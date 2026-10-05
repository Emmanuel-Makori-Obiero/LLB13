import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type CaseResult = {
  title: string;
  url: string;
  citation: string | null;
};

const FALLBACK_CASES: CaseResult[] = [
  { title: "Gachagua & 57 others v Speaker, National Assembly & 35 others [2026] KEHC 8198 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2026/8198/eng@2026-06-08", citation: "[2026] KEHC 8198 (KLR)" },
  { title: "National Assembly v Gachagua & 66 others [2026] KESC 19 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kesc/2026/19/eng@2026-01-30", citation: "[2026] KESC 19 (KLR)" },
  { title: "Gachagua & 11 others v Speaker, National Assembly of Kenya [2024] KEHC 13655 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2024/13655/eng@2024-10-25", citation: "[2024] KEHC 13655 (KLR)" },
  { title: "Gachagua & 7 others v Speaker, National Assembly & 5 others [2024] KEHC 13752 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2024/13752/eng@2024-10-23", citation: "[2024] KEHC 13752 (KLR)" },
  { title: "Chege v Gachagua (Environment and Land Case E003 of 2026) [2026] KEMC 187 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kemc/2026/187/eng@2026-06-24", citation: "[2026] KEMC 187 (KLR)" },
];

function fallbackCases(query: string): CaseResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 3);
  if (!terms.length) return [];
  return FALLBACK_CASES.filter((item) => terms.some((term) => item.title.toLowerCase().includes(term))).slice(0, 10);
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function officialCaseUrl(value: string) {
  try {
    const url = new URL(value, "https://www.google.com");
    const candidate = url.searchParams.get("q") || url.searchParams.get("url") || url.searchParams.get("uddg") || url.href;
    const clean = new URL(candidate);
    if (
      (clean.hostname === "new.kenyalaw.org" || clean.hostname === "kenyalaw.org") &&
      /\/akn\/ke\/judgment\//.test(clean.pathname)
    ) {
      return clean.toString();
    }
  } catch {
    /* Ignore malformed Google result links. */
  }
  return null;
}

function parseResults(html: string): CaseResult[] {
  const results: CaseResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = officialCaseUrl(match[1]);
    if (!url || seen.has(url)) continue;
    const title = decodeHtml(match[2]);
    if (title.length < 8 || /cached|similar|translate/i.test(title)) continue;
    seen.add(url);
    const citationMatch = title.match(/(\[\d{4}\]\s+[A-Z]+\s+\d+\s+\(KLR\)|\b[A-Z]{2,8}\s+\d+\/\d{4}\b)/i);
    results.push({ title: title.slice(0, 240), url, citation: citationMatch?.[1] ?? null });
    if (results.length === 10) break;
  }
  return results;
}

function extractJudgmentText(html: string) {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? html;
  return decodeHtml(main.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")).slice(0, 60000);
}

function citationUrlCandidates(query: string): { url: string; citation: string }[] {
  const match = query.match(/\[(\d{4})\]\s*(KEHC|KECA|KESC|KEELRC|KEELC|KEMC|KEKC|SCC)\s*(\d+)\s*\(KLR\)/i);
  if (!match) return [];
  const year = match[1];
  const court = match[2].toLowerCase();
  const number = match[3];
  const date = query.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = date ? String(months.indexOf(date[2].toLowerCase()) + 1).padStart(2, "0") : "";
  const dated = date ? `${date[3]}-${month}-${String(date[1]).padStart(2, "0")}` : null;
  const base = `https://kenyalaw.org/akn/ke/judgment/${court}/${year}/${number}/eng`;
  const citation = `[${year}] ${match[2].toUpperCase()} ${number} (KLR)`;
  return [...(dated ? [{ url: `${base}@${dated}`, citation }] : []), { url: base, citation }];
}

async function resolveCitation(query: string): Promise<CaseResult | null> {
  const candidate = citationUrlCandidates(query)[0];
  return candidate ? { title: query.slice(0, 240), url: candidate.url, citation: candidate.citation } : null;
}

async function discoverResults(query: string): Promise<{ results: CaseResult[]; providers: string[] }> {
  const queryVariants = [
    `site:new.kenyalaw.org/akn/ke/judgment ${query}`,
    `site:kenyalaw.org ${query} judgment`,
    `${query} Kenya Law judgment`,
  ];
  const sources = queryVariants.flatMap((variant, index) => [
    { name: index === 0 ? "Google" : "Google related", url: `https://www.google.com/search?gbv=1&num=10&q=${encodeURIComponent(variant)}` },
    { name: index === 0 ? "Bing" : "Bing related", url: `https://www.bing.com/search?count=10&q=${encodeURIComponent(variant)}` },
  ]);
  sources.push({ name: "Kenya Law", url: `https://new.kenyalaw.org/search/?q=${encodeURIComponent(query)}` });
  const providers: string[] = [];
  for (const source of sources) {
    try {
      const response = await fetch(source.url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; Group13CaseFinder/1.0; +https://kenyalaw.org/)",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) continue;
      providers.push(source.name);
      const results = parseResults(await response.text());
      if (results.length) return { results, providers };
    } catch {
      /* Try the next independent source. */
    }
  }
  return { results: [], providers };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "POST a case query." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Supabase is not configured on the server." }, 503);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  const { data } = await userClient.auth.getUser();
  if (!data.user) return json({ error: "Please sign in before searching case law." }, 401);

  let body: { query?: unknown; url?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON body containing a query." }, 400);
  }
  const requestedUrl = body.url ? officialCaseUrl(String(body.url)) : null;
  if (body.url && !requestedUrl) return json({ error: "Only official Kenya Law judgment links can be opened." }, 400);
  if (requestedUrl) {
    const judgment = await fetch(requestedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; Group13CaseFinder/1.0; +https://kenyalaw.org/)",
      },
    });
    if (!judgment.ok) return json({ error: "The official judgment could not be loaded right now." }, 502);
    const html = await judgment.text();
    const text = extractJudgmentText(html);
    if (text.length < 100) return json({ error: "The official judgment did not contain readable text." }, 422);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return json({ document: { title: titleMatch ? decodeHtml(titleMatch[1]) : "Kenya Law judgment", url: requestedUrl, text } });
  }

  const query = String(body.query ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 3) return json({ error: "Enter at least three characters to search." }, 400);
  if (query.length > 180) return json({ error: "Keep the case query under 180 characters." }, 400);
  const citationMatch = await resolveCitation(query);
  if (citationMatch) return json({ query, results: [citationMatch], source: "Official Kenya Law citation resolver" });

  const discovered = await discoverResults(query);
  const fallback = discovered.results.length ? discovered.results : fallbackCases(query);
  return json({
    query,
    results: fallback,
    source: discovered.providers.length
      ? `Official Kenya Law links discovered using ${discovered.providers.join(" / ")}`
      : fallback.length ? "Official Kenya Law judgment index fallback" : "No search provider responded; try the official Kenya Law advanced search.",
    degraded: discovered.providers.length === 0,
    officialSearchUrl: `https://kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment&q=${encodeURIComponent(query)}`,
  });
});
