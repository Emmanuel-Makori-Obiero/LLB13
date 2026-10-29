import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { materialVisibleToLevel, normalizeLearnerLevel } from "../supabase/functions/_shared/cohort.js";

test("shared materials remain available, while tagged items require an exact saved level", () => {
  assert.equal(materialVisibleToLevel([], undefined), true);
  assert.equal(materialVisibleToLevel(null, "phd"), true);
  assert.equal(materialVisibleToLevel(["llb-year-2"], "llb-year-2"), true);
  assert.equal(materialVisibleToLevel(["llb-year-2"], "llb-year-1"), false);
  assert.equal(materialVisibleToLevel(["llb-year-2"], undefined), false);
  assert.equal(materialVisibleToLevel(["llb-year-2"], ""), false);
  assert.equal(materialVisibleToLevel(["llb-year-2"], "prefer-not-to-say"), false);
});

test("only declared programme levels are accepted from authenticated metadata", () => {
  for (const level of ["llb-year-1", "llb-year-2", "llb-year-3", "llb-year-4", "masters", "phd", "prefer-not-to-say"]) {
    assert.equal(normalizeLearnerLevel(level), level);
  }
  assert.equal(normalizeLearnerLevel("all"), undefined);
  assert.equal(normalizeLearnerLevel("llb-year-5"), undefined);
  assert.equal(normalizeLearnerLevel(undefined), undefined);
});

test("AI retrieval trusts authenticated metadata and fails closed for tagged documents", () => {
  const edge = readFileSync(new URL("../supabase/functions/ai/index.ts", import.meta.url), "utf8");
  assert.match(edge, /normalizeLearnerLevel\(u\.user\.user_metadata\?\.learner_level\)/);
  assert.doesNotMatch(edge, /body\.learnerLevel/);
  assert.match(edge, /async function filterRowsByLearnerLevel[\s\S]*?if \(!rows\.length\) return rows/);
  assert.match(edge, /if \(selectedIds\.length\) \{[\s\S]*?materialVisibleToLevel\(audiences\.get\(String\(doc\.id\)\), learnerLevel\)/);
});

test("unit, assignment-helper, and direct reader views apply cohort visibility", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../src/AssignmentHelperPage.tsx", import.meta.url), "utf8");
  assert.match(app, /materials=\{visibleMaterials\}[\s\S]*?assignments=\{visibleAssignments\}/);
  assert.match(helper, /source\.scope !== "library" \|\| materialVisibleToLevel\(source\.target_years, learnerLevel\)/);
  assert.match(app, /view === "reader" && activeMaterial && visibleMaterials\.some/);
  assert.match(app, /view === "reader" && activeMaterial && !visibleMaterials\.some/);
});
