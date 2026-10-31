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

test("BookReader mobile CSS controls pane height instead of an inline desktop height", () => {
  assert.match(reader, /"--reader-height": `\$\{readerHeight\}px`/);
  assert.doesNotMatch(reader, /style=\{\{ height: `\$\{readerHeight \+ 84\}px` \}\}/);
  assert.match(readerStyles, /height: calc\(var\(--reader-height, 560px\) \+ 84px\)/);
  assert.match(readerStyles, /@media \(max-width: 820px\)[\s\S]*?\.book-reading-pane \{\s*height: min\(56dvh, 600px\)/);
});

test("BookReader preview headings and controls wrap at phone widths without hiding source text", () => {
  assert.match(readerStyles, /@media \(max-width: 820px\)[\s\S]*?\.book-pane-head \{\s*flex-wrap: wrap/);
  assert.match(readerStyles, /\.book-reader \.reader-heading strong,[\s\S]*?white-space: normal/);
  assert.match(readerStyles, /\.book-pane-head > div:first-child,[\s\S]*?\.book-reader \.reader-zoom-controls \{\s*flex: 1 1 100%/);
  assert.match(readerStyles, /\.book-reader \.reader-height-control \{\s*flex: 1 1 100%/);
  assert.match(readerStyles, /\.book-reader \.reader-height-control input\[type="range"\] \{\s*min-width: 90px/);
});
