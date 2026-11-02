import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261102222700_book_review_fingerprint_sha256_index.sql", import.meta.url),
  "utf8",
);

test("book-review duplicate protection uses a compact SHA-256 index key", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS book_reviews_book_fingerprint_sha256_idx[\s\S]*?ON public\.book_reviews\s*\(\s*book_key,\s*\(extensions\.digest\(content_fingerprint,\s*'sha256'\)\)\s*\)/i,
  );
  assert.match(migration, /DROP INDEX IF EXISTS public\.book_reviews_book_fingerprint_idx/i);
  assert.doesNotMatch(migration, /ON public\.book_reviews\s*\(\s*book_key,\s*content_fingerprint\s*\)/i);
});
