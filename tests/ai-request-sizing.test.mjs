import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasProviderPayloadTooLarge,
  keepRecentConversation,
  onlyAttemptedProvidersRejectedForSize,
  shrinkRetrievedPassages,
} from "../supabase/functions/ai/requestSizing.ts";

const handler = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");

test("detects a provider HTTP 413 without treating unrelated failures as oversized input", () => {
  assert.equal(hasProviderPayloadTooLarge({ attempts: [{ status: "413" }] }), true);
  assert.equal(hasProviderPayloadTooLarge({ attempts: [{ status: 429 }, { status: "timeout" }] }), false);
  assert.equal(hasProviderPayloadTooLarge(null), false);
});

test("only labels a request oversized when every provider that ran returned 413", () => {
  assert.equal(onlyAttemptedProvidersRejectedForSize([
    { status: "missing_key" },
    { status: "413" },
    { status: 413 },
  ]), true);
  assert.equal(onlyAttemptedProvidersRejectedForSize([
    { status: "missing_key" },
    { status: "429" },
    { status: "timeout" },
    { status: "413" },
  ]), false);
});

test("reduces source context by retaining whole passages in their original order", () => {
  const passages = ["complete passage 1", "complete passage 2", "complete passage 3", "complete passage 4", "complete passage 5"];
  assert.deepEqual(shrinkRetrievedPassages(passages), passages.slice(0, 3));
  assert.deepEqual(shrinkRetrievedPassages(["one"]), null);
  assert.deepEqual(shrinkRetrievedPassages([]), null);
});

test("keeps the most recent conversation messages in their original order", () => {
  const messages = ["old user", "old answer", "recent user", "recent answer", "current user"];
  assert.deepEqual(keepRecentConversation(messages, 3), messages.slice(-3));
  assert.deepEqual(keepRecentConversation(messages, 0), []);
});

test("the endpoint retries 413s while protecting complete document-review paths", () => {
  assert.match(handler, /hasProviderPayloadTooLarge\(error\)/);
  assert.match(handler, /shrinkRetrievedPassages\(requestSources\)/);
  assert.match(handler, /!FEATURES\[feature\]\?\.docWide/);
  assert.match(handler, /requestSources\.map\(\(s\) => s\.content\)/);
  assert.match(handler, /onlyAttemptedProvidersRejectedForSize\(attempts\)/);
});

test("Library metadata failure remains recoverable and uses a small opening sample", () => {
  assert.match(handler, /feature === "book_metadata"[\s\S]*Your file is still selected/);
  assert.match(app, /BOOK TEXT \(opening sample\):\\n\$\{text\.slice\(0, 12_000\)\}/);
});

test("Library upload indexing reuses the exact text extracted for metadata", () => {
  assert.match(app, /extractedTextRef\.current = \{ file: selectedFile, text \}/);
  assert.match(app, /onCreated=\{async \(material, file, extractedText\)/);
  assert.match(app, /created\.id,\s*extractedText,/);
  assert.match(ai, /extractedText \?\? await extractText\(file\)/);
});
