import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDocxMaterial,
  isOfficeMaterial,
  isPdfMaterial,
  readerPreviewUrl,
  resolveMaterialLinks,
} from "../src/lib/material-reader.ts";

const reader = readFileSync(new URL("../src/BookReader.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/book-reader.css", import.meta.url), "utf8");

test("stored textbook preview uses an inline URL and keeps attachment URL for explicit downloads", () => {
  const material = {
    id: "grit",
    title: "Grit: The Power of Passion and Perseverance summary pdf",
    type: "Book",
    url: "https://storage.example/object/public/materials/grit/object.pdf?download=true",
    storage_path: "grit/object.pdf",
    mime_type: "application/pdf",
  };
  const inlineUrl = "https://storage.example/object/public/materials/grit/object.pdf";
  const attachmentUrl = `${inlineUrl}?download=true`;
  const links = resolveMaterialLinks(material, inlineUrl, attachmentUrl);

  assert.equal(links.sourceUrl, inlineUrl);
  assert.equal(links.downloadUrl, attachmentUrl);
  assert.equal(links.file, true);
  assert.equal(links.label, "Download");
  assert.equal(readerPreviewUrl(material, links.sourceUrl), `${inlineUrl}#page=1&zoom=page-width`);
  assert.match(reader, /const sourceUrl = materialSourceUrl\(material\)/);
  assert.match(reader, /className="book-review-pdf" src=\{sourceUrl\}/);
  assert.doesNotMatch(reader, /info\?\.href \|\| link/);
});

test("reader recognizes uploaded PDFs and Word documents from MIME metadata when paths have no extension", () => {
  const pdf = { title: "Grit summary", url: "https://storage.example/object/abc", storage_path: "abc/opaque-id", mime_type: "application/pdf" };
  const docx = { title: "Lecture notes", url: "https://storage.example/object/def", storage_path: "def/opaque-id", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

  assert.equal(isPdfMaterial(pdf), true);
  assert.equal(isDocxMaterial(docx), true);
  assert.equal(isOfficeMaterial(docx), true);
  assert.equal(isDocxMaterial({ ...docx, mime_type: "application/pdf" }), false);
});

test("a stored URL already marked for download is normalized back to inline viewing", () => {
  const material = {
    title: "Course book",
    type: "Book",
    url: "https://storage.example/object/public/materials/book.pdf?download=true",
    storage_path: "book.pdf",
    mime_type: "application/pdf",
  };

  assert.equal(resolveMaterialLinks(material).sourceUrl, "https://storage.example/object/public/materials/book.pdf");
});

test("Notebook view has a ruled paper reading surface and a distinct warm study workspace", () => {
  assert.match(styles, /\.book-reader-style-notebook \.docx-reader \{[\s\S]*?repeating-linear-gradient/);
  assert.match(styles, /\.book-reader-style-notebook \.book-ai-pane/);
  assert.match(styles, /\.book-reader-style-notebook \.book-preview-wrap \{[\s\S]*?repeating-linear-gradient/);
});
