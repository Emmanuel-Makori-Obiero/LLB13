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

export function combineProviderChains(
  preferred: readonly Entry[],
  fallback: readonly Entry[],
): Entry[] {
  const seen = new Set<string>();
  const result: Entry[] = [];
  for (const entry of [...preferred, ...fallback]) {
    const baseUrl = entry.baseUrl.replace(/\/+$/, "");
    const identity = `${entry.provider}\0${baseUrl}\0${entry.model}\0${entry.keyEnv}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(baseUrl === entry.baseUrl ? entry : { ...entry, baseUrl });
  }
  return result;
}

export function modelRouteCooldownMs(status: number, retryAfterSeconds = 0): number {
  if (status === 429) return Math.max(60_000, retryAfterSeconds * 1000);
  if (status === 401 || status === 403) return 15 * 60_000;
  if (status === 400 || status === 404) return 30 * 60_000;
  return 45_000;
}

export function boundedProviderTimeoutMs(configured: number): number {
  return Number.isFinite(configured) ? Math.min(8_000, Math.max(3_000, configured)) : 8_000;
}

const BASE = {
  gemini: ["https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY"],
  nvidia: ["https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"],
  openrouter: ["https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"],
  groq: ["https://api.groq.com/openai/v1", "GROQ_API_KEY"],
  cerebras: ["https://api.cerebras.ai/v1", "CEREBRAS_API_KEY"],
  mistral: ["https://api.mistral.ai/v1", "MISTRAL_API_KEY"],
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
  e("cerebras", "gpt-oss-120b", "effort", false, 12000),
  e("mistral", "mistral-large-latest"),
  e("gemini", "gemini-3.8-flash", "effort", false, 16000),
  e("groq", "openai/gpt-oss-20b", "effort", false, 8192),
  e("openrouter", "openrouter/free", "openrouter", false, 8192),
  e("groq", "openai/gpt-oss-120b", "effort", false, 12000),
  e("openrouter", "google/gemma-4-31b-it:free", "openrouter", true, 8192),
  e("gemini", "gemini-3.6-flash", "effort", false, 16000),
  e("gemini", "gemini-3.5-flash-lite", "effort", false, 10000),
  e("gemini", "gemini-3.1-flash-lite", "effort", false, 8192),
];
