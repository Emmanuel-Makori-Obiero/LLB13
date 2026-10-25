// Client side of the AI layer.
import { supabase as client } from "../data/repository";
import { useCallback, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";
import { ocrImage, ocrPdfPages } from "./ocr";
import { extractLegacyWordHtml } from "./legacyWord";
import { isPersonalizedStudyFeature, personalizeMessages, type LearningProfile } from "./learnerAdaptation";
import { shouldRetryAiRequest } from "./aiRetryPolicy";
import { extractArticleNumbers, MAX_CONSTITUTION_ARTICLES_PER_BATCH, shouldReuseConstitutionHistory, splitArticleNumbers } from "./constitutionArticles";

function db() {
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

export type AIMode = "materials" | "library" | "auto" | "general";
export type AIFeature =
  | "chat"
  | "exam_analysis"
  | "explain"
  | "summarize"
  | "book_summary_synthesis"
  | "book_contents"
  | "topic_summary"
  | "book_metadata"
  | "book_recommendation"
  | "case_brief"
  | "irac"
  | "essay_feedback"
  | "arena_judgment"
  | "arena_case"
  | "study_plan"
  | "kaizen_check"
  | "timetable_proposal"
  | "personal_timetable_proposal"
  | "personal_timetable_replan"
  | "moot"
  | "moot_judge"
  | "moot_guide"
  | "arena_training"
  | "choices_game"
  | "kmun"
  | "kmun_guide"
  | "quiz"
  | "flashcards"
  | "notes"
  | "notes_research"
  | "notes_review"
  | "quality_check"
  | "extract_assignments"
  | "counsellor"
  | "rw_question"
  | "rw_outline"
  | "rw_draft"
  | "rw_improve"
  | "rw_critique"
  | "rw_citations"
  | "rw_validate"
  | "rw_bookends"
  | "podcast_script"
  | "video_script"
  | "legal_process"
  | "legal_explain";

export const AI_MODES: { value: AIMode; label: string; hint: string }[] = [
  {
    value: "materials",
    label: "My uploads only",
    hint: "Answers strictly from documents you uploaded.",
  },
  {
    value: "library",
    label: "Library only",
    hint: "Answers strictly from the shared library books.",
  },
  {
    value: "auto",
    label: "Smart (sources first)",
    hint: "Uses your uploads and the library, then fills gaps from general law.",
  },
  {
    value: "general",
    label: "Any law",
    hint: "Kenyan law, with the Constitution first. Case citations are included only when supported by selected sources.",
  },
];

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

let currentLearnerProfile: LearningProfile = { learnerLevel: "", learningPreference: "" };

/** Set from the signed-in profile; cleared when auth state becomes null. */
export function setLearnerAdaptation(profile: LearningProfile): void {
  currentLearnerProfile = { ...profile };
}
export interface AIResult {
  answer: string;
  data: unknown | null; // parsed JSON for quiz / flashcards
  basis: "materials" | "library" | "mixed" | "general" | "none";
  grounded: boolean;
  warnings: string[];
  sources: { tag: string; title: string; author?: string | null; ref: string | null }[];
  provider: string | null;
  model: string | null;
}

type AskAIArgs = {
  feature: AIFeature;
  mode: AIMode;
  messages: AIMessage[];
  docIds?: string[];
  part?: number; // Paged notes or complete-source book summary block
  size?: number; // How many indexed sections per paged block
  startIndex?: number; // Zero-based absolute offset for exact book-summary ranges
  learnerLevel?: LearningProfile["learnerLevel"];
};

const CONSTITUTION_BATCHABLE_FEATURES = new Set<AIFeature>(["chat", "explain", "legal_explain"]);
const CONSTITUTION_HISTORY_FEATURES = new Set<AIFeature>(["chat", "explain"]);

async function askAISingle(
  args: AskAIArgs,
  constitutionArticles?: number[],
  constitutionHistoryOnly = false,
): Promise<AIResult> {
  let data: unknown = null;
  let error: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const request = isPersonalizedStudyFeature(args.feature)
      ? { ...args, learnerLevel: currentLearnerProfile.learnerLevel, messages: personalizeMessages(args.messages, currentLearnerProfile) }
      : args;
    const body = {
      ...request,
      ...(constitutionArticles ? { constitutionArticles } : {}),
      ...(constitutionHistoryOnly ? { constitutionHistoryOnly: true } : {}),
    };
    const response = await db().functions.invoke("ai", { body });
    data = response.data;
    error = response.error;
    if (!error) break;
    const context = (error as { context?: Response })?.context;
    const status = Number(context?.status ?? 0);
    let errorBody: { attempts?: unknown; retry_after_seconds?: unknown } | null = null;
    try {
      errorBody = context ? await context.clone().json() : null;
    } catch {
      /* gateway/network errors may not include JSON */
    }
    if (attempt === 0 && shouldRetryAiRequest(status, errorBody)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    break;
  }
  if (error) {
    // supabase-js wraps non-2xx; try to surface the function's own message
    let msg = "The assistant is unavailable right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      msg = body?.error ?? msg;
      if (Number(body?.retry_after_seconds) > 0) {
        msg += ` The configured API-key alternatives and provider fallbacks were already tried; at least one provider asked that it not be retried for about ${Number(body.retry_after_seconds)} seconds. This request will not restart automatically.`;
      }
      if (Array.isArray(body?.attempts) && body.attempts.length)
        msg += ` [${body.attempts
          .map(
            (a: { id: string; status: string; detail?: string }) =>
              `${a.id} ${a.status}${a.detail ? ` ${String(a.detail).slice(0, 70)}` : ""}`,
          )
          .join("; ")}]`;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return data as AIResult;
}

function mergeConstitutionBatchResults(
  completed: { articles: number[]; result: AIResult }[],
  allBatches: number[][],
  failure?: string,
): AIResult {
  let nextSourceNumber = 1;
  const sharedTags = new Map<string, string>();
  const sources: AIResult["sources"] = [];
  const sections = completed.map(({ articles, result }) => {
    const localToGlobal = new Map<string, string>();
    for (const source of result.sources ?? []) {
      const key = `${source.title}\u0000${source.author ?? ""}\u0000${source.ref ?? ""}`;
      let globalTag = sharedTags.get(key);
      if (!globalTag) {
        globalTag = `S${nextSourceNumber++}`;
        sharedTags.set(key, globalTag);
        sources.push({ ...source, tag: globalTag });
      }
      localToGlobal.set(source.tag, globalTag);
    }
    const answer = result.answer.replace(/\[(S\d+)\]/g, (match, tag: string) => {
      const replacement = localToGlobal.get(tag);
      return replacement ? `[${replacement}]` : match;
    });
    return `## Articles ${articles.join(", ")}\n\n${answer}`;
  });

  const incompleteArticles = failure
    ? allBatches.slice(completed.length).flat()
    : [];
  const incompleteNotice = failure
    ? `> **Incomplete coverage:** batches ${completed.length} of ${allBatches.length} completed. Articles ${incompleteArticles.join(", ")} were not reviewed because processing stopped: ${failure}. Completed batches count toward your normal hourly text-AI allowance. Do not treat this as a complete review.\n\n`
    : `> All ${completed.reduce((count, batch) => count + batch.articles.length, 0)} requested Articles were processed in ${allBatches.length} source-grounded batches. Each batch uses a standard text-AI request; a transient retry may use an additional request.\n\n`;
  const results = completed.map((batch) => batch.result);
  const first = results[0];
  const last = results[results.length - 1];
  const warnings = [...new Set(results.flatMap((result) => result.warnings ?? []))];
  if (failure) warnings.unshift(`Constitution review incomplete: ${incompleteArticles.length} Articles remain unreviewed.`);
  else warnings.unshift(`All requested Constitution Articles were processed in ${allBatches.length} standard AI batches; a transient retry may use an additional request.`);

  return {
    answer: `${incompleteNotice}${sections.join("\n\n---\n\n")}`,
    data: null,
    basis: first?.basis ?? "none",
    grounded: !failure && results.every((result) => result.grounded),
    warnings,
    sources,
    provider: last?.provider ?? null,
    model: last?.model ?? null,
  };
}

export async function askAI(args: AskAIArgs): Promise<AIResult> {
  if (!CONSTITUTION_BATCHABLE_FEATURES.has(args.feature)) return askAISingle(args);

  const userMessages = args.messages
    .filter((message) => message.role === "user")
    .slice(-1);
  const articleRequest = userMessages[0]?.content ?? "";

  const recentAssistantTurns = args.messages
    .filter((message) => message.role === "assistant")
    .slice(-4);
  if (
    CONSTITUTION_HISTORY_FEATURES.has(args.feature) &&
    (args.mode === "general" || args.mode === "auto") &&
    !args.docIds?.length &&
    shouldReuseConstitutionHistory(articleRequest, recentAssistantTurns)
  ) {
    return askAISingle(args, undefined, true);
  }

  const articleNumbers = extractArticleNumbers(articleRequest);
  const batches = splitArticleNumbers(articleNumbers, MAX_CONSTITUTION_ARTICLES_PER_BATCH);
  if (batches.length <= 1) return askAISingle(args);

  let lastUserIndex = -1;
  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    if (args.messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex !== args.messages.length - 1) return askAISingle(args);

  const completed: { articles: number[]; result: AIResult }[] = [];
  let failure: string | undefined;
  for (let index = 0; index < batches.length; index += 1) {
    const articles = batches[index];
    const messages = [...args.messages];
    messages[lastUserIndex] = {
      ...messages[lastUserIndex],
      content: `${messages[lastUserIndex].content}\n\nFor this response, answer only for Constitution Articles ${articles.join(", ")}. This is batch ${index + 1} of ${batches.length}; do not claim that other Articles were reviewed in this batch.`,
    };
    try {
      const result = await askAISingle({ ...args, messages }, articles);
      completed.push({ articles, result });
    } catch (error) {
      failure = error instanceof Error ? error.message : "an AI request failed";
      if (!completed.length) throw new Error(`Could not process the first Constitution batch (Articles ${articles.join(", ")}): ${failure}`);
      break;
    }
  }

  return mergeConstitutionBatchResults(completed, batches, failure);
}

/** One hook for every AI screen: const { run, loading, result, error } = useAI("case_brief") */
export function useAI(feature: AIFeature) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (messages: AIMessage[], mode: AIMode, docIds?: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const r = await askAI({ feature, mode, messages, docIds });
        setResult(r);
        return r;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [feature],
  );

  return { run, loading, result, error };
}

// ---------- uploads: extract text in the browser, chunk, store ----------
function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const paras = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      chunks.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isLegacyDoc = name.endsWith(".doc") || file.type === "application/msword";
  if (name.endsWith(".pdf")) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
      .promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out +=
        tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
    }
    if (out.trim().length >= 40) return out;
    return ocrPdfPages(pdf);
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name)) {
    return ocrImage(file);
  }
  if (isDocx) {
    try {
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } catch {
      throw new Error("This Word file could not be read. Save it as a current .docx file in Microsoft Word or Google Docs and upload it again.");
    }
  }
  if (isLegacyDoc) {
    const legacyExport = extractLegacyWordHtml(await file.text());
    if (legacyExport) return legacyExport;
    throw new Error("This .doc is a binary Word file, not an older Group 13 export, so the browser cannot read it directly. For other .doc files, save or export a copy as .docx and upload that copy.");
  }
  if (name.endsWith(".pptx")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideFiles = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));
    const decoder = document.createElement("textarea");
    const decodeXml = (value: string) => {
      decoder.innerHTML = value;
      return decoder.value;
    };
    const slides: string[] = [];
    for (const [index, slidePath] of slideFiles.entries()) {
      const xml = await zip.files[slidePath].async("text");
      const words = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)]
        .map((match) => decodeXml(match[1]).replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (words.length) slides.push(`Slide ${index + 1}\n${words.join(" ")}`);
    }
    return slides.join("\n\n");
  }
  if (name.endsWith(".ppt")) {
    throw new Error("Legacy .ppt files are not supported in-browser. Save the slides as .pptx and upload again.");
  }
  return await file.text(); // .txt, .md
}

/** Convert a DOCX blob into HTML for the in-app reading view. */
export async function docxToHtml(file: Blob): Promise<string> {
  try {
    return (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value;
  } catch {
    throw new Error("This Word file could not be rendered. Save it as a current .docx file and upload it again.");
  }
}

export async function uploadMaterial(
  file: File,
  citation?: string,
  author?: string,
): Promise<{ id: string; chunks: number; text: string }> {
  if (!file.size) throw new Error("The selected file is empty. Choose a file with at least 1 byte.");
  const text = (await extractText(file)).trim();
  if (!text.length)
    throw new Error(
      "No readable text found after OCR. Try a clearer scan, or save the Word file as .docx before upload.",
    );
  const saved = await storeText(file.name.replace(/\.[^.]+$/, ""), text, citation, "user", author);
  return { ...saved, text };
}

/** Extract and index a newly uploaded Library book as shared AI knowledge. */
export async function uploadLibraryMaterial(
  file: File,
  citation?: string,
  author?: string,
  targetYears: string[] = [],
  materialId?: string,
): Promise<{ id: string; chunks: number }> {
  if (!file.size) throw new Error("The selected file is empty. Choose a file with at least 1 byte.");
  const text = (await extractText(file)).trim();
  if (!text.length)
    throw new Error("No readable text found after OCR. Try a clearer scan, or save the Word file as .docx before indexing.");
  return storeText(file.name.replace(/\.[^.]+$/, ""), text, citation, "library", author, targetYears, materialId);
}

export async function importLibraryMaterial(source: { title: string; url?: string | null; citation?: string | null; author?: string | null; target_years?: string[] | null }) {
  if (!source.url) throw new Error("This Library item does not have a readable file attached.");
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Could not open ${source.title} (${response.status}).`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`${source.title} is empty.`);
  const extension = (new URL(source.url).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || "pdf").toLowerCase();
  const file = new File([blob], `${source.title.replace(/[^a-z0-9._-]+/gi, "-")}.${extension}`, { type: blob.type || "application/octet-stream" });
  const text = (await extractText(file)).trim();
  if (!text.length) throw new Error(`${source.title} has no readable text after OCR. Try a clearer scan.`);
  const saved = await saveTextMaterial(source.title, text, source.citation ?? undefined, source.author ?? undefined, source.target_years ?? []);
  return { ...saved, text };
}

/** Save plain text (e.g. a lecture transcript) as a document the AI can read.
 *  Any earlier copy with the same title is replaced, so the AI never reads a stale version. */
export async function saveTextMaterial(
  title: string,
  text: string,
  citation?: string,
  author?: string,
  targetYears: string[] = [],
): Promise<{ id: string; chunks: number }> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Sign in first.");
  const clean = text.trim();
  if (!clean.length)
    throw new Error("There is not enough text to work with yet.");
  const { data: old } = await db()
    .from("ai_documents")
    .select("id")
    .eq("owner", u.user.id)
    .eq("scope", "user")
    .eq("title", title);
  for (const o of old ?? []) await deleteMaterial(o.id);
  return storeText(title, clean, citation, "user", author, targetYears);
}

async function storeText(
  title: string,
  text: string,
  citation?: string,
  scope: "user" | "library" = "user",
  author?: string,
  targetYears: string[] = [],
  materialId?: string,
): Promise<{ id: string; chunks: number }> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Sign in first.");

  const { data: doc, error } = await db()
    .from("ai_documents")
    .insert({
      owner: scope === "user" ? u.user.id : null,
      scope,
      title,
      citation: citation ?? null,
      author: author?.trim() || null,
      target_years: targetYears,
      material_id: materialId ?? null,
    })
    .select("id")
    .single();
  if (error || !doc) throw new Error("Could not save the document.");

  const rows = chunkText(text).map((content, idx) => ({
    document_id: doc.id,
    owner: scope === "user" ? u.user!.id : null,
    scope,
    idx,
    content,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e2 } = await db()
      .from("ai_chunks")
      .insert(rows.slice(i, i + 200));
    if (e2) {
      await db().from("ai_documents").delete().eq("id", doc.id);
      throw new Error("Upload failed part-way; nothing was kept.");
    }
  }
  return { id: doc.id, chunks: rows.length };
}

export async function listMyMaterials() {
  const { data, error } = await db()
    .from("ai_documents")
    .select("id,title,author,citation,scope,created_at,target_years,material_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load AI documents.");
  const linkedIds = [...new Set((data ?? []).map((doc) => doc.material_id).filter(Boolean).map(String))];
  const currentTags = new Map<string, string[]>();
  if (linkedIds.length) {
    const { data: materials } = await db().from("materials").select("id,target_years").in("id", linkedIds).limit(200);
    for (const material of materials ?? []) currentTags.set(String(material.id), material.target_years ?? []);
  }
  return (data ?? []).map((doc) => ({ ...doc, target_years: doc.material_id && currentTags.has(String(doc.material_id)) ? currentTags.get(String(doc.material_id))! : (doc.target_years ?? []) }));
}

/** Count only readable chunks, subject to the same RLS rules as document selection. */
export async function countMaterialChunks(documentId: string): Promise<number> {
  const { count, error } = await db()
    .from("ai_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);
  if (error) throw new Error("Could not verify the book's indexed sections. No summary was generated; refresh the Library and try again.");
  return Number(count ?? 0);
}

/** Resolve a shared Library row to the AI document that contains its extracted text. */
export async function getLibraryMaterialDocumentId(materialId: string): Promise<string> {
  const { data, error } = await db()
    .from("ai_documents")
    .select("id")
    .eq("scope", "library")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not locate the Library item's indexed text. Refresh the Library and try again.");
  if (!data?.id) throw new Error("This Library item has no linked, searchable text yet. Add the original book as a DOCX or PDF and make sure its AI indexing finishes before summarizing.");
  return String(data.id);
}

export async function deleteMaterial(id: string) {
  const { error } = await db().from("ai_documents").delete().eq("id", id);
  if (error) throw new Error("Could not delete that document.");
}
