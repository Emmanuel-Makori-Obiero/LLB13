// Server-only quota reservation. The database function serializes reservations
// per student/content type, so concurrent Edge Function requests cannot race past a cap.
export const AI_QUOTAS = {
  text: 60,
  // Metadata extraction is a short, low-cost request and has its own allowance.
  book_metadata: 1000,
  podcast: 5,
  image: 3,
  video: 1,
} as const;

export type AiQuotaKind = keyof typeof AI_QUOTAS;
export type AiQuotaResult = {
  allowed: boolean;
  used: number;
  quota: number;
  retry_after_seconds: number;
};

export async function reserveAiQuota(
  admin: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  userId: string,
  kind: AiQuotaKind,
): Promise<AiQuotaResult> {
  const { data, error } = await admin.rpc("reserve_ai_quota", {
    p_user_id: userId,
    p_kind: kind,
    p_limit: AI_QUOTAS[kind],
    p_window_seconds: 3600,
  });
  if (error) throw new Error(`AI quota service is unavailable: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Partial<AiQuotaResult> | null;
  if (!row || typeof row.allowed !== "boolean") throw new Error("AI quota service returned an invalid response.");
  return {
    allowed: row.allowed,
    used: Number(row.used ?? 0),
    quota: Number(row.quota ?? AI_QUOTAS[kind]),
    retry_after_seconds: Number(row.retry_after_seconds ?? 0),
  };
}
