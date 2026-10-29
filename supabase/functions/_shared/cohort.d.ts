export declare const LEARNER_LEVELS: Set<string>;
export declare function normalizeLearnerLevel(value: unknown): string | undefined;
export declare function materialVisibleToLevel(
  targetYears: readonly string[] | null | undefined,
  learnerLevel?: string,
): boolean;
