import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { officialLawUrl, parseResults } from "../supabase/functions/kenya-law-search/sources.ts";

const worker = readFileSync(new URL("../supabase/functions/kenya-law-search/index.ts", import.meta.url), "utf8");

test("case search accepts any official Kenya Law judgment link, including relative links", () => {
  const html = `
    <a href="/akn/ke/judgment/kehc/2024/13655/eng@2024-10-25">Example Constitutional Petition E001 of 2024 [2024] KEHC 13655 (KLR)</a>
    <a href="https://kenyalaw.org/akn/ke/judgment/kesc/2023/12/eng">Another Party v Republic [2023] KESC 12</a>
    <a href="https://new.kenyalaw.org/akn/ke/act/2010/constitution">Constitution of Kenya</a>
    <a href="https://notkenyalaw.org/akn/ke/judgment/kehc/2024/1/eng">Untrusted result</a>`;
  const results = parseResults(html);
  assert.equal(results.length, 2);
  assert.match(results[0].url, /^https:\/\/new\.kenyalaw\.org\/akn\/ke\/judgment\//);
  assert.match(results[1].url, /^https:\/\/kenyalaw\.org\/akn\/ke\/judgment\//);
  assert.equal(officialLawUrl("https://new.kenyalaw.org/akn/ke/act/2010/constitution"), null);
});

test("no-result and unreadable-source paths never substitute a hardcoded case or summary", () => {
  assert.doesNotMatch(worker, /FALLBACK_CASES|FALLBACK_DOCUMENTS|fallbackCases|fallbackText|citationUrlCandidates|resolveCitation/);
  assert.match(worker, /results:\s*discovered\.results/);
  assert.match(worker, /bestText\.length < 100[\s\S]*?422/);
  assert.match(worker, /nature=Judgment/);
});
