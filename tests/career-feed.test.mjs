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
  title: "Kenya legal internship",
  url: "https://ngojobsinafrica.com/job/kenya-legal-internship/",
  description: "A Kenya-location listing",
  published_at: "2026-10-28T12:00:00.000Z",
  categories: ["Kenya", "Law"],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    values,
  };
}

test("accepts only listings hosted by the Kenya-filtered provider", () => {
  assert.equal(normalizeCareerFeed({ items: [goodItem] })?.items?.length, 1);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://www.ngojobsinafrica.com/job/kenya-role/" }] })?.items?.length, 1);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://opportunitiesfeed.com/global-role/" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://opportunitiesforyouth.org/global-role/" }] }), null);
});

test("rejects unsafe and lookalike listing URLs", () => {
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "javascript:alert(1)" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://example.com/fake" }] }), null);
  assert.equal(normalizeCareerFeed({ items: [{ ...goodItem, url: "https://ngojobsinafrica.com.evil.example/fake" }] }), null);
});

test("stores and restores a validated Kenya-only feed using its own cache key", () => {
  const storage = memoryStorage();
  const feed = { source: "Kenya feed", updated_at: "2026-10-28T10:00:00.000Z", items: [goodItem], notice: "Check the source." };
  writeCareerFeedCache(feed, storage);
  assert.ok(storage.values.has(CAREER_FEED_CACHE_KEY));
  assert.deepEqual(readCareerFeedCache(storage), feed);
  storage.setItem(CAREER_FEED_CACHE_KEY, JSON.stringify({ items: [{ ...goodItem, url: "https://opportunitiesfeed.com/global-role/" }] }));
  assert.equal(readCareerFeedCache(storage), null);
});

test("extracts the Kenya-feed error from Supabase's generic non-2xx error", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  const serverMessage = "The Kenya-focused opportunities feed returned HTTP 403. Global listings are not used as a fallback.";
  error.context = new Response(JSON.stringify({ error: serverMessage }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(await careerFeedErrorMessage(error), serverMessage);
});

test("reports a useful status when the Edge Function returns non-JSON", async () => {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = new Response("gateway failure", { status: 502 });
  assert.match(await careerFeedErrorMessage(error), /HTTP 502/);
});
