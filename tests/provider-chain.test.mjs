import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boundedProviderTimeoutMs, combineProviderChains, DEFAULT_CHAIN, modelRouteCooldownMs, reasoningAttemptVariants, shouldTryAlternateApiKey } from "../supabase/functions/ai/providers.ts";
import { failoverKeyCandidates, newestKeySlotsFirst, selectFastFailoverKey } from "../supabase/functions/_shared/keys.ts";

test("the AI provider chain uses current high-availability fallback model IDs", () => {
  const ids = DEFAULT_CHAIN.map(({ provider, model }) => `${provider}:${model}`);
  assert.equal(ids[0], "cerebras:gpt-oss-120b");
  assert.equal(ids[1], "mistral:mistral-large-latest");
  for (const expected of [
    "gemini:gemini-3.8-flash",
    "groq:openai/gpt-oss-20b",
    "openrouter:openrouter/free",
    "groq:openai/gpt-oss-120b",
    "gemini:gemini-3.5-flash-lite",
  ]) assert.ok(ids.includes(expected), `missing ${expected}`);
  for (const retired of [
    "groq:llama-3.1-8b-instant",
    "groq:llama-3.3-70b-versatile",
    "gemini:gemini-3.5-flash",
    "gemini:gemini-2.5-flash",
    "gemini:gemini-2.5-flash-lite",
    "openrouter:deepseek/deepseek-v4-flash:free",
    "openrouter:openai/gpt-oss-120b:free",
    "openrouter:qwen/qwen3-32b:free",
  ]) assert.ok(!ids.includes(retired), `retired/invalid ID remains: ${retired}`);
  assert.equal(ids.indexOf("openrouter:openrouter/free") < ids.indexOf("groq:openai/gpt-oss-120b"), true, "dynamic free fallback should run before slower deep fallbacks");
  const identities = DEFAULT_CHAIN.map(({ provider, baseUrl, model, keyEnv }) =>
    `${provider}:${baseUrl}:${model}:${keyEnv}`,
  );
  assert.equal(new Set(identities).size, identities.length, "default chain must not contain duplicate routes");
});

test("configured duplicates are removed while alternate key sources are retained", () => {
  const first = DEFAULT_CHAIN[0];
  const duplicate = { ...first, baseUrl: `${first.baseUrl}/` };
  const alternateKey = { ...first, keyEnv: `${first.keyEnv}_SECONDARY` };
  const merged = combineProviderChains(
    [first, duplicate, alternateKey],
    [first, DEFAULT_CHAIN[1]],
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].keyEnv, first.keyEnv);
  assert.equal(merged[1].keyEnv, alternateKey.keyEnv);
  assert.equal(merged[2].model, DEFAULT_CHAIN[1].model);
});

test("one model attempt uses one key, and later provider models rotate through newer slots first", () => {
  const entries = [
    { slot: 0, value: "legacy" },
    { slot: 1, value: "older" },
    { slot: 7, value: "newest" },
  ];
  assert.deepEqual(newestKeySlotsFirst(entries).map(({ slot }) => slot), [7, 1, 0]);
  assert.deepEqual([0, 1, 2, 3].map((index) => selectFastFailoverKey(entries, index)?.slot), [7, 1, 0, 7]);
  assert.equal(selectFastFailoverKey([], 0), null);
});

test("each model route can fall through every configured API-key slot", () => {
  const entries = [
    { slot: 0, value: "legacy" },
    { slot: 1, value: "older" },
    { slot: 7, value: "newest" },
  ];
  assert.deepEqual(failoverKeyCandidates(entries, 0).map(({ slot }) => slot), [7, 1, 0]);
  assert.deepEqual(failoverKeyCandidates(entries, 1).map(({ slot }) => slot), [1, 0, 7]);
  assert.equal(shouldTryAlternateApiKey(401, true), true);
  assert.equal(shouldTryAlternateApiKey(403, true), true);
  assert.equal(shouldTryAlternateApiKey(429, true), true);
  assert.equal(shouldTryAlternateApiKey(404, true), false);
  assert.equal(shouldTryAlternateApiKey(429, false), false);
});

test("the Edge Function wires key-slot failover into the provider request loop", () => {
  const handler = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  assert.match(handler, /failoverKeyCandidates\(keys, cursor\)/);
  assert.match(handler, /shouldTryAlternateApiKey\(res\.status, keyIndex < keyCandidates\.length - 1\)/);
  assert.match(handler, /if \(retryWithNextKey\) continue;/);
  assert.match(handler, /invalidKeyUntil\.set\(credentialId/);
});

test("failed model routes cool down for later requests without delaying current-request failover", () => {
  assert.equal(modelRouteCooldownMs(429, 58), 60_000);
  assert.equal(modelRouteCooldownMs(401), 15 * 60_000);
  assert.equal(modelRouteCooldownMs(404), 30 * 60_000);
  assert.equal(modelRouteCooldownMs(503), 45_000);
});

test("ordinary provider calls are bounded between three and eight seconds", () => {
  assert.equal(boundedProviderTimeoutMs(20_000), 8_000);
  assert.equal(boundedProviderTimeoutMs(6_000), 6_000);
  assert.equal(boundedProviderTimeoutMs(1_000), 3_000);
  assert.equal(boundedProviderTimeoutMs(Number.NaN), 8_000);
});

test("large document requests get a longer but bounded model window", () => {
  assert.equal(boundedProviderTimeoutMs(undefined, 10_000), 15_000);
  assert.equal(boundedProviderTimeoutMs(8_000, 10_000), 15_000);
  assert.equal(boundedProviderTimeoutMs(30_000, 10_000), 18_000);
});

test("exam analysis makes exactly one reasoning-mode attempt per model route", () => {
  assert.deepEqual(reasoningAttemptVariants("exam_analysis", "effort"), [false]);
  assert.deepEqual(reasoningAttemptVariants("exam_analysis", "openrouter"), [false]);
  assert.deepEqual(reasoningAttemptVariants("chat", "effort"), [true, false]);
  assert.deepEqual(reasoningAttemptVariants("chat", "none"), [false]);
});
