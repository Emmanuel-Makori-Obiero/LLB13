import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldAutoRetrieveConstitution } from "../supabase/functions/ai/retrieval.ts";

const assignmentHelper = readFileSync(new URL("../src/AssignmentHelperPage.tsx", import.meta.url), "utf8");
const aiTypes = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");

test("book-review section batches still use summarize, but final synthesis never invokes its batch-only validation", () => {
  assert.match(assignmentHelper, /requestBookSummaryPart\([\s\S]*?selectedBook\.id[\s\S]*?askAI/);
  assert.equal((assignmentHelper.match(/feature: "book_review_synthesis"/g) ?? []).length, 2, "initial synthesis and originality retry both use the dedicated feature");
  assert.match(assignmentHelper, /feature: "book_review_synthesis", mode: "general", messages: \[\{ role: "user", content: synthesisPrompt \}\]/);
  assert.doesNotMatch(assignmentHelper, /askAI\(\{ feature: "summarize", mode: "general", messages: \[\{ role: "user", content: synthesisPrompt/);
});

test("book-review synthesis is a registered, source-isolated AI feature with the required review structure", () => {
  assert.match(aiTypes, /\| "book_review_synthesis"/);
  assert.match(server, /book_review_synthesis:\s*\{\s*task: "Synthesize the ordered evidence[\s\S]*?requested structured book review/);
  assert.match(server, /feature === "summarize" \|\| feature === "book_summary_synthesis" \|\| feature === "book_review_synthesis"/);
  assert.match(server, /feature === "summarize" && \(docIds\?\.length !== 1 \|\| part === undefined\)/);
  assert.equal(shouldAutoRetrieveConstitution("book_review_synthesis", true), false);
});
