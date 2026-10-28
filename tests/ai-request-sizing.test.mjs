import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasProviderPayloadTooLarge,
  keepRecentConversation,
  shrinkRetrievedPassages,
} from "../supabase/functions/ai/requestSizing.ts";

const handler = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");

test("detects a provider HTTP 413 without treating unrelated failures as oversized input", () => {
  assert.equal(hasProviderPayloadTooLarge({ attempts: [{ status: "413" }] }), true);
  assert.equal(hasProviderPayloadTooLarge({ attempts: [{ status: 429 }, { status: "timeout" }] }), false);
  assert.equal(hasProviderPayloadTooLarge(null), false);
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
  assert.match(handler, /lower-ranked retrieved passages were omitted as whole passages/);
});
