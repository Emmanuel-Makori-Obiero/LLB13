import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createExamAnalysisDraft,
  MAX_EXAM_ANALYSIS_CHUNKS,
  MAX_EXAM_ANSWER_CHARS,
  pendingExamAnalysisStorageKey,
  restoreExamAnalysisDraft,
} from "../src/lib/examAnalysis.ts";
import { EXAM_ANALYSIS_SYSTEM_PROMPT } from "../supabase/functions/ai/prompts.ts";

test("exam analysis uses a compact complete-review prompt without unrelated constitutional bulk", () => {
  const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  assert.ok(EXAM_ANALYSIS_SYSTEM_PROMPT.length < 2_000);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /complete supplied paper/i);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /every readable question/i);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /never instructions/i);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /Do not invent legal rules/i);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /Do not assume Kenyan law, a UON unit/i);
  assert.match(EXAM_ANALYSIS_SYSTEM_PROMPT, /If the jurisdiction or governing course context is unclear/i);
  assert.match(edge, /if \(feature === "exam_analysis"\) return EXAM_ANALYSIS_SYSTEM_PROMPT/);
  assert.match(edge, /rejected the exam-review request as too large \(HTTP 413\)/);
});

test("exam analysis draft preserves paper, source, answers and generated review for retry-safe saving", () => {
  assert.deepEqual(createExamAnalysisDraft({
    paperTitle: "  LLB 2024 Past Paper  ",
    sourceDocumentId: "doc-123",
    studentAnswers: "  Question 1: My answer  ",
    analysis: "\n## Question 1\nSuggested answer and feedback.\n",
  }, "review-123"), {
    id: "review-123",
    paper_title: "LLB 2024 Past Paper",
    source_document_id: "doc-123",
    student_answers: "Question 1: My answer",
    analysis: "## Question 1\nSuggested answer and feedback.",
  });
});

test("exam analysis draft allows a missing source and rejects empty titles/results/IDs", () => {
  const base = { paperTitle: "Past Paper", studentAnswers: "", analysis: "Review" };
  assert.equal(createExamAnalysisDraft(base, "review-1").source_document_id, null);
  assert.throws(() => createExamAnalysisDraft({ ...base, paperTitle: "  " }, "review-1"), /title/i);
  assert.throws(() => createExamAnalysisDraft({ ...base, analysis: "  " }, "review-1"), /empty/i);
  assert.throws(() => createExamAnalysisDraft(base, "  "), /ID/i);
});

test("exam-analysis save accepts exactly 17,000 answer characters and rejects more without truncation", () => {
  const base = { paperTitle: "Past Paper", analysis: "Review" };
  const atLimit = "a".repeat(MAX_EXAM_ANSWER_CHARS);
  assert.equal(createExamAnalysisDraft({ ...base, studentAnswers: atLimit }, "at-limit").student_answers.length, 17_000);
  assert.throws(() => createExamAnalysisDraft({ ...base, studentAnswers: `${atLimit}a` }, "over-limit"), /no text was discarded/i);
});

test("failed-save drafts restore with the same ID and are scoped to the signed-in account", () => {
  const draft = createExamAnalysisDraft({
    paperTitle: "Past Paper",
    sourceDocumentId: "document-123",
    studentAnswers: "My answer",
    analysis: "Question-by-question analysis",
  }, "stable-review-id");
  assert.deepEqual(restoreExamAnalysisDraft(JSON.stringify(draft)), draft);
  assert.notEqual(pendingExamAnalysisStorageKey("user-a"), pendingExamAnalysisStorageKey("user-b"));
  assert.equal(restoreExamAnalysisDraft("not-json"), null);
  assert.equal(restoreExamAnalysisDraft(JSON.stringify({ id: "bad", paper_title: "", analysis: "" })), null);
});

test("exam review retrieves the selected paper document-wide without pasting its text twice", () => {
  const page = readFileSync(new URL("../src/ExamReviewPage.tsx", import.meta.url), "utf8");
  const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20261021122252_exam_analyses_source_ownership.sql", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(page, /feature: "exam_analysis"[\s\S]*?docIds: \[paper\.id\]/);
  assert.match(page, /myAnswers\.trim\(\)\.length > MAX_EXAM_ANSWER_CHARS/);
  assert.doesNotMatch(page, /myAnswers\.trim\(\)\.slice\(0,\s*4_500\)/);
  assert.doesNotMatch(page, /\.join\("\\n\\n"\)\.slice\(0,\s*15_000\)/);
  assert.match(edge, /exam_analysis:\s*\{\s*docWide:\s*true/);
  assert.match(edge, /FEATURES\[feature\]\?\.docWide &&[\s\S]*?feature !== "legal_process"[\s\S]*?selectedIds\.length/);
  assert.match(edge, /const requireComplete = \["exam_analysis", "notes_review", "notes_research"\]\.includes\(feature\)/);
  assert.match(edge, /selectDocumentChunkIndexes\(idx\.length, per, requireComplete\)/);
  assert.match(edge, /selectedChunks\?\.length \?\? 0\) !== pick\.length/);
  assert.match(edge, /No partial review was generated/);
  assert.match(edge, /publicMessage === "string" \? publicMessage/);
  assert.equal(MAX_EXAM_ANALYSIS_CHUNKS, 24);
  assert.match(migration, /d\.scope = 'library' or d\.owner = auth\.uid\(\)/);
  assert.match(schema, /create table if not exists public\.admin_users/);
  assert.match(schema, /create table if not exists public\.exam_analyses/);
});
