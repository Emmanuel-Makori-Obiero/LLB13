export function shouldRetryAiRequest(
  status: number,
  payload?: { attempts?: unknown; retry_after_seconds?: unknown } | null,
): boolean {
  if (![429, 502, 503, 504].includes(status)) return false;
  if (Array.isArray(payload?.attempts)) return false;
  if (Number(payload?.retry_after_seconds) > 0) return false;
  return true;
}
