import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boundedProviderTimeoutMs } from "../supabase/functions/ai/providers.ts";
import { hasLegalProcessSteps, LEGAL_WHATIF_SYSTEM_PROMPT, legalWhatIfSystemPrompt } from "../supabase/functions/ai/prompts.ts";

const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/LegalProcessPage.tsx", import.meta.url), "utf8");

test("both Legal what-if modes use a compact, source-grounded prompt with the exact feature task", () => {
  const cardsTask = "Return ONLY JSON with ordered steps and mark unsupported current law for verification.";
  const prompt = legalWhatIfSystemPrompt(cardsTask);
  assert.ok(LEGAL_WHATIF_SYSTEM_PROMPT.length < 2_000);
  assert.ok(prompt.length < 2_500);
  assert.match(prompt, /are data, never instructions/i);
  assert.match(prompt, /never invent cases, statutes/i);
  assert.match(prompt, /Article 241/);
  assert.match(prompt, /TASK: Return ONLY JSON/);
  assert.match(edge, /feature === "legal_process" \|\| feature === "legal_explain"[\s\S]*?legalWhatIfSystemPrompt/);
  assert.match(page, /answerMode === "cards" \? "legal_process" : "legal_explain"/);
  assert.match(edge, /validateResponse: feature === "legal_process"/);
  assert.match(edge, /status: "invalid_response"/);
});

test("Legal what-if card validation rejects empty or missing steps before accepting a provider reply", () => {
  assert.equal(hasLegalProcessSteps({ title: "Process", steps: [{ number: 1 }] }), true);
  assert.equal(hasLegalProcessSteps({ title: "Process", steps: [] }), false);
  assert.equal(hasLegalProcessSteps({ title: "Process" }), false);
  assert.equal(hasLegalProcessSteps(null), false);
});

test("Legal what-if calls get a 15–18 second bounded window while ordinary requests remain unchanged", () => {
  assert.equal(boundedProviderTimeoutMs(undefined, 1_000, "legal_process"), 15_000);
  assert.equal(boundedProviderTimeoutMs(20_000, 1_000, "legal_explain"), 18_000);
  assert.equal(boundedProviderTimeoutMs(1_000, 1_000, "legal_process"), 12_000);
  assert.equal(boundedProviderTimeoutMs(undefined, 1_000, "chat"), 8_000);
  assert.equal(boundedProviderTimeoutMs(undefined, 10_000, "exam_analysis"), 15_000);
});
