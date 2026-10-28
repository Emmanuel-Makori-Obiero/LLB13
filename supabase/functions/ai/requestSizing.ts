export type ProviderAttempt = { status?: unknown };

export function hasProviderPayloadTooLarge(error: unknown): boolean {
  const attempts = (error as { attempts?: unknown } | null)?.attempts;
  return Array.isArray(attempts) && attempts.some((attempt) =>
    String((attempt as ProviderAttempt | null)?.status ?? "") === "413"
  );
}

export function onlyAttemptedProvidersRejectedForSize(attempts: unknown): boolean {
  if (!Array.isArray(attempts)) return false;
  const notAttempted = new Set([
    "missing_key",
    "invalid_key_skipped",
    "route_skipped",
    "route_cooldown",
    "cooldown",
    "deadline",
  ]);
  const attempted = attempts
    .map((attempt) => String((attempt as ProviderAttempt | null)?.status ?? ""))
    .filter((status) => !notAttempted.has(status));
  return attempted.length > 0 && attempted.every((status) => status === "413");
}

export function shrinkRetrievedPassages<T>(passages: readonly T[]): T[] | null {
  if (passages.length < 2) return null;
  return passages.slice(0, Math.ceil(passages.length / 2));
}

export function keepRecentConversation<T>(messages: readonly T[], maximum = 4): T[] {
  const count = Math.max(0, Math.trunc(maximum));
  return count === 0 ? [] : messages.slice(-count);
}
