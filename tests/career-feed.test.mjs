import test from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_FEED_CACHE_KEY,
  careerFeedErrorMessage,
  normalizeCareerFeed,
  readCareerFeedCache,
  writeCareerFeedCache,
} from "../src/lib/careerFeed.ts";

const goodItem = {
  title: "Law internship",
  url: "https://opportunitiesforyouth.org/law-internship/",
  description: "A public listing",
  published_at: "2026-10-01T12:00:00.000Z",
  categories: ["law"],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    values,
  };
}

test("accepts the current provider and the explicitly approved fallback host", () => {
  assert.equal(normalizeCareerFeed({ items: [goodItem] })?.items?.length, 1);
  const fallback = { ...goodItem, url: "https://opportunitiesfeed.com/2026/10/29/legal-internship/" };
  assert.equal(normalizeCareerFeed({ items: [fallback] })?.items?.length, 1);
});

test("rejects unsafe and lookalike listing URLs", () => {
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "javascript:alert(1)" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://example.com/fake" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://opportunitiesfeed.com.evil.example/fake" }] }), null);
});

test("stores and restores a validated last-successful feed", () => {
  const storage = memoryStorage();
  const feed = { source: "Public feed", updated_at: "2026-10-21T10:00:00.000Z", items: [goodItem], notice: "Check the source." };
  writeCareerFeedCache(feed, storage);
  assert.ok(storage.values.has(CAREER_FEED_CACHE_KEY));
  assert.deepEqual(readCareerFeedCache(storage), feed);
  storage.setItem(CAREER_FEED_CACHE_KEY, JSON.stringify({ items: [{ ...goodItem, url: "https://example.com" }] }));
  assert.equal(readCareerFeedCache(storage), null);
});

test("extracts the server's provider failure details from Supabase's generic non-2xx error", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = new Response(JSON.stringify({ error: "All public opportunities feeds failed (Opportunities Feed: HTTP 503; Opportunities for Youth: HTTP 403). Try refreshing later." }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
  const message = await careerFeedErrorMessage(error);
  assert.match(message, /Opportunities Feed: HTTP 503/);
  assert.match(message, /Opportunities for Youth: HTTP 403/);
});

test("reports a useful status when the Edge Function returns non-JSON", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = new Response("gateway failure", { status: 502 });
  assert.match(await careerFeedErrorMessage(error), /HTTP 502/);
});
