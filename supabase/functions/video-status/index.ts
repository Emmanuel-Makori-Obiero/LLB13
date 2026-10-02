import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function findVideoUrl(value: unknown): string | null {
  if (typeof value === "string" && /\.(mp4|webm|mov)(\?|$)/i.test(value)) return value;
  if (Array.isArray(value)) for (const item of value) { const found = findVideoUrl(item); if (found) return found; }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) { const found = findVideoUrl(item); if (found) return found; }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Supabase server configuration is incomplete." }, 503);
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before checking video status." }, 401);
  const assetId = new URL(req.url).searchParams.get("asset_id");
  if (!assetId) return json({ error: "asset_id is required." }, 400);

  const admin = createClient(url, service);
  const { data: asset, error: assetError } = await admin.from("media_assets")
    .select("id,owner_id,title,status,provider,provider_job_id,storage_path,metadata")
    .eq("id", assetId).eq("owner_id", auth.user.id).limit(1).maybeSingle();
  if (assetError) return json({ error: assetError.message }, 500);
  if (!asset) return json({ error: "Video job not found." }, 404);
  if (asset.status === "ready" || asset.status === "failed") return json({ asset, status: asset.status });

  const space = String((asset.metadata as Record<string, unknown>)?.space || "https://openking-wan2-video-generation.hf.space");
  const headers: Record<string, string> = {};
  const hfToken = Deno.env.get("HF_TOKEN");
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
  const result = await fetch(`${space}/gradio_api/call/generate_video/${asset.provider_job_id}`, { headers });
  if (!result.ok) return json({ asset, status: "queued", provider_status: result.status }, 200);
  const stream = await result.text();
  const lines = stream.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const events = lines.map((line) => {
    try { return JSON.parse(line.slice(5).trim()); } catch { return line.slice(5).trim(); }
  });
  const last = events.at(-1);
  const failed = events.some((event) => typeof event === "string" && /error|failed/i.test(event));
  if (failed) {
    const { data: updated } = await admin.from("media_assets").update({ status: "failed", metadata: { ...(asset.metadata as object), provider_events: events.slice(-3) } }).eq("id", asset.id).select("*").single();
    return json({ asset: updated || asset, status: "failed", provider_events: events.slice(-3) });
  }
  const videoUrl = findVideoUrl(last);
  if (!videoUrl) return json({ asset, status: "processing", provider_events: events.slice(-2) });
  const absoluteUrl = videoUrl.startsWith("http") ? videoUrl : `${space}${videoUrl.startsWith("/") ? "" : "/"}${videoUrl}`;
  const video = await fetch(absoluteUrl, { headers });
  if (!video.ok) return json({ asset, status: "processing", provider_status: video.status });
  const bytes = new Uint8Array(await video.arrayBuffer());
  const path = `${auth.user.id}/generated/${asset.id}.mp4`;
  const upload = await admin.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (upload.error) return json({ error: upload.error.message, asset }, 500);
  const { data: updated } = await admin.from("media_assets").update({ status: "ready", storage_path: path, mime_type: "video/mp4", metadata: { ...(asset.metadata as object), provider_events: events.slice(-2) } }).eq("id", asset.id).select("*").single();
  const signed = await admin.storage.from("media").createSignedUrl(path, 3600);
  return json({ asset: updated || asset, status: "ready", signed_url: signed.data?.signedUrl ?? null });
});
