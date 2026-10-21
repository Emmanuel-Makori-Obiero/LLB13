import type { ExamAnalysisDraft } from "../data/types";

export function createExamAnalysisDraft(input: {
  paperTitle: string;
  sourceDocumentId?: string | null;
  studentAnswers: string;
  analysis: string;
}, id: string = crypto.randomUUID()): ExamAnalysisDraft {
  const paperTitle = input.paperTitle.trim();
  const analysis = input.analysis.trim();
  if (!id.trim()) throw new Error("An exam-analysis save ID is required.");
  if (!paperTitle) throw new Error("The exam paper needs a title before its analysis can be saved.");
  if (!analysis) throw new Error("An empty exam analysis cannot be saved.");
  return {
    id,
    paper_title: paperTitle,
    source_document_id: input.sourceDocumentId || null,
    student_answers: input.studentAnswers.trim(),
    analysis,
  };
}

export function pendingExamAnalysisStorageKey(userId: string): string {
  return `group13:exam-review:pending:v1:${userId}`;
}

export function restoreExamAnalysisDraft(serialized: string): ExamAnalysisDraft | null {
  try {
    const stored = JSON.parse(serialized) as Record<string, unknown>;
    if (typeof stored.id !== "string" || typeof stored.paper_title !== "string" || typeof stored.analysis !== "string") return null;
    return createExamAnalysisDraft({
      paperTitle: stored.paper_title,
      sourceDocumentId: typeof stored.source_document_id === "string" ? stored.source_document_id : null,
      studentAnswers: typeof stored.student_answers === "string" ? stored.student_answers : "",
      analysis: stored.analysis,
    }, stored.id);
  } catch {
    return null;
  }
}
