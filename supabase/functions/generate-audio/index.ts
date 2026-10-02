import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
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
  if (text.length < 20) return json({ error: "The podcast script is too short." }, 400);
  if (text.length > 12000) return json({ error: "This script is too long for one free audio request. Generate a shorter episode." }, 400);

  const model = Deno.env.get("HF_TTS_MODEL") || "facebook/mms-tts-eng";
  const endpoint = Deno.env.get("HF_TTS_URL") || `https://router.huggingface.co/hf-inference/models/${model}`;
  const generated = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "audio/wav, application/json" },
    body: JSON.stringify({ inputs: text }),
  });
  if (!generated.ok) return json({ error: `Hugging Face audio generation failed (${generated.status}).`, detail: (await generated.text()).slice(0, 1200) }, 502);
  const contentType = generated.headers.get("content-type") || "audio/wav";
  if (!contentType.startsWith("audio/")) return json({ error: "Hugging Face returned a non-audio response.", detail: (await generated.text()).slice(0, 1200) }, 502);
  const bytes = new Uint8Array(await generated.arrayBuffer());
  const admin = createClient(url, service);
  const assetId = crypto.randomUUID();
  const storagePath = `${auth.user.id}/generated/${assetId}.wav`;
  const upload = await admin.storage.from("media").upload(storagePath, bytes, { contentType: "audio/wav", upsert: false });
  if (upload.error) return json({ error: `Could not store generated audio: ${upload.error.message}` }, 500);
  const { data: asset, error } = await admin.from("media_assets").insert({
    id: assetId,
    owner_id: auth.user.id,
    title: String(body.title || "Podcast episode").slice(0, 90),
    kind: "podcast_audio",
    storage_path: storagePath,
    mime_type: "audio/wav",
    status: "ready",
    provider: "huggingface-tts",
    metadata: { model, characters: text.length, voices: 1 },
  }).select("id,title,kind,storage_path,mime_type,status,provider,created_at").single();
  if (error) return json({ error: `Could not record generated audio: ${error.message}` }, 500);
  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  return json({ asset, signed_url: signed.data?.signedUrl ?? null });
});
