import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const html = fs.readFileSync(path.join(root, "care-plan-builder.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

let passed = 0;
function test(name, fn){ fn(); passed += 1; console.log(`PASS ${name}`); }

test("main HTML has unique IDs and parseable JavaScript", () => {
  assert(script); new Function(script);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test("welcome state exposes only example and language toolbar controls", () => {
  assert.match(html, /id="welcomeCopy"/);
  assert.match(html, /id="builderFields" hidden/);
  assert.match(html, /id="planStage" hidden/);
  assert.match(html, /id="recipientFields" hidden/);
  assert.equal((html.match(/class="[^"]*plan-action[^"]*" hidden/g) || []).length, 5);
  assert.match(html, /class="privacy plan-action" id="toolbarNote" hidden/);
  assert.match(html, /<button class="btn" onclick="loadExample\(\)" data-i18n="btnExample">/);
  assert.match(html, /<button class="btn" id="langBtn" onclick="toggleLang\(\)">/);
});

test("welcome guidance is complete and bilingual", () => {
  for (const copy of [
    "Select who is being cared for to start a new plan.",
    "Select “Show the example plan” to explore a completed household example.",
    "Yeni bir plan başlatmak için kime bakım verildiğini seçin.",
    "Tamamlanmış bir hane örneğini incelemek için “Örnek planı göster”i seçin."
  ]) assert(html.includes(copy), copy);
});

test("initialisation does not select a care type or add duties", () => {
  const init = script.slice(script.indexOf("/* ---------- Init:"));
  assert.match(init, /setBuilderStarted\(false\)/);
  assert.doesNotMatch(init, /chooseType\(|fillAll\(|loadExample\(/);
});

test("choosing care reveals a clean builder", () => {
  assert.match(script, /async function chooseType\(key,relangOnly=false\)/);
  assert.match(script, /duties:\[\], \.\.\.emptySupport\(\)/);
  assert.match(script, /autoContent = "type";\s+setBuilderStarted\(true\)/);
  assert.match(script, /document\.getElementById\("rolesSection"\)\.scrollIntoView/);
});

test("example and imported plans reveal all top actions", () => {
  assert.match(script, /autoContent = "example";\s+setBuilderStarted\(true\)/);
  assert.match(script, /autoContent = null;\s+setBuilderStarted\(true\);/);
  assert.match(script, /document\.querySelectorAll\("\.plan-action"\).*el\.hidden=!builderStarted/);
});

console.log(`\nRESULT ${passed} passed, 0 failed`);
