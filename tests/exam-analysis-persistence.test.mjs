import test from "node:test";
import assert from "node:assert/strict";
import {
  createExamAnalysisDraft,
  pendingExamAnalysisStorageKey,
  restoreExamAnalysisDraft,
} from "../src/lib/examAnalysis.ts";

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
