import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractArticleNumbers,
  findArticleChunkIndexes,
  findArticleChunkRanges,
  isConstitutionQuestion,
} from "../supabase/functions/ai/constitution.ts";
import { isConstitutionHistoryFollowup, splitArticleNumbers } from "../src/lib/constitutionArticles.ts";

const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
const prompts = readFileSync(new URL("../supabase/functions/ai/prompts.ts", import.meta.url), "utf8");

test("Constitution retrieval recognizes named Articles and common constitutional subjects", () => {
  assert.equal(isConstitutionQuestion("What does Article 260 mean?"), true);
  assert.equal(isConstitutionQuestion("Who can remove the Deputy President?"), true);
  assert.equal(isConstitutionQuestion("How does devolution affect county government?"), true);
  assert.equal(isConstitutionQuestion("What does the right to housing require?"), true);
  assert.equal(isConstitutionQuestion("What is an offer and acceptance?"), false);
});

test("Article references parse clauses, lists, ranges, and the final Articles through 264", () => {
  assert.deepEqual(
    extractArticleNumbers("Explain Articles 2(4), 10 and 150–152, and Articles 261 to 264."),
    [2, 10, 150, 151, 152, 261, 262, 263, 264],
  );
  assert.deepEqual(extractArticleNumbers("Compare Article 150(2) and Article 260."), [150, 260]);
  assert.deepEqual(extractArticleNumbers("The Constitution has 264 articles."), []);
});

test("all 264 Articles are covered by ordered, complete batches with no 12-Article request ceiling", () => {
  const allArticles = Array.from({ length: 264 }, (_, index) => index + 1);
  const batches = splitArticleNumbers(allArticles, 12);
  assert.equal(batches.length, 22);
  assert.equal(batches.every((batch) => batch.length <= 12), true);
  assert.deepEqual(batches.flat(), allArticles);
  assert.match(client, /splitArticleNumbers\(articleNumbers, MAX_CONSTITUTION_ARTICLES_PER_BATCH\)/);
  assert.match(client, /askAISingle\(\{ \.\.\.args, messages \}, articles\)/);
  assert.match(edge, /MAX_CONSTITUTION_ARTICLES_PER_BATCH/);
  assert.match(edge, /constitutionArticles\)/);
  assert.doesNotMatch(edge, /MAX_EXPLICIT_ARTICLES_PER_REQUEST/);
});

test("implicit follow-ups can use recent Constitution history, but explicit requests are freshly retrieved", () => {
  assert.equal(isConstitutionHistoryFollowup("Can you explain that Article again?"), true);
  assert.equal(isConstitutionHistoryFollowup("What about the second one?"), true);
  assert.equal(isConstitutionHistoryFollowup("Explain Article 150 again."), false);
  assert.equal(isConstitutionHistoryFollowup("Explain every Article again."), false);
  assert.equal(isConstitutionHistoryFollowup("Repeat that exact wording."), false);
  assert.equal(isConstitutionHistoryFollowup("How does that apply to my case?"), false);
  assert.equal(isConstitutionHistoryFollowup("How can I use that in my case?"), false);
  assert.match(client, /hasRecentGroundedConstitutionAnswer/);
  assert.match(client, /isConstitutionHistoryFollowup\(articleRequest\)/);
  assert.match(client, /constitutionHistoryOnly: true/);
  assert.match(edge, /body\.constitutionHistoryOnly === true/);
  assert.match(edge, /if \(constitutionHistoryOnly\) return \[\]/);
  assert.match(edge, /const currentArticleQuery = articleQuery \?\? query/);
  assert.match(edge, /extractArticleNumbers\(currentArticleQuery\)/);
  assert.match(edge, /CONVERSATION CONTINUITY/);
});

test("exact Article lookup rejects table-of-contents dot leaders and selects the full-text heading", () => {
  const chunks = [
    { document_id: "constitution", idx: 31, content: "150. Removal of Deputy President ........................................................ 53" },
    { document_id: "constitution", idx: 182, content: "149. Vacancy in the office of Deputy President. 150. Removal of Deputy President (1) The Deputy President may be removed from office." },
    { document_id: "constitution", idx: 56, content: "260. Interpretation ........................................................................ 101" },
    { document_id: "constitution", idx: 296, content: "260. Interpretation In this Constitution, unless the context requires otherwise— adult means an individual who has attained the age of eighteen years." },
    { document_id: "constitution", idx: 57, content: "261. Consequential legislation .................................................................. 105" },
    { document_id: "constitution", idx: 302, content: "261. Consequential legislation Parliament shall enact legislation required to implement this Constitution." },
    { document_id: "constitution", idx: 10, content: "8. State and religion .............................................................. 2" },
    { document_id: "constitution", idx: 61, content: "8. State and religion There shall be no State religion." },
  ];
  const matches = findArticleChunkIndexes(chunks, [8, 150, 260, 261]);
  assert.deepEqual(matches.get(8), { document_id: "constitution", idx: 61 });
  assert.deepEqual(matches.get(150), { document_id: "constitution", idx: 182 });
  assert.deepEqual(matches.get(260), { document_id: "constitution", idx: 296 });
  assert.deepEqual(matches.get(261), { document_id: "constitution", idx: 302 });
});

test("complete Article retrieval spans continuation chunks through the next body heading", () => {
  const chunks = [
    { document_id: "constitution", idx: 0, content: "1. First ................................ 1" },
    { document_id: "constitution", idx: 1, content: "1. First Article\nFirst part of the provision." },
    { document_id: "constitution", idx: 2, content: "Continuation of the first Article." },
    { document_id: "constitution", idx: 3, content: "2. Second Article\nSecond part begins." },
    { document_id: "constitution", idx: 4, content: "Continuation of the second Article." },
    { document_id: "constitution", idx: 5, content: "3. Third Article\nFinal provision." },
  ];
  assert.deepEqual([...findArticleChunkRanges(chunks, [1, 2, 3])], [
    [1, { document_id: "constitution", start_idx: 1, end_idx: 3 }],
    [2, { document_id: "constitution", start_idx: 3, end_idx: 5 }],
    [3, { document_id: "constitution", start_idx: 5, end_idx: 5 }],
  ]);
});

test("Article 264 retrieval stops before the Constitution schedules", () => {
  const chunks = [
    { document_id: "constitution", idx: 300, content: "264. Interpretation of this Constitution\nArticle text starts." },
    { document_id: "constitution", idx: 301, content: "Continuation and final paragraph of Article 264." },
    { document_id: "constitution", idx: 302, content: "FIRST SCHEDULE\nCounty boundaries." },
  ];
  assert.deepEqual([...findArticleChunkRanges(chunks, [264])], [
    [264, { document_id: "constitution", start_idx: 300, end_idx: 301 }],
  ]);
});

test("the Edge Function reserves exact Article hits from the selected automatic batch", () => {
  assert.match(edge, /exactConstitutionRows\(db, constitutionIds, articleNumbers\)/);
  assert.match(edge, /findArticleChunkRanges\(chunks, articleNumbers\)/);
  assert.match(edge, /articleBatch \?\? extractArticleNumbers\(currentArticleQuery\)/);
  assert.match(edge, /exact\.missing\.length/);
  assert.doesNotMatch(edge, /q:\s*`article \| \$\{number\}`/);
  assert.match(edge, /Math\.max\(limits\.total, articleChunkReserve\)/);
  assert.match(edge, /not an allowlist or complete list/i);
  assert.match(prompts, /not a complete list or an allowlist/i);
  assert.match(prompts, /any relevant Article/i);
});
