import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import mammoth from "mammoth";
import { buildPdfDocument, buildWordDocument, normalizeWordFilename } from "../src/export.ts";

test("Word exports are real DOCX packages with readable tables and formatting", async () => {
  const text = [
    "## Review heading",
    "A **bold rule** and a paragraph with & and < symbols.",
    "| Rule | Principle |",
    "| --- | --- |",
    "| Offer | Acceptance |",
    "> Keep this caution visible.",
  ].join("\n");
  const buffer = await buildWordDocument("Study notes", text, {
    eyebrow: "Group 13 · Study document",
    subtitle: "Generated notes",
    sources: ["Official Kenya Law source"],
    footer: "Verify current law",
  });
  const zip = await JSZip.loadAsync(buffer);
  for (const path of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]) {
    assert.ok(zip.file(path), `DOCX package should contain ${path}`);
  }
  const document = await zip.file("word/document.xml").async("string");
  assert.match(document, /<w:tbl>/);
  assert.match(document, /<w:b\/>/);
  assert.match(document, /&amp;/);
  const extracted = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  assert.match(extracted.value, /Review heading/);
  assert.match(extracted.value, /Rule/);
  assert.match(extracted.value, /Acceptance/);
  assert.match(extracted.value, /Official Kenya Law source/);
});

test("PDF exports have a valid document structure and readable, bordered tables", () => {
  const pdf = buildPdfDocument("Study notes", [
    "## Legal principles",
    "| Topic | Rule |",
    "| --- | --- |",
    "| Offer | Acceptance |",
  ].join("\n"), { subtitle: "Revision notes", footer: "Check the source" });
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /xref\n0 \d+/);
  assert.match(pdf, /\/Type \/Pages[^>]*\/Count 1/);
  assert.match(pdf, /\(Topic\) Tj ET/);
  assert.match(pdf, /\(Rule\) Tj ET/);
  assert.match(pdf, /\(Offer\) Tj ET/);
  assert.match(pdf, /\(Acceptance\) Tj ET/);
  assert.match(pdf, / re S/);
});

test("every legacy Word export filename is normalized to .docx", () => {
  assert.equal(normalizeWordFilename("lesson-notes.doc"), "lesson-notes.docx");
  assert.equal(normalizeWordFilename("lesson-notes.docx"), "lesson-notes.docx");
  assert.equal(normalizeWordFilename("lesson-notes"), "lesson-notes.docx");
});
