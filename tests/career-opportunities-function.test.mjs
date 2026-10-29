import test from "node:test";
import assert from "node:assert/strict";

let handler;
globalThis.Deno = { serve: (serveHandler) => { handler = serveHandler; } };
await import("../supabase/functions/career-opportunities/index.ts");

const kenyaFeedUrl = "https://ngojobsinafrica.com/job-location/kenya/feed/";
const kenyaRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Kenya NGO Jobs</title><item><title><![CDATA[Legal Research Assistant – Nairobi]]></title><link>https://ngojobsinafrica.com/job/kenya-legal-research-assistant/</link><pubDate>Wed, 28 Oct 2026 11:40:47 +0000</pubDate><category><![CDATA[Kenya]]></category><category><![CDATA[Law]]></category><description><![CDATA[Applications are invited for a legal research role based in Nairobi, Kenya.]]></description></item></channel></rss>`;

function request() {
  return new Request("https://function.test/career-opportunities", { method: "POST" });
}

test("returns Kenya-location listings from the dedicated Kenya RSS endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(kenyaRss, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [kenyaFeedUrl]);
    assert.equal(payload.source, "NGO Jobs in Africa (Kenya location feed)");
    assert.equal(payload.source_url, kenyaFeedUrl);
    assert.equal(payload.items.length, 1);
    assert.match(payload.items[0].title, /Nairobi/);
    assert.deepEqual(payload.items[0].categories, ["Kenya", "Law"]);
    assert.match(payload.notice, /filtered by Kenya location/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("drops feed links outside the Kenya provider rather than exposing global listings", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(kenyaRss.replace("https://ngojobsinafrica.com/job/kenya-legal-research-assistant/", "https://opportunitiesfeed.com/global-listing/"), {
    status: 200,
    headers: { "Content-Type": "application/rss+xml" },
  });
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.items, []);
    assert.equal(payload.source, "NGO Jobs in Africa (Kenya location feed)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not fall back to global feeds when the Kenya-specific endpoint is blocked", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response("Forbidden", { status: 403 });
  };
  try {
    const response = await handler(request());
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(calls, [kenyaFeedUrl]);
    assert.match(payload.error, /Kenya-focused opportunities feed returned HTTP 403/);
    assert.match(payload.error, /Global listings are not used as a fallback/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
