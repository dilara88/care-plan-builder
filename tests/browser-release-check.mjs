import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const appPath=path.join(root,"care-plan-builder.html");
const outputDir=path.join(root,"visual tests","current-release");
fs.mkdirSync(outputDir,{recursive:true});

const candidates={
  chrome:["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
  edge:["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]
};
const browsers=Object.fromEntries(Object.entries(candidates).map(([name,items])=>[name,items.find(fs.existsSync)]).filter(([,value])=>value));
assert(browsers.chrome,"Chrome is required for the full browser release check");

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on("error",reject);server.listen(0,"127.0.0.1",()=>{const {port}=server.address();server.close(()=>resolve(port))})})}
async function poll(fn,timeout=15000){const start=Date.now();let last;while(Date.now()-start<timeout){try{return await fn()}catch(error){last=error;await delay(100)}}throw last||new Error("Timed out")}

class Cdp {
  static async connect(url){
    const client=new Cdp(url);
    await new Promise((resolve,reject)=>{client.socket.addEventListener("open",resolve,{once:true});client.socket.addEventListener("error",reject,{once:true})});
    return client;
  }
  constructor(url){
    this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();this.events=[];
    this.socket.addEventListener("message",event=>{const message=JSON.parse(event.data);if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result)}else this.events.push(message)});
  }
  send(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
  close(){this.socket.close()}
}

async function launchBrowser(name,executable){
  const port=await freePort();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),`care-plan-builder-${name}-`));
  const process=spawn(executable,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking","--disable-component-update","--disable-sync","--metrics-recording-only",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
  const base=`http://127.0.0.1:${port}`;
  await poll(async()=>{const response=await fetch(`${base}/json/version`);if(!response.ok)throw new Error("Browser not ready");return response.json()});
  return {name,process,profile,base};
}

async function openRawPage(browser,url){
  const response=await fetch(`${browser.base}/json/new?${encodeURIComponent(url)}`,{method:"PUT"});
  if(!response.ok)throw new Error(`Cannot open page: ${response.status}`);
  const target=await response.json();const cdp=await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");await cdp.send("Runtime.enable");await cdp.send("Network.enable");await cdp.send("Accessibility.enable");
  return cdp;
}
async function openPage(browser,url){const cdp=await openRawPage(browser,url);await waitForApp(cdp);return cdp}

async function evaluate(cdp,expression,awaitPromise=false){
  const result=await cdp.send("Runtime.evaluate",{expression,awaitPromise,returnByValue:true,userGesture:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||"Evaluation failed");
  return result.result.value;
}
async function waitForApp(cdp){await poll(async()=>{const ready=await evaluate(cdp,"document.readyState==='complete' && typeof loadExample==='function'");if(!ready)throw new Error("App not ready");return true})}
async function navigate(cdp,url){await cdp.send("Page.navigate",{url});await waitForApp(cdp)}
async function viewport(cdp,width,height,mobile=width<=430){await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:mobile,maxTouchPoints:mobile?5:1});await evaluate(cdp,"window.scrollTo(0,0)")}
async function screenshot(cdp,name){const result=await cdp.send("Page.captureScreenshot",{format:"png",fromSurface:true});const target=path.join(outputDir,name);fs.writeFileSync(target,Buffer.from(result.data,"base64"));return target}
async function key(cdp,keyName,options={}){const codes={Tab:["Tab",9],Enter:["Enter",13],Escape:["Escape",27],PageDown:["PageDown",34]};const [code,vk]=codes[keyName]||[keyName,0];const text=keyName==="Enter"?"\r":"";await cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:keyName,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,text,unmodifiedText:text,modifiers:options.shiftKey?8:0});await cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:keyName,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers:options.shiftKey?8:0})}
async function clickAt(cdp,x,y){await cdp.send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});await cdp.send("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1})}
async function selectPdfPage(cdp,page){await clickAt(cdp,360,29);await cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2});await cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2});await cdp.send("Input.insertText",{text:String(page)});await key(cdp,"Enter");await delay(500)}
function pageCount(pdf){return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length}

const results={automatedAt:new Date().toISOString(),browsers:{},responsive:{},keyboard:{},accessibility:{},offline:{},pdf:{},warnings:[]};
const appUrl=pathToFileURL(appPath).href;

const deviceProfiles=[
  {id:"android-phone-small",width:360,height:800,kind:"Android phone",visualLocale:"tr"},
  {id:"iphone-se",width:375,height:667,kind:"iOS phone"},
  {id:"iphone-modern",width:390,height:844,kind:"iOS phone"},
  {id:"android-phone-large",width:412,height:915,kind:"Android phone"},
  {id:"phone-landscape",width:740,height:360,kind:"Phone landscape",visualLocale:"en"},
  {id:"android-tablet-compact",width:600,height:960,kind:"Android tablet",visualLocale:"tr"},
  {id:"ipad-mini",width:768,height:1024,kind:"iOS tablet",visualLocale:"tr"},
  {id:"android-tablet",width:800,height:1280,kind:"Android tablet"},
  {id:"ipad-air",width:820,height:1180,kind:"iOS tablet"},
  {id:"tablet-landscape",width:1024,height:768,kind:"Tablet landscape"},
  {id:"desktop",width:1366,height:768,kind:"Desktop",visualLocale:"en"}
];
const matrixSectionIds=["careDetails","rolesDetails","dutiesDetails","shoppingDetails","mealDetails","measurementDetails","weekPlanDetails","coverageDetails","loadDetails"];

async function inspectDeviceMatrix(cdp){
  results.responsive.deviceMatrix={profiles:{},sections:[...matrixSectionIds],locales:["en","tr"]};
  for(const profile of deviceProfiles){
    await viewport(cdp,profile.width,profile.height,profile.kind!=="Desktop");
    const currentLanguage=await evaluate(cdp,"document.documentElement.lang");if(currentLanguage!=="en")await evaluate(cdp,"toggleLang()");
    await evaluate(cdp,"loadExample(true)",true);
    await evaluate(cdp,"if(state.measurements[0]&&!state.measurements[0].rows.length)addMeasurementRow(state.measurements[0].id)");
    const profileResult={width:profile.width,height:profile.height,kind:profile.kind,locales:{}};
    for(const locale of ["en","tr"]){
      const activeLanguage=await evaluate(cdp,"document.documentElement.lang");if(activeLanguage!==locale)await evaluate(cdp,"toggleLang()");
      const localeResult={sections:0};
      for(const sectionId of matrixSectionIds){
        await evaluate(cdp,`(()=>{collapsibleSections().forEach(item=>item.open=item.id==="${sectionId}");const target=document.getElementById("${sectionId}");const surface=target.closest("section,.result-panel")||target;surface.scrollLeft=0;target.scrollLeft=0;surface.scrollIntoView({block:"start",inline:"nearest"});window.scrollTo(0,window.scrollY)})()`);await delay(60);
        const metrics=await evaluate(cdp,`(()=>{const viewportWidth=document.documentElement.clientWidth;const section=document.getElementById("${sectionId}");const visible=element=>element.getClientRects().length>0;const rectInfo=element=>{const rect=element.getBoundingClientRect();return {tag:element.tagName,id:element.id,className:String(element.className||""),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)}};const protectedByScroller=element=>{for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent);if(/auto|scroll/.test(style.overflowX)&&parent.scrollWidth>parent.clientWidth+1)return true}return false};const surfaces=[section,...section.querySelectorAll(".panel,.module-panel,.result-panel,.module-body,.starter-box,.compact-form,.category-card,.meal-card,.measurement-card,.day,.coverage-panel,.load")].filter(visible);const surfaceOffenders=surfaces.filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.left<-1||rect.right>viewportWidth+1)}).map(rectInfo);const controls=[...section.querySelectorAll("button,input,select,textarea,summary")].filter(visible);const controlOffenders=controls.filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.width>viewportWidth+1||((rect.left<-1||rect.right>viewportWidth+1)&&!protectedByScroller(element)))}).map(rectInfo);const summary=section.querySelector("summary");const summaryRect=summary?.getBoundingClientRect();const summaryChildren=summary?[...summary.children].filter(visible):[];const summaryChildOffenders=summaryChildren.filter(element=>{const rect=element.getBoundingClientRect();return rect.left<(summaryRect?.left||0)-1||rect.right>(summaryRect?.right||viewportWidth)+1}).map(rectInfo);return {viewportWidth,documentWidth:document.documentElement.scrollWidth,documentOverflow:document.documentElement.scrollWidth>viewportWidth+1,horizontalScroll:Math.round(window.scrollX),surfaceScroll:Math.round((section.closest("section,.result-panel")||section).scrollLeft),surfaceOffenders,controlOffenders,summaryChildOffenders,summaryContained:!summaryRect||(summaryRect.left>=-1&&summaryRect.right<=viewportWidth+1)}})()`);
        assert.equal(metrics.documentOverflow,false,`${profile.id}/${locale}/${sectionId}: document overflow ${metrics.documentWidth}/${metrics.viewportWidth}`);
        assert.deepEqual(metrics.surfaceOffenders,[],`${profile.id}/${locale}/${sectionId}: surface overflow`);
        assert.deepEqual(metrics.controlOffenders,[],`${profile.id}/${locale}/${sectionId}: control overflow`);
        assert.deepEqual(metrics.summaryChildOffenders,[],`${profile.id}/${locale}/${sectionId}: summary content overflow`);
        assert.equal(metrics.summaryContained,true,`${profile.id}/${locale}/${sectionId}: summary overflow`);
        assert.equal(metrics.horizontalScroll,0,`${profile.id}/${locale}/${sectionId}: horizontal viewport scroll`);
        assert.equal(metrics.surfaceScroll,0,`${profile.id}/${locale}/${sectionId}: horizontal section scroll`);
        localeResult.sections++;
        if(profile.visualLocale===locale){
          await screenshot(cdp,`matrix-${profile.id}-${locale}-${sectionId}.png`);
          if(sectionId==="rolesDetails"){await evaluate(cdp,"(()=>{const element=document.getElementById('roleForm');window.scrollTo(0,window.scrollY+element.getBoundingClientRect().top)})()");await screenshot(cdp,`matrix-${profile.id}-${locale}-role-form.png`)}
          if(sectionId==="dutiesDetails"){await evaluate(cdp,"(()=>{const element=document.getElementById('dutyList');window.scrollTo(0,window.scrollY+element.getBoundingClientRect().top)})()");await screenshot(cdp,`matrix-${profile.id}-${locale}-duty-rows.png`);await evaluate(cdp,"(()=>{const element=document.getElementById('dutyForm');window.scrollTo(0,window.scrollY+element.getBoundingClientRect().top)})()");await screenshot(cdp,`matrix-${profile.id}-${locale}-duty-form.png`)}
        }
      }
      profileResult.locales[locale]=localeResult;
    }
    results.responsive.deviceMatrix.profiles[profile.id]=profileResult;
  }
}

async function detailedChrome(browser){
  const cdp=await openPage(browser,appUrl);
  try{
    assert.equal(await evaluate(cdp,"document.compatMode"),"CSS1Compat");
    assert.equal(await evaluate(cdp,"document.title"),"Care Plan Builder");

    await viewport(cdp,390,844);await screenshot(cdp,"chrome-mobile-390-welcome.png");
    assert.equal(await evaluate(cdp,"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true);
    await evaluate(cdp,"loadExample(true)",true);
    await evaluate(cdp,"document.getElementById('planStage').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-example-plan-en.png");
    assert.equal(await evaluate(cdp,"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true);
    results.responsive.mobile390={overflow:false};

    await evaluate(cdp,"setSectionOpen('shoppingDetails',true);starterOpen.shopping=true;renderStarterSuggestions();document.querySelector('#shoppingDetails .starter-box').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-shopping-starters-en.png");
    await evaluate(cdp,"setSectionOpen('mealDetails',true);starterOpen.meals=true;renderStarterSuggestions();document.querySelector('#mealDetails .starter-box').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-meal-starters-en.png");
    await evaluate(cdp,"document.querySelector('#mealDetails .meal-plan-wrap').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-weekly-meal-plan-en.png");

    await evaluate(cdp,"toggleLang()");await evaluate(cdp,"document.getElementById('planStage').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-example-plan-tr.png");
    assert.equal(await evaluate(cdp,"document.documentElement.lang"),"tr");

    await evaluate(cdp,"setSectionOpen('shoppingDetails',true);document.getElementById('shoppingDetails').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-shopping-tr.png");
    const shoppingContainment=await evaluate(cdp,`(()=>{const body=document.querySelector('#shoppingDetails .module-body').getBoundingClientRect();const selectors=['#shoppingDetails .category-card','#shoppingDetails .guide-item > *','#shoppingDetails .compact-form','#shoppingDetails .current-list','#shoppingDetails .current-item > *'];const offenders=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]).filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.left<body.left-1||rect.right>body.right+1)}).map(element=>element.className||element.tagName);return {offenders,guideDisplay:getComputedStyle(document.querySelector('#shoppingDetails .guide-item')).display,currentDisplay:getComputedStyle(document.querySelector('#shoppingDetails .current-item')).display}})()`);
    assert.deepEqual(shoppingContainment.offenders,[]);assert.equal(shoppingContainment.guideDisplay,"grid");assert.equal(shoppingContainment.currentDisplay,"grid");
    await evaluate(cdp,"starterOpen.shopping=true;renderStarterSuggestions();document.querySelector('#shoppingDetails .starter-box').scrollIntoView()");
    const shoppingStarterContainment=await evaluate(cdp,`(()=>{const box=document.querySelector('#shoppingDetails .starter-box');const bounds=box.getBoundingClientRect();const elements=[...box.querySelectorAll('.starter-copy,.starter-copy > *,.btn-ghost,.starter-chips,.starter-chip')].filter(element=>element.getClientRects().length);const offenders=elements.filter(element=>{const rect=element.getBoundingClientRect();return rect.left<bounds.left-1||rect.right>bounds.right+1}).map(element=>element.className||element.tagName);return {offenders,boxDisplay:getComputedStyle(box).display,copyMinWidth:getComputedStyle(box.querySelector('.starter-copy')).minWidth}})()`);
    assert.deepEqual(shoppingStarterContainment,{offenders:[],boxDisplay:"block",copyMinWidth:"0px"});await screenshot(cdp,"chrome-mobile-390-shopping-starters-tr.png");
    await evaluate(cdp,"document.querySelector('#shoppingDetails .current-list').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-shopping-current-tr.png");

    await evaluate(cdp,"setSectionOpen('mealDetails',true);starterOpen.meals=true;renderStarterSuggestions();document.querySelector('#mealDetails .starter-box').scrollIntoView()");
    const mealStarterContainment=await evaluate(cdp,`(()=>{const box=document.querySelector('#mealDetails .starter-box');const bounds=box.getBoundingClientRect();const elements=[...box.querySelectorAll('.starter-copy,.starter-copy > *,.btn-ghost,.starter-chips,.starter-chip')].filter(element=>element.getClientRects().length);const offenders=elements.filter(element=>{const rect=element.getBoundingClientRect();return rect.left<bounds.left-1||rect.right>bounds.right+1}).map(element=>element.className||element.tagName);return {offenders,boxDisplay:getComputedStyle(box).display,copyMinWidth:getComputedStyle(box.querySelector('.starter-copy')).minWidth}})()`);
    assert.deepEqual(mealStarterContainment,{offenders:[],boxDisplay:"block",copyMinWidth:"0px"});await screenshot(cdp,"chrome-mobile-390-meal-starters-tr.png");
    await evaluate(cdp,"document.querySelector('#mealDetails .meal-plan-wrap').scrollIntoView()");
    const mobileMealPlan=await evaluate(cdp,`(()=>{const wrap=document.querySelector('#mealDetails .meal-plan-wrap');const bounds=wrap.getBoundingClientRect();const elements=[...wrap.querySelectorAll('tbody,tr,th,td,select')].filter(element=>element.getClientRects().length);const offenders=elements.filter(element=>{const rect=element.getBoundingClientRect();return rect.left<bounds.left-1||rect.right>bounds.right+1}).map(element=>element.tagName);return {offenders,headDisplay:getComputedStyle(wrap.querySelector('thead')).display,bodyDisplay:getComputedStyle(wrap.querySelector('tbody')).display,rowDisplay:getComputedStyle(wrap.querySelector('tbody tr')).display,cellDisplay:getComputedStyle(wrap.querySelector('td[data-label]')).display,overflowX:getComputedStyle(wrap).overflowX,labels:[...wrap.querySelectorAll('td[data-label]')].slice(0,3).map(cell=>cell.dataset.label)}})()`);
    assert.deepEqual(mobileMealPlan,{offenders:[],headDisplay:"none",bodyDisplay:"grid",rowDisplay:"block",cellDisplay:"grid",overflowX:"visible",labels:["Kahvaltı","Öğle","Akşam"]});await screenshot(cdp,"chrome-mobile-390-weekly-meal-plan-tr.png");

    await evaluate(cdp,"addMeasurementRow(state.measurements[0].id);setSectionOpen('measurementDetails',true);document.getElementById('measurementDetails').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-measurements-tr.png");
    const measurementContainment=await evaluate(cdp,`(()=>{const body=document.querySelector('#measurementDetails .module-body').getBoundingClientRect();const selectors=['#measurementDetails .measurement-card','#measurementDetails .measurement-head > *','#measurementDetails .column-chip','#measurementDetails .measurement-entry','#measurementDetails .measurement-entry > *'];const offenders=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]).filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.left<body.left-1||rect.right>body.right+1)}).map(element=>element.className||element.tagName);return {offenders,headDisplay:getComputedStyle(document.querySelector('#measurementDetails .measurement-table thead')).display,rowDisplay:getComputedStyle(document.querySelector('#measurementDetails .measurement-entry')).display,cellDisplay:getComputedStyle(document.querySelector('#measurementDetails .measurement-entry td[data-label]')).display}})()`);
    assert.deepEqual(measurementContainment.offenders,[]);assert.equal(measurementContainment.headDisplay,"none");assert.equal(measurementContainment.rowDisplay,"block");assert.equal(measurementContainment.cellDisplay,"grid");
    await evaluate(cdp,"document.querySelector('#measurementDetails .measurement-entry').scrollIntoView()");await screenshot(cdp,"chrome-mobile-390-measurement-row-tr.png");
    const mobileOverflow=await evaluate(cdp,`(()=>{const viewport=document.documentElement.clientWidth;return {viewport,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.left<-1||rect.right>viewport+1)}).map(element=>({tag:element.tagName,id:element.id,className:String(element.className||''),left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right)})).slice(0,20)}})()`);
    assert.equal(mobileOverflow.scrollWidth<=mobileOverflow.viewport,true,JSON.stringify(mobileOverflow,null,2));

    await viewport(cdp,768,900);await evaluate(cdp,"window.scrollTo(0,0)");await screenshot(cdp,"chrome-tablet-768-top-tr.png");
    await evaluate(cdp,"document.getElementById('planStage').scrollIntoView()");await screenshot(cdp,"chrome-tablet-768-example-plan-tr.png");
    assert.equal(await evaluate(cdp,"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true);
    const tabletModules=await evaluate(cdp,"({guide:getComputedStyle(document.querySelector('#shoppingDetails .guide-item')).display,current:getComputedStyle(document.querySelector('#shoppingDetails .current-item')).display,starterBox:getComputedStyle(document.querySelector('#shoppingDetails .starter-box')).display,mealHead:getComputedStyle(document.querySelector('#mealDetails .meal-plan thead')).display,mealRow:getComputedStyle(document.querySelector('#mealDetails .meal-plan tbody tr')).display,mealOverflow:getComputedStyle(document.querySelector('#mealDetails .meal-plan-wrap')).overflowX,measurementHead:getComputedStyle(document.querySelector('#measurementDetails .measurement-table thead')).display,measurementRow:getComputedStyle(document.querySelector('#measurementDetails .measurement-entry')).display,modulePadding:getComputedStyle(document.querySelector('#shoppingDetails .module-body')).paddingLeft})");
    assert.deepEqual(tabletModules,{guide:"flex",current:"flex",starterBox:"flex",mealHead:"table-header-group",mealRow:"table-row",mealOverflow:"auto",measurementHead:"table-header-group",measurementRow:"table-row",modulePadding:"24px"});
    results.responsive.tablet768={overflow:false,desktopTableLayoutPreserved:true};

    await viewport(cdp,1440,1000);await evaluate(cdp,"toggleLang();window.scrollTo(0,0)");await screenshot(cdp,"chrome-desktop-1440-top-en.png");
    assert.equal(await evaluate(cdp,"getComputedStyle(document.getElementById('creatorCredit')).textAlign"),"center");
    await evaluate(cdp,"document.querySelector('footer.creator-credit').scrollIntoView()");await screenshot(cdp,"chrome-desktop-1440-footer-en.png");

    await inspectDeviceMatrix(cdp);

    await navigate(cdp,appUrl);await viewport(cdp,1200,900);
    await evaluate(cdp,"document.querySelector('#careDetails summary').focus()");const before=await evaluate(cdp,"document.getElementById('careDetails').open");await key(cdp,"Enter");
    assert.notEqual(await evaluate(cdp,"document.getElementById('careDetails').open"),before);await key(cdp,"Enter");
    await evaluate(cdp,"document.getElementById('type-elderly').focus()");await key(cdp,"Enter");await poll(async()=>{if(!await evaluate(cdp,"builderStarted"))throw new Error("Care selection did not start")});
    await evaluate(cdp,"document.querySelector('#rolesDetails summary').focus()");assert.equal(await evaluate(cdp,"document.activeElement.matches(':focus-visible')"),true);await key(cdp,"Tab");
    const nextControl=await evaluate(cdp,"({tag:document.activeElement.tagName,text:document.activeElement.textContent.trim()})");assert.equal(nextControl.tag,"BUTTON");assert(nextControl.text.length>0);
    await evaluate(cdp,"document.getElementById('rName').focus()");
    await evaluate(cdp,"window.__dialogResult=null;uiConfirm('Keyboard confirmation').then(value=>window.__dialogResult=value)");await poll(async()=>{if(!await evaluate(cdp,"!!document.querySelector('.modal-wrap')"))throw new Error("Dialog missing")});
    assert.equal(await evaluate(cdp,"document.querySelector('[role=dialog]').getAttribute('aria-labelledby')"),"cpb-dialog-title");await key(cdp,"Escape");
    assert.equal(await evaluate(cdp,"window.__dialogResult"),false);assert.equal(await evaluate(cdp,"document.activeElement.id"),"rName");
    results.keyboard={disclosureEnter:true,careButtonEnter:true,tabOrder:true,focusVisible:true,dialogEscape:true,focusRestored:true};

    await evaluate(cdp,"loadExample(true)",true);await evaluate(cdp,"collapsibleSections().forEach(item=>item.open=true)");
    const audit=await evaluate(cdp,`(()=>{const visible=element=>element.getClientRects().length>0;const controls=[...document.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(visible);const name=element=>element.getAttribute('aria-label')||element.getAttribute('title')||element.textContent.trim()||element.labels?.[0]?.textContent.trim()||element.placeholder||'';return {controls:controls.length,unnamed:controls.filter(element=>!name(element)).map(element=>element.outerHTML.slice(0,160)),landmarks:{main:document.querySelectorAll('main').length,header:document.querySelectorAll('header').length,footer:document.querySelectorAll('footer').length},lang:document.documentElement.lang}})()`);
    assert.equal(audit.unnamed.length,0);assert.equal(audit.lang,"en");
    const ax=await cdp.send("Accessibility.getFullAXTree");const interactive=new Set(["button","textbox","combobox","checkbox","DisclosureTriangle","link"]);
    const unnamedAx=ax.nodes.filter(node=>interactive.has(node.role?.value)&&!node.ignored&&!String(node.name?.value||"").trim());
    assert.equal(unnamedAx.length,0,JSON.stringify(unnamedAx.map(node=>({role:node.role?.value,backendDOMNodeId:node.backendDOMNodeId,name:node.name?.value})),null,2));results.accessibility={...audit,axInteractiveNodes:ax.nodes.filter(node=>interactive.has(node.role?.value)&&!node.ignored).length,unnamedAx:0};

    await cdp.send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await navigate(cdp,appUrl);
    assert.equal(await evaluate(cdp,"document.title"),"Care Plan Builder");assert.equal(await evaluate(cdp,"typeof loadExample"),"function");
    const networkEntries=await evaluate(cdp,"performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>/^https?:/i.test(name))");assert.deepEqual(networkEntries,[]);
    results.offline={reloaded:true,httpResources:0};await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});

    await evaluate(cdp,"loadExample(true)",true);
    for(const locale of ["en","tr"]){
      const current=await evaluate(cdp,"document.documentElement.lang");if(current!==locale)await evaluate(cdp,"toggleLang()");
      const restored=await evaluate(cdp,"collapsibleSections().forEach(item=>item.open=false);window.__printCalled=false;window.print=()=>{window.__printCalled=true};printPlan().then(()=>({called:window.__printCalled,closed:collapsibleSections().every(item=>!item.open)}))",true);
      assert.deepEqual(restored,{called:true,closed:true});
      await evaluate(cdp,"collapsibleSections().forEach(item=>item.open=true);renderPrint()");
      await cdp.send("Emulation.setEmulatedMedia",{media:"print"});assert.equal(await evaluate(cdp,"getComputedStyle(document.querySelector('.p-foot')).textAlign"),"center");
      const printed=await cdp.send("Page.printToPDF",{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});const bytes=Buffer.from(printed.data,"base64");
      await cdp.send("Emulation.setEmulatedMedia",{media:"screen"});
      await evaluate(cdp,"collapsibleSections().forEach(item=>item.open=false)");assert.equal(await evaluate(cdp,"collapsibleSections().every(item=>!item.open)"),true);
      const pdfPath=path.join(outputDir,locale==="en"?"Care Plan Builder EN - current.pdf":"Bakım Planı Oluşturucu TR - current.pdf");fs.writeFileSync(pdfPath,bytes);
      const pages=pageCount(bytes);assert(pages>=1&&pages<=20);results.pdf[locale]={path:pdfPath,pages,bytes:bytes.length,allSectionsCollapsedBeforePrint:true};
    }
    for(const locale of ["en","tr"]){
      const pdfCdp=await openRawPage(browser,pathToFileURL(results.pdf[locale].path).href);
      try{
        await pdfCdp.send("Emulation.setDeviceMetricsOverride",{width:1100,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1100,screenHeight:1000});await delay(2000);
        for(let page=1;page<=results.pdf[locale].pages;page++){if(page>1)await selectPdfPage(pdfCdp,page);await screenshot(pdfCdp,`chrome-pdf-${locale}-page-${page}.png`)}
      }catch(error){results.warnings.push(`PDF viewer screenshots were unavailable for ${locale}: ${error.message}`)}finally{pdfCdp.close()}
    }
    results.browsers.chrome={passed:true};
  }finally{cdp.close()}
}

async function edgeSmoke(browser){
  const cdp=await openPage(browser,appUrl);
  try{
    await viewport(cdp,390,844);assert.equal(await evaluate(cdp,"document.compatMode"),"CSS1Compat");assert.equal(await evaluate(cdp,"document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true);
    await evaluate(cdp,"loadExample(true)",true);await evaluate(cdp,"toggleLang()");assert.equal(await evaluate(cdp,"document.documentElement.lang"),"tr");
    await evaluate(cdp,"document.getElementById('planStage').scrollIntoView()");await screenshot(cdp,"edge-mobile-390-example-plan-tr.png");results.browsers.edge={passed:true};
  }finally{cdp.close()}
}

async function runBrowser(name,executable,fn){const browser=await launchBrowser(name,executable);try{await fn(browser)}finally{browser.process.kill()}}

await runBrowser("chrome",browsers.chrome,detailedChrome);
if(browsers.edge)await runBrowser("edge",browsers.edge,edgeSmoke);else results.warnings.push("Edge was not available.");
results.warnings.push("Firefox was not installed in this Windows environment.");
results.warnings.push("Safari is not available on Windows; the README no longer promises universal modern-browser support.");
fs.writeFileSync(path.join(outputDir,"browser-release-results.json"),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
