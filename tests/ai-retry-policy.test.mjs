import test from "node:test";
import assert from "node:assert/strict";
import { shouldRetryAiRequest } from "../src/lib/aiRetryPolicy.ts";

test("do not replay a provider chain that returned per-provider attempts", () => {
  assert.equal(shouldRetryAiRequest(503, { attempts: [{ id: "gemini:model", status: "timeout" }] }), false);
});

test("do not retry before an explicit server cooldown expires", () => {
  assert.equal(shouldRetryAiRequest(429, { retry_after_seconds: 30 }), false);
});

test("retry a transient gateway failure that has no provider chain response", () => {
  assert.equal(shouldRetryAiRequest(503, null), true);
  assert.equal(shouldRetryAiRequest(504), true);
  assert.equal(shouldRetryAiRequest(500), false);
});

test("wait out a short provider cooldown once", async () => {
  const { cooldownRetryDelayMs } = await import("../src/lib/aiRetryPolicy.ts");
  assert.equal(cooldownRetryDelayMs(503, { retry_after_seconds: 13 }), 13_500);
  assert.equal(cooldownRetryDelayMs(429, { retry_after_seconds: 60 }), 0);
  assert.equal(cooldownRetryDelayMs(503, null), 0);
});
