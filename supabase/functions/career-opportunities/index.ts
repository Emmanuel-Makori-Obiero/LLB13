const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const KENYA_FEED_URL = "https://ngojobsinafrica.com/job-location/kenya/feed/";
const ALLOWED_LISTING_HOSTS = ["ngojobsinafrica.com", "www.ngojobsinafrica.com"];
const SOURCE_NAME = "NGO Jobs in Africa (Kenya location feed)";
const SOURCE_NOTICE = "This RSS feed is filtered by Kenya location and focuses on NGO and development-sector jobs. Verify each listing’s eligibility, closing date, and application route on the original posting. For Kenyan legal, public-service, and human-rights opportunities, also check the official boards above.";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function field(xml: string, tag: string) {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function plainText(value: string) {
  return decodeXml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseKenyaItems(xml: string) {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? xml;
  const blocks = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 40);
  const seen = new Set<string>();
  return blocks.flatMap((match) => {
    const item = match[1];
    const title = plainText(field(item, "title")).slice(0, 240);
    const rawUrl = field(item, "link");
    const date = field(item, "pubDate");
    const summary = plainText(field(item, "description") || field(item, "content:encoded")).slice(0, 900);
    const categories = [...item.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((category) => plainText(decodeXml(category[1])).slice(0, 80))
      .filter(Boolean)
      .slice(0, 12);
    let url = "";
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:" && ALLOWED_LISTING_HOSTS.includes(parsed.hostname)) url = parsed.toString();
    } catch { /* Ignore malformed or non-HTTPS feed links. */ }
    if (!title || !url || seen.has(url)) return [];
    seen.add(url);
    const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    return [{ title, url, description: summary, published_at: publishedAt, categories }];
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET" && request.method !== "POST") return response({ error: "Use GET or POST." }, 405);

  try {
    const feed = await fetch(KENYA_FEED_URL, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        "User-Agent": "Mozilla/5.0 (compatible; LLB13-Career-Desk/1.2; +https://llb-13.vercel.app/)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!feed.ok) {
      return response({ error: `The Kenya-focused opportunities feed returned HTTP ${feed.status}. Global listings are not used as a fallback. Please try again later or use the Kenyan opportunity boards on this page.` }, 502);
    }
    const contentLength = Number(feed.headers.get("content-length") ?? 0);
    if (contentLength > 1_500_000) return response({ error: "The Kenya opportunities feed was larger than expected." }, 502);
    const xml = await feed.text();
    if (xml.length > 1_500_000) return response({ error: "The Kenya opportunities feed was larger than expected." }, 502);

    const items = parseKenyaItems(xml);
    return response({
      source: SOURCE_NAME,
      source_url: KENYA_FEED_URL,
      updated_at: new Date().toISOString(),
      items,
      notice: SOURCE_NOTICE,
    });
  } catch {
    return response({ error: "Could not refresh the Kenya-focused opportunities feed. Global listings are not used as a fallback; please try again later or check the Kenyan opportunity boards on this page." }, 502);
  }
});
