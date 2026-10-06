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

type CauseListResult = {
  title: string;
  url: string;
  court: string;
  dateRange: string | null;
  source: "Kenya Law cause-list archive";
};

const FALLBACK_CASES: CaseResult[] = [
  { title: "Gachagua & 57 others v Speaker, National Assembly & 35 others [2026] KEHC 8198 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2026/8198/eng@2026-06-08", citation: "[2026] KEHC 8198 (KLR)" },
  { title: "National Assembly v Gachagua & 66 others [2026] KESC 19 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kesc/2026/19/eng@2026-01-30", citation: "[2026] KESC 19 (KLR)" },
  { title: "Gachagua & 11 others v Speaker, National Assembly of Kenya [2024] KEHC 13655 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2024/13655/eng@2024-10-25", citation: "[2024] KEHC 13655 (KLR)" },
  { title: "Gachagua & 7 others v Speaker, National Assembly & 5 others [2024] KEHC 13752 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kehc/2024/13752/eng@2024-10-23", citation: "[2024] KEHC 13752 (KLR)" },
  { title: "Chege v Gachagua (Environment and Land Case E003 of 2026) [2026] KEMC 187 (KLR)", url: "https://kenyalaw.org/akn/ke/judgment/kemc/2026/187/eng@2026-06-24", citation: "[2026] KEMC 187 (KLR)" },
];

const FALLBACK_DOCUMENTS: Record<string, string> = {
  "/kehc/2026/8198/": `Official Kenya Law metadata and order summary for Gachagua & 57 others v Speaker, National Assembly & 35 others [2026] KEHC 8198 (KLR).

Court: High Court of Kenya at Nairobi (Milimani Law Courts), Constitutional and Human Rights Division.
Judgment date: 8 June 2026. Judges: EKO Ogola, AC Mrima and FG Mugambi.
Case: Constitutional Petition E565 of 2024 and consolidated petitions E550, E570, E572, E013, E014, E015, E522, E506, E509, E525, E528, E537, E541, E567, E576 and E598 of 2024.

Official order summary: The prayer seeking to quash the Senate resolution to impeach H.E. Gachagua was declined. The Court declared that Gachagua's fair-trial rights were infringed when the Senate refused an adjournment despite his absence. The Court declared that Parliament must enact a dedicated statutory framework for impeachment of the Deputy President under Article 150 of the Constitution. The Court made no findings on pension and emoluments. Constitutional damages of Kshs. 50 million were awarded to H.E. Gachagua payable by the Senate. Each party was ordered to bear its own costs, and any prayer not expressly allowed was disallowed.

This is a verified fallback summary of the official Kenya Law record because the full document representation was not reachable from the server. Open the official judgment link to inspect the complete source before relying on it in academic work.`,
};

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

function officialLawUrl(value: string) {
  try {
    const url = new URL(value, "https://www.google.com");
    const candidate = url.searchParams.get("q") || url.searchParams.get("url") || url.searchParams.get("uddg") || url.href;
    const clean = new URL(candidate);
    if (
      (clean.hostname === "new.kenyalaw.org" || clean.hostname === "kenyalaw.org") &&
      /\/akn\/ke\/(judgment|act|bill|legal_notice)\//.test(clean.pathname)
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
    const url = officialLawUrl(match[1]);
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

function parseCauseLists(html: string, query: string): CauseListResult[] {
  const results: CauseListResult[] = [];
  const seen = new Set<string>();
  const terms = query.toLowerCase().split(/\s+/).filter((term) =>
    term.length >= 4 && !["find", "search", "look", "list", "case", "cases", "court", "courts", "cause", "causelists", "listings", "any", "there", "is", "today", "tomorrow", "upcoming", "nairobi", "milimani"].includes(term)
  );
  const anchorPattern = /<a[^>]+href=["'](\/akn\/ke\/doc\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const title = decodeHtml(match[2]);
    if (!/cause\s*list|causelist/i.test(title) || !/nairobi|milimani/i.test(title)) continue;
    const normalized = title.toLowerCase();
    if (terms.length && !terms.some((term) => normalized.includes(term))) continue;
    const url = `https://kenyalaw.org${match[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const dateRange = title.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s+to\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})?/i)?.[0] ?? null;
    const court = title.split(/\s+[–-]\s+(?:Daily|Weekly|Monthly) Cause List/i)[0].trim();
    results.push({ title: title.slice(0, 260), url, court, dateRange, source: "Kenya Law cause-list archive" });
    if (results.length >= 12) break;
  }
  return results;
}

function causeListDates(value: string | null): { start: string; end: string } | null {
  if (!value) return null;
  const matches = [...value.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)];
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const dates = matches.map((match) => `${match[3]}-${months[match[2].toLowerCase()] ?? "01"}-${String(match[1]).padStart(2, "0")}`);
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

function causeListOverlaps(result: CauseListResult, fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) return true;
  const dates = causeListDates(result.dateRange);
  if (!dates) return false;
  return dates.end >= (fromDate ?? "0000-01-01") && dates.start <= (toDate ?? "9999-12-31");
}

function causeListSearch(query: string) {
  const normalized = query.toLowerCase();
  const highCourt = /high\s+court|constitutional|commercial|civil|environment|family|judicial review|anti-?corruption/i.test(normalized);
  const magistrate = /magistrate|chief magistrate|criminal|small claims/i.test(normalized);
  const routes = highCourt && !magistrate
    ? ["https://kenyalaw.org/causelists/KEHC/HCNRB/?natures=cause-list-weekly"]
    : magistrate && !highCourt
      ? ["https://kenyalaw.org/causelists/KEMC/?q=Milimani"]
      : [
          "https://kenyalaw.org/causelists/KEHC/HCNRB/?natures=cause-list-weekly",
          "https://kenyalaw.org/causelists/KEMC/?q=Milimani",
        ];
  return routes;
}

async function discoverCauseLists(query: string, fromDate?: string, toDate?: string): Promise<{ results: CauseListResult[]; providers: string[] }> {
  const providers: string[] = [];
  const all: CauseListResult[] = [];
  const seen = new Set<string>();
  for (const url of causeListSearch(query)) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; Group13CaseFinder/1.0; +https://kenyalaw.org/)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      providers.push("Kenya Law cause-list archive");
      for (const result of parseCauseLists(await response.text(), query)) {
        if (!causeListOverlaps(result, fromDate, toDate)) continue;
        if (!seen.has(result.url)) { seen.add(result.url); all.push(result); }
      }
    } catch {
      /* The other official route may still respond. */
    }
  }
  return { results: all.slice(0, 12), providers: [...new Set(providers)] };
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
    `site:new.kenyalaw.org/akn/ke/act ${query}`,
    `site:kenyalaw.org ${query} Act statute Kenya`,
  ];
  const sources = queryVariants.flatMap((variant, index) => [
    { name: index === 0 ? "Google" : "Google related", url: `https://www.google.com/search?gbv=1&num=10&q=${encodeURIComponent(variant)}` },
    { name: index === 0 ? "Bing" : "Bing related", url: `https://www.bing.com/search?count=10&q=${encodeURIComponent(variant)}` },
  ]);
  sources.push({ name: "Kenya Law", url: `https://new.kenyalaw.org/search/?q=${encodeURIComponent(query)}` });
  const providers: string[] = [];
  const allResults: CaseResult[] = [];
  const seen = new Set<string>();
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
      for (const result of results) {
        if (!seen.has(result.url)) { seen.add(result.url); allResults.push(result); }
      }
      if (allResults.length >= 10) break;
    } catch {
      /* Try the next independent source. */
    }
  }
  return { results: allResults.slice(0, 10), providers };
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

  let body: { query?: unknown; url?: unknown; fromDate?: unknown; toDate?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON body containing a query." }, 400);
  }
  const requestedUrl = body.url ? officialLawUrl(String(body.url)) : null;
  if (body.url && !requestedUrl) return json({ error: "Only official Kenya Law legislation or judgment links can be opened." }, 400);
  if (requestedUrl) {
    const candidates = [
      requestedUrl,
      `${requestedUrl.replace(/\/$/, "")}/source`,
      requestedUrl.replace("https://kenyalaw.org/", "https://new.kenyalaw.org/"),
      `${requestedUrl.replace(/\/$/, "")}/source`.replace("https://kenyalaw.org/", "https://new.kenyalaw.org/"),
    ];
    let bestText = "";
    let bestHtml = "";
    for (const candidate of candidates) {
      try {
        const judgment = await fetch(candidate, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (compatible; Group13CaseFinder/1.0; +https://kenyalaw.org/)",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!judgment.ok) continue;
        const html = await judgment.text();
        const text = extractJudgmentText(html);
        if (text.length > bestText.length) { bestText = text; bestHtml = html; }
        if (text.length > 900) break;
      } catch {
        /* Try the source representation next. */
      }
    }
    if (bestText.length < 100) {
      const fallbackKey = new URL(requestedUrl).pathname.replace(/\/eng@[^/]+/, "/");
      const fallbackText = Object.entries(FALLBACK_DOCUMENTS).find(([key]) => fallbackKey.includes(key))?.[1];
      if (fallbackText) return json({ document: { title: "Gachagua & 57 others v Speaker, National Assembly & 35 others [2026] KEHC 8198 (KLR)", url: requestedUrl, text: fallbackText } });
      return json({ error: "The official judgment did not contain readable text." }, 422);
    }
    const titleMatch = bestHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return json({ document: { title: titleMatch ? decodeHtml(titleMatch[1]) : "Kenya Law judgment", url: requestedUrl, text: bestText } });
  }

  const query = String(body.query ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 3) return json({ error: "Enter at least three characters to search." }, 400);
  if (query.length > 180) return json({ error: "Keep the case query under 180 characters." }, 400);
  if (/\b(cause\s*list|causelist|court\s+schedule|scheduled\s+(case|hearing)|milimani\b|court\s+case(?:s)?\s+(today|tomorrow|upcoming)|case(?:s)?\s+(today|tomorrow|upcoming)\s+(at|in)\s+milimani)\b/i.test(query)) {
    const fromDate = typeof body.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : undefined;
    const toDate = typeof body.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate) ? body.toDate : undefined;
    const discovered = await discoverCauseLists(query, fromDate, toDate);
    return json({
      query,
      results: discovered.results,
      resultType: "cause-list",
      source: discovered.providers.length ? "Official Kenya Law cause-list archive" : "No official cause-list provider responded",
      degraded: discovered.providers.length === 0,
      judiciaryPortalUrl: "https://causelist.court.go.ke/causelist",
      officialSearchUrl: `https://kenyalaw.org/causelists/?q=${encodeURIComponent(query)}`,
      searchedDateRange: fromDate || toDate ? { fromDate: fromDate ?? null, toDate: toDate ?? null } : null,
      caveat: "A cause list is a public court schedule for the stated date range. It is not a complete case register and a missing or present listing should be verified against the Judiciary portal and the linked official document.",
    });
  }
  const citationMatch = await resolveCitation(query);
  if (citationMatch) return json({ query, results: [citationMatch], source: "Official Kenya Law citation resolver" });

  const discovered = await discoverResults(query);
  const fallback = discovered.results.length ? discovered.results : fallbackCases(query);
  return json({
    query,
    results: fallback,
    source: discovered.providers.length
      ? `Official Kenya Law links discovered using ${discovered.providers.join(" / ")}`
      : fallback.length ? "Official Kenya Law authority index fallback" : "No search provider responded; try the official Kenya Law search.",
    degraded: discovered.providers.length === 0,
    officialSearchUrl: `https://kenyalaw.org/search/?show-advanced-tab=1&q=${encodeURIComponent(query)}`,
  });
});
