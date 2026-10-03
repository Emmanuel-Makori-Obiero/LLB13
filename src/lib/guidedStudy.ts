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
export type GuideSyllabus = { overview: string; lessons: GuideLesson[] };
export type GuidedCourse = {
  id: string;
  owner: string;
  title: string;
  subject: string;
  source_document_ids: string[];
  source_labels: SourceChoice[];
  syllabus: GuideSyllabus;
  progress: number;
  updated_at: string;
};
export type CourseProgress = { lesson_index: number; status: string; score: number | null; attempts: number };

function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }

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

function parseJson(text: string, data?: unknown): GuideSyllabus {
  const raw = data && typeof data === "object" ? data as Partial<GuideSyllabus> : extractJsonObject(text);
  if (!raw) throw new Error("The guide generator did not return a syllabus. Try again.");
  const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
  if (!lessons.length) throw new Error("The guide generator returned no lessons.");
  return { overview: String(raw.overview ?? "A source-grounded guided course."), lessons: lessons.map((lesson) => ({
    title: String(lesson.title ?? "Lesson"), objective: String(lesson.objective ?? "Understand the key rule."),
    explanation: String(lesson.explanation ?? ""), example: String(lesson.example ?? ""), sourceFocus: lesson.sourceFocus ? String(lesson.sourceFocus) : undefined,
    checkpoint: lesson.checkpoint === "exam" ? "exam" : "quiz",
    quiz: Array.isArray(lesson.quiz) ? lesson.quiz.filter((q) => q && typeof q.question === "string" && Array.isArray(q.options)).map((q) => ({ question: q.question, options: q.options.map(String), answerIndex: Number(q.answerIndex) || 0, explanation: String(q.explanation ?? "") })) : [],
  })) };
}

async function transcriptAsDocument(choice: SourceChoice) {
  const { data, error } = await db().from("transcript_chunks").select("idx,text").eq("transcript_id", choice.id).order("idx").limit(3000);
  if (error) throw new Error(`Could not load transcript ${choice.title}.`);
  const text = (data ?? []).map((row) => row.text).join("\n\n");
  if (text.trim().length < 50) throw new Error(`${choice.title} has no usable transcript text yet.`);
  return saveTextMaterial(`${choice.title} (saved transcript)`, text, `Saved transcript: ${choice.title}`);
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

export async function createGuidedCourse(subject: string, sources: SourceChoice[], preferences: string): Promise<GuidedCourse> {
  if (!sources.length) throw new Error("Choose at least one book, saved document, or transcript.");
  const docIds: string[] = [];
  for (const source of sources) if (source.kind === "transcript") docIds.push((await transcriptAsDocument(source)).id); else if (source.kind === "document") docIds.push(source.id);
  const linkedMaterials = sources.filter((source) => source.kind === "material").map((source) => `${source.title}${source.citation ? ` (${source.citation})` : ""}`).join("; ");
  const prompt = `Create a complete guided law-study syllabus for: ${subject}. Use ONLY the selected source documents. ${linkedMaterials ? `The following Library items are also linked as reference records; use their titles and metadata as context, but do not invent their contents: ${linkedMaterials}.` : ""} ${preferences}\nReturn ONLY valid JSON with no markdown fences in this exact shape: {"overview":"...","lessons":[{"title":"...","objective":"...","explanation":"...","example":"...","sourceFocus":"...","checkpoint":"quiz","quiz":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}]}. Create 5 to 8 ordered lessons with concise explanations. Add a short quiz to every lesson, and mark every third lesson as checkpoint exam. Explain before testing; use plain language, story/examples where helpful, and never invent authorities.`;
  const readableSources = sources.filter((source) => source.kind !== "material");
  const mode = readableSources.length === 0 ? "general" : readableSources.every((source) => source.kind === "document" && source.scope === "library") ? "library" : readableSources.some((source) => source.scope === "library") ? "auto" : "materials";
  let syllabus: GuideSyllabus | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3 && !syllabus; attempt += 1) {
    try {
      const result: AIResult = await askAI({ feature: "study_plan", mode, docIds, messages: [{ role: "user", content: prompt }] });
      syllabus = parseJson(result.answer, result.data);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 2500 * (attempt + 1)));
    }
  }
  if (!syllabus) throw new Error(lastError instanceof Error ? lastError.message : "The AI could not create the syllabus after three attempts.");
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new Error("Sign in first.");
  const { data, error } = await db().from("guided_courses").insert({ owner: user.id, title: `${subject} guided syllabus`, subject, source_document_ids: docIds, source_labels: sources, syllabus, progress: 0 }).select("*").single();
  if (error || !data) throw new Error(`Could not save the syllabus: ${error?.message ?? "unknown error"}`);
  return data as GuidedCourse;
}

export async function listGuidedCourses() {
  const { data, error } = await db().from("guided_courses").select("*").order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error("Could not load your guided syllabi.");
  return (data ?? []) as GuidedCourse[];
}

export async function getCourseProgress(courseId: string) {
  const { data, error } = await db().from("guided_course_progress").select("lesson_index,status,score,attempts").eq("course_id", courseId).order("lesson_index").limit(100);
  if (error) throw new Error("Could not load learning progress.");
  return (data ?? []) as CourseProgress[];
}

export async function saveLessonProgress(course: GuidedCourse, lessonIndex: number, score: number, answers: number[]) {
  const user = (await db().auth.getUser()).data.user;
  if (!user) throw new Error("Sign in first.");
  const current = await db().from("guided_course_progress").select("attempts").eq("course_id", course.id).eq("learner", user.id).eq("lesson_index", lessonIndex).maybeSingle();
  const attempts = Number(current.data?.attempts ?? 0) + 1;
  const status = score >= 70 ? "completed" : "repeat";
  const { error } = await db().from("guided_course_progress").upsert({ course_id: course.id, learner: user.id, lesson_index: lessonIndex, status, score, attempts, last_answer: answers, completed_at: status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "course_id,learner,lesson_index" });
  if (error) throw new Error("Could not save this checkpoint.");
  const progress = Math.round(((await getCourseProgress(course.id)).filter((p) => p.status === "completed").length / Math.max(1, course.syllabus.lessons.length)) * 100);
  await db().from("guided_courses").update({ progress, updated_at: new Date().toISOString() }).eq("id", course.id).eq("owner", user.id);
  return { progress, status };
}
