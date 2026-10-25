import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { bookSummaryPartPrompt, bookSummarySynthesisPrompt, extractBookPartRecap, mergeBookSummaryParts, planBookSummary } from "../src/lib/bookSummary.ts";

const result = (answer, sourceTag = "S1") => ({
  answer,
  data: null,
  basis: "materials",
  grounded: true,
  warnings: [],
  sources: [{ tag: sourceTag, title: "The Grit", author: null, ref: "library://grit" }],
  provider: "test",
  model: "test-model",
});

test("book planning covers each readable section once, in order, with no silent sampling", () => {
  for (const count of [1, 10, 11, 30, 40, 301, 500, 625, 1000]) {
    const plan = planBookSummary(count);
    assert.equal(plan[0].startSection, 1);
    assert.equal(plan.at(-1).endSection, count);
    assert.deepEqual(plan.map((part) => part.part), Array.from({ length: plan.length }, (_, i) => i));
    for (let index = 1; index < plan.length; index += 1) {
      assert.equal(plan[index].startSection, plan[index - 1].endSection + 1);
    }
    assert.ok(plan.every((part) => part.size <= 10));
  }
});

test("zero and over-limit sources fail explicitly rather than returning sampled summaries", () => {
  assert.throws(() => planBookSummary(0), /no readable indexed sections/i);
  assert.throws(() => planBookSummary(1001), /Nothing was sampled/i);
});

test("part prompts preserve the main points in order and request a concise source-only recap", () => {
  const part = planBookSummary(21)[1];
  const prompt = bookSummaryPartPrompt("Focus on the character arcs", part);
  assert.match(prompt, /indexed sections 11–20/);
  assert.match(prompt, /compress repetition, not main points/i);
  assert.match(prompt, /do not claim that the whole book was covered/i);
  assert.match(prompt, /Part recap/);
  assert.match(prompt, /character arcs/);
});

test("whole-book merge preserves every part in order and deduplicates source tags", () => {
  const plan = planBookSummary(21);
  const completed = plan.map((part) => ({ plan: part, result: result(`> Part recap: Part ${part.part + 1} follows the source.\n\nPoint [S1].`) }));
  const overview = result("## Overview\nAll recaps considered.");
  const merged = mergeBookSummaryParts("The Grit", 21, completed, overview);
  assert.equal(merged.grounded, true);
  assert.match(merged.answer, /processed all 21 readable indexed sections/);
  assert.ok(merged.answer.indexOf("Part 1 · indexed sections 1–10") < merged.answer.indexOf("Part 2 · indexed sections 11–20"));
  assert.ok(merged.answer.indexOf("Part 2 · indexed sections 11–20") < merged.answer.indexOf("Part 3 · indexed sections 21–21"));
  assert.equal((merged.answer.match(/\[S1\]/g) ?? []).length, 3);
  assert.equal(merged.sources.length, 1);
});

test("partial coverage is labeled and an optional overview failure does not erase complete notes", () => {
  const [first, second] = planBookSummary(20);
  const partial = mergeBookSummaryParts("Book", 20, [{ plan: first, result: result("Part one.") }], null, "part two unavailable");
  assert.equal(partial.grounded, false);
  assert.match(partial.answer, /Incomplete coverage/);
  assert.match(partial.answer, /1–10 of 20/);
  const completeNotes = mergeBookSummaryParts("Book", 20, [first, second].map((plan) => ({ plan, result: result("Notes.") })), null, undefined, "overview service unavailable");
  assert.match(completeNotes.answer, /processed all 20 readable indexed sections/);
  assert.ok(completeNotes.warnings.some((warning) => /overview could not be generated/i.test(warning)));
});

test("recaps and the whole-book overview use ordered source-grounded text", () => {
  const plan = planBookSummary(1)[0];
  const text = "> Part recap: The narrator leaves home and faces a difficult choice.\n\n## Main points\nDetails.";
  assert.match(extractBookPartRecap(text), /narrator leaves home/);
  const prompt = bookSummarySynthesisPrompt("Novel", "Focus on conflict", [{ plan, recap: extractBookPartRecap(text) }]);
  assert.match(prompt, /only the ordered part recaps/i);
  assert.match(prompt, /Focus on conflict/);
  assert.match(prompt, /do not add outside knowledge/i);
});

test("production routes batch all book sections and expose both document downloads", () => {
  const page = fs.readFileSync(new URL("../src/StudyAssistant.tsx", import.meta.url), "utf8");
  const library = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/lib/ai.ts", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  assert.match(page, /countMaterialChunks\(selected\[0\]\)/);
  assert.match(page, /for \(const part of plan\)/);
  assert.match(page, /part: part\.part/);
  assert.match(page, /Download DOCX/);
  assert.match(page, /Download PDF/);
  assert.match(api, /countMaterialChunks/);
  assert.match(server, /Complete book summaries require one selected readable book and an exact section batch/);
  assert.match(server, /\["notes", "notes_research", "notes_review", "summarize"\]/);
  assert.match(library, /getLibraryMaterialDocumentId\(material\.id\)/);
  assert.match(library, /supabase\.storage\.from\("materials"\)\.download\(material\.storage_path\)/);
  assert.match(library, /if \(!documentId \|\| totalSections === 0\)[\s\S]*?const indexed = await uploadLibraryMaterial\([\s\S]*?material\.id/);
  assert.match(library, /onClick=\{\(\) => void summarizeLibraryMaterial\(material\)\}/);
  assert.match(library, /Download DOCX/);
  assert.match(library, /Download PDF/);
});
