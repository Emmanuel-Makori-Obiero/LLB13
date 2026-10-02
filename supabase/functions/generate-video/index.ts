import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SPACE = Deno.env.get("HF_VIDEO_SPACE") || "https://openking-wan2-video-generation.hf.space";

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

  // Wan2.2 Space input order: prompt, image, width, height, frames, steps, guidance, seed.
  // These conservative values target the free queue and a short first clip.
  const input = [prompt, null, 512, 512, 25, 20, 5, Number.isFinite(body.seed) ? body.seed : -1];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const hfToken = Deno.env.get("HF_TOKEN");
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
  const submitted = await fetch(`${SPACE}/gradio_api/call/generate_video`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data: input }),
  });
  if (!submitted.ok) return response({ error: `Video provider rejected the job (${submitted.status}).`, detail: (await submitted.text()).slice(0, 1200) }, 502);
  const submission = await submitted.json();
  const providerJobId = submission.event_id;
  if (!providerJobId) return response({ error: "Video provider returned no job id.", detail: submission }, 502);

  const admin = createClient(url, service);
  const asset = {
    owner_id: auth.user.id,
    title: prompt.slice(0, 90),
    kind: "film_clip",
    project_id: body.project_id || null,
    status: "queued",
    provider: "huggingface-zero-gpu-wan2",
    provider_job_id: providerJobId,
    metadata: { prompt, shot_index: body.shot_index ?? null, frames: 25, width: 512, height: 512, fps: 24, space: SPACE },
  };
  const { data, error } = await admin.from("media_assets").insert(asset).select("id,title,kind,project_id,status,provider,provider_job_id,metadata,created_at").single();
  if (error) return response({ error: `Could not save video job: ${error.message}` }, 500);
  return response({ asset, provider_job_id: providerJobId, status_url: `${url}/functions/v1/video-status?asset_id=${data.id}` }, 202);
});
