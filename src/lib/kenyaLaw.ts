import { supabase } from "../data/repository";

export type KenyaLawCaseResult = {
  title: string;
  url: string;
  citation: string | null;
};

export type KenyaLawCaseDocument = {
  title: string;
  url: string;
  text: string;
};

export async function searchKenyaLaw(query: string): Promise<KenyaLawCaseResult[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("kenya-law-search", {
    body: { query },
  });
  if (error) {
    let message = "The case search is unavailable right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* Keep the friendly fallback. */
    }
    throw new Error(message);
  }
  return Array.isArray(data?.results) ? (data.results as KenyaLawCaseResult[]) : [];
}

export async function fetchKenyaLawCase(url: string): Promise<KenyaLawCaseDocument> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("kenya-law-search", {
    body: { url },
  });
  if (error) {
    let message = "The official judgment could not be loaded.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* Keep the friendly fallback. */
    }
    throw new Error(message);
  }
  if (!data?.document?.text) throw new Error("The official judgment did not contain readable text.");
  return data.document as KenyaLawCaseDocument;
}
