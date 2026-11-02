import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookReviewSystemPrompt } from "../supabase/functions/ai/bookReviewPrompts.ts";
import { shouldAutoRetrieveConstitution } from "../supabase/functions/ai/retrieval.ts";

const page = readFileSync(new URL("../src/AssignmentHelperPage.tsx", import.meta.url), "utf8");
const studyAssistant = readFileSync(new URL("../src/StudyAssistant.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");

test("Assignment Helper exposes a dedicated single-book review action", () => {
  assert.match(api, /\| "book_review"/);
  assert.match(page, /feature: "book_review", label: "Write a book review"/);
  assert.match(page, /tool\.feature === "book_review" && selectedSources\.length !== 1/);
  assert.match(page, /feature: tool\.feature, mode: selectedIds\.length \? groundingMode : "general", docIds: selectedIds/);
  assert.match(studyAssistant, /feature: "book_review",\s*label: "Book review",\s*needsDoc: true/);
  assert.match(studyAssistant, /task\.feature === "book_review" && selected\.length !== 1/);
  assert.match(studyAssistant, /feature: task\.feature,[\s\S]*?docIds: selected\.length \? selected : undefined/);
  assert.doesNotMatch(studyAssistant, /requestBookSummaryPart\([^\n]*book_review/);
  assert.doesNotMatch(page, /requestBookSummaryPart|part:|size:|startIndex:/);
});

test("book-review metadata and prose follow the requested sample structure without inventing missing facts", () => {
  const prompt = bookReviewSystemPrompt();
  assert.match(prompt, /Title; Author; Publisher; Year of Publication; Price; Pages; Availability; Reviewer\./);
  assert.match(prompt, /Not stated in the provided source/);
  assert.match(prompt, /Do not guess current retail price or availability/);
  assert.match(prompt, /four to six connected, polished paragraphs/);
  assert.match(prompt, /claim that the entire book was read/);
});

test("server routes book_review to broad selected-document retrieval and skips summary-only validation", () => {
  assert.match(server, /book_review:\s*\{\s*docWide: true/);
  assert.match(server, /feature === "book_review"\) return bookReviewSystemPrompt\(\)/);
  assert.match(server, /feature === "book_review" && docIds\?\.length !== 1/);
  assert.match(server, /feature === "summarize" && \(docIds\?\.length !== 1 \|\| part === undefined\)/);
  assert.equal(shouldAutoRetrieveConstitution("book_review", true), false);
});
