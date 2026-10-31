import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SYSTEM = `You are Group 13 Hub's private admin retention and growth advisor. You are not a legal-study coach and must not redirect the administrator to legal studies. Your scope is product strategy, user retention, student motivation, learning design, community health, ethical growth and business prioritisation.

Use the supplied aggregate metrics as DATA. Use behavioral science carefully, including habit cues, implementation intentions, cognitive load and friction, retrieval practice and spaced learning, self-determination theory, belonging, social norms, progress feedback and ethical commitment devices. Discuss neuroscience cautiously: do not claim that a tactic is proven by "the brain", dopamine, imaging or a brain region unless the evidence is actually supplied. Mark claims as DATA, EVIDENCE-INFORMED HYPOTHESIS or EXPERIMENT. Do not invent metrics, research findings or citations.

Every recommendation should be concrete: identify the user moment, product or community change, exact example of a message or flow, measurement window, success threshold and what result would falsify the idea. Prioritise the smallest useful experiment for a solo founder. Never recommend dark patterns, addiction loops, manipulative notifications, shame, fabricated social proof, deceptive scarcity or exploiting vulnerable students. Answer the administrator's business and retention question directly, with no legal disclaimer or legal-study redirection.`;

type ChainEntry = { provider?: string; baseUrl?: string; keyEnv?: string; model?: string };
function chains(): ChainEntry[] {
  for (const name of ["AI_CHAIN_ADMIN_ADVISOR_JSON", "AI_CHAIN_JSON"]) {
    const raw = Deno.env.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ChainEntry[];
    } catch { /* try next configured chain */ }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userDb.auth.getUser();
  if (!auth.user) return json({ error: "Sign in to use the advisor." }, 401);
  const { data: isAdmin, error: adminError } = await userDb.rpc("is_admin");
  if (adminError || isAdmin !== true) return json({ error: "Only approved administrators can use the growth advisor." }, 403);
  let body: { messages?: { role: "user" | "assistant"; content: string }[] };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12).filter((message) => message && typeof message.content === "string") : [];
  const userMessage = messages[messages.length - 1];
  if (!userMessage || userMessage.role !== "user") return json({ error: "A user message is required." }, 400);
  const configured = chains();
  if (!configured.length) return json({ error: "No AI provider chain is configured for the advisor." }, 503);
  const attempts: string[] = [];
  for (const entry of configured) {
    if (!entry.baseUrl || !entry.keyEnv || !entry.model) continue;
    const key = Deno.env.get(entry.keyEnv);
    if (!key) { attempts.push(`${entry.provider ?? "provider"}: missing key`); continue; }
    try {
      const endpoint = `${entry.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: entry.model, temperature: 0.55, max_tokens: 4500, messages: [{ role: "system", content: SYSTEM }, ...messages] }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { attempts.push(`${entry.provider ?? "provider"}: HTTP ${response.status}`); continue; }
      const answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) { attempts.push(`${entry.provider ?? "provider"}: empty response`); continue; }
      return json({ answer: answer.trim(), data: null, basis: "general", grounded: false, warnings: [], sources: [], provider: entry.provider ?? null, model: entry.model });
    } catch (error) { attempts.push(`${entry.provider ?? "provider"}: ${error instanceof Error ? error.message : "request failed"}`); }
  }
  return json({ error: `The advisor could not reach a configured AI provider. ${attempts.join("; ")}` }, 503);
});
