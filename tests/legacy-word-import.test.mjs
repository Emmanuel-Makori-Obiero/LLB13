import test from "node:test";
import assert from "node:assert/strict";
import { extractLegacyWordHtml } from "../src/lib/legacyWord.ts";

const oldPlatformDoc = `<!doctype html>
<html><head><meta charset="utf-8"><title>Old review notes</title><style>body{display:none}.do-not-import{color:red}</style></head>
<body><header><div class="eyebrow">Group 13 · Study document</div><h1>Old review notes</h1></header>
<main><h2>Contract formation</h2><p>An offer must be clear &amp; certain, and acceptance must be communicated.</p>
<table><thead><tr><th>Element</th><th>Rule</th></tr></thead><tbody><tr><td>Offer</td><td>Clear &amp; certain</td></tr><tr><td>Acceptance</td><td>Communicated to the offeror</td></tr></tbody></table>
<ul><li>Check the facts</li><li>Apply the legal rule</li></ul><blockquote>Consider the whole agreement.</blockquote>
<div class="footer">Prepared in Group 13</div></main></body></html>`;

test("old platform Word downloads are read automatically with headings, tables, and lists", () => {
  const text = extractLegacyWordHtml(oldPlatformDoc);
  assert.ok(text);
  assert.match(text, /# Old review notes/);
  assert.match(text, /## Contract formation/);
  assert.match(text, /An offer must be clear & certain/);
  assert.match(text, /\| Element \| Rule \|/);
  assert.match(text, /\| Offer \| Clear & certain \|/);
  assert.match(text, /- Check the facts/);
  assert.match(text, /> Consider the whole agreement\./);
  assert.match(text, /Prepared in Group 13/);
  assert.doesNotMatch(text, /display:none|do-not-import|<style/i);
});

test("non-HTML legacy binary Word content is not mistaken for a platform export", () => {
  assert.equal(extractLegacyWordHtml("\u0000\u0001\u0002binary Word data"), null);
  assert.equal(extractLegacyWordHtml("Plain text without an HTML document wrapper"), null);
});
