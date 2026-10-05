import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerHeaders, bearerHeadersForSlot, secretKeyEntries } from "../_shared/keys.ts";
import { providerChain, submitVideo } from "./video-providers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function findVideoRef(value: unknown, videoContext = false): string | null {
  if (typeof value === "string") {
    const hasVideoExtension = /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(value);
    if (hasVideoExtension || value.includes("/file=") || (videoContext && /^https?:\/\//i.test(value))) return value;
    return null;
  }
  if (Array.isArray(value)) for (const item of value) { const found = findVideoRef(item, videoContext); if (found) return found; }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "video", "file", "path"]) {
      const found = findVideoRef(record[key], videoContext || key === "video" || key === "file");
      if (found) return found;
    }
    for (const item of Object.values(record)) { const found = findVideoRef(item, videoContext); if (found) return found; }
  }
  return null;
}
function eventFailed(value: unknown) {
  if (typeof value === "string") return /^(?:error|failed|canceled|cancelled|process_failed|exception|internal server error)\b/i.test(value.trim());
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const message = `${String(event.msg || "")} ${String(event.status || "")}`;
  return event.success === false || Boolean(event.error) || Boolean(event.exception) || /error|process_failed|failed|canceled|cancelled/i.test(message);
}
function resolveTrustedVideoUrl(videoRef: string, space: string): string | null {
  try {
    const base = new URL(space);
    if (base.protocol !== "https:" || base.username || base.password) return null;
    const resolved = /^https?:\/\//i.test(videoRef)
      ? new URL(videoRef)
      : videoRef.includes("/file=")
        ? new URL(videoRef.startsWith("/") ? videoRef : `/${videoRef}`, base.origin)
        : new URL(`/file=${videoRef.replace(/^\/+/, "")}`, base.origin);
    if (resolved.protocol !== "https:" || resolved.origin !== base.origin || resolved.username || resolved.password) return null;
    return resolved.toString();
  } catch { return null; }
}
function isValidMp4(contentType: string, bytes: Uint8Array): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (mime && !["video/mp4", "application/octet-stream", "application/x-mp4"].includes(mime)) return false;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
}
async function readVideoBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`Provider output exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB clip limit.`);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Provider output exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB clip limit.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
const VIDEO_JOB_LOCK_TTL_MS = 180_000;
const MAX_PROVIDER_RUNTIME_MS = 10 * 60_000;
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

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
  const { data: initialAsset, error: assetError } = await admin.from("media_assets")
    .select("*")
    .eq("id", assetId).eq("owner_id", auth.user.id).limit(1).maybeSingle();
  if (assetError) return json({ error: assetError.message }, 500);
  if (!initialAsset) return json({ error: "Video job not found." }, 404);
  let asset = initialAsset;
  if (asset.status === "ready") {
    const { data: existingJob, error: lookupError } = await admin.from("video_jobs").select("asset_id")
      .eq("asset_id", asset.id).eq("owner_id", auth.user.id).limit(1).maybeSingle();
    if (lookupError) return json({ asset, status: "ready", warning: "The video is ready, but its retry record could not be checked." });
    if (existingJob) {
      const repair = await admin.from("video_jobs").update({ status: "ready", last_error: null, locked_at: null, next_attempt_at: new Date().toISOString() })
        .eq("asset_id", asset.id).eq("owner_id", auth.user.id);
      return json({ asset, status: "ready", ...(repair.error ? { warning: "The video is ready, but its retry record could not be repaired." } : {}) });
    }
    const savedMetadata = (asset.metadata || {}) as Record<string, unknown>;
    const knownFailures = Array.isArray(savedMetadata.provider_failures) ? savedMetadata.provider_failures.length : 0;
    const repair = await admin.from("video_jobs").insert({
      asset_id: asset.id,
      owner_id: auth.user.id,
      status: "ready",
      attempt_count: Math.min(6, knownFailures + 1),
      max_attempts: 6,
      next_attempt_at: new Date().toISOString(),
      provider_attempts: Array.isArray(savedMetadata.fallback_attempts) ? savedMetadata.fallback_attempts : [],
    });
    return json({ asset, status: "ready", ...(repair.error ? { warning: "The video is ready, but its missing retry record could not be recreated." } : {}) });
  }
  if (asset.status === "deleted") return json({ asset, status: "deleted" });
  if (asset.status === "failed") return json({ asset, status: "failed" });

  const { data: initialRetryState, error: retryStateError } = await admin.from("video_jobs")
    .select("attempt_count,max_attempts,next_attempt_at,locked_at,provider_attempts")
    .eq("asset_id", asset.id).eq("owner_id", auth.user.id).limit(1).maybeSingle();
  if (retryStateError) return json({ error: retryStateError.message }, 500);
  let retryState = initialRetryState;
  if (!retryState) {
    const savedMetadata = (asset.metadata || {}) as Record<string, unknown>;
    const knownFailures = Array.isArray(savedMetadata.provider_failures) ? savedMetadata.provider_failures.length : 0;
    const attemptCount = Math.min(6, knownFailures + (asset.provider_job_id ? 1 : 0));
    const waitSeconds = asset.provider_job_id ? 0 : Math.max(0, Number(savedMetadata.retry_after_seconds || 0));
    const { error: restoreError } = await admin.from("video_jobs").upsert({
      asset_id: asset.id,
      owner_id: auth.user.id,
      status: asset.status === "processing" ? "processing" : "queued",
      attempt_count: attemptCount,
      max_attempts: 6,
      next_attempt_at: new Date(Date.now() + waitSeconds * 1000).toISOString(),
      last_error: typeof savedMetadata.last_error === "string" ? savedMetadata.last_error : null,
      provider_attempts: Array.isArray(savedMetadata.fallback_attempts) ? savedMetadata.fallback_attempts : [],
    }, { onConflict: "asset_id", ignoreDuplicates: true });
    if (restoreError) return json({ error: "Could not restore video retry tracking.", detail: restoreError.message }, 500);
    const { data: restored, error: reloadError } = await admin.from("video_jobs")
      .select("attempt_count,max_attempts,next_attempt_at,locked_at,provider_attempts")
      .eq("asset_id", asset.id).eq("owner_id", auth.user.id).limit(1).maybeSingle();
    if (reloadError || !restored) return json({ error: "The video retry record could not be restored." }, 500);
    retryState = restored;
  }
  const now = Date.now();
  const lockAt = retryState?.locked_at ? Date.parse(retryState.locked_at) : 0;
  if (lockAt > now - VIDEO_JOB_LOCK_TTL_MS) {
    return json({ asset, status: asset.provider_job_id ? "processing" : "queued", retry_after_seconds: 15 });
  }
  const retryAt = retryState?.next_attempt_at ? Date.parse(retryState.next_attempt_at) : 0;
  if (retryAt > now) {
    return json({ asset, status: asset.provider_job_id ? "processing" : "queued", retry_after_seconds: Math.ceil((retryAt - Date.now()) / 1000) });
  }

  let lockClaimed = false;
  const lockTimestamp = new Date().toISOString();
  if (retryState) {
    const staleLockBefore = new Date(now - VIDEO_JOB_LOCK_TTL_MS).toISOString();
    const { data: claimed, error: claimError } = await admin.from("video_jobs")
      .update({ locked_at: lockTimestamp })
      .eq("asset_id", asset.id).eq("owner_id", auth.user.id)
      .or(`locked_at.is.null,locked_at.lt.${staleLockBefore}`)
      .select("asset_id").maybeSingle();
    if (claimError) return json({ error: "Could not reserve this video status check.", detail: claimError.message }, 500);
    if (!claimed) return json({ asset, status: asset.provider_job_id ? "processing" : "queued", retry_after_seconds: 15 });
    lockClaimed = true;
  }
  const reply = async (body: unknown, status = 200) => {
    if (lockClaimed) {
      lockClaimed = false;
      const { error } = await admin.from("video_jobs").update({ locked_at: null })
        .eq("asset_id", asset.id).eq("owner_id", auth.user.id).eq("locked_at", lockTimestamp);
      if (error) console.warn("Could not release video job lock", error.message);
    }
    return json(body, status);
  };

  if (lockClaimed) {
    const { data: freshAsset, error: freshAssetError } = await admin.from("media_assets").select("*")
      .eq("id", asset.id).eq("owner_id", auth.user.id).limit(1).maybeSingle();
    if (freshAssetError) return await reply({ error: "Could not refresh video state after reserving the status check.", detail: freshAssetError.message }, 500);
    if (!freshAsset) return await reply({ error: "Video job not found." }, 404);
    asset = freshAsset;
    if (asset.status === "ready") {
      const repair = await admin.from("video_jobs").update({ status: "ready", last_error: null, next_attempt_at: new Date().toISOString() })
        .eq("asset_id", asset.id).eq("owner_id", auth.user.id);
      return await reply({ asset, status: "ready", ...(repair.error ? { warning: "The video is ready, but its retry record could not be updated." } : {}) });
    }
    if (asset.status === "deleted") return await reply({ asset, status: "deleted" });
    if (asset.status === "failed") {
      const detail = String((asset.metadata as Record<string, unknown> | null)?.last_error || "Video generation failed.");
      const repair = await admin.from("video_jobs").update({ status: "failed", last_error: detail, next_attempt_at: new Date().toISOString() })
        .eq("asset_id", asset.id).eq("owner_id", auth.user.id);
      return await reply({ asset, status: "failed", ...(repair.error ? { warning: "The asset is failed, but its retry record could not be repaired." } : {}) });
    }
    const { data: freshRetryState, error: freshRetryError } = await admin.from("video_jobs")
      .select("attempt_count,max_attempts,next_attempt_at,locked_at,provider_attempts")
      .eq("asset_id", asset.id).eq("owner_id", auth.user.id).limit(1).maybeSingle();
    if (freshRetryError || !freshRetryState) return await reply({ error: "Could not refresh the video retry state after reserving the check.", detail: freshRetryError?.message }, 500);
    retryState = freshRetryState;
    const freshRetryAt = retryState.next_attempt_at ? Date.parse(retryState.next_attempt_at) : 0;
    if (freshRetryAt > Date.now()) {
      return await reply({ asset, status: asset.provider_job_id ? "processing" : "queued", retry_after_seconds: Math.ceil((freshRetryAt - Date.now()) / 1000) });
    }
  }

  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  const configuredProviders = providerChain();
  let savedSpaceOrigin = "";
  try { savedSpaceOrigin = metadata.space ? new URL(String(metadata.space)).origin : ""; } catch { /* reject invalid saved host below */ }
  const configuredProvider = configuredProviders.find((provider) => provider.id === asset.provider)
    || configuredProviders.find((provider) => provider.label === metadata.provider_label)
    || configuredProviders.find((provider) => {
      try { return Boolean(savedSpaceOrigin) && new URL(provider.space).origin === savedSpaceOrigin; } catch { return false; }
    });
  let space = "";
  let trustedProviderHost = false;
  if (configuredProvider) {
    try {
      const configuredUrl = new URL(configuredProvider.space);
      const savedUrl = new URL(String(metadata.space || configuredProvider.space));
      trustedProviderHost = configuredUrl.protocol === "https:" && savedUrl.protocol === "https:"
        && configuredUrl.origin === savedUrl.origin && !savedUrl.username && !savedUrl.password;
      if (trustedProviderHost) space = configuredUrl.origin;
    } catch { /* invalid provider configuration is treated as a failed provider */ }
  }
  const apiName = configuredProvider?.apiName || "";
  const hfTokens = secretKeyEntries("HF_TOKEN");
  const currentTokenSlot = Number.isInteger(Number(metadata.hf_token_slot)) && Number(metadata.hf_token_slot) >= 0
    ? Number(metadata.hf_token_slot)
    : null;
  const headers: Record<string, string> = currentTokenSlot === null
    ? bearerHeaders("HF_TOKEN")
    : bearerHeadersForSlot("HF_TOKEN", currentTokenSlot);
  const retryProvider = async () => {
    const attempted = new Set<string>([
      ...((Array.isArray(metadata.fallback_attempts) ? metadata.fallback_attempts : []) as Array<{ provider?: string }>).map((item) => item.provider || ""),
      ...((Array.isArray(metadata.provider_failures) ? metadata.provider_failures : []) as string[]),
    ]);
    const retryFailures: Array<{ provider: string; error: string }> = [];
    for (const provider of providerChain()) {
      if (attempted.has(provider.label)) continue;
      const attemptsUsed = Number(retryState?.attempt_count || 0) + retryFailures.length;
      const maxAttempts = Number(retryState?.max_attempts || 6);
      if (attemptsUsed >= maxAttempts) break;
      let submitted: Awaited<ReturnType<typeof submitVideo>>;
      const tokenEntry = hfTokens.length
        ? hfTokens[(Number(retryState?.attempt_count || 0) + retryFailures.length) % hfTokens.length]
        : null;
      const tokenSlot = tokenEntry?.slot ?? 0;
      try {
        submitted = await submitVideo(provider, String(metadata.prompt || asset.title), Number(metadata.seed ?? -1), tokenEntry
          ? { Authorization: `Bearer ${tokenEntry.value}` }
          : bearerHeadersForSlot("HF_TOKEN", tokenSlot));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        attempted.add(provider.label);
        retryFailures.push({ provider: provider.label, error: detail });
        metadata.provider_failures = [...attempted];
        metadata.last_error = detail;
        continue;
      }
      const previousAttempts = Array.isArray(metadata.fallback_attempts) ? metadata.fallback_attempts : [];
      const nextMetadata = {
        ...metadata,
        provider_label: provider.label,
        provider_api: provider.apiName,
        space: provider.space,
        hf_token_slot: tokenSlot,
        provider_started_at: new Date().toISOString(),
        provider_status_failures: 0,
        storage_upload_failures: 0,
        last_error: null,
        fallback_attempts: [...previousAttempts, ...retryFailures, { provider: provider.label, error: "submitted after earlier provider failures" }].slice(-20),
        provider_failures: [...attempted],
      };
      const { data: updated, error: updateError } = await admin.from("media_assets")
        .update({ status: "processing", provider: provider.id, provider_job_id: submitted.eventId, metadata: nextMetadata })
        .eq("id", asset.id).select("*").single();
      if (updateError) throw new Error(`Could not update video job: ${updateError.message}`);
      const attemptCount = Number(retryState?.attempt_count || 0) + retryFailures.length + 1;
      const jobUpdate = await admin.from("video_jobs").update({
        status: "processing",
        attempt_count: attemptCount,
        last_provider: provider.id,
        provider_attempts: [...(Array.isArray(retryState?.provider_attempts) ? retryState.provider_attempts : []), ...retryFailures],
        next_attempt_at: new Date().toISOString(),
      }).eq("asset_id", asset.id);
      if (jobUpdate.error) throw new Error(`Could not update video retry state: ${jobUpdate.error.message}`);
      return { asset: updated || asset, provider };
    }
    return null;
  };

  const markRetryExhausted = async () => {
    const detail = String(metadata.last_error || "No untried video provider accepted this clip.").slice(0, 800);
    const { data: failedAsset, error: assetUpdateError } = await admin.from("media_assets")
      .update({ status: "failed", provider: null, provider_job_id: null, metadata: { ...metadata, last_error: detail } })
      .eq("id", asset.id).select("*").single();
    if (assetUpdateError || !failedAsset) return await reply({ error: "Could not save the final video failure state.", detail: assetUpdateError?.message }, 500);
    const jobUpdate = await admin.from("video_jobs").update({ status: "failed", last_error: detail, next_attempt_at: new Date().toISOString() }).eq("asset_id", asset.id);
    if (jobUpdate.error) return await reply({ asset: failedAsset, status: "failed", error: "The video is marked failed, but its retry record could not be updated." }, 500);
    return await reply({ asset: failedAsset, status: "failed", provider_error: "All available free video providers have been tried and none accepted this clip. Please try again later." });
  };

  const markProviderUnavailable = async (reason: string, immediate = false) => {
    const consecutiveFailures = Number(metadata.provider_status_failures || 0) + 1;
    const detail = String(reason || "Provider status unavailable.").slice(0, 800);
    if (!immediate && consecutiveFailures < 4) {
      const nextMetadata = { ...metadata, provider_status_failures: consecutiveFailures, last_error: detail };
      const { data: updated, error: updateError } = await admin.from("media_assets")
        .update({ metadata: nextMetadata }).eq("id", asset.id).select("*").single();
      if (updateError) return await reply({ error: "Could not save provider status retry state.", detail: updateError.message }, 500);
      const jobUpdate = await admin.from("video_jobs").update({ last_error: detail, next_attempt_at: new Date(Date.now() + 20_000).toISOString() }).eq("asset_id", asset.id);
      if (jobUpdate.error) return await reply({ asset: updated || asset, status: "processing", error: "Could not save the next provider status check." }, 500);
      return await reply({ asset: updated || asset, status: "processing", provider_error: "The video provider status is temporarily unavailable; checking again shortly.", retry_after_seconds: 20 });
    }

    const failedProvider = String(metadata.provider_label || asset.provider || "unknown");
    const failures = [...new Set([...(Array.isArray(metadata.provider_failures) ? metadata.provider_failures as string[] : []), failedProvider])];
    const remaining = providerChain().some((provider) => !failures.includes(provider.label));
    const nextMetadata = { ...metadata, provider_failures: failures, provider_status_failures: 0, last_error: detail };
    const nextStatus = remaining ? "queued" : "failed";
    const { data: updated, error: updateError } = await admin.from("media_assets").update({
      status: nextStatus,
      provider: remaining ? null : asset.provider,
      provider_job_id: null,
      metadata: nextMetadata,
    }).eq("id", asset.id).select("*").single();
    if (updateError || !updated) return await reply({ error: "Could not save provider failover state.", detail: updateError?.message }, 500);
    const previousAttempts = Array.isArray(retryState?.provider_attempts) ? retryState.provider_attempts : [];
    const jobUpdate = await admin.from("video_jobs").update({
      status: nextStatus,
      last_error: detail,
      provider_attempts: [...previousAttempts, { provider: failedProvider, error: detail }].slice(-50),
      next_attempt_at: new Date(Date.now() + (remaining ? 30_000 : 0)).toISOString(),
    }).eq("asset_id", asset.id);
    if (jobUpdate.error) return await reply({ asset: updated, status: nextStatus, error: "The asset failover state was saved, but the retry record could not be updated." }, 500);
    return await reply({
      asset: updated,
      status: nextStatus,
      provider_error: remaining
        ? "The current video provider stopped returning usable status; trying the next provider shortly."
        : "All available video providers failed or stopped returning usable status. Please try again later.",
      retrying: remaining,
      ...(remaining ? { retry_after_seconds: 30 } : {}),
    });
  };

  if (!asset.provider_job_id) {
    let retried: Awaited<ReturnType<typeof retryProvider>>;
    try {
      retried = await retryProvider();
    } catch (error) {
      return await reply({ error: error instanceof Error ? error.message : "Could not retry the video provider.", asset }, 500);
    }
    if (retried) return await reply({ asset: retried.asset, status: "processing", provider: retried.provider.id });
    return await markRetryExhausted();
  }
  if (!trustedProviderHost || !space || !apiName) {
    return await markProviderUnavailable("The saved video provider is not in the server's HTTPS allowlist. No provider credentials were sent.", true);
  }
  const providerStartedAt = Date.parse(String(metadata.provider_started_at || asset.created_at || ""));
  if (Number.isFinite(providerStartedAt) && Date.now() - providerStartedAt > MAX_PROVIDER_RUNTIME_MS) {
    return await markProviderUnavailable("Provider exceeded its 10-minute processing window.", true);
  }
  let stream: string;
  try {
    const result = await fetch(`${space}/gradio_api/call/${apiName}/${asset.provider_job_id}`, { headers, redirect: "manual", signal: AbortSignal.timeout(45_000) });
    if (!result.ok) return await markProviderUnavailable(`Provider status returned HTTP ${result.status}.`);
    stream = await result.text();
  } catch (error) {
    return await markProviderUnavailable(error instanceof Error ? error.message : "Provider status unavailable.");
  }
  const lines = stream.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const eventNames = [...stream.matchAll(/^event:\s*([^\r\n]+)/gim)].map((match) => match[1].trim().toLowerCase());
  const events = lines.map((line) => {
    try { return JSON.parse(line.slice(5).trim()); } catch { return line.slice(5).trim(); }
  });
  const last = events.at(-1);
  const completed = eventNames.some((name) => name === "complete" || name === "completed") || events.some((event) => event && typeof event === "object" && ((event as Record<string, unknown>).msg === "process_completed" || (event as Record<string, unknown>).success === true));
  const failed = eventNames.some((name) => /^(?:error|failed|process_failed|canceled|cancelled)$/.test(name)) || events.some(eventFailed);
  if (failed && !completed) {
    const failures = [...new Set([...(Array.isArray(metadata.provider_failures) ? metadata.provider_failures as string[] : []), String(metadata.provider_label || asset.provider || "unknown")])];
    const remaining = providerChain().some((provider) => !failures.includes(provider.label));
    const nextMetadata = { ...metadata, provider_failures: failures, provider_status_failures: 0, last_error: "Provider job reported failure.", provider_events: events.slice(-3) };
    const { data: updated, error: assetUpdateError } = await admin.from("media_assets").update({ status: remaining ? "queued" : "failed", provider: remaining ? null : asset.provider, provider_job_id: remaining ? null : asset.provider_job_id, metadata: nextMetadata }).eq("id", asset.id).select("*").single();
    if (assetUpdateError || !updated) return await reply({ error: "Could not save the provider failure state.", detail: assetUpdateError?.message }, 500);
    const jobUpdate = await admin.from("video_jobs").update({ status: remaining ? "queued" : "failed", last_error: "Provider job failed; fallback retry recorded", provider_attempts: failures, next_attempt_at: new Date(Date.now() + (remaining ? 30_000 : 0)).toISOString() }).eq("asset_id", asset.id);
    if (jobUpdate.error) return await reply({ asset: updated, status: remaining ? "queued" : "failed", error: "The asset state was saved, but the retry record could not be updated." }, 500);
    return await reply({ asset: updated, status: remaining ? "queued" : "failed", provider_error: remaining ? "The first provider failed; a fallback provider will be retried shortly." : "The available video providers could not finish this clip. Check the saved media error details or try again later.", retrying: remaining, ...(remaining ? { retry_after_seconds: 30 } : {}) });
  }
  const videoRef = events.slice().reverse().map((event) => findVideoRef(event)).find((candidate): candidate is string => Boolean(candidate)) || null;
  if (!videoRef) {
    if (completed) return await markProviderUnavailable("Provider reported completion without a usable video file.", true);
    const hasProgress = events.some((event) => /process_started|process_generating|progress|heartbeat|estimation|queue/i.test(typeof event === "string" ? event : JSON.stringify(event)));
    if (!events.length || !hasProgress) return await markProviderUnavailable("Provider returned no usable progress event or video file.");
    if (Number(metadata.provider_status_failures || 0) > 0) {
      const { data: updated, error: updateError } = await admin.from("media_assets")
        .update({ metadata: { ...metadata, provider_status_failures: 0 } }).eq("id", asset.id).select("*").single();
      if (updateError) return await reply({ error: "Could not reset provider status retry state.", detail: updateError.message }, 500);
      return await reply({ asset: updated || asset, status: "processing", provider_events: events.slice(-2) });
    }
    return await reply({ asset, status: "processing", provider_events: events.slice(-2) });
  }
  const absoluteUrl = resolveTrustedVideoUrl(videoRef, space);
  if (!absoluteUrl) return await markProviderUnavailable("Provider returned a video URL outside its trusted HTTPS host; no credentials were sent.", true);
  let bytes: Uint8Array;
  try {
    const video = await fetch(absoluteUrl, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (!video.ok) return await markProviderUnavailable(`Generated video download returned HTTP ${video.status}.`);
    const declaredLength = Number(video.headers.get("content-length") || 0);
    if (declaredLength > MAX_VIDEO_BYTES) return await markProviderUnavailable("Provider output exceeds the 128 MB clip limit.", true);
    const contentType = video.headers.get("content-type") || "";
    bytes = await readVideoBytes(video, MAX_VIDEO_BYTES);
    if (!isValidMp4(contentType, bytes)) return await markProviderUnavailable("Provider output is not a supported MP4 file.", true);
  } catch (error) {
    return await markProviderUnavailable(error instanceof Error ? error.message : "Generated video download failed.");
  }
  const path = `${auth.user.id}/generated/${asset.id}.mp4`;
  let uploadError: { message: string } | null = null;
  try {
    const upload = await admin.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
    uploadError = upload.error;
  } catch (error) {
    uploadError = { message: error instanceof Error ? error.message : String(error) };
  }
  if (uploadError) {
    const detail = `Private media storage upload failed: ${uploadError.message}`.slice(0, 800);
    const failures = Number(metadata.storage_upload_failures || 0) + 1;
    if (failures < 4) {
      const { data: updated, error: assetUpdateError } = await admin.from("media_assets")
        .update({ metadata: { ...metadata, storage_upload_failures: failures, last_error: detail } })
        .eq("id", asset.id).select("*").single();
      if (assetUpdateError || !updated) return await reply({ error: "Could not save the temporary storage retry state.", detail: assetUpdateError?.message }, 500);
      const retryAt = new Date(Date.now() + 20_000).toISOString();
      const jobUpdate = await admin.from("video_jobs").update({ status: "processing", last_error: detail, next_attempt_at: retryAt }).eq("asset_id", asset.id);
      if (jobUpdate.error) return await reply({ asset: updated, status: "processing", error: "The storage retry was recorded on the asset, but not on the retry row." }, 500);
      return await reply({ asset: updated, status: "processing", provider_error: "Private storage is temporarily unavailable; retrying the saved video in about 20 seconds.", retry_after_seconds: 20 });
    }
    const { data: failedAsset, error: assetUpdateError } = await admin.from("media_assets")
      .update({ status: "failed", provider_job_id: null, metadata: { ...metadata, storage_upload_failures: failures, last_error: detail } })
      .eq("id", asset.id).select("*").single();
    if (assetUpdateError || !failedAsset) return await reply({ error: "Could not save the final storage failure state.", detail: assetUpdateError?.message }, 500);
    const jobUpdate = await admin.from("video_jobs").update({ status: "failed", last_error: detail, next_attempt_at: new Date().toISOString() }).eq("asset_id", asset.id);
    return await reply({ asset: failedAsset, status: "failed", provider_error: "Supabase Storage could not save this rendered video after four retries. Check the media bucket, then submit a new generation job.", ...(jobUpdate.error ? { warning: "The asset is marked failed, but its retry record could not be updated." } : {}) });
  }
  const { data: updated, error: readyError } = await admin.from("media_assets")
    .update({ status: "ready", storage_path: path, mime_type: "video/mp4", metadata: { ...metadata, provider_status_failures: 0, storage_upload_failures: 0, last_error: null, provider_events: events.slice(-2) } })
    .eq("id", asset.id).select("*").single();
  if (readyError || !updated) return await reply({ error: "The video file is saved, but its media record could not be marked ready. Refresh status to retry.", detail: readyError?.message }, 500);
  const jobUpdate = await admin.from("video_jobs").update({ status: "ready", last_error: null, next_attempt_at: new Date().toISOString() }).eq("asset_id", asset.id);
  let signedUrl: string | null = null;
  try {
    const signed = await admin.storage.from("media").createSignedUrl(path, 3600);
    if (!signed.error) signedUrl = signed.data?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }
  return await reply({
    asset: updated,
    status: "ready",
    signed_url: signedUrl,
    ...(jobUpdate.error ? { warning: "The video is ready, but its retry record could not be updated." } : {}),
    ...(!signedUrl ? { provider_error: "The video is saved privately, but a playback link could not be created. Open it again from Cloud media." } : {}),
  });
});
