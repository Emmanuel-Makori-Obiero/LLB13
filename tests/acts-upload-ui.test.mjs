import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/ActsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/acts.css", import.meta.url), "utf8");

test("Act upload exposes a full-screen accessible progress overlay with progressive statuses", () => {
  assert.match(page, /aria-busy=\{busy\}/);
  assert.match(page, /className="acts-processing-overlay" role="status" aria-live="polite"/);
  assert.match(page, /Extracting text from the selected file/);
  assert.match(page, /Structuring numbered provisions and schedules/);
  assert.match(page, /AI is cross-checking the extracted section outline/);
  assert.match(page, /Saving the structured Act to the library/);
  assert.match(styles, /\.acts-processing-overlay\{position:fixed;inset:0;z-index:10000/);
});
