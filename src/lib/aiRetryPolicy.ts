export const MAX_AUTO_COOLDOWN_SECONDS = 20;

export function shouldRetryAiRequest(
  status: number,
  payload?: { attempts?: unknown; retry_after_seconds?: unknown } | null,
): boolean {
  if (![429, 502, 503, 504].includes(status)) return false;
  if (Array.isArray(payload?.attempts)) return false;
  if (Number(payload?.retry_after_seconds) > 0) return false;
  return true;
}

// For a full provider-chain failure that carries a short cooldown (e.g. ~13s),
// wait it out once and replay, instead of surfacing the error immediately.
export function cooldownRetryDelayMs(
  status: number,
  payload?: { retry_after_seconds?: unknown } | null,
): number {
  if (![429, 503].includes(status)) return 0;
  const seconds = Number(payload?.retry_after_seconds);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_AUTO_COOLDOWN_SECONDS) return 0;
  return Math.ceil(seconds * 1000) + 500;
}
