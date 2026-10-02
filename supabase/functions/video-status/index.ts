import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { providerChain, submitVideo } from "./video-providers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function findVideoRef(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) || /\.(mp4|webm|mov)(\?|$)/i.test(value) || value.includes("/file=")) return value;
    return null;
  }
  if (Array.isArray(value)) for (const item of value) { const found = findVideoRef(item); if (found) return found; }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "video", "file", "path"]) {
      const found = findVideoRef(record[key]);
      if (found) return found;
    }
    for (const item of Object.values(record)) { const found = findVideoRef(item); if (found) return found; }
  }
  return null;
}
function eventFailed(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /error|failed|canceled|cancelled/i.test(text || "");
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

  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  const space = String(metadata.space || "https://openking-wan2-video-generation.hf.space").replace(/\/$/, "");
  const apiName = String(metadata.provider_api || "generate_video");
  const headers: Record<string, string> = {};
  const hfToken = Deno.env.get("HF_TOKEN");
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;
  const retryProvider = async () => {
    const attempted = new Set<string>([
      ...((Array.isArray(metadata.fallback_attempts) ? metadata.fallback_attempts : []) as Array<{ provider?: string }>).map((item) => item.provider || ""),
      ...((Array.isArray(metadata.provider_failures) ? metadata.provider_failures : []) as string[]),
    ]);
    for (const provider of providerChain()) {
      if (attempted.has(provider.label)) continue;
      try {
        const submitted = await submitVideo(provider, String(metadata.prompt || asset.title), Number(metadata.seed ?? -1), headers);
        const nextMetadata = { ...metadata, provider_label: provider.label, provider_api: provider.apiName, space: provider.space, fallback_attempts: [...(Array.isArray(metadata.fallback_attempts) ? metadata.fallback_attempts : []), { provider: provider.label, error: "previous provider failed; retried here" }] };
        const { data: updated } = await admin.from("media_assets").update({ status: "processing", provider: provider.id, provider_job_id: submitted.eventId, metadata: nextMetadata }).eq("id", asset.id).select("*").single();
        await admin.from("video_jobs").update({ status: "processing", attempt_count: ((metadata.attempt_count as number) || 0) + 1, last_provider: provider.id, next_attempt_at: new Date().toISOString() }).eq("asset_id", asset.id);
        return { asset: updated || asset, provider };
      } catch (error) {
        const failures = [...(Array.isArray(metadata.provider_failures) ? metadata.provider_failures as string[] : []), provider.label];
        metadata.provider_failures = failures;
        metadata.last_error = error instanceof Error ? error.message : String(error);
      }
    }
    return null;
  };
  if (!asset.provider_job_id) {
    const retried = await retryProvider();
    if (retried) return json({ asset: retried.asset, status: "processing", provider: retried.provider.id });
    return json({ asset, status: "queued", retry_after_seconds: 30 });
  }
  let result: Response;
  try {
    result = await fetch(`${space}/gradio_api/call/${apiName}/${asset.provider_job_id}`, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    return json({ asset, status: "queued", provider_error: error instanceof Error ? error.message : "Provider status unavailable" }, 200);
  }
  if (!result.ok) return json({ asset, status: "queued", provider_status: result.status }, 200);
  const stream = await result.text();
  const lines = stream.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const events = lines.map((line) => {
    try { return JSON.parse(line.slice(5).trim()); } catch { return line.slice(5).trim(); }
  });
  const last = events.at(-1);
  const completed = events.some((event) => event && typeof event === "object" && ((event as Record<string, unknown>).msg === "process_completed" || (event as Record<string, unknown>).success === true));
  const failed = events.some(eventFailed);
  if (failed && !completed) {
    const failures = [...(Array.isArray(metadata.provider_failures) ? metadata.provider_failures as string[] : []), String(metadata.provider_label || asset.provider || "unknown")];
    const remaining = providerChain().some((provider) => !failures.includes(provider.label));
    const nextMetadata = { ...metadata, provider_failures: failures, provider_events: events.slice(-3) };
    const { data: updated } = await admin.from("media_assets").update({ status: remaining ? "queued" : "failed", provider: remaining ? null : asset.provider, provider_job_id: remaining ? null : asset.provider_job_id, metadata: nextMetadata }).eq("id", asset.id).select("*").single();
    await admin.from("video_jobs").update({ status: remaining ? "queued" : "failed", last_error: "Provider job failed; fallback retry recorded", provider_attempts: failures, next_attempt_at: new Date(Date.now() + (remaining ? 30_000 : 0)).toISOString() }).eq("asset_id", asset.id);
    return json({ asset: updated || asset, status: remaining ? "queued" : "failed", provider_events: events.slice(-3), retrying: remaining });
  }
  const videoRef = findVideoRef(last);
  if (!videoRef) return json({ asset, status: completed ? "processing" : "processing", provider_events: events.slice(-2) });
  const absoluteUrl = /^https?:\/\//i.test(videoRef)
    ? videoRef
    : videoRef.includes("/file=")
      ? `${space}${videoRef.startsWith("/") ? "" : "/"}${videoRef}`
      : `${space}/file=${videoRef.replace(/^\//, "")}`;
  const video = await fetch(absoluteUrl, { headers, signal: AbortSignal.timeout(30_000) });
  if (!video.ok) return json({ asset, status: "processing", provider_status: video.status });
  const bytes = new Uint8Array(await video.arrayBuffer());
  const path = `${auth.user.id}/generated/${asset.id}.mp4`;
  const upload = await admin.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (upload.error) return json({ error: upload.error.message, asset }, 500);
  const { data: updated } = await admin.from("media_assets").update({ status: "ready", storage_path: path, mime_type: "video/mp4", metadata: { ...metadata, provider_events: events.slice(-2) } }).eq("id", asset.id).select("*").single();
  const signed = await admin.storage.from("media").createSignedUrl(path, 3600);
  return json({ asset: updated || asset, status: "ready", signed_url: signed.data?.signedUrl ?? null });
});
