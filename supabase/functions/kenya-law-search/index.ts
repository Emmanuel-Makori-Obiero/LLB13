import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeHtml, officialLawUrl, parseResults, type CaseResult } from "./sources.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type CauseListResult = {
  title: string;
  url: string;
  court: string;
  dateRange: string | null;
  source: "Kenya Law cause-list archive";
};

function parseCauseLists(html: string, query: string): CauseListResult[] {
  const results: CauseListResult[] = [];
  const seen = new Set<string>();
  const terms = query.toLowerCase().split(/\s+/).filter((term) =>
    term.length >= 4 && !["find", "search", "look", "list", "case", "cases", "court", "courts", "cause", "causelists", "listings", "any", "there", "is", "today", "tomorrow", "upcoming", "nairobi", "milimani", "where", "what", "have", "this", "week"].includes(term)
  );
  const anchorPattern = /<a[^>]+href=["'](\/akn\/ke\/doc\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const title = decodeHtml(match[2]);
    if (!/cause\s*list|causelist/i.test(title)) continue;
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
  const courtRoutes = normalized.includes("court of appeal") ? ["KECA"]
    : normalized.includes("employment") || normalized.includes("labour") ? ["KEELRC"]
      : normalized.includes("environment and land") ? ["KEELC"]
        : highCourt && !magistrate ? ["KEHC"]
          : magistrate && !highCourt ? ["KEMC"] : ["KEHC", "KEMC"];
  const routes = ["https://kenyalaw.org/causelists/", ...courtRoutes.map((code) => `https://kenyalaw.org/causelists/${code}/` )];
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

async function discoverResults(query: string): Promise<{ results: CaseResult[]; providers: string[] }> {
  const queryVariants = [
    `site:new.kenyalaw.org/akn/ke/judgment ${query}`,
    `site:kenyalaw.org/akn/ke/judgment ${query}`,
    `${query} Kenya Law judgment`,
  ];
  const sources = queryVariants.flatMap((variant, index) => [
    { name: index === 0 ? "Google" : "Google related", url: `https://www.google.com/search?gbv=1&num=10&q=${encodeURIComponent(variant)}` },
    { name: index === 0 ? "Bing" : "Bing related", url: `https://www.bing.com/search?count=10&q=${encodeURIComponent(variant)}` },
  ]);
  sources.push({ name: "Kenya Law", url: `https://new.kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment&q=${encodeURIComponent(query)}` });
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
  if (body.url && !requestedUrl) return json({ error: "Only official Kenya Law judgment links can be opened." }, 400);
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
      return json({ error: "The official judgment could not be read by the preview. Open the official link directly or choose another result; no substitute case summary was used." }, 422);
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
  const discovered = await discoverResults(query);
  return json({
    query,
    results: discovered.results,
    source: discovered.results.length
      ? `Official Kenya Law judgment links discovered using ${discovered.providers.join(" / ")}`
      : discovered.providers.length
        ? "Search providers responded, but no verified official judgment link was found."
        : "No public search provider responded; try the official Kenya Law advanced search.",
    degraded: discovered.providers.length === 0,
    officialSearchUrl: `https://new.kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment&q=${encodeURIComponent(query)}`,
  });
});
