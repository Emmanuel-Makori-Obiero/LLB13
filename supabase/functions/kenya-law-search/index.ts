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

  const discovered = await discoverResults(query);
  return json({
    query,
    results: discovered.results,
    source: discovered.providers.length
      ? `Official Kenya Law links discovered using ${discovered.providers.join(" / ")}`
      : "No search provider responded; try the official Kenya Law collections below.",
    degraded: discovered.providers.length === 0,
  });
});
