// Free-tier fallback chain. Every provider speaks the OpenAI chat-completions format.
// Providers without an API key set are skipped automatically, so you can start with one key and add more later.
// Free model lists change often (e.g. Kimi K2.6 lost its ":free" tier in June 2026). A dead model ID returns
// 404/400, gets a long cooldown, and the chain moves on, so a stale entry costs one failed call, not an outage.
// Override the whole list without redeploying code: supabase secrets set AI_CHAIN_JSON='[{...}]'

export type Msg = { role: "system" | "user" | "assistant"; content: string };
type ReasoningStyle = "openrouter" | "effort" | "none";

export interface Entry {
  provider: string;
  baseUrl: string;
  keyEnv: string;
  model: string;
  reasoning: ReasoningStyle;
  noSystem?: boolean; // model rejects the system role: merge it into the first user turn
}

const BASE = {
  gemini: [
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "GEMINI_API_KEY",
  ],
  nvidia: ["https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"],
  openrouter: ["https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"],
  groq: ["https://api.groq.com/openai/v1", "GROQ_API_KEY"],
  cerebras: ["https://api.cerebras.ai/v1", "CEREBRAS_API_KEY"],
  mistral: ["https://api.mistral.ai/v1", "MISTRAL_API_KEY"],
} as const;

const e = (
  p: keyof typeof BASE,
  model: string,
  reasoning: ReasoningStyle = "none",
  noSystem = false,
): Entry => ({
  provider: p,
  baseUrl: BASE[p][0],
  keyEnv: BASE[p][1],
  model,
  reasoning,
  noSystem,
});

// Ordered strongest-reasoning-first, spread across providers so one quota running dry never stalls the chain.
export const DEFAULT_CHAIN: Entry[] = [
  e("gemini", "gemini-3.6-flash", "effort"),
  e("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter"),
  e("groq", "openai/gpt-oss-120b", "effort"),
  e("cerebras", "gpt-oss-120b", "effort"),
  e("openrouter", "deepseek/deepseek-v4-flash:free", "openrouter"),
  e("nvidia", "z-ai/glm-5.2"), // verify exact IDs at build.nvidia.com
  e("mistral", "mistral-large-latest"),
  e("openrouter", "openai/gpt-oss-120b:free", "openrouter"),
  e("openrouter", "inclusionai/ring-2.6-1t:free", "openrouter"),
  e("openrouter", "arcee-ai/trinity-large-thinking:free", "openrouter"),
  e("openrouter", "nvidia/nemotron-3-super-120b-a12b:free", "openrouter"),
  e("gemini", "gemini-3.5-flash", "effort"),
  e("openrouter", "qwen/qwen3-next-80b-a3b-instruct:free", "openrouter"),
  e("groq", "llama-3.3-70b-versatile"),
  e("openrouter", "meta-llama/llama-3.3-70b-instruct:free", "openrouter"),
  e("openrouter", "google/gemma-4-31b-it:free", "openrouter", true),
  e("gemini", "gemini-3.5-flash-lite", "effort"),
  e("openrouter", "openrouter/free", "openrouter"), // last resort: OpenRouter picks any live free model
];

function chain(): Entry[] {
  const raw = Deno.env.get("AI_CHAIN_JSON");
  if (raw) {
    try {
      return JSON.parse(raw) as Entry[];
    } catch {
      /* fall through to default */
    }
  }
  return DEFAULT_CHAIN;
}

const cooldownUntil = new Map<string, number>(); // per warm isolate; good enough for a fallback breaker
const id = (x: Entry) => `${x.provider}:${x.model}`;

function mergeSystem(msgs: Msg[]): Msg[] {
  const sys = msgs
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = msgs.filter((m) => m.role !== "system");
  const i = rest.findIndex((m) => m.role === "user");
  if (i >= 0)
    rest[i] = { role: "user", content: `${sys}\n\n---\n\n${rest[i].content}` };
  return rest;
}

function clean(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface Attempt {
  id: string;
  status: string;
}
export interface ChainResult {
  text: string;
  provider: string;
  model: string;
  attempts: Attempt[];
}

export async function callChain(
  messages: Msg[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    json?: boolean;
    deadlineMs?: number;
    perCallMs?: number;
  },
): Promise<ChainResult> {
  const started = Date.now();
  const deadline = opts.deadlineMs ?? 120_000;
  const perCall = opts.perCallMs ?? 45_000;
  const attempts: Attempt[] = [];

  for (const ent of chain()) {
    const key = Deno.env.get(ent.keyEnv);
    const eid = id(ent);
    if (!key) continue;
    if ((cooldownUntil.get(eid) ?? 0) > Date.now()) {
      attempts.push({ id: eid, status: "cooldown" });
      continue;
    }
    if (Date.now() - started > deadline - 8_000) {
      attempts.push({ id: eid, status: "deadline" });
      break;
    }

    // Try with high reasoning first; if the provider/model rejects the parameter (400), retry once without it.
    for (const withReasoning of ent.reasoning === "none"
      ? [false]
      : [true, false]) {
      const body: Record<string, unknown> = {
        model: ent.model,
        messages: ent.noSystem ? mergeSystem(messages) : messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096,
      };
      if (withReasoning) {
        if (ent.reasoning === "openrouter") body.reasoning = { effort: "high" };
        if (ent.reasoning === "effort") body.reasoning_effort = "high";
      }

      try {
        const res = await fetch(`${ent.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            ...(ent.provider === "openrouter"
              ? { "X-Title": "Group 13 Hub" }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(
            Math.min(
              perCall,
              Math.max(5_000, deadline - (Date.now() - started)),
            ),
          ),
        });

        if (res.ok) {
          const data = await res.json();
          const text = clean(data?.choices?.[0]?.message?.content ?? "");
          if (text) {
            attempts.push({ id: eid, status: "ok" });
            return { text, provider: ent.provider, model: ent.model, attempts };
          }
          attempts.push({ id: eid, status: "empty" });
          cooldownUntil.set(eid, Date.now() + 60_000);
          break;
        }

        if (res.status === 400 && withReasoning) continue; // retry same model without reasoning params

        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        const cool =
          res.status === 429
            ? Math.max(retryAfter * 1000, 60_000)
            : res.status === 401 || res.status === 403
              ? 15 * 60_000
              : res.status === 404 || res.status === 400
                ? 30 * 60_000 // model ID gone / unsupported
                : 45_000; // 5xx, 408 etc.
        cooldownUntil.set(eid, Date.now() + cool);
        attempts.push({ id: eid, status: String(res.status) });
        await res.body?.cancel();
        break;
      } catch (err) {
        cooldownUntil.set(eid, Date.now() + 45_000);
        attempts.push({
          id: eid,
          status: err instanceof DOMException ? "timeout" : "network",
        });
        break;
      }
    }
  }
  throw Object.assign(new Error("All AI providers are busy or unavailable"), {
    attempts,
  });
}
