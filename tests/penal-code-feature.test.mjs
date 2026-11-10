import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = new URL("../src/data/penal-code-2023.json", import.meta.url);
const data = JSON.parse(readFileSync(source, "utf8"));
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const reader = readFileSync(new URL("../src/PenalCodePage.tsx", import.meta.url), "utf8");
const routes = JSON.parse(readFileSync(new URL("../public/manus-routes.json", import.meta.url), "utf8"));
const groupCss = readFileSync(new URL("../src/groups.css", import.meta.url), "utf8");
const penalCss = readFileSync(new URL("../src/penal-code.css", import.meta.url), "utf8");

test("official Penal Code edition includes every numbered provision and lettered insertions", () => {
  assert.equal(data.edition, "Legislation as at 11 December 2023");
  assert.equal(data.sectionCount, 416);
  assert.equal(data.sections.length, 416);
  assert.equal(new Set(data.sections.map((section) => section.id)).size, data.sections.length);
  const numbers = new Set(data.sections.map((section) => section.number));
  for (let number = 1; number <= 398; number += 1) assert.ok(numbers.has(String(number)), `missing section ${number}`);
  assert.deepEqual(data.sections.filter((section) => !/^\d+$/.test(section.number)).map((section) => section.number), [
    "26A", "43A", "66A", "102A", "112A", "122A", "122B", "122C", "122D", "128A", "242A", "251A", "266A", "278A", "278B", "316A", "316B", "367A",
  ]);
});

test("full text retains deleted provisions, representative source text, front matter, and the alphabetical index", () => {
  const section = (number) => data.sections.find((item) => item.number === number);
  assert.match(section("3").title, /Deleted/);
  assert.match(section("9").text, /intention to cause a particular result/i);
  assert.match(section("10").text, /honest and reasonable/i);
  assert.match(section("26A").text, /\S/);
  assert.match(section("398").text, /accessory after the fact/i);
  assert.match(data.frontMatter, /Legislation as at 11 December 2023/);
  assert.match(data.frontMatter, /Contents/);
  assert.match(data.indexText, /ABDUCTION/);
  assert.ok(data.indexText.length > 50_000, "the complete scanned A–W index is included rather than the partial 2023 PDF index");
  for (const term of ["BROTHELS", "DANGEROUS", "WARRANTS"]) assert.match(data.indexText, new RegExp(term));
  assert.match(data.indexEdition, /2014/);
  assert.match(data.indexSourceUrl, /probation\.go\.ke/);
  assert.match(reader, /source\.indexSourceUrl/);
  assert.match(reader, /OCR may contain recognition errors/);
  assert.equal(data.pageCount, 117);
});

test("Penal Code is a standalone app feature with a direct route", () => {
  assert.ok(routes.routes.some((route) => route.path === "/penal-code"));
  assert.match(app, /id: "penal-code", label: "Penal Code"/);
  assert.match(app, /view === "penal-code"/);
  assert.match(app, /lazy\(\(\) => import\("\.\/PenalCodePage"\)\)/);
});

test("Group sharing fields stack and controls have narrow-screen rules", () => {
  assert.match(groupCss, /\.groups-field\s*\{[^}]*display:\s*grid/s);
  assert.match(groupCss, /\.groups-material-scope-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(groupCss, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.groups-material-scope-row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(penalCss, /@media\s*\(max-width:\s*820px\)/);
  assert.match(penalCss, /@media\s*\(max-width:\s*480px\)/);
  assert.match(penalCss, /overflow-wrap:\s*anywhere/);
});
