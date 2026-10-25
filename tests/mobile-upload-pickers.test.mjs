import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const accepts = (text) => [...text.matchAll(/accept="([^"]+)"/g)].map((match) => match[1]);
const documentSource = /\.(?:pdf|docx?|pptx?|xlsx?|txt|md|csv|rtf|json|html)(?:,|$)|application\/|text\//i;

const auditedPages = [
  ["Notes Review", source("../src/NotesReviewPage.tsx")],
  ["Study Assistant", source("../src/StudyAssistant.tsx")],
  ["Lawyer Agent", source("../src/FloatingLawyerAgent.tsx")],
  ["Library material", source("../src/App.tsx")],
];

test("site upload inputs never mix image and document types in one picker", () => {
  for (const [name, text] of auditedPages) {
    const filters = accepts(text);
    assert.ok(filters.length, `${name} should contain file-picker filters`);
    const mixed = filters.filter((filter) => /image\//i.test(filter) && documentSource.test(filter));
    assert.deepEqual(mixed, [], `${name} must use separate image and document pickers`);
    assert.ok(filters.some((filter) => /image\//i.test(filter)), `${name} retains an image picker`);
    assert.ok(filters.some((filter) => documentSource.test(filter)), `${name} retains a document picker`);
  }
});

test("mobile upload controls expose separate document and image actions", () => {
  assert.match(source("../src/NotesReviewPage.tsx"), /Choose document[\s\S]*Choose photo/);
  assert.match(source("../src/StudyAssistant.tsx"), /Upload document[\s\S]*Upload images/);
  assert.match(source("../src/FloatingLawyerAgent.tsx"), /aria-label="Attach document"[\s\S]*aria-label="Attach image"/);
  assert.match(source("../src/App.tsx"), /Upload document[\s\S]*Choose image/);
});
