// Provider endpoints and stable model IDs used by the shared AI fallback chain.
export interface Entry {
  provider: string;
  baseUrl: string;
  keyEnv: string;
  model: string;
  reasoning: "openrouter" | "effort" | "none";
  maxTokens?: number;
  noSystem?: boolean;
}

const DISABLED_PROVIDERS = new Set(["mistral", "cerebras"]);

export function combineProviderChains(
  preferred: readonly Entry[],
  fallback: readonly Entry[],
): Entry[] {
  const seen = new Set<string>();
  const result: Entry[] = [];
  for (const entry of [...preferred, ...fallback]) {
    if (DISABLED_PROVIDERS.has(entry.provider.trim().toLowerCase())) continue;
    const baseUrl = entry.baseUrl.replace(/\/+$/, "");
    const identity = `${entry.provider}\0${baseUrl}\0${entry.model}\0${entry.keyEnv}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(baseUrl === entry.baseUrl ? entry : { ...entry, baseUrl });
  }
  return result;
}

export function modelRouteCooldownMs(status: number, retryAfterSeconds = 0): number {
  // A 413 describes this request's size, not provider health. The same route
  // may succeed immediately when a later request carries less context.
  if (status === 413) return 0;
  if (status === 429) return Math.max(60_000, retryAfterSeconds * 1000);
  if (status === 401 || status === 403) return 15 * 60_000;
  if (status === 400 || status === 404) return 30 * 60_000;
  return 45_000;
}

export function isTransientProviderFailure(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || (status >= 500 && status < 600);
}

export function shouldTryAlternateApiKey(status: number, hasAnotherKey: boolean): boolean {
  if (!hasAnotherKey) return false;
  return [0, 401, 402, 403, 408, 425, 429].includes(status) || (status >= 500 && status < 600);
}

export function boundedProviderTimeoutMs(
  configured: number | undefined,
  inputChars = 0,
  feature?: string,
): number {
  const isLegalWhatIf = feature === "legal_process" || feature === "legal_explain";
  // A full-outline extraction emits thousands of JSON tokens; the generic 18s
  // large-document ceiling times out before the model can finish.
  if (feature === "course_outline") {
    const requested = Number.isFinite(configured) ? configured as number : 45_000;
    return Math.min(60_000, Math.max(30_000, requested));
  }
  const isLargeDocumentRequest = inputChars >= 8_000;
  const ceiling = isLegalWhatIf || isLargeDocumentRequest ? 18_000 : 8_000;
  const fallback = isLegalWhatIf || isLargeDocumentRequest ? 15_000 : 8_000;
  const floor = isLegalWhatIf ? 12_000 : isLargeDocumentRequest ? 15_000 : 3_000;
  const requested = Number.isFinite(configured) ? configured as number : fallback;
  return Math.min(ceiling, Math.max(floor, requested));
}

export function reasoningAttemptVariants(
  feature: string | undefined,
  reasoning: Entry["reasoning"],
  fast = false,
): boolean[] {
  if (["exam_analysis", "notes_review", "notes_research", "course_outline"].includes(feature ?? "") || reasoning === "none" || fast) return [false];
  return [true, false];
}

const isOpenRouterFreeRoute = (provider: string, model: string) =>
  provider.trim().toLowerCase() === "openrouter" && (model === "openrouter/free" || model.endsWith(":free"));

export function orderCourseOutlineRoutes(entries: readonly Entry[], preferredId?: string): Entry[] {
  const freeRoutes = entries.filter((entry) => isOpenRouterFreeRoute(entry.provider, entry.model));
  const directRoutes = entries.filter((entry) => !isOpenRouterFreeRoute(entry.provider, entry.model));
  const ordered = [...directRoutes, ...freeRoutes];
  if (!preferredId) return ordered;
  const index = ordered.findIndex((entry) => `${entry.provider}:${entry.model}:${entry.keyEnv}` === preferredId);
  return index <= 0 ? ordered : [ordered[index], ...ordered.slice(0, index), ...ordered.slice(index + 1)];
}

export function providerCallTimeoutMs(baseTimeoutMs: number, feature: string | undefined, provider: string, model: string): number {
  // Free OpenRouter routes often stall; cap them so they cannot consume the
  // Course Planner request budget before the direct-provider fallbacks run.
  if (feature === "course_outline" && isOpenRouterFreeRoute(provider, model)) return Math.min(baseTimeoutMs, 20_000);
  return baseTimeoutMs;
}

const BASE = {
  gemini: ["https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY"],
  nvidia: ["https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"],
  openrouter: ["https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"],
  groq: ["https://api.groq.com/openai/v1", "GROQ_API_KEY"],
} as const;

const e = (
  p: keyof typeof BASE,
  model: string,
  reasoning: Entry["reasoning"] = "none",
  noSystem = false,
  maxTokens?: number,
): Entry => ({ provider: p, baseUrl: BASE[p][0], keyEnv: BASE[p][1], model, reasoning, noSystem, maxTokens });

// Prefer stable/current IDs and spread early attempts across independent providers.
// The OpenRouter free router selects from models it currently marks available,
// avoiding hard-coded free slugs that quickly become stale.
export const DEFAULT_CHAIN: Entry[] = [
  e("gemini", "gemini-3.8-flash", "effort", false, 16000),
  e("groq", "openai/gpt-oss-20b", "effort", false, 8192),
  e("openrouter", "openrouter/free", "openrouter", false, 8192),
  e("groq", "openai/gpt-oss-120b", "effort", false, 12000),
  e("openrouter", "google/gemma-4-31b-it:free", "openrouter", true, 8192),
  e("gemini", "gemini-3.6-flash", "effort", false, 16000),
  e("gemini", "gemini-3.5-flash-lite", "effort", false, 10000),
  e("gemini", "gemini-3.1-flash-lite", "effort", false, 8192),
];
