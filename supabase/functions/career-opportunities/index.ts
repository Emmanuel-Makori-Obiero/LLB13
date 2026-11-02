const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type FeedSource = {
  name: string;
  url: string;
  hosts: string[];
};

const FEED_SOURCES: FeedSource[] = [
  {
    name: "NGO Jobs in Africa — Kenya",
    url: "https://ngojobsinafrica.com/job-location/kenya/feed/",
    hosts: ["ngojobsinafrica.com", "www.ngojobsinafrica.com"],
  },
  {
    name: "Career Point Kenya",
    url: "https://www.careerpointkenya.co.ke/feed/",
    hosts: ["careerpointkenya.co.ke", "www.careerpointkenya.co.ke"],
  },
];

const SOURCE_NOTICE = "Listings are collected from verified public Kenya-focused feeds and remain linked to their original websites. Verify each listing’s eligibility, closing date, and application route on the original posting. For additional Kenyan opportunities, use the public opportunity boards shown below.";

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

function parseItems(xml: string, source: FeedSource) {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? xml;
  const blocks = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 100);
  const seen = new Set<string>();
  return blocks.flatMap((match) => {
    const item = match[1];
    const title = plainText(field(item, "title")).slice(0, 240);
    const rawUrl = field(item, "link") || field(item, "guid");
    const date = field(item, "pubDate") || field(item, "dc:date") || field(item, "published");
    const summary = plainText(field(item, "description") || field(item, "content:encoded") || field(item, "summary")).slice(0, 900);
    const details = plainText(field(item, "content:encoded") || field(item, "description") || field(item, "summary")).slice(0, 12000);
    const categories = [...item.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((category) => plainText(decodeXml(category[1])).slice(0, 80))
      .filter(Boolean)
      .slice(0, 12);
    let url = "";
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:" && source.hosts.includes(parsed.hostname)) url = parsed.toString();
    } catch { /* Ignore malformed or non-HTTPS feed links. */ }
    if (!title || !url || seen.has(url)) return [];
    seen.add(url);
    const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    return [{ title, url, description: summary, details, published_at: publishedAt, categories: [...categories, source.name] }];
  });
}

async function fetchSource(source: FeedSource) {
  const feed = await fetch(source.url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      "User-Agent": "Mozilla/5.0 (compatible; LLB13-Career-Desk/1.3; +https://llb-13.vercel.app/)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!feed.ok) throw new Error(`${source.name} returned HTTP ${feed.status}`);
  const contentLength = Number(feed.headers.get("content-length") ?? 0);
  if (contentLength > 1_500_000) throw new Error(`${source.name} feed was larger than expected`);
  const xml = await feed.text();
  if (xml.length > 1_500_000) throw new Error(`${source.name} feed was larger than expected`);
  return parseItems(xml, source);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET" && request.method !== "POST") return response({ error: "Use GET or POST." }, 405);

  try {
    const results = await Promise.allSettled(FEED_SOURCES.map(fetchSource));
    const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const successfulSources = results
      .map((result, index) => result.status === "fulfilled" ? FEED_SOURCES[index].name : null)
      .filter((name): name is string => Boolean(name));
    const failedSources = results
      .map((result, index) => result.status === "rejected" ? FEED_SOURCES[index].name : null)
      .filter((name): name is string => Boolean(name));

    if (!items.length) {
      return response({ error: "Could not refresh any Kenya-focused opportunity feed. Please try again later or check the Kenyan opportunity boards on this page." }, 502);
    }

    const uniqueItems = [...new Map(items.map((item) => [item.url, item])).values()]
      .sort((a, b) => (Date.parse(b.published_at ?? "") || 0) - (Date.parse(a.published_at ?? "") || 0))
      .slice(0, 200);
    const sourceSummary = successfulSources.join(" + ");
    const failureNote = failedSources.length ? ` Temporarily unavailable: ${failedSources.join(", ")}.` : "";

    return response({
      source: `Kenya opportunity feeds: ${sourceSummary}`,
      source_url: FEED_SOURCES[0].url,
      updated_at: new Date().toISOString(),
      items: uniqueItems,
      notice: `${SOURCE_NOTICE}${failureNote}`,
    });
  } catch {
    return response({ error: "Could not refresh any Kenya-focused opportunity feed. Please try again later or check the Kenyan opportunity boards on this page." }, 502);
  }
});
