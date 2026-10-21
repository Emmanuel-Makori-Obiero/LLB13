export type PracticeExamQuestion = {
  question: string;
  modelAnswer: string;
  explanation: string;
  keyPoints: string[];
  marks: number;
  type: string;
};

export type PracticeExam = {
  title: string;
  instructions: string;
  durationMinutes: number;
  totalMarks: number;
};

export function normalizePracticeExam(
  result: { data?: unknown; answer?: string },
  requestedCount: number,
): { paper: PracticeExam; questions: PracticeExamQuestion[] } | null {
  let raw = result.data;
  if (!raw || typeof raw !== "object") {
    try { raw = JSON.parse(result.answer ?? ""); } catch { return null; }
  }
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rows = Array.isArray(data.questions) ? data.questions : [];
  const questions: PracticeExamQuestion[] = rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const question = String(item.question ?? item.text ?? "").trim();
    const modelAnswer = String(item.modelAnswer ?? item.model_answer ?? item.answer ?? "").trim();
    if (question.length < 30 || modelAnswer.length < 20) return [];
    const rawMarks = Number(item.marks);
    return [{
      question,
      modelAnswer,
      explanation: String(item.explanation ?? "").trim(),
      keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints.map(String).filter(Boolean) : [],
      marks: Number.isFinite(rawMarks) && rawMarks > 0 ? Math.round(rawMarks) : 0,
      type: String(item.type ?? "problem").trim(),
    }];
  });
  if (questions.length !== requestedCount || requestedCount < 1) return null;

  const weights = questions.map((question) => question.marks || 1);
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const exactShares = weights.map((weight) => weight * 100 / weightTotal);
  const allocated = exactShares.map(Math.floor);
  let remaining = 100 - allocated.reduce((total, marks) => total + marks, 0);
  const order = exactShares.map((share, index) => ({ index, remainder: share - allocated[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index += 1) allocated[order[index].index] += 1;
  questions.forEach((question, index) => { question.marks = allocated[index]; });

  const duration = Number(data.duration_minutes);
  return {
    paper: {
      title: String(data.title ?? "").trim() || "Law Practice Examination",
      instructions: String(data.instructions ?? "Answer every question. Support legal propositions with relevant authority where available; do not invent citations.").trim(),
      durationMinutes: Number.isFinite(duration) && duration >= 30 ? Math.round(duration) : 180,
      totalMarks: 100,
    },
    questions,
  };
}
