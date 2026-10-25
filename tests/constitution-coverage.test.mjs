import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractArticleNumbers,
  findArticleChunkIndexes,
  isConstitutionQuestion,
} from "../supabase/functions/ai/constitution.ts";

const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
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

test("the Edge Function reserves exact Article hits and never silently limits the lookup to eight numbers", () => {
  assert.match(edge, /exactConstitutionRows\(db, constitutionIds, articleNumbers\)/);
  assert.match(edge, /MAX_EXPLICIT_ARTICLES_PER_REQUEST = 12/);
  assert.match(edge, /exact\.missing\.length/);
  assert.doesNotMatch(edge, /q:\s*`article \| \$\{number\}`/);
  assert.match(edge, /Math\.max\(limits\.total, articleChunkReserve\)/);
  assert.match(edge, /not an allowlist or complete list/i);
  assert.match(prompts, /not a complete list or an allowlist/i);
  assert.match(prompts, /any relevant Article/i);
});
