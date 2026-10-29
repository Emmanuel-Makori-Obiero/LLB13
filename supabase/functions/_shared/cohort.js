export const LEARNER_LEVELS = new Set([
  "llb-year-1",
  "llb-year-2",
  "llb-year-3",
  "llb-year-4",
  "masters",
  "phd",
  "prefer-not-to-say",
]);

/** @param {unknown} value @returns {string | undefined} */
export function normalizeLearnerLevel(value) {
  return typeof value === "string" && LEARNER_LEVELS.has(value) ? value : undefined;
}

/**
 * Untagged materials are shared; tagged materials require an exact saved-level match.
 * A missing or invalid profile level must never expose cohort-tagged material.
 * @param {readonly string[] | null | undefined} targetYears
 * @param {string | undefined} learnerLevel
 * @returns {boolean}
 */
export function materialVisibleToLevel(targetYears, learnerLevel) {
  return !targetYears?.length || Boolean(learnerLevel && targetYears.includes(learnerLevel));
}
