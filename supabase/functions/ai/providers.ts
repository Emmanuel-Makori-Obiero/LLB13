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
  e("gemini", "gemini-3.8-flash", "effort", false, 16000),
  e("groq", "openai/gpt-oss-20b", "effort", false, 8192),
  e("openrouter", "openrouter/free", "openrouter", false, 8192),
  e("groq", "openai/gpt-oss-120b", "effort", false, 12000),
  e("openrouter", "google/gemma-4-31b-it:free", "openrouter", true, 8192),
  e("gemini", "gemini-3.6-flash", "effort", false, 16000),
  e("gemini", "gemini-3.5-flash-lite", "effort", false, 10000),
  e("gemini", "gemini-3.1-flash-lite", "effort", false, 8192),
  e("cerebras", "gpt-oss-120b", "effort", false, 12000),
  e("mistral", "mistral-large-latest"),
  // Gemini 2.5 remains a legacy option, but Google restricts it to projects
  // that have actively used it before; it is intentionally near the end.
  e("gemini", "gemini-2.5-flash", "effort", false, 12000),
  e("gemini", "gemini-2.5-flash-lite", "effort", false, 8192),
];
