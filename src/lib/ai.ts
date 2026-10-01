// Client side of the AI layer.
import { supabase as client } from "../data/repository";
import { useCallback, useState } from "react";

function db() {
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

export type AIMode = "materials" | "library" | "auto" | "general";
export type AIFeature =
  | "chat"
  | "explain"
  | "summarize"
  | "book_contents"
  | "topic_summary"
  | "case_brief"
  | "irac"
  | "essay_feedback"
  | "study_plan"
  | "moot"
  | "moot_judge"
  | "moot_guide"
  | "kmun"
  | "kmun_guide"
  | "quiz"
  | "flashcards"
  | "notes"
  | "extract_assignments"
  | "counsellor"
  | "rw_question"
  | "rw_outline"
  | "rw_draft"
  | "rw_improve"
  | "rw_critique"
  | "rw_citations"
  | "rw_bookends";

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
    hint: "General legal knowledge. Verify cases and provisions.",
  },
];

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AIResult {
  answer: string;
  data: unknown | null; // parsed JSON for quiz / flashcards
  basis: "materials" | "library" | "mixed" | "general" | "none";
  grounded: boolean;
  warnings: string[];
  sources: { tag: string; title: string; ref: string | null }[];
  provider: string | null;
  model: string | null;
}

export async function askAI(args: {
  feature: AIFeature;
  mode: AIMode;
  messages: AIMessage[];
  docIds?: string[];
  part?: number; // 'notes' only: which block of a document to read
  size?: number; // 'notes' only: how many sections per block
}): Promise<AIResult> {
  const { data, error } = await db().functions.invoke("ai", { body: args });
  if (error) {
    // supabase-js wraps non-2xx; try to surface the function's own message
    let msg = "The assistant is unavailable right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      msg = body?.error ?? msg;
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

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
      .default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
      .promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out +=
        tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
    }
    return out;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (
      await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    ).value;
  }
  return await file.text(); // .txt, .md
}

export async function uploadMaterial(
  file: File,
  citation?: string,
): Promise<{ id: string; chunks: number }> {
  const text = (await extractText(file)).trim();
  if (text.length < 50)
    throw new Error(
      "No readable text found. Scanned PDFs need OCR before upload.",
    );
  return storeText(file.name.replace(/\.[^.]+$/, ""), text, citation);
}

/** Save plain text (e.g. a lecture transcript) as a document the AI can read.
 *  Any earlier copy with the same title is replaced, so the AI never reads a stale version. */
export async function saveTextMaterial(
  title: string,
  text: string,
  citation?: string,
): Promise<{ id: string; chunks: number }> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Sign in first.");
  const clean = text.trim();
  if (clean.length < 50)
    throw new Error("There is not enough text to work with yet.");
  const { data: old } = await db()
    .from("ai_documents")
    .select("id")
    .eq("owner", u.user.id)
    .eq("scope", "user")
    .eq("title", title);
  for (const o of old ?? []) await deleteMaterial(o.id);
  return storeText(title, clean, citation);
}

async function storeText(
  title: string,
  text: string,
  citation?: string,
): Promise<{ id: string; chunks: number }> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Sign in first.");

  const { data: doc, error } = await db()
    .from("ai_documents")
    .insert({
      owner: u.user.id,
      scope: "user",
      title,
      citation: citation ?? null,
    })
    .select("id")
    .single();
  if (error || !doc) throw new Error("Could not save the document.");

  const rows = chunkText(text).map((content, idx) => ({
    document_id: doc.id,
    owner: u.user!.id,
    scope: "user",
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
  const { data } = await db()
    .from("ai_documents")
    .select("id,title,citation,scope,created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deleteMaterial(id: string) {
  await db().from("ai_documents").delete().eq("id", id);
}
