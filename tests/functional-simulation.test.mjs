import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "care-plan-builder.html"), "utf8");
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class FakeClassList {
  constructor(value=""){ this.values = new Set(value.split(/\s+/).filter(Boolean)); }
  add(...names){ names.forEach(name => this.values.add(name)); }
  remove(...names){ names.forEach(name => this.values.delete(name)); }
  contains(name){ return this.values.has(name); }
  toString(){ return [...this.values].join(" "); }
}

function attrsOf(source){
  const attrs = {};
  for (const match of source.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[match[1]] = match[2] ?? "";
  return attrs;
}

class FakeElement {
  constructor(document, tag="div", attrs={}){
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.id = attrs.id || "";
    this.value = attrs.value || "";
    this.type = attrs.type || "";
    this.checked = Object.hasOwn(attrs, "checked");
    this.disabled = Object.hasOwn(attrs, "disabled");
    this.hidden = Object.hasOwn(attrs, "hidden");
    this.textContent = "";
    this.placeholder = attrs.placeholder || "";
    this.style = {};
    this.dataset = {};
    this.attributes = {...attrs};
    this.classList = new FakeClassList(attrs.class || "");
    this.children = [];
    this.options = [];
    this.listeners = {};
    this.parentNode = null;
    this.files = null;
    for (const [key,value] of Object.entries(attrs)) if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = value;
  }
  set innerHTML(value){
    this._innerHTML = String(value);
    this.ownerDocument.replaceGeneratedChildren(this, this._innerHTML);
  }
  get innerHTML(){ return this._innerHTML || ""; }
  setAttribute(name,value){
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
    if (name === "class") this.classList = new FakeClassList(String(value));
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = String(value);
  }
  getAttribute(name){ return this.attributes[name] ?? null; }
  addEventListener(type,fn){ (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type,fn){ this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
  focus(){ this.ownerDocument.activeElement = this; }
  scrollIntoView(options){ this.scrolled = options || true; }
  appendChild(child){ child.parentNode = this; this.children.push(child); this.ownerDocument.register(child); return child; }
  remove(){
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.ownerDocument.unregister(this);
  }
  matches(selector){
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector === "[data-x]") return this.dataset.x !== undefined;
    const data = selector.match(/^\[data-x="([^"]+)"\]$/); if (data) return this.dataset.x === data[1];
    return false;
  }
  closest(selector){ return this.matches(selector) ? this : null; }
  querySelector(selector){ return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector){
    const all = [];
    const visit = element => { for (const child of element.children){ all.push(child); visit(child); } };
    visit(this);
    return all.filter(element => element.matches(selector));
  }
  click(){
    this.clicked = true;
    if (this.tagName === "A") this.ownerDocument.downloads.push({download:this.download,href:this.href});
  }
}

class FakeDocument {
  constructor(markup){
    this.elementsById = new Map();
    this.all = new Set();
    this.generatedByParent = new Map();
    this.activeElement = null;
    this.downloads = [];
    this.listeners = {};
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.register(this.documentElement); this.register(this.body);
    for (const match of markup.matchAll(/<([a-z][\w-]*)([^>]*\bid="[^"]+"[^>]*)>/gi)){
      const attrs = attrsOf(match[2]);
      this.register(new FakeElement(this, match[1], attrs));
    }
    for (const match of markup.matchAll(/<([a-z][\w-]*)([^>]*\bdata-i18n(?:-html|-ph)?="[^"]+"[^>]*)>/gi)){
      const attrs = attrsOf(match[2]);
      if (!attrs.id) this.register(new FakeElement(this, match[1], attrs));
    }
  }
  register(element){
    this.all.add(element);
    if (element.id) this.elementsById.set(element.id, element);
  }
  unregister(element){
    this.all.delete(element);
    if (element.id && this.elementsById.get(element.id) === element) this.elementsById.delete(element.id);
    for (const child of element.children) this.unregister(child);
  }
  replaceGeneratedChildren(parent, markup){
    for (const old of this.generatedByParent.get(parent) || []) this.unregister(old);
    parent.children = [];
    const generated = [];
    for (const match of markup.matchAll(/<(input|button|select|span|div|a)([^>]*)>/gi)){
      const attrs = attrsOf(match[2]);
      if (!attrs.id && !attrs.class && attrs["data-x"] === undefined) continue;
      const child = new FakeElement(this, match[1], attrs);
      child.parentNode = parent;
      parent.children.push(child); generated.push(child); this.register(child);
    }
    this.generatedByParent.set(parent, generated);
    parent.options = [];
    for (const match of markup.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)){
      const attrs = attrsOf(match[1]);
      const option = {value:attrs.value || "", textContent:match[2].replace(/<[^>]+>/g, ""), selected:Object.hasOwn(attrs,"selected")};
      parent.options.push(option);
    }
    if (parent.tagName === "SELECT" && parent.options.length && !parent.options.some(option => option.value === parent.value)) parent.value = parent.options[0].value;
  }
  getElementById(id){ return this.elementsById.get(id) || null; }
  querySelectorAll(selector){
    if (selector.startsWith("[data-i18n")){
      const key = selector.includes("-html") ? "i18nHtml" : selector.includes("-ph") ? "i18nPh" : "i18n";
      return [...this.all].filter(element => element.dataset[key] !== undefined);
    }
    const classMatch = selector.match(/^\.([\w-]+)(:checked)?$/);
    if (classMatch) return [...this.all].filter(element => element.classList.contains(classMatch[1]) && (!classMatch[2] || element.checked));
    return [];
  }
  createElement(tag){ return new FakeElement(this, tag); }
  addEventListener(type,fn){ (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type,fn){ this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
}

class FakeFileReader {
  readAsText(file){ this.result = file.content; queueMicrotask(() => this.onload?.()); }
}

function makeContext(language){
  const document = new FakeDocument(html);
  const objectUrls = [];
  const context = {
    console,
    document,
    navigator:{language},
    localStorage:{removeItem(){}},
    window:{printCalls:0,printOpenStates:[],print(){this.printCalls += 1;this.printOpenStates.push(["careDetails","rolesDetails","dutiesDetails","shoppingDetails","mealDetails","measurementDetails","weekPlanDetails","coverageDetails","loadDetails"].map(id=>document.getElementById(id).open));}},
    Blob,
    FileReader:FakeFileReader,
    URL:{createObjectURL(blob){objectUrls.push(blob);return `blob:test-${objectUrls.length}`;},revokeObjectURL(){}},
    setTimeout(fn){fn();return 1;}, clearTimeout(){},
    queueMicrotask,
    Date, Map, Set, Object, Array, String, Number, Math, JSON, RegExp, Promise
  };
  context.globalThis = context;
  vm.createContext(context);
  const expose = `
    globalThis.__app={
      getLang:()=>lang,
      getState:()=>JSON.parse(JSON.stringify(state)),
      setState:value=>{state=value;},
      getAuto:()=>autoContent,
      setAuto:value=>{autoContent=value;},
      getBuilderStarted:()=>builderStarted,
      getTypes:()=>JSON.parse(JSON.stringify(TYPES)),
      getGlossary:()=>JSON.parse(JSON.stringify(USER_ENTRY_GLOSSARY)),
      functions:{suggestedEffort,normaliseEffort,buildEffortOptions,uiDialog,editForCover,setBuilderStarted,collapsibleSections,syncSectionToggle,syncSectionToggles,setSectionOpen,configureSectionState,applyStatic,addParallelTranslations,addBilingualTranslations,generatedTranslationMap,matchEntryCase,translateMappedText,translateGeneratedState,toggleLang,buildTypes,chooseType,setRecipient,setCustomLabel,buildDayPicks,syncDayState,toggleEvery,toggleAsNeeded,picked,setChecks,submitRole,startEditRole,cancelRole,removeRole,submitDuty,startEditDuty,cancelDuty,removeDuty,takenSets,addFrom,addSuggestion,addBasic,fillAll,clearDuties,loadExample,toggleStarterSuggestions,useShoppingStarter,useMealStarter,renderStarterSuggestions,supportChanged,toggleNewShopCategory,addShoppingItem,startEditShoppingItem,cancelShoppingItemEdit,cycleShoppingStatus,markShoppingStock,removeShoppingItem,renderShopping,addMeal,startEditMeal,cancelMealEdit,removeMeal,addMealIngredientsToShopping,setMealPlan,renderMeals,measurementTemplateColumns,buildMeasurementOptions,updateMeasurementSubmitLabel,toggleCustomMeasurement,addMeasurementTable,removeMeasurementTable,updateMeasurementName,addMeasurementColumn,removeMeasurementColumn,updateMeasurementColumn,addMeasurementRow,removeMeasurementRow,updateMeasurementValue,renderMeasurements,renderSupport,render,renderLoad,renderSupportPrint,renderPrint,printPlan,backupFailure,backupArray,backupText,backupBoolean,backupId,backupDays,backupReference,sanitizeBackupState,exportJSON,importJSON},
      helpers:{L,t,dS,dL,B,emptyMealPlan,emptySupport,roleOf,esc,byTime,capitalizeFirstLetter,typeName,hasPlanContent,uiAlert,uiConfirm,pool,allShopItems,supportStarters},
      t,
      getUid:()=>uid,
      backupLimits:BACKUP_LIMITS
    };`;
  vm.runInContext(appScript + expose, context, {filename:"care-plan-builder.html"});
  context.__objectUrls = objectUrls;
  return context;
}

async function answerDialog(context, answer){
  await Promise.resolve();
  const wrap = context.document.body.children.at(-1);
  assert(wrap, "Expected a dialog");
  const button = wrap.querySelector(`[data-x="${answer ? "1" : "0"}"]`);
  assert(button, `Expected dialog button ${answer ? "OK" : "Cancel"}`);
  for (const listener of wrap.listeners.click || []) listener({target:button});
  await Promise.resolve();
}

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn){
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch(error){ failed += 1; failures.push({name,error}); console.error(`FAIL ${name}: ${error.message}`); }
}

async function runLocale(locale, expected){
  const context = makeContext(locale);
  const {document} = context;
  const app = context.__app;
  const f = app.functions;

  await test(`${expected.code}: clean staged startup`, async () => {
    const state = app.getState();
    assert.equal(app.getLang(), expected.code);
    assert.equal(document.documentElement.lang, expected.code);
    assert.equal(document.title, expected.title);
    assert.equal(state.type, "elderly");
    assert.equal(state.roles.length, 0); assert.equal(state.duties.length, 0);
    assert.equal(app.getBuilderStarted(),false);
    assert.equal(document.getElementById("welcomeCopy").hidden,false);
    assert.equal(document.getElementById("builderFields").hidden,true);
    assert.equal(document.getElementById("planStage").hidden,true);
    assert.equal(document.getElementById("careDetails").open,true);
    assert.equal(document.getElementById("shoppingDetails").open,false);
    assert.equal(document.getElementById("careDetailsToggle").textContent,expected.hideSection);
    assert.equal(document.getElementById("shoppingDetailsToggle").textContent,expected.showSection);
  });

  await test(`${expected.code}: language controls and all ten care types`, async () => {
    assert.equal(document.getElementById("types").children.filter(child => child.classList.contains("type")).length, 10);
    assert.equal(document.getElementById("langBtn").textContent, expected.languageButton);
    assert.equal(document.getElementById("type-baby").getAttribute("aria-pressed"), "false");
    assert.equal(document.getElementById("creatorCredit").textContent,expected.creatorCredit);
    assert.equal(document.getElementById("copyrightNotice").textContent,"© 2026 Dilara Murathanoglu");
    assert.equal(document.getElementById("pCreatorCredit").textContent,expected.creatorCredit);
  });

  await test(`${expected.code}: recipient and custom label`, async () => {
    await f.chooseType("other"); assert.equal(app.getBuilderStarted(),true);
    assert.equal(document.getElementById("careDetails").open,false);
    assert.equal(document.getElementById("rolesDetails").open,true);
    assert.equal(document.getElementById("dutiesDetails").open,true);
    assert.equal(document.getElementById("shoppingDetails").open,false);
    assert.equal(document.getElementById("mealDetails").open,false);
    assert.equal(document.getElementById("measurementDetails").open,false);
    assert.equal(document.getElementById("weekPlanDetails").open,true);
    assert(document.getElementById("rolesSection").scrolled);
    f.setRecipient(expected.recipient);
    assert.equal(app.getState().recipient, expected.recipient);
    assert.equal(app.getState().type, "other");
    f.setCustomLabel(expected.customType);
    assert.equal(app.getState().customLabel, expected.customType);
  });

  {const switchPromise=f.chooseType("elderly");await answerDialog(context,true);await switchPromise;f.fillAll();}

  await test(`${expected.code}: Every day and As needed day controls`, async () => {
    const every = document.getElementById("dEvery"), needed = document.getElementById("dAsNeeded");
    every.checked = true; f.toggleEvery(true);
    assert.equal(needed.checked, false); assert.equal(needed.disabled, true);
    needed.checked = true; f.toggleAsNeeded(true);
    assert.equal(every.checked, false); assert.equal(every.disabled, true);
    needed.checked = false; f.syncDayState();
    const days = document.querySelectorAll(".dday"); days[2].checked = true;
    assert.deepEqual(Array.from(f.picked(".dday")), [2]);
  });

  await test(`${expected.code}: add, edit and cancel a role`, async () => {
    const before = app.getState().roles.length;
    document.getElementById("rName").value = expected.role;
    document.getElementById("rPerson").value = expected.person;
    document.getElementById("rNote").value = expected.note;
    document.getElementById("rStandby").checked = true;
    document.querySelectorAll(".roff")[1].checked = true;
    f.submitRole();
    let state = app.getState(); assert.equal(state.roles.length, before + 1);
    let role = state.roles.at(-1); assert.equal(role.name, expected.role); assert.deepEqual(role.off, [1]); assert.equal(role.standby, true);
    f.startEditRole(role.id); document.getElementById("rName").value = expected.roleEdited; f.submitRole();
    state = app.getState(); role = state.roles.find(item => item.id === role.id); assert.equal(role.name, expected.roleEdited);
    f.startEditRole(role.id); f.cancelRole(); assert.equal(document.getElementById("rName").value, "");
  });

  await test(`${expected.code}: remove role cancel and confirm`, async () => {
    const role = app.getState().roles.at(-1);
    let promise = f.removeRole(role.id); await answerDialog(context, false); await promise;
    assert(app.getState().roles.some(item => item.id === role.id));
    promise = f.removeRole(role.id); await answerDialog(context, true); await promise;
    assert(!app.getState().roles.some(item => item.id === role.id));
  });

  await test(`${expected.code}: add, edit, cover-focus and remove duty`, async () => {
    const state0 = app.getState(); const owner = state0.roles[0], cover = state0.roles[2];
    document.getElementById("dName").value = expected.duty;
    document.getElementById("dRole").value = String(owner.id);
    document.getElementById("dCover").value = String(cover.id);
    document.getElementById("dMinutes").value = "120";
    document.getElementById("dIntensity").value = "demanding";
    document.getElementById("dCategory").value = "planning";
    document.getElementById("dAsNeeded").checked = true; f.toggleAsNeeded(true);
    await f.submitDuty();
    let duty = app.getState().duties.at(-1); assert.equal(duty.name, expected.duty); assert.equal(duty.ongoing, true); assert.equal(duty.minutes, 120);
    f.startEditDuty(duty.id); document.getElementById("dName").value = expected.dutyEdited; await f.submitDuty();
    duty = app.getState().duties.find(item => item.id === duty.id); assert.equal(duty.name, expected.dutyEdited);
    f.editForCover(duty.id); assert.equal(document.activeElement.id, "dCover"); assert(document.getElementById("dCover").scrolled);
    f.cancelDuty();
    let promise = f.removeDuty(duty.id); await answerDialog(context, false); await promise; assert(app.getState().duties.some(item => item.id === duty.id));
    promise = f.removeDuty(duty.id); await answerDialog(context, true); await promise; assert(!app.getState().duties.some(item => item.id === duty.id));
  });

  await test(`${expected.code}: clear and refill suggested duties`, async () => {
    let promise = f.clearDuties(); await answerDialog(context, false); await promise; assert(app.getState().duties.length > 0);
    promise = f.clearDuties(); await answerDialog(context, true); await promise; assert.equal(app.getState().duties.length, 0);
    f.fillAll(); const first = app.getState().duties.length; f.fillAll(); assert.equal(app.getState().duties.length, first);
  });

  await test(`${expected.code}: load complete fictionalized example`, async () => {
    await f.loadExample(true); const state = app.getState();
    assert.equal(state.roles.length, 5); assert(state.duties.some(duty => duty.name === expected.budget));
    assert.equal(state.shopping.length, 7); assert.equal(state.meals.length, 11); assert.equal(state.mealPlan.length, 7);
    assert.equal(state.measurements.length, 1); assert.equal(state.measurements[0].rows.length, 0);
    assert(!document.getElementById("bars").innerHTML.includes(expected.nobody));
    for(const id of ["careDetails","rolesDetails","dutiesDetails","shoppingDetails","mealDetails","measurementDetails"])assert.equal(document.getElementById(id).open,false,id);
    for(const id of ["weekPlanDetails","coverageDetails","loadDetails"])assert.equal(document.getElementById(id).open,true,id);
  });

  await test(`${expected.code}: shopping item add, edit, status cycle and removal`, async () => {
    const category = document.getElementById("shopCategory");
    assert(category.options.length >= 6); category.value = expected.shopCategory;
    document.getElementById("shopItem").value = expected.shopItem;
    document.getElementById("shopStatus").value = "low";
    document.getElementById("shopSource").value = expected.shopSource;
    f.addShoppingItem();
    let item = app.getState().shopping.flatMap(group => group.items).find(value => value.name === expected.shopItem);
    assert(item); assert.equal(item.status, "low"); assert(document.getElementById("currentShoppingList").innerHTML.includes(expected.shopItem));
    f.cycleShoppingStatus(item.id); item = app.getState().shopping.flatMap(group => group.items).find(value => value.id === item.id); assert.equal(item.status, "needed");
    f.markShoppingStock(item.id); item = app.getState().shopping.flatMap(group => group.items).find(value => value.id === item.id); assert.equal(item.status, "stock");
    f.startEditShoppingItem(item.id); assert.equal(document.getElementById("shopCancel").hidden,false);
    document.getElementById("shopCategory").value=expected.shopCategoryEdited;document.getElementById("shopItem").value=expected.shopItemEdited;document.getElementById("shopSource").value=expected.shopSourceEdited;document.getElementById("shopStatus").value="low";f.addShoppingItem();
    const editedGroup=app.getState().shopping.find(group=>group.items.some(value=>value.id===item.id));item=editedGroup.items.find(value=>value.id===item.id);assert.equal(editedGroup.name,expected.shopCategoryEdited);assert.equal(item.name,expected.shopItemEdited);assert.equal(item.source,expected.shopSourceEdited);assert.equal(item.status,"low");assert.equal(document.getElementById("shopCancel").hidden,true);
    let promise = f.removeShoppingItem(item.id); await answerDialog(context, false); await promise; assert(app.getState().shopping.flatMap(group => group.items).some(value => value.id === item.id));
    promise = f.removeShoppingItem(item.id); await answerDialog(context, true); await promise; assert(!app.getState().shopping.flatMap(group => group.items).some(value => value.id === item.id));
  });

  await test(`${expected.code}: care-specific starter prompts are opt-in and non-writing`, async () => {
    app.setState({...app.getState(),type:"baby",shopping:[],meals:[],mealPlan:app.helpers.emptyMealPlan()});
    f.renderSupport();
    const shopPanel=document.getElementById("shoppingStarters"), mealPanel=document.getElementById("mealStarters");
    assert.equal(shopPanel.hidden,true); assert.equal(mealPanel.hidden,true);
    f.toggleStarterSuggestions("shopping"); assert.equal(shopPanel.hidden,false);
    assert(shopPanel.innerHTML.includes(expected.shopStarter));
    f.useShoppingStarter(0);
    assert.equal(document.getElementById("shopCategory").value,expected.shopStarter);
    assert.equal(document.activeElement.id,"shopItem"); assert.equal(app.getState().shopping.length,0);
    f.toggleStarterSuggestions("meals"); assert.equal(mealPanel.hidden,false);
    assert(mealPanel.innerHTML.includes(expected.mealStarter));
    f.useMealStarter(0);
    assert.equal(document.getElementById("mealName").value,expected.mealStarter);
    assert.equal(document.activeElement.id,"mealIngredients"); assert.equal(app.getState().meals.length,0);
  });

  await test(`${expected.code}: custom shopping category remains selectable`, async () => {
    const category = document.getElementById("shopCategory"); category.value = "__new__"; f.toggleNewShopCategory("__new__", false);
    assert.equal(document.getElementById("shopNewCategoryWrap").hidden, false);
    document.getElementById("shopNewCategory").value = expected.customCategory;
    document.getElementById("shopItem").value = expected.customItem;
    document.getElementById("shopStatus").value = "needed"; f.addShoppingItem();
    assert(app.getState().shopping.some(group => group.name === expected.customCategory));
    assert([...document.getElementById("shopCategory").options].some(option => option.value === expected.customCategory));
  });

  await test(`${expected.code}: meal add, edit, weekly plan, shopping integration and removal`, async () => {
    document.getElementById("mealName").value = expected.meal;
    document.getElementById("mealIngredients").value = expected.mealIngredient;
    document.getElementById("mealNotes").value = expected.mealNote; f.addMeal();
    let meal = app.getState().meals.find(item => item.name === expected.meal); assert(meal);
    f.setMealPlan(0,"dinner",String(meal.id)); assert.equal(app.getState().mealPlan[0].dinner, meal.id);
    f.startEditMeal(meal.id);assert.equal(document.getElementById("mealCancel").hidden,false);document.getElementById("mealName").value=expected.mealEdited;document.getElementById("mealIngredients").value=expected.mealIngredientEdited;document.getElementById("mealNotes").value=expected.mealNoteEdited;f.addMeal();
    meal=app.getState().meals.find(item=>item.id===meal.id);assert.equal(meal.name,expected.mealEdited);assert.equal(meal.ingredients,expected.mealIngredientEdited);assert.equal(meal.notes,expected.mealNoteEdited);assert.equal(document.getElementById("mealCancel").hidden,true);assert.equal(app.getState().mealPlan[0].dinner,meal.id);
    let promise = f.addMealIngredientsToShopping(meal.id); await answerDialog(context, true); await promise;
    assert(app.getState().shopping.flatMap(group => group.items).some(item => item.name === expected.mealIngredientEdited && item.status === "needed"));
    promise = f.removeMeal(meal.id); await answerDialog(context, false); await promise; assert(app.getState().meals.some(item => item.id === meal.id));
    promise = f.removeMeal(meal.id); await answerDialog(context, true); await promise; assert(!app.getState().meals.some(item => item.id === meal.id)); assert.equal(app.getState().mealPlan[0].dinner, null);
  });

  await test(`${expected.code}: measurement templates, calendar, values and removals`, async () => {
    const initialTableCount=app.getState().measurements.length;
    document.getElementById("measurementTemplate").value = "pressure";
    document.getElementById("measurementName").value = ""; f.addMeasurementTable();
    let table = app.getState().measurements.at(-1); assert.equal(table.columns[0].type, "date");
    document.getElementById("measurementTemplate").value="custom";f.toggleCustomMeasurement("custom",false);assert.equal(document.getElementById("measurementNameWrap").hidden,false);
    document.getElementById("measurementName").value="";f.addMeasurementTable();assert.equal(app.getState().measurements.length,initialTableCount+1);assert.equal(document.activeElement.id,"measurementName");
    document.getElementById("measurementName").value=expected.measurementSecond;f.addMeasurementTable();
    const secondTable=app.getState().measurements.at(-1);assert.equal(app.getState().measurements.length,initialTableCount+2);assert.equal(document.getElementById("measurementSubmit").textContent,expected.addCustomTable);
    f.updateMeasurementName(table.id,expected.measurementEdited);assert.equal(app.getState().measurements.find(item=>item.id===table.id).name,expected.measurementEdited);
    assert(document.getElementById("measurementTables").innerHTML.includes('type="date"') || table.rows.length === 0);
    f.addMeasurementRow(table.id); table = app.getState().measurements.find(item => item.id === table.id);
    const row = table.rows[0], dateColumn = table.columns[0]; f.updateMeasurementValue(table.id,row.id,dateColumn.id,"2026-07-15");
    assert.equal(app.getState().measurements.find(item => item.id === table.id).rows[0].values[dateColumn.id],"2026-07-15");
    const input = document.getElementById(`newColumn-${table.id}`); input.value = expected.dateColumn; f.addMeasurementColumn(table.id);
    table = app.getState().measurements.find(item => item.id === table.id); const addedColumn = table.columns.at(-1); assert.equal(addedColumn.type,"date");
    let promise = f.removeMeasurementRow(table.id,row.id); await answerDialog(context, false); await promise; assert(app.getState().measurements.find(item => item.id === table.id).rows.some(item => item.id === row.id));
    promise = f.removeMeasurementRow(table.id,row.id); await answerDialog(context, true); await promise; assert(!app.getState().measurements.find(item => item.id === table.id).rows.some(item => item.id === row.id));
    promise = f.removeMeasurementColumn(table.id,addedColumn.id); await answerDialog(context, true); await promise; assert(!app.getState().measurements.find(item => item.id === table.id).columns.some(item => item.id === addedColumn.id));
    promise = f.removeMeasurementTable(table.id); await answerDialog(context, false); await promise; assert(app.getState().measurements.some(item => item.id === table.id));
    promise = f.removeMeasurementTable(table.id); await answerDialog(context, true); await promise; assert(!app.getState().measurements.some(item => item.id === table.id));
    promise=f.removeMeasurementTable(secondTable.id);await answerDialog(context,true);await promise;assert(!app.getState().measurements.some(item=>item.id===secondTable.id));
  });

  await test(`${expected.code}: print content and PDF trigger`, async () => {
    f.renderPrint();
    assert(document.getElementById("pTitle").textContent.includes(app.getState().recipient));
    assert(document.getElementById("supportPrint").innerHTML.includes(expected.printShopping));
    f.setSectionOpen("weekPlanDetails",false);f.setSectionOpen("shoppingDetails",false);
    const before = context.window.printCalls; await f.printPlan(); assert.equal(context.window.printCalls, before + 1);
    assert(context.window.printOpenStates.at(-1).every(Boolean));
    assert.equal(document.getElementById("weekPlanDetails").open,false);assert.equal(document.getElementById("shoppingDetails").open,false);
  });

  await test(`${expected.code}: JSON export and valid import round trip`, async () => {
    f.exportJSON(); assert.equal(document.downloads.at(-1).download, "care-plan.json");
    const blob = context.__objectUrls.at(-1); const exported = await blob.text(); const parsed = JSON.parse(exported); assert.equal(parsed.roles.length, app.getState().roles.length);
    const input = document.getElementById("importer"); input.files = [{content:exported}]; f.importJSON(input); await Promise.resolve(); await Promise.resolve();
    assert.equal(app.getState().recipient, parsed.recipient); assert.equal(input.value, "");
  });

  await test(`${expected.code}: invalid backup uses styled alert`, async () => {
    const input = document.getElementById("importer"); input.files = [{content:"not-json"}]; f.importJSON(input); await Promise.resolve();
    await answerDialog(context, true); await Promise.resolve(); assert.equal(input.value, "");
  });

  await test(`${expected.code}: hostile backup fields are whitelisted and rendered safely`, async () => {
    const payload={type:"elderly",recipient:"Safe household",roles:[{id:900,name:'<img src=x onerror="globalThis.injected=true">',off:[],color:'red\"><img src=x onerror="globalThis.injected=true">',evil:"discard"}],
      duties:[{id:901,name:"Safe duty",roleId:900,coverId:null,days:[0],every:false,ongoing:false,minutes:15,intensity:"routine",category:"other"}]};
    const clean=f.sanitizeBackupState(payload);
    assert.equal(clean.state.roles[0].id,1);assert.equal(clean.state.duties[0].roleId,1);
    assert.match(clean.state.roles[0].color,/^#[0-9A-F]{6}$/);assert.equal(Object.hasOwn(clean.state.roles[0],"evil"),false);
    app.setState(clean.state);f.render();assert.doesNotMatch(document.getElementById("roleList").innerHTML,/<img\b/i);assert.equal(context.injected,undefined);
  });

  await test(`${expected.code}: malformed nested backup is rejected without replacing the plan`, async () => {
    const before=JSON.stringify(app.getState()),input=document.getElementById("importer");
    const malformed={type:"elderly",roles:[{id:1,name:"Owner",off:[]}],duties:[],shopping:[{id:2,name:"Food",items:"not-an-array"}]};
    input.files=[{content:JSON.stringify(malformed)}];f.importJSON(input);await Promise.resolve();await answerDialog(context,true);await Promise.resolve();
    assert.equal(JSON.stringify(app.getState()),before);assert.equal(input.value,"");
  });

  await test(`${expected.code}: oversized backup is rejected before it is read`, async () => {
    const before=JSON.stringify(app.getState()),input=document.getElementById("importer");input.files=[{content:"{}",size:app.backupLimits.maxBytes+1}];
    const promise=f.importJSON(input);await answerDialog(context,true);await promise;
    assert.equal(JSON.stringify(app.getState()),before);assert.equal(input.value,"");
  });

  return context;
}

const english = {
  code:"en", title:"Care Plan Builder", nobody:"Nobody yet", languageButton:"Türkçe",
  showSection:"Show",hideSection:"Hide",
  creatorCredit:"Created with love for caregivers everywhere.",
  recipient:"Test recipient", customType:"Community care", role:"Test coordinator", roleEdited:"Lead coordinator", person:"Alex", note:"Test note",
  duty:"Test planning duty", dutyEdited:"Edited planning duty", budget:"Budget management",
  shopCategory:"Food and drinks", shopCategoryEdited:"Cleaning", shopItem:"Test cereal", shopItemEdited:"Edited cereal", shopSource:"Test store", shopSourceEdited:"Edited store", customCategory:"Pet supplies", customItem:"Cat food",
  shopStarter:"Feeding supplies", mealStarter:"Usual feed or meal",
  meal:"Test supper", mealEdited:"Edited supper", mealIngredient:"Test spice", mealIngredientEdited:"Edited spice", mealNote:"Low salt", mealNoteEdited:"Edited note", measurement:"Test blood pressure", measurementEdited:"Edited blood pressure", measurementSecond:"Second custom table", addCustomTable:"Add a Custom Table", dateColumn:"Date",
  printShopping:"Shopping Guide and Current List"
};
const turkish = {
  code:"tr", title:"Bakım Planı Oluşturucu", nobody:"Henüz kimse yok", languageButton:"English",
  showSection:"Göster",hideSection:"Gizle",
  creatorCredit:"Her yerdeki bakım verenler için sevgiyle oluşturulmuştur.",
  recipient:"Test yakını", customType:"Toplum bakımı", role:"Test koordinatörü", roleEdited:"Baş koordinatör", person:"Ayşe", note:"Test notu",
  duty:"Test planlama görevi", dutyEdited:"Düzenlenmiş planlama görevi", budget:"Bütçe yönetimi",
  shopCategory:"Yiyecek ve içecek", shopCategoryEdited:"Temizlik", shopItem:"Test gevreği", shopItemEdited:"Düzenlenmiş gevrek", shopSource:"Test marketi", shopSourceEdited:"Düzenlenmiş market", customCategory:"Evcil hayvan ürünleri", customItem:"Kedi maması",
  shopStarter:"Beslenme malzemeleri", mealStarter:"Alışılmış beslenme veya öğün",
  meal:"Test akşam yemeği", mealEdited:"Düzenlenmiş akşam yemeği", mealIngredient:"Test baharatı", mealIngredientEdited:"Düzenlenmiş baharat", mealNote:"Az tuzlu", mealNoteEdited:"Düzenlenmiş not", measurement:"Test tansiyon tablosu", measurementEdited:"Düzenlenmiş tansiyon tablosu", measurementSecond:"İkinci özel tablo", addCustomTable:"Özel Tablo Ekle", dateColumn:"Tarih",
  printShopping:"Alışveriş Rehberi ve Güncel Liste"
};

const enContext = await runLocale("en-US", english);
const trContext = await runLocale("tr-TR", turkish);

await test("cross-language switch translates every example module repeatedly", async () => {
  const app = enContext.__app, f = app.functions, document = enContext.document;
  await f.loadExample(true); assert.equal(app.getAuto(), "example");
  f.setSectionOpen("shoppingDetails",true);f.setSectionOpen("coverageDetails",false);
  f.toggleLang(); await Promise.resolve(); assert.equal(app.getLang(), "tr");
  assert.equal(document.getElementById("shoppingDetails").open,true);assert.equal(document.getElementById("shoppingDetailsToggle").textContent,"Gizle");
  assert.equal(document.getElementById("coverageDetails").open,false);assert.equal(document.getElementById("coverageDetailsToggle").textContent,"Göster");
  let state=app.getState();
  assert(state.roles.some(role=>role.name==="Bakım sorumlusu"));
  assert(state.duties.some(duty => duty.name === "Bütçe yönetimi"));
  assert(state.shopping.some(category=>category.name==="Kahvaltı temel ürünleri"&&category.items.some(item=>item.name==="Yulaf ezmesi")));
  assert(state.meals.some(meal=>meal.name==="Muzlu yulaf lapası"&&meal.ingredients.includes("Yulaf ezmesi")));
  assert(state.measurements.some(table=>table.name==="Örnek sağlık ölçümleri"&&table.columns.some(column=>column.label==="Ölçüm türü")));
  document.getElementById("rName").value = "User role"; f.submitRole(); const count = app.getState().roles.length;
  f.toggleLang(); assert.equal(app.getLang(), "en");state=app.getState();assert.equal(state.roles.length,count);assert(state.roles.some(role=>role.name==="User role"));
  assert(state.roles.some(role=>role.name==="Care manager"));assert(state.duties.some(duty=>duty.name==="Budget management"));
  assert(state.shopping.some(category=>category.name==="Breakfast basics"&&category.items.some(item=>item.name==="Oats")));
  assert(state.meals.some(meal=>meal.name==="Oatmeal with banana"));assert(state.measurements.some(table=>table.name==="Example health measurements"));
  f.toggleLang();f.toggleLang();assert.equal(app.getLang(),"en");assert(app.getState().roles.some(role=>role.name==="User role"));
});

await test("manual Turkish meal entries translate offline and transferred ingredients are capitalized",async()=>{
  const context=makeContext("tr-TR"),app=context.__app,f=app.functions,document=context.document;
  await f.chooseType("elderly",true);
  document.getElementById("mealName").value="köfte";
  document.getElementById("mealIngredients").value="kıyma, köfte, patates";
  document.getElementById("mealNotes").value="";f.addMeal();
  f.toggleLang();assert.equal(app.getLang(),"en");
  let meal=app.getState().meals[0];assert.equal(meal.name,"meatballs");assert.equal(meal.ingredients,"ground meat, meatballs, potatoes");
  const promise=f.addMealIngredientsToShopping(meal.id);await answerDialog(context,true);await promise;
  const names=app.getState().shopping.flatMap(category=>category.items.map(item=>item.name));
  assert.deepEqual(Array.from(names),["Ground meat","Meatballs","Potatoes"]);
  assert(names.every(name=>/^\p{Lu}/u.test(name)));
  f.toggleLang();meal=app.getState().meals[0];assert.equal(meal.name,"köfte");assert.equal(meal.ingredients,"kıyma, köfte, patates");
});

await test("every care option translates generated roles and duties after content is pinned", async()=>{
  for(const key of ["baby","child","child_needs","elderly","dementia","recovery","disability","palliative","mental_health","other"]){
    const context=makeContext("en-US"),app=context.__app,f=app.functions,document=context.document,types=app.getTypes();
    await f.chooseType(key,true);f.fillAll();
    f.setRecipient("Private household name");assert.equal(app.getAuto(),null);
    f.toggleLang();const state=app.getState();assert.equal(app.getLang(),"tr");
    for(const role of state.roles.filter(item=>item.tpl!==undefined))assert.equal(role.name,types[key].roles[role.tpl].name.tr,`${key} role ${role.tpl}`);
    const expectedDuties=new Set(types[key].suggested.map(item=>item.name.tr));
    for(const duty of state.duties)assert(expectedDuties.has(duty.name),`${key}: ${duty.name}`);
  }
});

for (const [locale, expected] of [["en-US",english],["tr-TR",turkish]]){
  await test(`${expected.code}: all ten templates render and fill without duplicates`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions;
    for (const key of ["baby","child","child_needs","elderly","dementia","recovery","disability","palliative","mental_health","other"]){
      app.setState({...app.getState(),duties:[]});
      await f.chooseType(key,true); f.fillAll(); f.render();
      const state = app.getState(); assert.equal(state.type,key); assert(state.roles.length > 0);
      const count = state.duties.length; f.fillAll(); assert.equal(app.getState().duties.length,count);
      if (key === "other") assert.equal(count,0); else assert(count > 0);
    }
  });

  await test(`${expected.code}: localized helpers and pure state helpers`, async () => {
    const context = makeContext(locale), app = context.__app, h = app.helpers, f = app.functions;
    await f.chooseType("elderly",true);
    assert.equal(h.L({en:"English value",tr:"Türkçe değer"}),expected.code === "tr" ? "Türkçe değer" : "English value");
    assert.equal(h.dS(0),expected.code === "tr" ? "Pzt" : "Mon"); assert.equal(h.dL(6),expected.code === "tr" ? "Pazar" : "Sunday");
    assert.equal(h.esc(`<tag a="1">&'`),"&lt;tag a=&quot;1&quot;&gt;&amp;&#39;");
    assert(h.byTime({time:"08:00"},{time:"09:00"}) < 0); assert.equal(h.emptyMealPlan().length,7);
    assert.deepEqual(JSON.parse(JSON.stringify(h.emptySupport())),{shopping:[],meals:[],mealPlan:[{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null},{breakfast:null,lunch:null,dinner:null}],measurements:[]});
    assert.equal(h.roleOf(app.getState().roles[0].id).id,app.getState().roles[0].id); assert(h.pool().length > 0); assert.equal(h.allShopItems().length,0);
    assert.equal(f.suggestedEffort("Morning medicine").category,"medical");
    assert.equal(f.normaliseEffort({name:"Bath",minutes:999,intensity:"x",category:"x"}).category,"direct");
    f.buildEffortOptions(); f.buildTypes(); f.buildDayPicks(); f.applyStatic(); f.renderSupport(); f.renderLoad(); f.renderPrint();
  });

  await test(`${expected.code}: individual suggestions, basics and duplicate tracking`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions;
    app.setState({...app.getState(),duties:[]}); f.addSuggestion(0); assert.equal(app.getState().duties.length,1);
    let taken = f.takenSets(); assert(taken.src.has("s0"));
    app.setState({...app.getState(),duties:[]}); f.addBasic(0); assert.equal(app.getState().duties.length,1); taken = f.takenSets(); assert(taken.src.has("b0"));
    app.setState({...app.getState(),duties:[]}); f.addFrom([{name:{en:"Direct add",tr:"Doğrudan ekleme"},r:0,days:[0],t:"10:00"}],0,"x"); assert.equal(app.getState().duties[0].src,"x0");
  });

  await test(`${expected.code}: dialog Escape, backdrop, required-field and empty-print paths`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions, h = app.helpers, document = context.document;
    let promise = h.uiConfirm("Confirm test"); await Promise.resolve(); const keyListener = document.listeners.keydown.at(-1); keyListener({key:"Escape"}); assert.equal(await promise,false);
    promise = h.uiConfirm("Backdrop test"); await Promise.resolve(); let wrap = document.body.children.at(-1); for(const listener of wrap.listeners.click||[])listener({target:wrap}); assert.equal(await promise,false);
    const beforeRoles = app.getState().roles.length; document.getElementById("rName").value=""; f.submitRole(); assert.equal(app.getState().roles.length,beforeRoles); assert.equal(document.activeElement.id,"rName");
    app.setState({...app.getState(),duties:[],shopping:[],meals:[],measurements:[]}); promise=f.printPlan(); await answerDialog(context,true); await promise; assert.equal(context.window.printCalls,0);
    document.getElementById("dName").value=expected.duty; document.getElementById("dEvery").checked=false; document.getElementById("dAsNeeded").checked=false; f.setChecks(".dday",[]);
    promise=f.submitDuty(); await answerDialog(context,true); await promise; assert.equal(app.getState().duties.length,0);
  });

  await test(`${expected.code}: all measurement templates and editors`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions, document = context.document;
    app.setState({...app.getState(),measurements:[]});
    for(const kind of ["glucose","pressure","oxygen","custom"]){
      const columns=f.measurementTemplateColumns(kind); assert.equal(columns[0].type,"date");
      document.getElementById("measurementTemplate").value=kind; document.getElementById("measurementName").value=kind==="custom"?expected.measurementSecond:""; f.addMeasurementTable();
    }
    assert.equal(app.getState().measurements.length,4); let table=app.getState().measurements[0];
    f.updateMeasurementName(table.id,expected.measurement); assert.equal(app.getState().measurements[0].name,expected.measurement);
    const column=table.columns[1]; f.updateMeasurementColumn(table.id,column.id,expected.dateColumn+" note"); assert.equal(app.getState().measurements[0].columns[1].label,expected.dateColumn+" note");
    const input=document.getElementById(`newColumn-${table.id}`); input.value=expected.note; f.addMeasurementColumn(table.id); table=app.getState().measurements[0]; assert.equal(table.columns.at(-1).type,"text");
    const added=table.columns.at(-1); let promise=f.removeMeasurementColumn(table.id,added.id); await answerDialog(context,false); await promise; assert(app.getState().measurements[0].columns.some(item=>item.id===added.id));
  });

  await test(`${expected.code}: all meal slots and full shopping status cycle`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions;
    await f.loadExample(true); const mealId=app.getState().meals[0].id;
    for(let day=0;day<7;day++)for(const slot of ["breakfast","lunch","dinner"])f.setMealPlan(day,slot,String(mealId));
    assert(app.getState().mealPlan.every(day=>day.breakfast===mealId&&day.lunch===mealId&&day.dinner===mealId));
    const stockItem=app.getState().shopping.flatMap(group=>group.items).find(item=>item.status==="stock");
    f.cycleShoppingStatus(stockItem.id); assert.equal(app.getState().shopping.flatMap(group=>group.items).find(item=>item.id===stockItem.id).status,"low");
    f.cycleShoppingStatus(stockItem.id); assert.equal(app.getState().shopping.flatMap(group=>group.items).find(item=>item.id===stockItem.id).status,"needed");
    f.cycleShoppingStatus(stockItem.id); assert.equal(app.getState().shopping.flatMap(group=>group.items).find(item=>item.id===stockItem.id).status,"stock");
    f.supportChanged(false); f.renderShopping(); f.renderMeals(); f.renderMeasurements(); f.renderSupport();
  });

  await test(`${expected.code}: legacy backup migration and no-file import`, async () => {
    const context = makeContext(locale), app = context.__app, f = app.functions, document = context.document;
    const legacy={type:"elderly",recipient:"Legacy",roles:[{id:1,name:"Owner",off:[],color:"#000"},{id:2,name:"Cover",off:[],color:"#111"}],duties:[{id:3,name:"Legacy duty",roleId:1,cover:"Cover on Thursday",days:[3],minutes:15,intensity:"routine",category:"other"}]};
    const input=document.getElementById("importer"); input.files=[{content:JSON.stringify(legacy)}]; f.importJSON(input); await Promise.resolve(); await Promise.resolve();
    assert.equal(app.getState().duties[0].coverId,2); assert.equal(Object.hasOwn(app.getState().duties[0],"cover"),false);
    input.files=[]; const before=JSON.stringify(app.getState()); f.importJSON(input); assert.equal(JSON.stringify(app.getState()),before);
  });
}

console.log(`\nRESULT ${passed} passed, ${failed} failed`);
if (failed){
  for (const {name,error} of failures) console.error(`- ${name}: ${error.stack || error.message}`);
  process.exitCode = 1;
}
