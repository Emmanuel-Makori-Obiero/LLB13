import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { providerChain, submitVideo } from "./video-providers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return response({ error: "Supabase server configuration is incomplete." }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return response({ error: "Sign in before generating video." }, 401);

  let body: { prompt?: string; project_id?: string; shot_index?: number; seed?: number };
  try { body = await req.json(); } catch { return response({ error: "Invalid JSON body." }, 400); }
  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 12) return response({ error: "Describe the video scene in at least 12 characters." }, 400);
  if (prompt.length > 2500) return response({ error: "Prompt is too long." }, 400);
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : -1;
  const headers: Record<string, string> = {};
  const hfToken = Deno.env.get("HF_TOKEN");
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
  const admin = createClient(url, service);
  const providers = providerChain();

  const attempts: Array<{ provider: string; error: string }> = [];
  let selected: Awaited<ReturnType<typeof submitVideo>> | null = null;
  for (const provider of providers) {
    try {
      selected = await submitVideo(provider, prompt, seed, headers);
      break;
    } catch (error) {
      attempts.push({ provider: provider.label, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!selected) {
    const queuedAsset = {
      owner_id: auth.user.id,
      title: prompt.slice(0, 90),
      kind: "film_clip",
      project_id: body.project_id || null,
      status: "queued",
      provider: null,
      provider_job_id: null,
      metadata: { prompt, shot_index: body.shot_index ?? null, seed, fallback_order: providers.map((item) => item.id), fallback_attempts: attempts, retry_after_seconds: 30 },
    };
    const { data: queued, error: queuedError } = await admin.from("media_assets").insert(queuedAsset).select("id,title,kind,project_id,status,provider,provider_job_id,metadata,created_at").single();
    if (queuedError) return response({ error: `Could not save queued video job: ${queuedError.message}`, attempts }, 500);
    const job = await admin.from("video_jobs").insert({ asset_id: queued.id, owner_id: auth.user.id, status: "queued", attempt_count: attempts.length, last_error: attempts.at(-1)?.error || "All providers unavailable", provider_attempts: attempts, next_attempt_at: new Date(Date.now() + 30_000).toISOString() });
    if (job.error) return response({ error: `Could not save retry state: ${job.error.message}` }, 500);
    return response({ asset: queued, provider: null, fallback_attempts: attempts, retryable: true, status_url: `${url}/functions/v1/video-status?asset_id=${queued.id}` }, 202);
  }

  const asset = {
    owner_id: auth.user.id,
    title: prompt.slice(0, 90),
    kind: "film_clip",
    project_id: body.project_id || null,
    status: "queued",
    provider: selected.provider.id,
    provider_job_id: selected.eventId,
    metadata: {
      prompt,
      shot_index: body.shot_index ?? null,
      seed,
      provider_label: selected.provider.label,
      provider_api: selected.provider.apiName,
      space: selected.provider.space,
      fallback_order: providers.map((item) => item.id),
      fallback_attempts: attempts,
      frames: selected.provider.id === "openking-wan22" ? 25 : null,
    },
  };
  const { data, error } = await admin.from("media_assets").insert(asset).select("id,title,kind,project_id,status,provider,provider_job_id,metadata,created_at").single();
  if (error) return response({ error: `Could not save video job: ${error.message}` }, 500);
  const job = await admin.from("video_jobs").insert({ asset_id: data.id, owner_id: auth.user.id, status: "processing", attempt_count: attempts.length + 1, last_provider: selected.provider.id, provider_attempts: attempts, next_attempt_at: new Date().toISOString() });
  if (job.error) return response({ error: `Could not save retry state: ${job.error.message}` }, 500);
  return response({ asset, provider_job_id: selected.eventId, provider: selected.provider.id, fallback_attempts: attempts, status_url: `${url}/functions/v1/video-status?asset_id=${data.id}` }, 202);
});
