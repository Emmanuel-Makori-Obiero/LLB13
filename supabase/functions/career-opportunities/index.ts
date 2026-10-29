const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FEED_SOURCES = [
  {
    url: "https://opportunitiesfeed.com/feed/",
    name: "Opportunities Feed (third-party aggregator)",
    hosts: ["opportunitiesfeed.com", "www.opportunitiesfeed.com"],
  },
  {
    url: "https://opportunitiesforyouth.org/feed/",
    name: "Opportunities for Youth (third-party aggregator)",
    hosts: ["opportunitiesforyouth.org", "www.opportunitiesforyouth.org"],
  },
];

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

function parseItems(xml: string, allowedHosts: string[]) {
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
      if (parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname)) url = parsed.toString();
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

  const failures: string[] = [];
  for (const source of FEED_SOURCES) {
    try {
      const feed = await fetch(source.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
          "User-Agent": "Mozilla/5.0 (compatible; LLB13-Career-Desk/1.1; +https://llb-13.vercel.app/)",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!feed.ok) {
        failures.push(`${source.name}: HTTP ${feed.status}`);
        continue;
      }
      const contentLength = Number(feed.headers.get("content-length") ?? 0);
      if (contentLength > 1_500_000) {
        failures.push(`${source.name}: feed was larger than expected`);
        continue;
      }
      const xml = await feed.text();
      if (xml.length > 1_500_000) {
        failures.push(`${source.name}: feed was larger than expected`);
        continue;
      }
      const items = parseItems(xml, source.hosts);
      if (!items.length) {
        failures.push(`${source.name}: feed contained no valid listings`);
        continue;
      }
      return response({
        source: source.name,
        source_url: source.url,
        updated_at: new Date().toISOString(),
        items,
        notice: "Listings come from third-party aggregators and may be global or expired. Confirm location, eligibility, fees and deadlines on the original listing, and apply through the linked employer or organiser.",
      });
    } catch (error) {
      failures.push(`${source.name}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  return response({ error: `All public opportunities feeds failed (${failures.join("; ")}). Try refreshing later.` }, 502);
});
