import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLegalDebateTopic, validateGeneratedCasePacket, extractDebateMotion } from "../src/lib/debateCase.ts";

const packet = `## Question before the court\nWhether the defendant breached a contractual duty and whether the claimant is entitled to damages under Kenyan law.\n\n## Agreed facts\nThe parties entered a written agreement and both performed some obligations.\n\n## Claimant's case\nThe claimant says the defendant failed to deliver an agreed service and caused a provable financial loss.\n\n## Defendant's case\nThe defendant disputes the alleged breach and says the claimant has not proved causation or loss.\n\n## Evidence packet\nThe signed agreement, two payment receipts, and correspondence are available for the parties to assess.\n\n## Authority boundaries\nNo specific statute or judgment was verified for this exercise. The parties must identify applicable law without inventing authority.`;

test("debate topic selection uses legal issues and avoids nonlegal library metadata", () => {
  assert.equal(resolveLegalDebateTopic("Boolean search operators", "Computer science"), null);
  assert.equal(resolveLegalDebateTopic("", "Computer science"), "Kenyan contract law and remedies");
  assert.equal(resolveLegalDebateTopic("", "Constitutional law"), "Constitutional law");
  assert.equal(resolveLegalDebateTopic("breach of contract", "Computer science"), "breach of contract");
});

test("balanced legal packets pass, while irrelevant technical jargon and incomplete packets fail", () => {
  assert.deepEqual(validateGeneratedCasePacket(packet), { valid: true, reason: "" });
  assert.match(validateGeneratedCasePacket(packet.replace("signed agreement", "Boolean operators and truncation in a computer search interface")).reason, /technical\/search jargon/);
  assert.match(validateGeneratedCasePacket(packet.replace("## Authority boundaries", "## Missing authorities")).reason, /missing required legal sections/);
  assert.match(validateGeneratedCasePacket(packet.replace("Whether the defendant breached a contractual duty and whether the claimant is entitled to damages under Kenyan law.", "A product's search interface returned zero results.")).reason, /clear legal issue/);
});

test("the debate motion is taken from the actual question before the court", () => {
  assert.equal(extractDebateMotion(packet), "Whether the defendant breached a contractual duty and whether the claimant is entitled to damages under Kenyan law.");
});

test("the backend has a dedicated strict law-only case prompt and feature route", () => {
  const aiIndex = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  const prompt = readFileSync(new URL("../supabase/functions/ai/prompts.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
  const evaluator = readFileSync(new URL("../supabase/functions/evaluate-debate/index.ts", import.meta.url), "utf8");
  assert.match(prompt, /STRICT LEGAL SCOPE:[\s\S]*Boolean operators, truncation, indexing/);
  assert.match(aiIndex, /arena_case:\s*\{/);
  assert.match(aiIndex, /feature === "arena_case"\) return ARENA_CASE_SYSTEM_PROMPT/);
  assert.match(aiIndex, /LIVE LEGAL ADVOCACY ONLY:[\s\S]*Boolean operators/);
  assert.match(evaluator, /STRICT LEGAL SCOPE:[\s\S]*Boolean operators, truncation/);
  assert.match(client, /\| "arena_case"/);
});
