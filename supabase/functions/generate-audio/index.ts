import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretKeys } from "../_shared/keys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Speaker = "HOST" | "TUTOR";
type Turn = { speaker: Speaker; text: string };
type AudioResult = { bytes: Uint8Array; mimeType: string; provider: string; model: string; voices: number };

function speechTurns(script: string): Turn[] {
  const turns: Turn[] = [];
  let currentSpeaker: Speaker = "HOST";
  for (const rawLine of script.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || /^(SCENE\s*\d+\b|VISUAL:|SOURCE NOTE:)/i.test(line)) continue;
    const speaker = line.match(/^(HOST|TUTOR|SPEAKER\s*1|SPEAKER\s*2)\s*:\s*(.*)$/i);
    if (speaker) {
      currentSpeaker = /^(TUTOR|SPEAKER\s*2)$/i.test(speaker[1].replace(/\s+/g, " ")) ? "TUTOR" : "HOST";
      line = speaker[2];
    }
    line = line
      .replace(/^NARRATION\s*:\s*/i, "")
      .replace(/^\s*[-*#>]+\s*/, "")
      .replace(/\bVISUAL:.*$/i, "")
      .replace(/\bSOURCE NOTE:.*$/i, "")
      .replace(/[#*_`>\[\]]/g, "")
      .replace(/\(verify\)/gi, "verify")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const previous = turns.at(-1);
    if (previous?.speaker === currentSpeaker) previous.text += ` ${line}`;
    else turns.push({ speaker: currentSpeaker, text: line });
  }
  return turns;
}

function extractAudioBase64(value: unknown, inAudioBlock = false): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAudioBase64(item, inAudioBlock);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = `${String(record.type ?? "")} ${String(record.mime_type ?? record.mimeType ?? "")}`.toLowerCase();
  const audioBlock = inAudioBlock || type.includes("audio") || "output_audio" in record;
  if (typeof record.data === "string" && audioBlock) return record.data;
  for (const [key, child] of Object.entries(record)) {
    const found = extractAudioBase64(child, audioBlock || key.toLowerCase().includes("audio"));
    if (found) return found;
  }
  return null;
}

function decodeBase64(encoded: string): Uint8Array {
  const clean = encoded.replace(/^data:audio\/[^;]+;base64,/i, "").replace(/\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function generateGeminiAudio(text: string, keys: string[], model: string): Promise<AudioResult> {
  const turns = speechTurns(text);
  if (!turns.length) throw new Error("The podcast script contains no speakable text.");
  const multiSpeaker = turns.some((turn) => turn.speaker === "TUTOR");
  const content = turns.map((turn) => ({
    type: "text",
    text: turn.text,
    ...(multiSpeaker ? {
      annotations: [{
        type: "speech_metadata",
        speaker: turn.speaker,
        style: turn.speaker === "HOST" ? "Warm, clear, conversational podcast host." : "Thoughtful, clear law tutor; measured and friendly.",
      }],
    } : {}),
  }));
  const body = {
    model,
    store: false,
    input: [{ type: "user_input", content }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: multiSpeaker
        ? { mode: "conversational", speakers: [{ speaker: "HOST", voice: "Puck" }, { speaker: "TUTOR", voice: "Kore" }] }
        : [{ voice: "Kore" }],
    },
  };
  const failures: string[] = [];
  for (const key of keys) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const raw = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { payload = raw; }
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "error" in payload
          ? String(((payload as { error?: { message?: unknown } }).error?.message) ?? "")
          : typeof payload === "string" ? payload.slice(0, 500) : "Provider returned an error.";
        failures.push(`Gemini TTS ${response.status}: ${detail}`);
        continue;
      }
      const encoded = extractAudioBase64(payload);
      if (!encoded) throw new Error("Gemini returned no audio data.");
      const bytes = decodeBase64(encoded);
      if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WAVE") {
        throw new Error("Gemini returned audio without a valid WAV header.");
      }
      return { bytes, mimeType: "audio/wav", provider: "gemini-tts", model, voices: multiSpeaker ? 2 : 1 };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(failures.slice(-3).join("; ") || "Gemini TTS did not return audio.");
}

async function generateHuggingFaceAudio(text: string, tokens: string[], model: string, endpoint: string): Promise<AudioResult> {
  let generated: Response | null = null;
  let lastDetail = "";
  const attempts = Math.min(3, tokens.length);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const token = tokens[(attempt - 1) % tokens.length];
    try {
      generated = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "audio/wav, audio/*, application/json" },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (generated.ok) break;
      lastDetail = (await generated.text()).slice(0, 1200);
      if (![429, 500, 502, 503, 504].includes(generated.status) || attempt === attempts) break;
      const retryAfter = Number(generated.headers.get("retry-after")) || 8;
      await sleep(Math.min(20_000, Math.max(2_000, retryAfter * 1000)));
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await sleep(3_000 * attempt);
    }
  }
  if (!generated?.ok) throw new Error(`Hugging Face TTS failed (${generated?.status || "network"}): ${lastDetail}`);
  const contentType = generated.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await generated.arrayBuffer());
  const looksLikeWav = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  const looksLikeOgg = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (!contentType.startsWith("audio/") && !contentType.includes("octet-stream") && !looksLikeWav && !looksLikeOgg) {
    throw new Error(`Hugging Face returned a non-audio response: ${new TextDecoder().decode(bytes).slice(0, 500)}`);
  }
  const mimeType = looksLikeOgg || contentType.includes("ogg") ? "audio/ogg" : "audio/wav";
  return { bytes, mimeType, provider: "huggingface-tts", model, voices: 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hfTokens = secretKeys("HF_TOKEN");
  const geminiKeys = secretKeys("GEMINI_API_KEY");
  const geminiEnabled = Deno.env.get("GEMINI_TTS_ENABLED")?.toLowerCase() === "true";
  if (!url || !anon || !service) return json({ error: "Audio generation is missing Supabase server configuration." }, 503);
  if (!hfTokens.length && !(geminiEnabled && geminiKeys.length)) {
    return json({ error: "Audio provider not configured. Set HF_TOKEN_1, or set GEMINI_TTS_ENABLED=true and configure GEMINI_API_KEY_1 in Supabase secrets." }, 503);
  }
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before creating audio." }, 401);

  let body: { text?: string; title?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const text = String(body.text || "").trim();
  if (text.length < 20) return json({ error: "The lesson or podcast script is too short." }, 400);
  if (text.length > 12000) return json({ error: "This script is too long for one audio request. Shorten the episode or generate it in parts." }, 400);
  const turns = speechTurns(text);
  const plainText = turns.map((turn) => turn.text).join("\n");
  const hfModel = Deno.env.get("HF_TTS_MODEL") || "facebook/mms-tts-eng";
  const hfEndpoint = Deno.env.get("HF_TTS_URL") || `https://router.huggingface.co/hf-inference/models/${hfModel}`;
  const geminiModel = Deno.env.get("GEMINI_TTS_MODEL") || "gemini-3.8-flash-tts";
  const failures: string[] = [];
  let audio: AudioResult | null = null;

  if (geminiEnabled && geminiKeys.length) {
    try { audio = await generateGeminiAudio(text, geminiKeys, geminiModel); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio && hfTokens.length) {
    try { audio = await generateHuggingFaceAudio(plainText, hfTokens, hfModel, hfEndpoint); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio) {
    const status = geminiEnabled && geminiKeys.length && !hfTokens.length ? 502 : 503;
    return json({ error: "No configured audio provider completed this request.", detail: failures.join("; ") || "Enable Gemini TTS or configure an HF token." }, status);
  }

  const extension = audio.mimeType === "audio/ogg" ? "ogg" : "wav";
  const admin = createClient(url, service);
  const assetId = crypto.randomUUID();
  const storagePath = `${auth.user.id}/generated/${assetId}.${extension}`;
  const upload = await admin.storage.from("media").upload(storagePath, audio.bytes, { contentType: audio.mimeType, upsert: false });
  if (upload.error) return json({ error: `Could not store generated audio: ${upload.error.message}` }, 500);
  const { data: asset, error } = await admin.from("media_assets").insert({
    id: assetId,
    owner_id: auth.user.id,
    title: String(body.title || "Podcast episode").slice(0, 90),
    kind: "podcast_audio",
    storage_path: storagePath,
    mime_type: audio.mimeType,
    status: "ready",
    provider: audio.provider,
    metadata: { model: audio.model, characters: text.length, voices: audio.voices },
  }).select("id,title,kind,storage_path,mime_type,status,provider,created_at").single();
  if (error) {
    await admin.storage.from("media").remove([storagePath]);
    return json({ error: `Could not record generated audio: ${error.message}` }, 500);
  }
  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  return json({ asset, signed_url: signed.data?.signedUrl ?? null, mime_type: audio.mimeType });
});
