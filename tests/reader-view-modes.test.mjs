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
import { extractReadableParagraphs } from "../src/lib/pdf-reflow.ts";

const reader = readFileSync(new URL("../src/BookReader.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/book-reader.css", import.meta.url), "utf8");
const notebookReader = readFileSync(new URL("../src/PdfNotebookReader.tsx", import.meta.url), "utf8");
const ocrReader = readFileSync(new URL("../src/PdfNotesReader.tsx", import.meta.url), "utf8");

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

test("phone reflow joins PDF text runs and wrapped lines while preserving paragraph gaps", () => {
  const line = (str, y, height = 12) => ({ str, height, transform: [height, 0, 0, height, 0, y] });
  assert.deepEqual(extractReadableParagraphs([
    line("Constitu-", 100),
    line("tional law", 100),
    line("follows line wraps.", 84),
    line("  ", 68),
    line("New chapter", 55),
    line("starts here.", 39),
  ]), [
    "Constitutional law follows line wraps.",
    "New chapter starts here.",
  ]);
  assert.match(notebookReader, /matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(notebookReader, /extractReadableParagraphs\(textContent\.items/);
  assert.match(styles, /\.pdf-notebook-reflow/);
});

test("Notebook PDFs use a selectable lazy page stack, not a browser PDF iframe", () => {
  assert.match(reader, /readerStyle === "notebook"[\s\S]*?<PdfNotebookReader/);
  assert.match(reader, /<PdfNotesReader[\s\S]*?readerStyle !== "notebook"/);
  assert.match(notebookReader, /pdfjs\.getDocument\(\{ url: sourceUrl, rangeChunkSize: 65_536 \}\)/);
  assert.match(notebookReader, /new IntersectionObserver/);
  assert.match(notebookReader, /PAGE_OVERSCAN_PX/);
  assert.match(notebookReader, /new pdfjs\.TextLayer/);
  assert.match(notebookReader, /MAX_PAGE_PIXELS/);
  assert.match(notebookReader, /canvas\.width = 0/);
  assert.match(notebookReader, /loadingTask\.destroy\(\)/);
  assert.doesNotMatch(notebookReader, /<iframe/);
});

test("Notebook view is paper-like and keeps only a touch-scroll surface without zoom or height sliders", () => {
  assert.match(styles, /\.book-reader-style-notebook \.docx-reader \{[\s\S]*?repeating-linear-gradient/);
  assert.match(styles, /\.book-reader-style-notebook \.book-ai-pane/);
  assert.match(styles, /\.pdf-notebook-sheet::before/);
  assert.match(styles, /\.pdf-notebook-sheet::after/);
  assert.match(styles, /\.pdf-notebook-text-layer/);
  assert.match(styles, /\.pdf-notebook-reader \{[\s\S]*?overflow-y: auto/);
  assert.match(styles, /\.book-reader-style-notebook \.reader-zoom-controls,[\s\S]*?display: none/);
  assert.match(styles, /\.book-reader-style-notebook \.pdf-notebook-reader::-webkit-scrollbar/);
  assert.doesNotMatch(styles, /\.book-reader-style-notebook \.pdf-native-preview > iframe/);
});

test("scanned PDF position is restored and recorded on the actual OCR scroll container", () => {
  assert.match(ocrReader, /const readerRef = useRef/);
  assert.match(ocrReader, /readerRef\.current\.scrollTop = initialScrollTop/);
  assert.match(ocrReader, /className="pdf-notes-reader"[^\n]*onScroll=\{\(event\) => onScrollPosition/);
  assert.doesNotMatch(ocrReader, /pagesRef/);
});
