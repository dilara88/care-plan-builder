import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const htmlPath = path.join(root, "care-plan-builder.html");
const readmePath = path.join(root, "README.md");
const licensePath = path.join(root, "LICENSE");
const html = fs.readFileSync(htmlPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");
const license = fs.readFileSync(licensePath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert(scriptMatch, "The embedded application script is missing");
const script = scriptMatch[1];

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn){
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error){
    failed += 1;
    failures.push({name, error});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function evaluateObject(regex, label, bindings={}){
  const match = html.match(regex);
  assert(match, `${label} block is missing`);
  const names = Object.keys(bindings);
  const values = Object.values(bindings);
  return Function(...names, `return (${match[1].replace(/;\s*$/, "")});`)(...values);
}

function compareShape(a, b, prefix=""){
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${prefix || "root"} translation keys differ`);
  for (const key of Object.keys(a)){
    const label = prefix ? `${prefix}.${key}` : key;
    if (a[key] && typeof a[key] === "object" && !Array.isArray(a[key])){
      assert(b[key] && typeof b[key] === "object" && !Array.isArray(b[key]), `${label} has a different type`);
      compareShape(a[key], b[key], label);
    } else {
      assert.equal(typeof b[key], typeof a[key], `${label} has a different type`);
    }
  }
}

const I18N = evaluateObject(/const I18N = (\{[\s\S]*?\n\});\nconst t =/, "I18N");
const B = (en, tr) => ({en, tr});
const ALL = [0,1,2,3,4,5,6];
const WEEKDAYS = [0,1,2,3,4];
const USER_ENTRY_GLOSSARY = evaluateObject(/const USER_ENTRY_GLOSSARY = (\[[\s\S]*?\n\]);\n\nconst BASICS/, "USER_ENTRY_GLOSSARY", {B});

const templateMatch = html.match(/const BASICS = ([\s\S]*?)\n\n\/\* ---------- A fictionalized example/);
assert(templateMatch, "Template data block is missing");
const templateData = Function("B", "ALL", "WEEKDAYS", `const BASICS = ${templateMatch[1]}; return {BASICS,TYPES,SUPPORT_STARTERS};`)(B, ALL, WEEKDAYS);
const {BASICS, TYPES, SUPPORT_STARTERS} = templateData;

const EXAMPLE = evaluateObject(/const EXAMPLE = ([\s\S]*?\n\};)\n\n\/\* Fictionalized reference/, "EXAMPLE", {B, ALL});
const EXAMPLE_SUPPORT = evaluateObject(/const EXAMPLE_SUPPORT = ([\s\S]*?\n\});\n\nconst emptyMealPlan/, "EXAMPLE_SUPPORT", {B});

const workloadMatch = script.match(/const DURATION_OPTIONS = ([\s\S]*?\n}\n)function buildEffortOptions/);
assert(workloadMatch, "Workload helper block is missing");
const workload = Function(`${"const DURATION_OPTIONS = " + workloadMatch[1]}return {DURATION_OPTIONS,INTENSITY_MULTIPLIER,WORK_CATEGORIES,suggestedEffort,normaliseEffort};`)();

test("HTML and JavaScript parse", () => new Function(script));

test("document uses standards mode and title-cased static metadata", () => {
  assert.match(html,/^<!doctype html>/i);
  assert.match(html,/<title>Care Plan Builder<\/title>/);
  assert.match(html,/<meta property="og:title" content="Care Plan Builder">/);
});

test("document contains one embedded script and no external runtime", () => {
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i);
});

test("document IDs are unique", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test("English and Turkish translation structures match", () => compareShape(I18N.en, I18N.tr));

test("every static translation key exists in both languages", () => {
  const keys = [...html.matchAll(/data-i18n(?:-html|-ph)?="([^"]+)"/g)].map(match => match[1]);
  for (const key of keys){
    assert.notEqual(I18N.en[key], undefined, `English key missing: ${key}`);
    assert.notEqual(I18N.tr[key], undefined, `Turkish key missing: ${key}`);
  }
});

test("protected titles and example button copy are exact", () => {
  assert.equal(I18N.en.title, "Care Plan Builder");
  assert.equal(I18N.tr.title, "Bakım Planı Oluşturucu");
  assert.equal(I18N.en.btnExample, "Show the example plan");
  assert.equal(I18N.tr.btnExample, "Örnek planı göster");
});

test("bilingual headings, care options and titled controls use title case", () => {
  // Every string that is presented in title case: section and plan headings, the
  // titled measurement controls, the care-option labels and the custom-table option.
  const titleKeys = ["eyebrow","s1Head","s2Head","s3Head","basicsCap","gapsHead","loadHead","planTitleEmpty","everydayCap","ongoingCap","pRolesCap","pTitleEmpty","modalConfirmCap","modalNoteCap","starterHead","shopHead","guideHead","currentListHead","mealHead","mealLibraryHead","weeklyMealsHead","measureHead","printShopping","printMeals","printMeasurements","addTable","addAnotherTable","addCustomTable","customTableDefault"];
  // Minor words stay lowercase inside a title (never as the first or last word).
  const minorWords = {
    en: new Set(["a","an","the","and","or","but","nor","for","of","in","on","at","to","by","with","as","when","from"]),
    tr: new Set(["ve","ile","ya","veya","için","ki","de","da","gibi","kadar"])
  };
  const firstLetter = word => word.match(/\p{L}/u)?.[0];
  // Title case: the first and last words are always capitalized; a minor word
  // between them stays lowercase; every other word is capitalized.
  const assertTitleCase = (value, locale, label) => {
    const words = value.split(/\s+/).filter(w => firstLetter(w));
    words.forEach((word, i) => {
      const letter = firstLetter(word);
      const bare = word.replace(/[^\p{L}]/gu, "").toLocaleLowerCase(locale);
      const isEdge = i === 0 || i === words.length - 1;
      if(!isEdge && minorWords[locale].has(bare)){
        assert.equal(letter, letter.toLocaleLowerCase(locale), `${label}: “${word}” should be lowercase`);
      } else {
        assert.equal(letter, letter.toLocaleUpperCase(locale), `${label}: “${word}” should be capitalized`);
      }
    });
  };
  for (const locale of ["en","tr"]){
    for (const key of titleKeys) assertTitleCase(I18N[locale][key], locale, `${locale}.${key}`);
    assertTitleCase(I18N[locale].measureTemplates.custom, locale, `${locale}.measureTemplates.custom`);
    for (const [key,type] of Object.entries(TYPES)) assertTitleCase(type.label[locale], locale, `${locale}.${key}`);
  }
});

test("every bilingual placeholder begins with a capital letter", () => {
  for (const locale of ["en","tr"]){
    for (const [key,value] of Object.entries(I18N[locale]).filter(([key,value])=>key.endsWith("Ph")&&typeof value==="string")){
      const first=value.match(/\p{L}/u)?.[0];
      assert(first, `${locale}.${key} has no letters`);
      assert.equal(first,first.toLocaleUpperCase(locale),`${locale}.${key}`);
    }
  }
});

test("localized percentage and time formatters follow convention", () => {
  assert.equal(I18N.en.percent(73), "73%");
  assert.equal(I18N.tr.percent(73), "%73");
  assert.equal(I18N.en.loadAmount(68, "about 13 hr"), "68% · about 13 hr");
  assert.equal(I18N.tr.loadAmount(68, "yaklaşık 13 sa"), "%68 · yaklaşık 13 sa");
});

test("PDF footer branding uses title case", () => {
  assert.match(I18N.en.pFoot, /^Made with Care Plan Builder/);
  assert.match(I18N.tr.pFoot, /^Bakım Planı Oluşturucu ile hazırlandı/);
  assert.doesNotMatch(I18N.en.pFoot, /Care plan builder/);
  assert.doesNotMatch(I18N.tr.pFoot, /Bakım planı oluşturucu/);
});

test("creator credit and copyright appear on the page, in print and in the README", () => {
  assert.equal(I18N.en.creatorCredit,"Created with love for caregivers everywhere.");
  assert.equal(I18N.tr.creatorCredit,"Her yerdeki bakım verenler için sevgiyle oluşturulmuştur.");
  assert.equal(I18N.en.copyrightNotice,"© 2026 Dilara Murathanoglu");
  assert.equal(I18N.tr.copyrightNotice,"© 2026 Dilara Murathanoglu");
  for(const id of ["creatorCredit","copyrightNotice","pCreatorCredit","pCopyrightNotice"])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/<footer class="creator-credit">/);
  assert.match(html,/\.p-foot span\{display:block/);
  assert.match(readme,/Created with love for caregivers everywhere\./);
  assert.doesNotMatch(readme,/Created with love for caregivers everywhere by/);
  assert.match(readme,/© 2026 Dilara Murathanoglu/);
});

test("all named application functions remain present", () => {
  const declared = [...script.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
  const arrows = [...script.matchAll(/(?:^|\n)const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^\n]*?\)|[A-Za-z_$][\w$]*)\s*=>/g)].map(match => match[1]);
  const expected = [
    "suggestedEffort","normaliseEffort","buildEffortOptions","uiDialog","editForCover","setBuilderStarted","collapsibleSections","syncSectionToggle","syncSectionToggles","setSectionOpen","configureSectionState","applyStatic","addParallelTranslations","addBilingualTranslations","generatedTranslationMap","matchEntryCase","translateMappedText","translateGeneratedState","toggleLang","buildTypes","chooseType","setRecipient","setCustomLabel","buildDayPicks","syncDayState","toggleEvery","toggleAsNeeded","picked","setChecks","submitRole","startEditRole","cancelRole","removeRole","submitDuty","startEditDuty","cancelDuty","removeDuty","takenSets","addFrom","addSuggestion","addBasic","fillAll","clearDuties","loadExample","toggleStarterSuggestions","useShoppingStarter","useMealStarter","renderStarterSuggestions","supportChanged","toggleNewShopCategory","addShoppingItem","startEditShoppingItem","cancelShoppingItemEdit","cycleShoppingStatus","markShoppingStock","removeShoppingItem","renderShopping","addMeal","startEditMeal","cancelMealEdit","removeMeal","addMealIngredientsToShopping","setMealPlan","renderMeals","measurementTemplateColumns","buildMeasurementOptions","updateMeasurementSubmitLabel","toggleCustomMeasurement","addMeasurementTable","removeMeasurementTable","updateMeasurementName","addMeasurementColumn","removeMeasurementColumn","updateMeasurementColumn","addMeasurementRow","removeMeasurementRow","updateMeasurementValue","renderMeasurements","renderSupport","render","renderLoad","renderSupportPrint","renderPrint","printPlan","backupFailure","backupArray","backupText","backupBoolean","backupId","backupDays","backupReference","sanitizeBackupState","exportJSON","importJSON",
    "L","t","dS","dL","B","emptyMealPlan","emptySupport","roleOf","esc","byTime","capitalizeFirstLetter","typeName","hasPlanContent","uiAlert","uiConfirm","pool","allShopItems","supportStarters","isBackupRecord"
  ];
  assert.deepEqual([...new Set([...declared,...arrows])].sort(), expected.sort());
});

test("workload option constants are valid", () => {
  assert.deepEqual(workload.DURATION_OPTIONS, [5,10,15,20,30,45,60,90,120,180]);
  assert.deepEqual(workload.INTENSITY_MULTIPLIER, {routine:1,attention:1.25,demanding:1.5});
  assert.deepEqual(workload.WORK_CATEGORIES, ["direct","household","planning","medical","appointments","supervision","other"]);
});

test("suggested workload classification covers every work type", () => {
  assert.equal(workload.suggestedEffort("Morning medication").category, "medical");
  assert.equal(workload.suggestedEffort("Deep cleaning").category, "household");
  assert.equal(workload.suggestedEffort("Budget planning").category, "planning");
  assert.equal(workload.suggestedEffort("Physiotherapy session").category, "appointments");
  assert.equal(workload.suggestedEffort("Night supervision").category, "supervision");
  assert.equal(workload.suggestedEffort("Bath routine").category, "direct");
  assert.equal(workload.suggestedEffort("Something else").category, "other");
});

test("normaliseEffort repairs invalid workload input", () => {
  const duty = workload.normaliseEffort({name:"Morning medication",minutes:17,intensity:"invalid",category:"invalid"});
  assert.deepEqual(duty, {name:"Morning medication",minutes:15,intensity:"attention",category:"medical"});
});

test("ten care templates have valid roles, duties, days and cover indexes", () => {
  assert.equal(Object.keys(TYPES).length, 10);
  for (const [key, type] of Object.entries(TYPES)){
    assert(type.roles.length > 0, `${key} has no roles`);
    if (key !== "other") assert(type.suggested.length > 0, `${key} has no suggestions`);
    for (const duty of type.suggested){
      assert(Array.isArray(duty.days), `${key} duty has no day list`);
      assert(duty.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6), `${key} duty has an invalid day`);
      if (duty.r !== null && duty.r !== undefined) assert(type.roles[duty.r], `${key} duty has an invalid owner`);
      if (duty.cover !== null && duty.cover !== undefined) assert(type.roles[duty.cover], `${key} duty has an invalid cover`);
    }
  }
});

test("first-open older-adult template has complete Thursday coverage", () => {
  const type = TYPES.elderly;
  const daily = type.suggested.filter(duty => duty.r === 1 && duty.every);
  assert.equal(daily.length, 7);
  assert(daily.every(duty => duty.cover === 0));
  const uncovered = type.suggested.flatMap(duty => duty.days.filter(day => {
    const owner = type.roles[duty.r];
    return owner && owner.off.includes(day) && (duty.cover === undefined || !type.roles[duty.cover]);
  }));
  assert.equal(uncovered.length, 0);
  assert.match(script, /coverId:cover \? cover\.id : null/);
});

test("example plan role and duty references are valid", () => {
  assert.equal(EXAMPLE.roles.length, 5);
  for (const duty of EXAMPLE.duties){
    if (duty.r !== null && duty.r !== undefined) assert(EXAMPLE.roles[duty.r]);
    if (duty.cover !== null && duty.cover !== undefined) assert(EXAMPLE.roles[duty.cover]);
    assert(duty.days.every(day => day >= 0 && day <= 6));
    assert(workload.INTENSITY_MULTIPLIER[duty.intensity]);
    assert(workload.WORK_CATEGORIES.includes(duty.category));
  }
});

test("example workload durations survive normalisation", () => {
  const unsupported = EXAMPLE.duties.filter(duty => !workload.DURATION_OPTIONS.includes(duty.minutes)).map(duty => `${duty.name.en}: ${duty.minutes}`);
  assert.deepEqual(unsupported, [], `These example durations are silently replaced during rendering: ${unsupported.join(", ")}`);
});

test("fictionalized example coverage answers are all present", () => {
  const coveredNames = [
    "Morning medication reminder","Breakfast and medication reminder","Lunch and supplements",
    "Afternoon snack","Dinner and medication reminder","Evening wellness check",
    "Morning and evening health check"
  ];
  for (const name of coveredNames){
    const duty = EXAMPLE.duties.find(item => item.name.en === name);
    assert(duty, `Example duty missing: ${name}`);
    assert.notEqual(duty.cover, undefined, `Example cover missing: ${name}`);
  }
});

test("fictionalized care-manager workload duties have exact settings", () => {
  const expected = [
    ["Budget management","Bütçe yönetimi",90],
    ["Coordination with support services","Destek hizmetleriyle koordinasyon",120]
  ];
  for (const [en,tr,minutes] of expected){
    const duty = EXAMPLE.duties.find(item => item.name.en === en);
    assert(duty);
    assert.equal(duty.name.tr, tr);
    assert.equal(duty.r, 0);
    assert.equal(duty.minutes, minutes);
    assert.equal(duty.intensity, "demanding");
    assert.equal(duty.category, "planning");
    assert.equal(duty.ongoing, true);
  }
});

test("example plan is explicitly fictionalized and excludes former identifying details", () => {
  assert.equal(EXAMPLE.recipient.en, "My Grandparent");
  assert.equal(EXAMPLE.recipient.tr, "Büyükannem/Büyükbabam");
  assert.equal(EXAMPLE_SUPPORT.measurements[0].name.en, "Example health measurements");
  assert.equal(EXAMPLE_SUPPORT.measurements[0].name.tr, "Örnek sağlık ölçümleri");
  assert.match(I18N.en.exampleNotice, /fictionalized example household/i);
  assert.match(I18N.tr.exampleNotice, /kurgulanmış bir örnek hane/i);
  assert.match(readme, /fictionalized composite household/i);
  assert.match(readme, /kurgulanmış bileşik bir hane/i);
  for (const formerDetail of ["My Grandmother", "Local butcher", "real household"]){
    assert(!html.includes(formerDetail), `Former example detail remains in HTML: ${formerDetail}`);
  }
});

test("shopping starter categories are bilingual and custom categories remain available", () => {
  assert.equal(I18N.en.shopCategoryExamples.length, 5);
  assert.equal(I18N.tr.shopCategoryExamples.length, 5);
  assert.deepEqual(I18N.en.shopCategoryExamples, ["Food and drinks","Household supplies","Personal care","Cleaning","Other"]);
  assert.deepEqual(I18N.tr.shopCategoryExamples, ["Yiyecek ve içecek","Ev ihtiyaçları","Kişisel bakım","Temizlik","Diğer"]);
  assert.match(html, /<select id="shopCategory" onchange="toggleNewShopCategory\(this\.value\)">/);
  assert.match(script, /value="__new__"/);
});

test("every care option has bilingual opt-in shopping and meal prompts", () => {
  assert.deepEqual(Object.keys(SUPPORT_STARTERS).sort(), Object.keys(TYPES).sort());
  for (const key of Object.keys(TYPES)){
    const starter = SUPPORT_STARTERS[key];
    assert.equal(starter.shopping.length, 3, `${key} shopping prompt count`);
    assert.equal(starter.meals.length, 3, `${key} meal prompt count`);
    for (const prompt of [...starter.shopping,...starter.meals]){
      assert.equal(typeof prompt.en, "string"); assert(prompt.en.trim());
      assert.equal(typeof prompt.tr, "string"); assert(prompt.tr.trim());
    }
  }
  assert.match(html, /id="shopStarterToggle"/);
  assert.match(html, /id="mealStarterToggle"/);
  assert.match(I18N.en.mealStarterHint, /not food advice/);
  assert.match(I18N.tr.mealStarterHint, /beslenme önerisi değildir/);
});

test("shopping status field precedes source field and supports all states", () => {
  assert(html.indexOf('id="shopStatus"') < html.indexOf('id="shopSource"'));
  assert.deepEqual(I18N.en.shopStatus, {stock:"In stock",low:"Running low",needed:"Needed"});
  assert.deepEqual(I18N.tr.shopStatus, {stock:"Stokta",low:"Azaldı",needed:"Gerekli"});
  assert.match(script, /const order=\["stock","low","needed"\]/);
});

test("shopping items and meals expose edit, save and cancel controls", () => {
  for (const marker of ["startEditShoppingItem","cancelShoppingItemEdit","startEditMeal","cancelMealEdit","shopSubmit","shopCancel","mealSubmit","mealCancel"]) assert(html.includes(marker), marker);
  assert.match(script, /found\.item\.name=name;found\.item\.source=source;found\.item\.status=status/);
  assert.match(script, /meal\.name=name;meal\.ingredients=ingredients;meal\.notes=notes/);
});

test("weekly meal dropdowns receive bilingual accessible names", () => {
  assert.match(script,/select aria-label="\$\{esc\(dL\(day\)\+" — "\+t\("mealSlots"\)\[slot\]\)\}"/);
});

test("measurement tables are unlimited and remain directly editable", () => {
  assert.match(script, /state\.measurements\.push\(table\)/);
  assert.match(script, /select\.value==="custom"\?"addCustomTable":state\.measurements\.length\?"addAnotherTable":"addTable"/);
  assert.match(html, /oninput="updateMeasurementName/);
  assert.match(html, /id="measurementTemplate" onchange="toggleCustomMeasurement\(this\.value\)"/);
  assert.match(html, /id="measurementNameWrap" hidden/);
  assert.match(script, /if\(kind==="custom"&&!custom\)/);
  assert.match(html, /data-i18n="measureUnlimitedHint"/);
  assert.match(I18N.en.measureUnlimitedHint,/as many separate tables/);
  assert.match(I18N.tr.measureUnlimitedHint,/ihtiyaç duyduğu kadar ayrı tablo/);
});

test("language switching translates generated and mapped manual state", () => {
  assert.match(script,/function translateGeneratedState\(from,to\)/);
  assert.match(script,/\[TYPES,BASICS,SUPPORT_STARTERS,EXAMPLE,EXAMPLE_SUPPORT,USER_ENTRY_GLOSSARY\]/);
  assert.match(script,/state\.shopping\|\|\[\]/);
  assert.match(script,/state\.measurements\|\|\[\]/);
  const toggle=script.slice(script.indexOf("function toggleLang"),script.indexOf("/* ---------- Setup UI",script.indexOf("function toggleLang")));
  assert.match(toggle,/translateGeneratedState\(from,to\)/);
  assert.doesNotMatch(toggle,/chooseType\(|loadExample\(/);
});

test("offline manual-entry translation includes köfte and list-aware matching", () => {
  const pairs=Object.fromEntries(USER_ENTRY_GLOSSARY.map(pair=>[pair.tr,pair.en]));
  assert.equal(pairs.Köfte,"Meatballs");
  assert.equal(pairs.Patates,"Potatoes");
  assert.match(script,/function translateMappedText\(map,value,from,to\)/);
  assert.match(script,/value\.split\(\/\(\\s\*\[,;\]\\s\*\)\//);
});

test("meal ingredients are capitalized when transferred to shopping", () => {
  assert.match(script,/meal\.ingredients\.split\(","\)\.map\(x=>capitalizeFirstLetter\(x\.trim\(\)\)\)/);
  assert.match(script,/match\.item\.name=capitalizeFirstLetter\(match\.item\.name\)/);
});

test("every major section uses independent native bilingual disclosure controls", () => {
  const ids=["careDetails","rolesDetails","dutiesDetails","shoppingDetails","mealDetails","measurementDetails","weekPlanDetails","coverageDetails","loadDetails"];
  for(const id of ids){
    assert.match(html,new RegExp(`<details id="${id}" data-collapsible`),id);
    assert.match(html,new RegExp(`id="${id}Toggle"`),`${id} label`);
  }
  assert.equal(I18N.en.showSection,"Show");assert.equal(I18N.en.hideSection,"Hide");
  assert.equal(I18N.tr.showSection,"Göster");assert.equal(I18N.tr.hideSection,"Gizle");
  assert.match(script,/configureSectionState\("type"\)/);
  assert.match(script,/configureSectionState\("example"\)/);
  assert.match(script,/document\.getElementById\("planStage"\)\.scrollIntoView/);
  assert.match(html,/details\[data-collapsible\] > :not\(summary\)\{display:block !important\}/);
});

test("standby availability copy does not use a centred dot", () => {
  assert.equal(I18N.en.standbyMeta(6),"regular availability/supervision, about 6 days/week");
  assert.equal(I18N.tr.standbyMeta(6),"düzenli hazır bulunma/gözetim, haftada yaklaşık 6 gün");
});

test("example shopping guide and current list are populated", () => {
  assert.equal(EXAMPLE_SUPPORT.shopping.length, 7);
  assert(EXAMPLE_SUPPORT.shopping.flatMap(category => category.items).length >= 35);
  assert(EXAMPLE_SUPPORT.shopping.some(category => category.items.some(item => item.status === "stock")));
  assert(EXAMPLE_SUPPORT.shopping.some(category => category.items.some(item => item.status === "low")));
  assert(EXAMPLE_SUPPORT.shopping.some(category => category.items.some(item => item.status === "needed")));
});

test("example meal library and weekly plan are internally consistent", () => {
  assert.equal(EXAMPLE_SUPPORT.meals.length, 11);
  const keys = new Set(EXAMPLE_SUPPORT.meals.map(meal => meal.key));
  assert.equal(keys.size, EXAMPLE_SUPPORT.meals.length);
  assert.equal(EXAMPLE_SUPPORT.mealPlan.length, 7);
  for (const day of EXAMPLE_SUPPORT.mealPlan){
    assert.deepEqual(Object.keys(day).sort(), ["breakfast","dinner","lunch"]);
    for (const mealKey of Object.values(day)) assert(keys.has(mealKey));
  }
});

test("every example meal ingredient exists in the bilingual shopping guide", () => {
  for (const locale of ["en","tr"]){
    const items = new Set(EXAMPLE_SUPPORT.shopping.flatMap(category => category.items.map(item => item.name[locale])));
    for (const meal of EXAMPLE_SUPPORT.meals){
      for (const ingredient of meal.ingredients[locale].split(",").map(value => value.trim()).filter(Boolean)){
        assert(items.has(ingredient), `${locale} ingredient is not in the guide: ${ingredient}`);
      }
    }
  }
});

test("measurement example is blank and calendar-enabled", () => {
  assert.equal(EXAMPLE_SUPPORT.measurements.length, 1);
  assert.deepEqual(EXAMPLE_SUPPORT.measurements[0].rows, []);
  assert.equal(EXAMPLE_SUPPORT.measurements[0].columns[0].type, "date");
  assert.match(script, /c\.type==="date"\?"date":"text"/);
});

test("all destructive controls use styled confirmations", () => {
  const names = ["removeRole","removeDuty","clearDuties","removeShoppingItem","removeMeal","removeMeasurementTable","removeMeasurementColumn","removeMeasurementRow"];
  for (const name of names){
    const start = script.indexOf(`function ${name}`);
    assert(start >= 0, `${name} is missing`);
    const next = script.indexOf("\nfunction ", start + 10);
    const body = script.slice(start, next < 0 ? script.length : next);
    assert(body.includes("uiConfirm("), `${name} does not confirm`);
  }
  assert.doesNotMatch(script.replaceAll("uiAlert(", "").replaceAll("uiConfirm(", ""), /(^|[^A-Za-z])(alert|confirm)\(/);
});

test("backup import validates every current module and legacy cover migration", () => {
  for (const marker of ["const BACKUP_LIMITS", "sanitizeBackupState", "backupReference", "roleNames", "maxShoppingItems", "maxTableRows", "file.size", "fr.result.length"]){
    assert(script.includes(marker), `Backup marker missing: ${marker}`);
  }
  assert.doesNotMatch(script,/roles:\s*s\.roles|duties:\s*s\.duties/);
});

test("privacy contract has no network or persistent-storage writes", () => {
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(/);
  assert.doesNotMatch(script, /localStorage\.setItem|sessionStorage\.setItem|indexedDB\.open/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i);
});

test("embedded font and license files are present", () => {
  assert.match(html, /font-family:"Source Serif 4"/);
  for (const file of ["fonts/OFL-SourceSerif4.md","fonts/OFL-PublicSans.txt","fonts/OFL-IBMPlexMono.txt"]){
    assert(fs.existsSync(path.join(root, file)), `Missing font license: ${file}`);
  }
  assert.equal(fs.existsSync(path.join(root,"fonts/OFL-Fraunces.txt")),false);
  assert.match(license,/Copyright \(c\) 2026 Dilara Murathanoglu/);
  assert.match(license,/Source Serif 4, Public Sans, IBM Plex Mono/);
  assert.doesNotMatch(license,/Fraunces|Murathanoğlu/);
});

test("every CSS custom property is defined", () => {
  const definitions=new Set([...html.matchAll(/--([\w-]+)\s*:/g)].map(match=>match[1]));
  const uses=new Set([...html.matchAll(/var\(--([\w-]+)/g)].map(match=>match[1]));
  assert.deepEqual([...uses].filter(name=>!definitions.has(name)),[]);
});

test("small text palette meets WCAG AA contrast", () => {
  const luminance=hex=>{
    const values=hex.match(/[0-9A-F]{2}/gi).map(part=>parseInt(part,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
    return 0.2126*values[0]+0.7152*values[1]+0.0722*values[2];
  };
  const contrast=(foreground,background)=>{const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
  for(const background of ["F3F5F2","FFFFFF"])assert(contrast("64716B",background)>=4.5);
  for(const background of ["FBF0D8","F3F5F2","FFFFFF"])assert(contrast("855A08",background)>=4.5);
});

test("full-width copy and Turkish PDF load width regressions remain fixed", () => {
  for (const selector of ["sub","load-note","load-method","note"]){
    const match = html.match(new RegExp(`\\.${selector}\\{([^}]*)\\}`));
    assert(match, `Missing .${selector}`);
    assert.match(match[1], /max-width:none/);
  }
  assert.match(html, /\.bar \.num\{width:168px/);
});

test("responsive and print rules exist", () => {
  assert.match(html, /@media \(max-width:820px\)/);
  assert.match(html, /@media \(max-width:560px\)/);
  assert.match(html, /@media print/);
  assert.match(html, /@page\{ size:A4 portrait/);
  assert.match(html, /print-color-adjust:exact/);
});

test("README describes the current bilingual feature set", () => {
  const phrases = [
    "# Care Plan Builder · Bakım Planı Oluşturucu",
    "Shopping guide and current list","Meal library and weekly meal planner","Custom measurement tables",
    "Alışveriş rehberi ve güncel liste","Yemek kütüphanesi ve haftalık yemek planı","Özel ölçüm tabloları"
  ];
  for (const phrase of phrases) assert(readme.includes(phrase), `README phrase missing: ${phrase}`);
  for (const target of ["care-plan-builder.html","LICENSE","fonts"]){
    assert(fs.existsSync(path.join(root, target)), `README target missing: ${target}`);
  }
});

console.log(`\nRESULT ${passed} passed, ${failed} failed`);
if (failed){
  for (const {name,error} of failures) console.error(`- ${name}: ${error.stack || error.message}`);
  process.exitCode = 1;
}
