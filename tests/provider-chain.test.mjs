import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHAIN } from "../supabase/functions/ai/providers.ts";

test("the AI provider chain uses current high-availability fallback model IDs", () => {
  const ids = DEFAULT_CHAIN.map(({ provider, model }) => `${provider}:${model}`);
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
    "openrouter:deepseek/deepseek-v4-flash:free",
    "openrouter:openai/gpt-oss-120b:free",
    "openrouter:qwen/qwen3-32b:free",
  ]) assert.ok(!ids.includes(retired), `retired/invalid ID remains: ${retired}`);
  assert.equal(ids.indexOf("openrouter:openrouter/free") < ids.indexOf("groq:openai/gpt-oss-120b"), true, "dynamic free fallback should run before slower deep fallbacks");
});
