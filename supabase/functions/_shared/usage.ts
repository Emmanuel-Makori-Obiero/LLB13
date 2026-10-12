export type ProviderUsage = {
  userId: string;
  category: "text" | "book_metadata" | "podcast" | "image" | "video" | "transcription" | "live_voice" | "search" | "other";
  provider: string;
  model?: string | null;
  status?: "success" | "failure" | "quota_denied";
  requestUnits?: number;
  inputUnits?: number;
  outputUnits?: number;
  unitLabel?: string;
  details?: Record<string, unknown>;
};

/** Best-effort audit logging: a provider outage must never break a successful request. */
export async function recordProviderUsage(
  admin: { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } },
  usage: ProviderUsage,
) {
  const { error } = await admin.from("ai_provider_usage").insert({
    user_id: usage.userId,
    category: usage.category,
    provider: usage.provider,
    model: usage.model ?? null,
    status: usage.status ?? "success",
    request_units: Math.max(0, Math.round(usage.requestUnits ?? 1)),
    input_units: Math.max(0, Math.round(usage.inputUnits ?? 0)),
    output_units: Math.max(0, Math.round(usage.outputUnits ?? 0)),
    unit_label: usage.unitLabel ?? "requests",
    details: usage.details ?? {},
  });
  if (error) console.error("Could not record provider usage", error.message);
}
