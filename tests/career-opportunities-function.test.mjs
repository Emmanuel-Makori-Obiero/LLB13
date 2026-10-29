import test from "node:test";
import assert from "node:assert/strict";

let handler;
globalThis.Deno = { serve: (serveHandler) => { handler = serveHandler; } };
await import("../supabase/functions/career-opportunities/index.ts");

const primaryUrl = "https://opportunitiesfeed.com/feed/";
const backupUrl = "https://opportunitiesforyouth.org/feed/";
const primaryRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Opportunities Feed</title><item><title><![CDATA[Legal Research Internship]]></title><link>https://opportunitiesfeed.com/2026/10/legal-research-internship/</link><pubDate>Thu, 29 Oct 2026 10:58:03 +0000</pubDate><category><![CDATA[Law]]></category><description><![CDATA[Applications are open for a legal research internship.]]></description></item></channel></rss>`;
const backupRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Opportunities for Youth</title><item><title>Legal Fellowship</title><link>https://opportunitiesforyouth.org/legal-fellowship/</link><pubDate>Thu, 29 Oct 2026 10:58:03 +0000</pubDate><category>Law</category><description>A public listing.</description></item></channel></rss>`;

function request() {
  return new Request("https://function.test/career-opportunities", { method: "POST" });
}

test("returns validated items from the verified primary RSS feed", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(primaryRss, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [primaryUrl]);
    assert.equal(payload.source, "Opportunities Feed (third-party aggregator)");
    assert.equal(payload.source_url, primaryUrl);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].title, "Legal Research Internship");
    assert.deepEqual(payload.items[0].categories, ["Law"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to Opportunities for Youth when the primary RSS endpoint fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url) === primaryUrl) return new Response("Service unavailable", { status: 503 });
    return new Response(backupRss, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [primaryUrl, backupUrl]);
    assert.equal(payload.source, "Opportunities for Youth (third-party aggregator)");
    assert.equal(payload.source_url, backupUrl);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].title, "Legal Fellowship");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports both upstream statuses only when every feed fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response("Forbidden", {
    status: String(url) === primaryUrl ? 403 : 503,
  });
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.match(payload.error, /Opportunities Feed \(third-party aggregator\): HTTP 403/);
    assert.match(payload.error, /Opportunities for Youth \(third-party aggregator\): HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
