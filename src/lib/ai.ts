// Client side of the AI layer. Adjust this import to wherever your Supabase client is created.
import { supabase } from "./supabase";
import { useCallback, useState } from "react";

export type AIMode = "materials" | "library" | "auto" | "general";
export type AIFeature =
  | "chat"
  | "explain"
  | "summarize"
  | "case_brief"
  | "irac"
  | "essay_feedback"
  | "study_plan"
  | "moot"
  | "quiz"
  | "flashcards";

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
}): Promise<AIResult> {
  const { data, error } = await supabase.functions.invoke("ai", { body: args });
  if (error) {
    // supabase-js wraps non-2xx; try to surface the function's own message
    let msg = "The assistant is unavailable right now.";
    try {
      msg =
        (await (error as { context?: Response }).context?.json())?.error ?? msg;
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
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in first.");
  const text = (await extractText(file)).trim();
  if (text.length < 50)
    throw new Error(
      "No readable text found. Scanned PDFs need OCR before upload.",
    );

  const { data: doc, error } = await supabase
    .from("ai_documents")
    .insert({
      owner: u.user.id,
      scope: "user",
      title: file.name.replace(/\.[^.]+$/, ""),
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
    const { error: e2 } = await supabase
      .from("ai_chunks")
      .insert(rows.slice(i, i + 200));
    if (e2) {
      await supabase.from("ai_documents").delete().eq("id", doc.id);
      throw new Error("Upload failed part-way; nothing was kept.");
    }
  }
  return { id: doc.id, chunks: rows.length };
}

export async function listMyMaterials() {
  const { data } = await supabase
    .from("ai_documents")
    .select("id,title,citation,scope,created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deleteMaterial(id: string) {
  await supabase.from("ai_documents").delete().eq("id", id);
}
