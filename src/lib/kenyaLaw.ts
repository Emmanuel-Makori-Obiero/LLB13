import { supabase } from "../data/repository";

export type KenyaLawCaseResult = {
  title: string;
  url: string;
  citation: string | null;
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
