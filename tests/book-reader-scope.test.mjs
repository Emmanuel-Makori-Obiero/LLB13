import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookReaderSystemPrompt, hasBookReaderPassage, isBookReaderFeature } from "../supabase/functions/ai/bookReaderPrompts.ts";
import { shouldAutoRetrieveConstitution } from "../supabase/functions/ai/retrieval.ts";

const reader = readFileSync(new URL("../src/BookReader.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
const readerStyles = readFileSync(new URL("../src/book-reader.css", import.meta.url), "utf8");

test("Book Review uses a dedicated prompt that explains non-law books instead of refusing them", () => {
  assert.equal(isBookReaderFeature("book_explain"), true);
  assert.equal(isBookReaderFeature("book_chat"), true);
  assert.equal(isBookReaderFeature("explain"), false);
  const prompt = bookReaderSystemPrompt("book_explain", "Explain the passage in plain language.");
  assert.match(prompt, /any subject, not only law/i);
  assert.match(prompt, /Never refuse or redirect merely because the book is not about law/i);
  assert.match(prompt, /supplied passage as the evidence/i);
  assert.match(prompt, /TASK: Explain the passage in plain language\./);
  assert.doesNotMatch(prompt, /Politely decline anything unrelated/i);
});

test("Book Review requires and grounds the request in its pasted or selected passage", () => {
  assert.equal(hasBookReaderPassage("book_explain", "Book: Grit\nPassage to work from:\n“Grit is passion and perseverance.”"), true);
  assert.equal(hasBookReaderPassage("book_explain", "Book: Grit\nPassage to work from:\n“”"), false);
  assert.equal(hasBookReaderPassage("book_chat", "Book: Grit\nPassage:\n“Grit is passion and perseverance.”\nConversation so far:\nstudent: explain"), true);
  assert.equal(hasBookReaderPassage("book_chat", "Book: Grit\nConversation so far:\nstudent: explain"), false);
});

test("book-reader AI calls cannot import unrelated library or Constitution chunks", () => {
  assert.equal(shouldAutoRetrieveConstitution("book_explain", true), false);
  assert.equal(shouldAutoRetrieveConstitution("book_chat", true), false);
  assert.equal(shouldAutoRetrieveConstitution("explain", true), true);
  assert.match(server, /const docIds = isBookReaderFeature\(feature\) \? undefined/);
  assert.match(server, /grounded: requestSources\.length > 0 \|\| bookReaderPassageProvided/);
});

test("the Grit Book Review explanation and follow-up use the dedicated general-mode features", () => {
  assert.match(client, /\| "book_explain"/);
  assert.match(client, /\| "book_chat"/);
  assert.match(reader, /feature: "book_explain"/);
  assert.match(reader, /feature: "book_chat"/);
  assert.match(reader, /mode: "general"/);
  assert.match(readerStyles, /@media \(max-width: 820px\)/);
});
