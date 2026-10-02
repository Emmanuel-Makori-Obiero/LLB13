import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("HF_TOKEN");
  if (!url || !anon || !service || !token) return json({ error: "Audio generation is not configured on the server." }, 503);
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before creating audio." }, 401);

  let body: { text?: string; title?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const text = String(body.text || "").trim();
  if (text.length < 20) return json({ error: "The lesson or podcast script is too short." }, 400);
  if (text.length > 12000) return json({ error: "This script is too long for one free audio request. Shorten the episode or generate it in parts." }, 400);

  const model = Deno.env.get("HF_TTS_MODEL") || "facebook/mms-tts-eng";
  const endpoint = Deno.env.get("HF_TTS_URL") || `https://router.huggingface.co/hf-inference/models/${model}`;
  let generated: Response | null = null;
  let lastDetail = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      generated = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "audio/wav, audio/*, application/json" },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (generated.ok) break;
      lastDetail = (await generated.text()).slice(0, 1200);
      if (![429, 500, 502, 503, 504].includes(generated.status) || attempt === 3) break;
      const retryAfter = Number(generated.headers.get("retry-after")) || 8;
      await sleep(Math.min(20_000, Math.max(2_000, retryAfter * 1000)));
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await sleep(3_000 * attempt);
    }
  }
  if (!generated?.ok) return json({ error: `Hugging Face audio generation failed after retries (${generated?.status || "network"}).`, detail: lastDetail }, 502);

  const contentType = generated.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await generated.arrayBuffer());
  const looksLikeWav = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  const looksLikeOgg = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (!contentType.startsWith("audio/") && !contentType.includes("octet-stream") && !looksLikeWav && !looksLikeOgg) {
    return json({ error: "Hugging Face returned a non-audio response.", detail: new TextDecoder().decode(bytes).slice(0, 1200) }, 502);
  }
  const mimeType = looksLikeOgg || contentType.includes("ogg") ? "audio/ogg" : "audio/wav";
  const extension = mimeType === "audio/ogg" ? "ogg" : "wav";
  const admin = createClient(url, service);
  const assetId = crypto.randomUUID();
  const storagePath = `${auth.user.id}/generated/${assetId}.${extension}`;
  const upload = await admin.storage.from("media").upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (upload.error) return json({ error: `Could not store generated audio: ${upload.error.message}` }, 500);
  const { data: asset, error } = await admin.from("media_assets").insert({
    id: assetId,
    owner_id: auth.user.id,
    title: String(body.title || "Podcast episode").slice(0, 90),
    kind: "podcast_audio",
    storage_path: storagePath,
    mime_type: mimeType,
    status: "ready",
    provider: "huggingface-tts",
    metadata: { model, characters: text.length, voices: 1, retried: true },
  }).select("id,title,kind,storage_path,mime_type,status,provider,created_at").single();
  if (error) {
    await admin.storage.from("media").remove([storagePath]);
    return json({ error: `Could not record generated audio: ${error.message}` }, 500);
  }
  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  return json({ asset, signed_url: signed.data?.signedUrl ?? null, mime_type: mimeType });
});
