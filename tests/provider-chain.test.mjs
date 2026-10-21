import test from "node:test";
import assert from "node:assert/strict";
import { boundedProviderTimeoutMs, combineProviderChains, DEFAULT_CHAIN, modelRouteCooldownMs } from "../supabase/functions/ai/providers.ts";
import { fastFailoverKeys, newestKeySlotsFirst } from "../supabase/functions/_shared/keys.ts";

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

test("newer numbered provider keys are tried before older and legacy key slots", () => {
  const entries = [
    { slot: 0, value: "legacy" },
    { slot: 1, value: "older" },
    { slot: 7, value: "newest" },
  ];
  assert.deepEqual(newestKeySlotsFirst(entries).map(({ slot }) => slot), [7, 1, 0]);
  assert.deepEqual(fastFailoverKeys(entries), [{ slot: 7, value: "newest" }]);
  assert.equal(fastFailoverKeys(entries).length, 1, "only one key is used before model failover");
});

test("failed model routes cool down for later requests without delaying current-request failover", () => {
  assert.equal(modelRouteCooldownMs(429, 58), 60_000);
  assert.equal(modelRouteCooldownMs(401), 15 * 60_000);
  assert.equal(modelRouteCooldownMs(404), 30 * 60_000);
  assert.equal(modelRouteCooldownMs(503), 45_000);
});

test("provider call timeout is bounded between three and eight seconds", () => {
  assert.equal(boundedProviderTimeoutMs(20_000), 8_000);
  assert.equal(boundedProviderTimeoutMs(6_000), 6_000);
  assert.equal(boundedProviderTimeoutMs(1_000), 3_000);
  assert.equal(boundedProviderTimeoutMs(Number.NaN), 8_000);
});
