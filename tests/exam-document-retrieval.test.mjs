import test from "node:test";
import assert from "node:assert/strict";
import { selectDocumentChunkIndexes } from "../supabase/functions/ai/retrieval.ts";

const range = (size) => Array.from({ length: size }, (_, index) => index);

test("a 10,000-character paper within the section cap includes every indexed chunk in order", () => {
  const paper = "question text ".repeat(715).slice(0, 10_000);
  const indexedChunks = Array.from({ length: 9 }, (_, index) => `${index}:${paper.slice(index * 1_200, (index + 1) * 1_200)}`);
  const selected = selectDocumentChunkIndexes(indexedChunks.length, 24, true);
  assert.deepEqual(selected, range(indexedChunks.length));
  assert.equal(selected.map((index) => indexedChunks[index]).join(""), indexedChunks.join(""));
  assert.ok(selected.map((index) => indexedChunks[index]).join("").includes("8:"));
});

test("complete exam analysis rejects documents over the cap rather than silently sampling", () => {
  assert.throws(
    () => selectDocumentChunkIndexes(25, 24, true),
    (error) => error.status === 413 && /split the paper/i.test(error.message) && /No sections were silently omitted/i.test(error.message),
  );
});

test("sampling remains bounded and includes both ends for non-exam document-wide tasks", () => {
  const selected = selectDocumentChunkIndexes(100, 24);
  assert.equal(selected.length, 24);
  assert.equal(selected[0], 0);
  assert.equal(selected.at(-1), 99);
  assert.equal(new Set(selected).size, 24);
});

test("complete analysis rejects a nonempty paper when configured capacity is zero", () => {
  assert.throws(() => selectDocumentChunkIndexes(1, 0, true), (error) => error.status === 413);
});
