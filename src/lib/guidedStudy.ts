import { supabase } from "../data/repository";
import { askAI, saveTextMaterial, type AIResult } from "./ai";

export type SourceChoice = { id: string; title: string; kind: "document" | "transcript" | "material"; citation?: string | null; scope?: "user" | "library"; url?: string | null };
export type GuideLesson = {
  title: string;
  objective: string;
  explanation: string;
  example: string;
  sourceFocus?: string;
  quiz: { question: string; options: string[]; answerIndex: number; explanation: string }[];
  checkpoint?: "quiz" | "exam";
};
export type StudyLanguage = "en" | "sw";
export type GuideSyllabus = { overview: string; lessons: GuideLesson[]; language?: StudyLanguage };
export type GuidedCourse = {
  id: string;
  owner: string;
  title: string;
  subject: string;
  source_document_ids: string[];
  source_labels: SourceChoice[];
  syllabus: GuideSyllabus;
  progress: number;
  visibility: "private" | "group";
  updated_at: string;
};
export type WrittenCheckpoint = { answer: string; feedback: string; score: number; passed: boolean; missing_points: string[]; next_step: string; updated_at: string };
export type CourseProgress = { lesson_index: number; status: string; score: number | null; attempts: number; last_answer?: WrittenCheckpoint | null };
export type GuideProgress = (message: string) => void;

function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }

function parseWrittenCheckpoint(value: unknown): WrittenCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<WrittenCheckpoint>;
  if (typeof item.answer !== "string" || typeof item.feedback !== "string") return null;
  return {
    answer: item.answer,
    feedback: item.feedback,
    score: Math.max(0, Math.min(100, Number(item.score) || 0)),
    passed: Boolean(item.passed),
    missing_points: Array.isArray(item.missing_points) ? item.missing_points.map(String) : [],
    next_step: typeof item.next_step === "string" ? item.next_step : "Rewrite the answer once using the feedback.",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

function extractJsonObject(text: string) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(clean) as Partial<GuideSyllabus>; } catch { /* find JSON wrapped in prose */ }
  for (let start = 0; start < clean.length; start += 1) {
    if (clean[start] !== "{") continue;
    let depth = 0; let quoted = false; let escaped = false;
    for (let i = start; i < clean.length; i += 1) {
      const char = clean[i];
      if (escaped) { escaped = false; continue; }
      if (char === "\\" && quoted) { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === "{") depth += 1;
      if (char === "}") { depth -= 1; if (depth === 0) { try { return JSON.parse(clean.slice(start, i + 1)) as Partial<GuideSyllabus>; } catch { break; } } }
    }
  }
  return null;
}

function normalizeSyllabus(raw: unknown): Partial<GuideSyllabus> | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.lessons)) return value as Partial<GuideSyllabus>;
  for (const key of ["syllabus", "course", "data", "result"]) {
    const nested = normalizeSyllabus(value[key]);
    if (nested) return nested;
  }
  for (const key of ["modules", "sections", "topics", "chapters"]) {
    if (!Array.isArray(value[key])) continue;
    return { overview: String(value.overview ?? value.summary ?? "A source-grounded guided course."), lessons: value[key] as GuideLesson[] };
  }
  return null;
}

function parseSyllabus(text: string, data?: unknown): GuideSyllabus | null {
  const raw = normalizeSyllabus(data) ?? normalizeSyllabus(extractJsonObject(text));
  if (!raw) return null;
  const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
  if (!lessons.length) return null;
  return { overview: String(raw.overview ?? "A source-grounded guided course."), lessons: lessons.map((lesson) => {
    const item = (lesson && typeof lesson === "object" ? lesson : {}) as Partial<GuideLesson> & { summary?: unknown; content?: unknown };
    const quiz = Array.isArray(item.quiz) ? item.quiz : [];
    return {
    title: String(item.title ?? "Lesson"), objective: String(item.objective ?? "Understand the key rule."),
    explanation: String(item.explanation ?? item.summary ?? item.content ?? ""), example: String(item.example ?? ""), sourceFocus: item.sourceFocus ? String(item.sourceFocus) : undefined,
    checkpoint: item.checkpoint === "exam" ? "exam" : "quiz",
    quiz: quiz.filter((q) => q && typeof q === "object" && typeof (q as { question?: unknown }).question === "string").map((q) => { const item = q as { question: string; options?: unknown; answerIndex?: unknown; explanation?: unknown }; return { question: item.question, options: Array.isArray(item.options) ? item.options.map(String) : [], answerIndex: Number(item.answerIndex) || 0, explanation: String(item.explanation ?? "") }; }),
  }; }) };
}

function parseMarkdownSyllabus(text: string): GuideSyllabus | null {
  const headings = text.split(/\r?\n(?=##?\s+)/).map((part) => part.trim()).filter(Boolean);
  const lessons: GuideLesson[] = headings.map((part): GuideLesson | null => {
    const lines = part.split(/\r?\n/); const title = lines[0].replace(/^##?\s+/, "").trim();
    if (!title || /^overview$/i.test(title)) return null;
    return { title, objective: "Understand the key ideas in this section.", explanation: lines.slice(1).join("\n").trim(), example: "", checkpoint: "quiz" as const, quiz: [] };
  }).filter((lesson): lesson is GuideLesson => lesson !== null);
  return lessons.length ? { overview: "A source-grounded guided course.", lessons } : null;
}

function parseJson(text: string, data?: unknown): GuideSyllabus {
  const parsed = parseSyllabus(text, data) ?? parseMarkdownSyllabus(text);
  if (!parsed) throw new Error("The guide generator did not return a syllabus. Try again.");
  return parsed;
}

async function transcriptAsDocument(choice: SourceChoice) {
  const { data, error } = await db().from("transcript_chunks").select("idx,text").eq("transcript_id", choice.id).order("idx").limit(3000);
  if (error) throw new Error(`Could not load transcript ${choice.title}.`);
  const text = (data ?? []).map((row) => row.text).join("\n\n");
  if (text.trim().length < 50) throw new Error(`${choice.title} has no usable transcript text yet.`);
  return saveTextMaterial(`${choice.title} (saved transcript)`, text, `Saved transcript: ${choice.title}`);
}

async function documentChunkCount(id: string) {
  const { count, error } = await db().from("ai_chunks").select("id", { count: "exact", head: true }).eq("document_id", id);
  if (error) throw new Error(`Could not inspect document sections.`);
  return count ?? 0;
}

async function runAIStage(args: Parameters<typeof askAI>[0]): Promise<AIResult> {
  try { return await askAI(args); }
  catch (error) {
    const stage = args.feature === "notes" ? "Section reading" : args.feature === "summarize" ? "Coverage reduction" : args.feature === "study_plan" ? "Syllabus generation" : "AI stage";
    const detail = error instanceof Error ? error.message : "No provider returned a result.";
    throw new Error(`${stage} failed after the configured provider failover: ${detail}`);
  }
}

const SOURCE_READ_CONCURRENCY = 3;
const DIGEST_CONCURRENCY = 2;
async function mapConcurrentOrdered<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function buildSourceDigest(sources: SourceChoice[], docIds: string[], onProgress?: GuideProgress) {
  const digests: string[] = [];
  for (const docId of docIds) {
    const source = sources.find((item) => item.id === docId && item.kind === "document");
    const count = await documentChunkCount(docId);
    if (!count) throw new Error(`${source?.title ?? "This document"} has no readable text. Re-upload it or choose a saved transcript before building a source-grounded syllabus.`);
    const parts = Math.max(1, Math.ceil(count / 10));
    const mode = source?.scope === "library" ? "library" : "materials";
    const sectionIndexes = Array.from({ length: parts }, (_, index) => index);
    const notes = await mapConcurrentOrdered(sectionIndexes, SOURCE_READ_CONCURRENCY, async (part) => {
      onProgress?.(`Reading ${source?.title ?? "source"}: section ${part + 1} of ${parts}…`);
      const result = await runAIStage({
        feature: "notes", mode, docIds: [docId], part, size: 10,
        messages: [{ role: "user", content: "Create faithful coverage notes for this section. Preserve every rule, definition, authority, example, exception, date and exam warning. Do not invent or skip content." }],
      });
      return result.answer;
    });
    const reductionBatches = Array.from({ length: Math.ceil(notes.length / 4) }, (_, index) => notes.slice(index * 4, index * 4 + 4));
    const reduced = await mapConcurrentOrdered(reductionBatches, DIGEST_CONCURRENCY, async (batchNotes, index) => {
      onProgress?.(`Compressing ${source?.title ?? "source"}: digest ${index + 1} of ${reductionBatches.length}…`);
      const batch = batchNotes.join("\n\n--- NEXT SECTION ---\n\n");
      const compressed = await runAIStage({
        feature: "summarize", mode: "general",
        messages: [{ role: "user", content: `Compress the following source-grounded coverage notes into a compact chapter/topic map. Keep all distinct legal rules, authorities, examples, exceptions and unresolved [unclear] markers. Do not add facts.\n\n${batch}` }],
      });
      return `SOURCE: ${source?.title ?? docId}\n${compressed.answer}`;
    });
    digests.push(...reduced);
  }
  let digestParts = digests;
  while (digestParts.join("\n\n=== SOURCE DIGEST ===\n\n").length > 14000 && digestParts.length > 1) {
    const compactBatches = Array.from({ length: Math.ceil(digestParts.length / 4) }, (_, index) => digestParts.slice(index * 4, index * 4 + 4));
    onProgress?.(`Compacting the full-book digest in ${compactBatches.length} ordered groups…`);
    digestParts = await mapConcurrentOrdered(compactBatches, DIGEST_CONCURRENCY, async (batchParts) => {
      const batch = batchParts.join("\n\n--- NEXT DIGEST ---\n\n");
      const compressed = await runAIStage({
        feature: "summarize",
        mode: "general",
        messages: [{ role: "user", content: `Compact this study digest while preserving every distinct topic, rule, authority, exception and example. Keep section order and do not add facts.\n\n${batch}` }],
      });
      return compressed.answer;
    });
  }
  return digestParts.join("\n\n=== SOURCE DIGEST ===\n\n");
}

export async function listGuideSources(): Promise<SourceChoice[]> {
  const [docs, transcripts, materials] = await Promise.all([
    db().from("ai_documents").select("id,title,citation,scope").order("created_at", { ascending: false }).limit(200),
    db().from("transcripts").select("id,title,unit,status,created_at").eq("status", "done").order("created_at", { ascending: false }).limit(200),
    db().from("materials").select("id,title,type,unit,topic,date,source,url").order("date", { ascending: false }).limit(500),
  ]);
  if (docs.error) throw new Error("Could not load saved AI documents.");
  if (transcripts.error) throw new Error("Could not load saved transcripts.");
  if (materials.error) throw new Error("Could not load Library materials.");
  return [
    ...(docs.data ?? []).map((d) => ({ id: d.id, title: d.title, kind: "document" as const, citation: d.citation, scope: d.scope === "library" ? "library" as const : "user" as const })),
    ...(transcripts.data ?? []).map((t) => ({ id: t.id, title: t.title, kind: "transcript" as const, citation: t.unit ? `Transcript · ${t.unit}` : "Saved transcript", scope: "user" as const })),
    ...(materials.data ?? []).map((m) => ({ id: m.id, title: m.title, kind: "material" as const, citation: [m.type, m.unit, m.topic, m.source].filter(Boolean).join(" · "), scope: "library" as const, url: m.url ?? null })),
  ];
}

export async function createGuidedCourse(subject: string, sources: SourceChoice[], preferences: string, visibility: "private" | "group" = "private", onProgress?: GuideProgress, language: StudyLanguage = "en"): Promise<GuidedCourse> {
  if (!sources.length) throw new Error("Choose at least one book, saved document, or transcript.");
  const docIds: string[] = [];
  for (const source of sources) if (source.kind === "transcript") docIds.push((await transcriptAsDocument(source)).id); else if (source.kind === "document") docIds.push(source.id);
  const linkedMaterials = sources.filter((source) => source.kind === "material").map((source) => `${source.title}${source.citation ? ` (${source.citation})` : ""}`).join("; ");
  const readableSources = sources.filter((source) => source.kind !== "material");
  const hasReadableSourceText = docIds.length > 0;
  const mode = readableSources.length === 0 ? "general" : readableSources.every((source) => source.kind === "document" && source.scope === "library") ? "library" : readableSources.some((source) => source.scope === "library") ? "auto" : "materials";
  const grounding = hasReadableSourceText
    ? "Use ONLY the readable source digest below."
    : "No readable source text was selected. Create a general-knowledge study outline for the requested subject and say in the overview that it is not grounded in the selected materials. Do not imply that linked titles or metadata were read as source content.";
  const languageInstruction = language === "sw"
    ? "Write the overview, every lesson title and goal, explanations, examples, quiz questions, answer options and feedback in fluent, natural Kiswahili used in Kenya. Preserve case names, statute titles, citations, legal Latin and official legal terms exactly as they appear in the source; do not invent translations for authorities."
    : "Write in clear Kenyan English with natural, direct teaching language. Preserve case names, statute titles, citations and legal terms exactly as they appear in the source.";
  const prompt = `Create a complete guided law-study syllabus for: ${subject}. ${grounding} ${linkedMaterials ? `The following Library items are linked reference records; their titles and metadata are context only, not source content: ${linkedMaterials}.` : ""} ${preferences} ${languageInstruction}\nReturn ONLY valid JSON with no markdown fences in this exact shape: {"overview":"...","lessons":[{"title":"...","objective":"...","explanation":"...","example":"...","sourceFocus":"...","checkpoint":"quiz","quiz":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}]}. Create 8 to 16 ordered lessons scaled to the distinct chapters and themes in the readable digest. Represent every major chapter; group only closely related minor sections, and never collapse a long book into a handful of lessons. Give each ordinary lesson a three-question quiz that mixes rule recall with a short fact-pattern application. Mark every third lesson as checkpoint exam and give those checkpoints five scenario-based multiple-choice questions. Explain before testing; use plain language, story/examples where helpful, and never invent authorities. Do not append quotation-warning labels or explanatory text outside the JSON.\n\nSOURCE DIGEST:\n`;
  onProgress?.("Starting a staged read so every source section is covered…");
  const digest = docIds.length ? await buildSourceDigest(sources, docIds, onProgress) : "No AI-readable document was selected.";
  onProgress?.("Building the final syllabus from the complete staged digest…");
  const final = await runAIStage({ feature: "study_plan", mode: "general", messages: [{ role: "user", content: `${prompt}${digest}` }] });
  const syllabus = { ...parseJson(final.answer, final.data), language };
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new Error("Sign in first.");
  const { data, error } = await db().from("guided_courses").insert({ owner: user.id, title: `${subject} guided syllabus`, subject, source_document_ids: docIds, source_labels: sources, syllabus, progress: 0, visibility }).select("*").single();
  if (error || !data) throw new Error(`Could not save the syllabus: ${error?.message ?? "unknown error"}`);
  return data as GuidedCourse;
}

export async function listGuidedCourses() {
  const { data, error } = await db().from("guided_courses").select("*").order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error("Could not load your guided syllabi.");
  return (data ?? []) as GuidedCourse[];
}

export async function getCourseProgress(courseId: string) {
  const { data, error } = await db().from("guided_course_progress").select("lesson_index,status,score,attempts,last_answer").eq("course_id", courseId).order("lesson_index").limit(100);
  if (error) throw new Error("Could not load learning progress.");
  return (data ?? []).map((row) => ({ ...row, last_answer: parseWrittenCheckpoint(row.last_answer) })) as CourseProgress[];
}

export async function resumeLessonIndex(course: GuidedCourse) {
  const saved = await getCourseProgress(course.id);
  const next = course.syllabus.lessons.findIndex((_, index) => saved.find((item) => item.lesson_index === index)?.status !== "completed");
  return { progress: saved, lessonIndex: next >= 0 ? next : Math.max(0, course.syllabus.lessons.length - 1) };
}

export async function evaluateWrittenCheckpoint(course: GuidedCourse, lessonIndex: number, answer: string, previous?: WrittenCheckpoint | null) {
  const lesson = course.syllabus.lessons[lessonIndex];
  if (!lesson || answer.trim().length < 20) throw new Error("Write at least a few sentences so the tutor can evaluate your reasoning.");
  const readable = course.source_labels.filter((source) => source.kind !== "material");
  const sourceMode = !course.source_document_ids.length ? "general" : readable.length > 0 && readable.every((source) => source.kind === "document" && source.scope === "library") ? "library" : "materials";
  const prior = previous ? `\nPrevious typed answer: ${previous.answer}\nPrevious checkpoint feedback: ${previous.feedback}\nPrevious missing points: ${previous.missing_points.join("; ")}` : "";
  const languageInstruction = course.syllabus.language === "sw"
    ? "Write feedback, missing points, and next step in fluent Kenyan Kiswahili; preserve official legal names and citations."
    : "Write feedback, missing points, and next step in clear Kenyan English.";
  const result = await runAIStage({ feature: "kaizen_check", mode: sourceMode, docIds: course.source_document_ids, messages: [{ role: "user", content: `Lesson: ${lesson.title}\nObjective: ${lesson.objective}\nTeaching output:\n${lesson.explanation}\n\nStudent typed answer:\n${answer.trim()}${prior}\n\nEvaluate this answer as the written Kaizen checkpoint. ${languageInstruction} Return only the requested JSON.` }] });
  const raw = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const score = Math.max(0, Math.min(100, Number(raw.score) || 0));
  const checkpoint: WrittenCheckpoint = { answer: answer.trim(), feedback: String(raw.feedback ?? result.answer), score, passed: Boolean(raw.passed) || score >= 70, missing_points: Array.isArray(raw.missing_points) ? raw.missing_points.map(String) : [], next_step: String(raw.next_step ?? "Rewrite the answer once using the feedback."), updated_at: new Date().toISOString() };
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new Error("Sign in first.");
  const current = await db().from("guided_course_progress").select("attempts").eq("course_id", course.id).eq("learner", user.id).eq("lesson_index", lessonIndex).maybeSingle();
  const { error } = await db().from("guided_course_progress").upsert({ course_id: course.id, learner: user.id, lesson_index: lessonIndex, status: checkpoint.passed ? "completed" : "repeat", score: checkpoint.score, attempts: Number(current.data?.attempts ?? 0) + 1, last_answer: checkpoint, completed_at: checkpoint.passed ? new Date().toISOString() : null, updated_at: checkpoint.updated_at }, { onConflict: "course_id,learner,lesson_index" });
  if (error) throw new Error("Could not save your written checkpoint.");
  const progress = Math.round(((await getCourseProgress(course.id)).filter((p) => p.status === "completed").length / Math.max(1, course.syllabus.lessons.length)) * 100);
  await db().from("guided_courses").update({ progress, updated_at: checkpoint.updated_at }).eq("id", course.id).eq("owner", user.id);
  return { checkpoint, progress };
}

export async function saveLessonProgress(course: GuidedCourse, lessonIndex: number, score: number, answers: number[]) {
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new Error("Sign in first.");
  const current = await db().from("guided_course_progress").select("attempts,last_answer").eq("course_id", course.id).eq("learner", user.id).eq("lesson_index", lessonIndex).maybeSingle();
  const attempts = Number(current.data?.attempts ?? 0) + 1;
  const status = score >= 70 ? "completed" : "repeat";
  const { error } = await db().from("guided_course_progress").upsert({ course_id: course.id, learner: user.id, lesson_index: lessonIndex, status, score, attempts, last_answer: parseWrittenCheckpoint(current.data?.last_answer), completed_at: status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "course_id,learner,lesson_index" });
  if (error) throw new Error("Could not save this checkpoint.");
  const progress = Math.round(((await getCourseProgress(course.id)).filter((p) => p.status === "completed").length / Math.max(1, course.syllabus.lessons.length)) * 100);
  await db().from("guided_courses").update({ progress, updated_at: new Date().toISOString() }).eq("id", course.id).eq("owner", user.id);
  return { progress, status };
}
