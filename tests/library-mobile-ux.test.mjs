import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const reader = readFileSync(new URL("../src/BookReader.tsx", import.meta.url), "utf8");
const readerStyles = readFileSync(new URL("../src/book-reader.css", import.meta.url), "utf8");

test("Library summaries bring their progress and result panel into view on phone-width screens", () => {
  assert.match(app, /summaryPanelRef = useRef/);
  assert.match(app, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(app, /summaryPanelRef\.current\?\.scrollIntoView/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /ref=\{summaryPanelRef\} className="card card-pad library-summary-panel"/);
  assert.match(styles, /\.library-summary-panel \{ scroll-margin-top: 16px; \}/);
});

test("BookReader automatically sizes the phone preview from the current viewport height", () => {
  assert.match(reader, /matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(reader, /const effectiveReaderHeight = mobileReading \? Math\.max\(300, viewportHeight - 138\) : readerHeight/);
  assert.match(reader, /style=\{\{ height: `\$\{effectiveReaderHeight \+ 84\}px` \}\}/);
  assert.match(reader, /style=\{\{ height: `\$\{effectiveReaderHeight\}px` \}\}/);
  assert.match(readerStyles, /\.book-reader-mobile-reading \.reader-toolbar \{\s*display: grid;/);
  assert.match(readerStyles, /grid-template-areas: "back title" "actions actions"/);
  assert.match(readerStyles, /\.book-reader-mobile-reading \.book-reader-grid \{\s*display: block; flex: 1 1 0; height: auto;/);
  assert.match(readerStyles, /\.book-reader-mobile-reading \.book-reading-pane \{\s*height: 100%!important/);
  assert.match(readerStyles, /\.book-reader-mobile-reading \.book-preview-wrap \{\s*flex: 1 1 auto; height: auto!important/);
});

test("BookReader preview headings and controls wrap at phone widths without hiding source text", () => {
  assert.match(readerStyles, /@media \(max-width: 820px\)[\s\S]*?\.book-pane-head \{\s*flex-wrap: wrap/);
  assert.match(readerStyles, /\.book-reader \.reader-heading strong,[\s\S]*?white-space: normal/);
  assert.match(readerStyles, /\.book-pane-head > div:first-child,[\s\S]*?\.book-reader \.reader-zoom-controls \{\s*flex: 1 1 100%/);
  assert.match(readerStyles, /\.book-reader \.reader-height-control \{\s*flex: 1 1 100%/);
  assert.match(readerStyles, /\.book-reader \.reader-height-control input\[type="range"\] \{\s*min-width: 90px/);
});
