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

export type KenyaCauseListResult = {
  title: string;
  url: string;
  court: string;
  dateRange: string | null;
  source: "Kenya Law cause-list archive";
};

const COMMON_LEGAL_TERMS = [
  "contract", "negligence", "defamation", "constitutional", "employment",
  "land", "succession", "judicial review", "criminal appeal", "tort",
  "impeachment", "jurisdiction", "discrimination", "dismissal", "privacy",
  "arbitration", "election", "murder", "fraud", "neighbour", "liability",
  "administrative", "inheritance", "negligent", "appeal", "evidence",
];

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

export function suggestCaseQueries(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const replacements: Record<string, string> = {
    titt: "tort", tirt: "tort", conract: "contract", contractt: "contract",
    neglegence: "negligence", negligencee: "negligence", constition: "constitutional",
    constituton: "constitutional", emplyment: "employment", employement: "employment",
    defamtion: "defamation", succesion: "succession", judical: "judicial review",
  };
  const direct = replacements[normalized];
  const clean = query.trim();
  const suggestions = direct ? [direct] : [];
  const terms = [...new Set(COMMON_LEGAL_TERMS.flatMap((term) => term.split(" ")).filter((term) => term.length >= 4))];
  const corrected = clean.replace(/\b[A-Za-z]{4,}\b/g, (word) => {
    const token = word.toLowerCase();
    const ranked = terms
      .filter((term) => Math.abs(term.length - token.length) <= (token.length >= 8 ? 2 : 1))
      .map((term) => ({ term, distance: editDistance(token, term) }))
      .filter((candidate) => candidate.distance > 0 && candidate.distance <= (token.length >= 8 ? 2 : 1))
      .sort((a, b) => a.distance - b.distance);
    if (!ranked.length || (ranked[1] && ranked[1].distance === ranked[0].distance)) return word;
    return word[0] === word[0].toUpperCase()
      ? ranked[0].term[0].toUpperCase() + ranked[0].term.slice(1)
      : ranked[0].term;
  });
  if (corrected.toLowerCase() !== normalized) suggestions.unshift(corrected);
  if (!direct && normalized.length >= 4) {
    for (const term of COMMON_LEGAL_TERMS) if (editDistance(normalized, term) <= Math.max(2, Math.floor(term.length / 4))) suggestions.push(term);
  }
  if (clean.length >= 3) {
    suggestions.push(`${clean} case`, `${clean} judgment`, `${clean} Kenya Law`);
  }
  return [...new Set(suggestions)].slice(0, 5);
}

export async function searchKenyaLaw(query: string): Promise<KenyaLawCaseResult[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  try {
    const localResponse = await fetch("/kenya-law-index.json", { cache: "no-store" });
    if (localResponse.ok) {
      const localData = await localResponse.json() as { results?: unknown };
      const term = query.trim().toLowerCase();
      const localResults = Array.isArray(localData.results)
        ? (localData.results as KenyaLawCaseResult[]).filter((item) => `${item.title} ${item.citation ?? ""}`.toLowerCase().includes(term))
        : [];
      if (localResults.length) return localResults.slice(0, 30);
    }
  } catch {
    /* The optional local cache is absent; use the authenticated worker below. */
  }
  let data: { results?: unknown } | null = null;
  let error: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await supabase.functions.invoke("kenya-law-search", { body: { query } });
    data = response.data;
    error = response.error;
    if (!error) break;
    const status = Number((error as { context?: Response })?.context?.status ?? 0);
    if (attempt === 0 && (status === 502 || status === 503 || status === 504)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      continue;
    }
    break;
  }
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

export async function searchKenyaCauseLists(query: string, dates?: { fromDate?: string; toDate?: string }): Promise<{
  results: KenyaCauseListResult[];
  judiciaryPortalUrl: string;
  officialSearchUrl: string;
  caveat: string;
}> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("kenya-law-search", { body: { query, ...dates } });
  if (error) {
    let message = "The official cause-list search is unavailable right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* Keep the friendly fallback. */
    }
    throw new Error(message);
  }
  return {
    results: Array.isArray(data?.results) ? data.results as KenyaCauseListResult[] : [],
    judiciaryPortalUrl: String(data?.judiciaryPortalUrl ?? "https://causelist.court.go.ke/causelist"),
    officialSearchUrl: String(data?.officialSearchUrl ?? "https://kenyalaw.org/causelists/"),
    caveat: String(data?.caveat ?? "A cause list is a dated public court schedule, not a complete case register."),
  };
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
