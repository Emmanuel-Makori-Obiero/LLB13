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
    const candidate = url.searchParams.get("q") || url.searchParams.get("url") || url.href;
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

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON body containing a query." }, 400);
  }
  const query = String(body.query ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 3) return json({ error: "Enter at least three characters to search." }, 400);
  if (query.length > 180) return json({ error: "Keep the case query under 180 characters." }, 400);

  const googleQuery = `site:new.kenyalaw.org/akn/ke/judgment ${query}`;
  const googleUrl = new URL("https://www.google.com/search");
  googleUrl.searchParams.set("gbv", "1");
  googleUrl.searchParams.set("num", "10");
  googleUrl.searchParams.set("q", googleQuery);
  const response = await fetch(googleUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; Group13CaseFinder/1.0; +https://kenyalaw.org/)",
    },
  });
  if (!response.ok) return json({ error: "The free case search provider is temporarily unavailable." }, 502);

  const results = parseResults(await response.text());
  return json({ query, results, source: "Official Kenya Law links discovered from public web search" });
});
