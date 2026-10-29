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

test("accepts a valid feed and rejects unsafe listing URLs", () => {
  assert.equal(normalizeCareerFeed({ items: [goodItem] })?.items?.length, 1);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "javascript:alert(1)" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://example.com/fake" }] }), null);
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

test("extracts the server's JSON message from Supabase's generic non-2xx error", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = new Response(JSON.stringify({ error: "The public opportunities feed returned HTTP 503. Try refreshing later." }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(await careerFeedErrorMessage(error), "The public opportunities feed returned HTTP 503. Try refreshing later.");
});

test("reports a useful status when the Edge Function returns non-JSON", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = new Response("gateway failure", { status: 502 });
  assert.match(await careerFeedErrorMessage(error), /HTTP 502/);
});
