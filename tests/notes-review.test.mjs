import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeNotesReview,
  normalizeResearchPlan,
  mergeResearchPlans,
  joinReviewedNoteParts,
  notesResearchPrompt,
  notesReviewPrompt,
  extractOfficialCitation,
  safeKenyaLawUrl,
  uniqueOfficialSources,
} from "../src/lib/notesReview.ts";
import { selectTranscriptRunSource } from "../src/lib/transcriptRunSource.ts";

const backend = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../supabase/functions/ai/prompts.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/NotesReviewPage.tsx", import.meta.url), "utf8");
const transcript = readFileSync(new URL("../src/TranscriptAI.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261025085439_notes_reviews.sql", import.meta.url), "utf8");
const largeReviewMigration = readFileSync(new URL("../supabase/migrations/20261025180000_notes_review_large_documents.sql", import.meta.url), "utf8");

 test("research plan preserves only bounded legal queries and exact authority mentions", () => {
  const result = normalizeResearchPlan({
    legalIssues: ["Contract formation"],
    authorities: [{ mention: "Mumo Matemu v Trusted Society", query: "Mumo Matemu v Trusted Society" }],
    searchQueries: ["Article 10 public participation", "x"],
  });
  assert.deepEqual(result.searchQueries, ["Mumo Matemu v Trusted Society", "Article 10 public participation", "Contract formation"]);
  assert.equal(result.authorities[0].mention, "Mumo Matemu v Trusted Society");
  assert.ok(result.searchQueries.length <= 8);
});

test("official link validation accepts only HTTPS Kenya Law AKN records", () => {
  assert.equal(safeKenyaLawUrl("https://kenyalaw.org/akn/ke/act/2010/constitution"), "https://kenyalaw.org/akn/ke/act/2010/constitution");
  assert.equal(safeKenyaLawUrl("http://kenyalaw.org/akn/ke/act/2010/constitution"), null);
  assert.equal(safeKenyaLawUrl("https://example.com/akn/ke/act/2010/constitution"), null);
  assert.equal(safeKenyaLawUrl("https://kenyalaw.org/search/?q=foo"), null);
});

test("notes review rejects empty corrections and strips invented source IDs", () => {
  assert.equal(normalizeNotesReview({ corrected_notes: "short", corrections: [], authority_checks: [] }, new Set(["K1"])), null);
  const result = normalizeNotesReview({
    summary: "A few citations still need checking.",
    corrected_notes: "## Contract law\n\nThe agreement must be interpreted in context [K9].",
    corrections: [{ original: "case claim", corrected: "revised claim", reason: "The official judgment supports this", source_ids: ["K1", "K9"], verification: "supported" }],
    authority_checks: [{ authority: "Example v Example", status: "verified", source_ids: ["K9"] }],
    unresolved_questions: [],
  }, new Set(["K1"]));
  assert.ok(result);
  assert.equal(result.corrections[0].sourceIds.join(","), "K1");
  assert.equal(result.authorityChecks[0].sourceIds.length, 0);
  assert.equal(result.authorityChecks[0].status, "not_checked");
  assert.match(result.correctedNotes, /unverified source reference/);
  assert.equal(result.status, "partly_checked");
});

test("source inventory accepts readable official AKN records only", () => {
  const result = uniqueOfficialSources([
    { id: "", title: "Judgment", url: "https://kenyalaw.org/akn/ke/judgment/2020/1/eng@2020-01-01", citation: null, text: "Official judgment text" },
    { id: "", title: "Fake", url: "https://example.com/akn/ke/judgment/1", citation: null, text: "Not official" },
    { id: "", title: "Empty", url: "https://kenyalaw.org/akn/ke/judgment/2020/2", citation: null, text: " " },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "K1");
});

test("the app refuses silent source sampling and labels its accuracy limit", () => {
  assert.match(page, /Nothing was sampled/);
  assert.match(page, /No AI can guarantee 100% legal accuracy/);
  assert.match(backend, /notes_review.*notes_research/);
  assert.match(backend, /requireComplete/);
  assert.match(prompt, /A result title or model memory does not prove a holding/);
});

test("transcript-generated notes can be edited, rerun as the source, and handed into legal review", () => {
  assert.match(transcript, /Re-run using these notes as the source/);
  assert.match(transcript, /onReviewNotes\(generatedText/);
  assert.match(transcript, /sourceOverride/);
  assert.match(page, /initialText\?\.trim\(\)/);
});

test("notes rerun indexes the edited generated notes and does not read the original transcript", () => {
  const generatedNotes = "Edited notes: judicial review requires legality, rationality, and procedural fairness.";
  let originalReads = 0;
  const selected = selectTranscriptRunSource(generatedNotes, () => {
    originalReads++;
    return "Original lecture transcript that must not be used for this rerun.";
  });
  assert.deepEqual(selected, { kind: "generated_notes", text: generatedNotes });
  assert.equal(originalReads, 0);
  assert.match(transcript, /saveTextMaterial\(`\$\{title\} \(notes rerun/);
  assert.match(transcript, /selectTranscriptRunSource\(sourceOverride, getText\)/);
  assert.deepEqual(selectTranscriptRunSource(undefined, () => "Original transcript"), {
    kind: "original_transcript",
    text: "Original transcript",
  });
});

test("case citation corrections use the opened Kenya Law record citation and retain its source link", () => {
  const officialTitle = "Matemu v Trusted Society of Human Rights Alliance & 5 others (Civil Application 29 of 2014) [2014] KESC 6 (KLR) (9 December 2014) (Ruling)";
  const citation = extractOfficialCitation(officialTitle, "Neutral citation: [2014] KESC 6 (KLR).\nRepublic of Kenya.");
  assert.equal(citation, "[2014] KESC 6 (KLR)");
  const result = normalizeNotesReview({
    summary: "The case citation was corrected against the opened Supreme Court record.",
    corrected_notes: `Matemu v Trusted Society of Human Rights Alliance & 5 others ${citation} [K1] concerned Civil Application 29 of 2014.`,
    corrections: [{ original: "[2013] KESC 6", corrected: citation, category: "citation", reason: "Matches the neutral citation in the opened Kenya Law record.", source_ids: ["K1"], verification: "supported" }],
    authority_checks: [{ authority: `Matemu v Trusted Society of Human Rights Alliance & 5 others ${citation}`, status: "verified", reason: "Official Kenya Law text was opened.", source_ids: ["K1"] }],
    unresolved_questions: [],
  }, new Set(["K1"]));
  assert.ok(result);
  assert.match(result.correctedNotes, /\[2014\] KESC 6 \(KLR\) \[K1\]/);
  assert.equal(result.corrections[0].corrected, citation);
  assert.equal(result.corrections[0].verification, "supported");
  assert.deepEqual(result.corrections[0].sourceIds, ["K1"]);
  assert.match(page, /citation: extractOfficialCitation\(document\.title \|\| candidate\.title, document\.text\)/);
  assert.doesNotMatch(page, /citation: candidate\.citation/);
});

test("private history migration is owner scoped with row-level security", () => {
  assert.match(migration, /alter table public\.notes_reviews enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/g);
  assert.match(migration, /on delete cascade/i);
  assert.match(page, /\.eq\("user_id", userId\)/);
});

test("large note reviews research and correct every bounded segment", () => {
  const merged = mergeResearchPlans([
    { legalIssues: ["Judicial review"], authorities: [{ mention: "Mumo Matemu", query: "Mumo Matemu" }], searchQueries: ["judicial review Kenya"] },
    { legalIssues: ["Judicial review", "fair hearing"], authorities: [{ mention: "Mumo Matemu", query: "duplicate" }, { mention: "Article 47", query: "Article 47 Kenya" }], searchQueries: ["fair hearing Kenya"] },
  ]);
  assert.deepEqual(merged.authorities.map((item) => item.mention), ["Mumo Matemu", "Article 47"]);
  assert.match(notesResearchPrompt({ part: 6, total: 8 }), /segment 7 of 8/);
  assert.match(page, /feature: "notes_research"/);
  assert.match(page, /part,\n\s+size: REVIEW_SECTIONS_PER_PART/);
  assert.match(backend, /\["notes", "notes_research", "notes_review", "summarize"\]\.includes\(feature\)/);
  assert.doesNotMatch(page, /indexed\.chunks > 24/);
  assert.match(largeReviewMigration, /char_length\(original_text\) between 1 and 500000/i);
});

test("the review picker does not hide legacy Word files and explains DOCX support", () => {
  assert.match(page, /accept="[^"]*\.doc,\.docx/);
  assert.match(page, /older Word files exported by Group 13 can be read directly/i);
  assert.match(page, /accept="[^"]*application\/pdf[^"]*text\/markdown"[^>]*onChange/);
  assert.match(page, /accept="image\/\*"/);
  assert.doesNotMatch(page, /accept="[^"]*image\/\*[^\"]*application\/pdf/);
});

test("edited corrected notes can be re-reviewed and downloaded as DOCX or PDF", () => {
  assert.match(page, /Download DOCX/);
  assert.match(page, /Download PDF/);
  assert.match(page, /Re-review corrected notes/);
  assert.match(page, /runReview\(review\.correctedNotes, reviewTitle\)/);
  assert.match(page, /downloadReviewedNotes\("docx"\)/);
  assert.match(page, /downloadReviewedNotes\("pdf"\)/);
});

test("long notes are reviewed in order with overlap continuity and no repeated boundary text", () => {
  const overlap = "The court considered the statutory language, the parties' evidence, and the constitutional context before reaching its decision on the claim.";
  const result = joinReviewedNoteParts([`## Part one\n\n${overlap}`, `${overlap}\n\n## Part two`]);
  assert.equal(result.split("The court considered").length - 1, 1);
  assert.match(notesReviewPrompt([], { part: 1, total: 3, precedingTail: "The first segment already covered this point." }), /segment 2 of 3/);
  assert.match(notesReviewPrompt([], { part: 1, total: 3, precedingTail: "The first segment already covered this point." }), /Do not repeat material already present/);
  assert.match(page, /REVIEW_SECTIONS_PER_PART = 6/);
  assert.match(page, /for \(let part = 0; part < totalParts; part\+\+\)/);
});
