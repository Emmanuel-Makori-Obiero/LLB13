import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { newestKeySlotsFirst, secretKeyEntries, secretKeys } from "../_shared/keys.ts";
import { reserveAiQuota } from "../_shared/quotas.ts";
import { recordProviderUsage } from "../_shared/usage.ts";

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
type VoiceGender = "male" | "female";
type Turn = { speaker: Speaker; text: string };
type AudioResult = { bytes: Uint8Array; mimeType: string; provider: string; model: string; voices: number; requestUnits: number };

function speechTurns(script: string): Turn[] {
  const turns: Turn[] = [];
  let currentSpeaker: Speaker = "HOST";
  for (const rawLine of script.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || /^(SCENE\s*\d+\b|VISUAL:|SOURCE NOTE:)/i.test(line)) continue;
    const speaker = line.match(/^(HOST|TUTOR|PRESENTER|LEGAL\s+GUIDE|SPEAKER\s*1|SPEAKER\s*2)\s*:\s*(.*)$/i);
    if (speaker) {
      currentSpeaker = /^(TUTOR|LEGAL\s+GUIDE|SPEAKER\s*2)$/i.test(speaker[1].replace(/\s+/g, " ")) ? "TUTOR" : "HOST";
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

function chunkSpeechTurns(turns: Turn[], maxCharacters = 4200): Turn[][] {
  const chunks: Turn[][] = [];
  let current: Turn[] = [];
  let length = 0;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    length = 0;
  };
  const append = (speaker: Speaker, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (length + clean.length + (current.length ? 1 : 0) > maxCharacters) flush();
    const previous = current.at(-1);
    if (previous?.speaker === speaker) previous.text += ` ${clean}`;
    else current.push({ speaker, text: clean });
    length += clean.length + 1;
  };

  for (const turn of turns) {
    const sentences = turn.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [turn.text];
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (clean.length <= maxCharacters) {
        append(turn.speaker, clean);
        continue;
      }
      for (const word of clean.split(/\s+/)) append(turn.speaker, word);
    }
  }
  flush();
  return chunks;
}

function stripMp3Metadata(bytes: Uint8Array): Uint8Array {
  let start = 0;
  if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === "ID3") {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    start = Math.min(bytes.length, 10 + size + ((bytes[5] & 0x10) ? 10 : 0));
  }
  let end = bytes.length;
  if (end >= 128 && String.fromCharCode(...bytes.slice(end - 128, end - 125)) === "TAG") end -= 128;
  return bytes.slice(start, end);
}

async function generateElevenLabsAudio(
  text: string,
  keys: string[],
  language: "en" | "sw",
  model: string,
  hostVoiceId: string,
  tutorVoiceId: string,
  hostGender: VoiceGender,
  tutorGender: VoiceGender,
): Promise<AudioResult> {
  const turns = speechTurns(text);
  if (!turns.length) throw new Error("The script contains no speakable text.");
  const chunks = chunkSpeechTurns(turns);
  const outputs = new Array<Uint8Array>(chunks.length);
  let nextChunk = 0;
  const worker = async () => {
    while (true) {
      const index = nextChunk++;
      if (index >= chunks.length) return;
      const chunk = chunks[index];
    const body = {
      model_id: model,
      language_code: language,
      apply_text_normalization: "auto",
      inputs: chunk.map((turn) => ({
        text: turn.text,
        voice_id: (turn.speaker === "TUTOR" ? tutorGender : hostGender) === "female"
          ? Deno.env.get("ELEVENLABS_FEMALE_VOICE_ID") || hostVoiceId
          : Deno.env.get("ELEVENLABS_MALE_VOICE_ID") || tutorVoiceId,
      })),
    };
    let generated: Response | null = null;
    const failures: string[] = [];
    // Spread chunks across configured keys first, then fall through to the
    // remaining keys. One exhausted account should not block a long episode.
    const orderedKeys = keys.map((_, offset) => keys[(index + offset) % keys.length]);
    for (const key of orderedKeys) {
      try {
        generated = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128", {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(35_000),
        });
        if (generated.ok) break;
        const detail = (await generated.text()).slice(0, 500);
        const quotaMessage = /quota_exceeded|quota exceeded|credits remaining/i.test(detail)
          ? "quota exhausted for this key; trying the next configured ElevenLabs key"
          : detail;
        failures.push(`ElevenLabs ${generated.status}: ${quotaMessage}`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!generated?.ok) throw new Error(failures.slice(-2).join("; ") || "ElevenLabs did not return audio.");
    const contentType = generated.headers.get("content-type") || "audio/mpeg";
    const bytes = new Uint8Array(await generated.arrayBuffer());
    if (!contentType.toLowerCase().includes("audio") || bytes.length < 100) {
      throw new Error("ElevenLabs returned an empty or non-audio response.");
    }
      outputs[index] = bytes;
    }
  };
  // Four concurrent ordered chunks keep long narration inside the Edge runtime
  // while preserving the original script order in the final MP3.
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, () => worker()));
  if (outputs.length === 1) {
    return { bytes: outputs[0], mimeType: "audio/mpeg", provider: "elevenlabs", model, requestUnits: chunks.length, voices: new Set(turns.map((turn) => turn.speaker)).size };
  }
  const frames = outputs.map(stripMp3Metadata);
  const total = frames.reduce((sum, bytes) => sum + bytes.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of frames) { combined.set(part, offset); offset += part.length; }
  return { bytes: combined, mimeType: "audio/mpeg", provider: "elevenlabs-chunked", model, requestUnits: chunks.length, voices: new Set(turns.map((turn) => turn.speaker)).size };
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

function wavPayload(bytes: Uint8Array): Uint8Array {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) === "data") return bytes.slice(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  return bytes.slice(44);
}

function combineWav(parts: Uint8Array[]): Uint8Array {
  const payloads = parts.map(wavPayload);
  const payloadLength = payloads.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(44 + payloadLength);
  output.set(parts[0].slice(0, 44), 0);
  let offset = 44;
  for (const payload of payloads) { output.set(payload, offset); offset += payload.length; }
  const view = new DataView(output.buffer);
  view.setUint32(4, output.length - 8, true);
  view.setUint32(40, payloadLength, true);
  return output;
}

async function generateGeminiAudio(text: string, keys: string[], model: string, hostGender: VoiceGender, tutorGender: VoiceGender): Promise<AudioResult> {
  const turns = speechTurns(text);
  if (!turns.length) throw new Error("The podcast script contains no speakable text.");
  // Gemini returns uncompressed WAV. Keep each response small so the JSON,
  // base64 string, decoded bytes, and accumulated output stay below the Edge
  // Function memory limit during long learning episodes.
  const chunks = chunkSpeechTurns(turns, 1000);
  const outputs: Uint8Array[] = [];
  for (const chunk of chunks) {
  const multiSpeaker = chunk.some((turn) => turn.speaker === "TUTOR");
  const content = chunk.map((turn) => ({
    type: "text",
    text: turn.text,
    ...(multiSpeaker ? {
      annotations: [{
        type: "speech_metadata",
        speaker: turn.speaker,
        style: turn.speaker === "HOST" ? "Warm, clear, conversational class presenter." : "Thoughtful, clear law tutor; measured and friendly.",
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
        ? { speakers: [{ speaker: "HOST", voice: hostGender === "female" ? "Kore" : "Puck" }, { speaker: "TUTOR", voice: tutorGender === "female" ? "Kore" : "Puck" }] }
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
        signal: AbortSignal.timeout(60_000),
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
      outputs.push(bytes);
      break;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  }
  if (outputs.length !== chunks.length) throw new Error(failures.slice(-3).join("; ") || "Gemini TTS did not return audio.");
  return { bytes: outputs.length === 1 ? outputs[0] : combineWav(outputs), mimeType: "audio/wav", provider: chunks.length === 1 ? "gemini-tts" : "gemini-tts-chunked", model, requestUnits: chunks.length, voices: new Set(turns.map((turn) => turn.speaker)).size };
}

async function generateOpenAIAudio(
  text: string,
  keys: string[],
  model: string,
  hostVoice: string,
  tutorVoice: string,
  hostGender: VoiceGender,
  tutorGender: VoiceGender,
): Promise<AudioResult> {
  const turns = speechTurns(text);
  if (!turns.length) throw new Error("The podcast script contains no speakable text.");
  const chunks = turns.flatMap((turn) => chunkSpeechTurns([turn], 3500).flat());
  const outputs: Uint8Array[] = [];
  const failures: string[] = [];

  for (const chunk of chunks) {
    let generated: Response | null = null;
    const turnFailures: string[] = [];
    for (const key of keys) {
      try {
        generated = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            model,
            input: chunk.text,
            voice: (chunk.speaker === "TUTOR" ? tutorGender : hostGender) === "female" ? hostVoice : tutorVoice,
            response_format: "mp3",
            instructions: chunk.speaker === "TUTOR"
              ? "Speak as a thoughtful, clear Kenyan law tutor: natural, warm, precise, and conversational."
              : "Speak as a warm, clear podcast host using natural Kenyan English, with an engaging conversational pace.",
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (generated.ok) break;
        turnFailures.push(`OpenAI TTS ${generated.status}: ${(await generated.text()).slice(0, 500)}`);
      } catch (error) {
        turnFailures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!generated?.ok) {
      failures.push(turnFailures.slice(-2).join("; ") || "OpenAI TTS did not return audio.");
      throw new Error(failures.slice(-3).join("; "));
    }
    const contentType = generated.headers.get("content-type") || "audio/mpeg";
    const bytes = new Uint8Array(await generated.arrayBuffer());
    if (!contentType.toLowerCase().includes("audio") || bytes.length < 100) {
      throw new Error("OpenAI TTS returned an empty or non-audio response.");
    }
    outputs.push(stripMp3Metadata(bytes));
  }

  const total = outputs.reduce((sum, bytes) => sum + bytes.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of outputs) { combined.set(part, offset); offset += part.length; }
  return { bytes: combined, mimeType: "audio/mpeg", provider: "openai-tts", model, requestUnits: chunks.length, voices: new Set(turns.map((turn) => turn.speaker)).size };
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
        signal: AbortSignal.timeout(60_000),
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
  return { bytes, mimeType, provider: "huggingface-tts", model, requestUnits: attempts, voices: 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hfTokens = secretKeys("HF_TOKEN");
  const geminiKeys = secretKeys("GEMINI_API_KEY");
  // Prefer the newest numbered account first, so ELEVENLABS_API_KEY_2 is used
  // before key 1 when configured; older keys remain automatic fallback.
  const elevenLabsKeys = newestKeySlotsFirst(secretKeyEntries("ELEVENLABS_API_KEY")).map((entry) => entry.value);
  const openAIKeys = secretKeys("OPENAI_API_KEY");
  const geminiEnabled = Deno.env.get("GEMINI_TTS_ENABLED")?.toLowerCase() !== "false";
  const openAIEnabled = Deno.env.get("OPENAI_TTS_ENABLED")?.toLowerCase() !== "false";
  const hfFallbackEnabled = Deno.env.get("HF_TTS_FALLBACK_ENABLED")?.toLowerCase() === "true";
  if (!url || !anon || !service) return json({ error: "Audio generation is missing Supabase server configuration." }, 503);
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before creating audio." }, 401);
  const { data: isAdmin } = await userClient.rpc("is_super_admin");
  const adminMayUsePremiumVoice = isAdmin === true;
  const admin = createClient(url, service);

  let body: { text?: string; title?: string; language?: "en" | "sw" | "mix" | "sheng"; presenter_gender?: VoiceGender; guide_gender?: VoiceGender };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const text = String(body.text || "").trim();
  const language: "en" | "sw" | "mix" | "sheng" = body.language === "sw" ? "sw" : body.language === "mix" ? "mix" : body.language === "sheng" ? "sheng" : "en";
  const hostGender: VoiceGender = body.presenter_gender === "female" ? "female" : "male";
  const tutorGender: VoiceGender = body.guide_gender === "male" ? "male" : "female";
  const providerLanguage: "en" | "sw" = language === "sw" ? "sw" : "en";
  if (text.length < 20) return json({ error: "The lesson or podcast script is too short." }, 400);
  if (text.length > 100000) return json({ error: "This script is over the supported limit of about 70 minutes. Shorten it or generate it as separate episodes." }, 400);
  const turns = speechTurns(text);
  const plainText = turns.map((turn) => turn.text).join("\n");
  // Administrators may use the configured ElevenLabs account without the
  // platform's hourly podcast quota. ElevenLabs' own account limits, billing,
  // and API-key restrictions still apply, and every request remains logged.
  const adminElevenLabsBypass = adminMayUsePremiumVoice && elevenLabsKeys.length > 0;
  if (!adminElevenLabsBypass) {
    try {
      const quota = await reserveAiQuota(admin, auth.user.id, "podcast");
      if (!quota.allowed) return json({ error: `Hourly podcast limit reached (${quota.quota}). Try again later.`, retry_after_seconds: quota.retry_after_seconds }, 429);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "AI quota service is unavailable." }, 503);
    }
  }
  if (!(adminMayUsePremiumVoice && elevenLabsKeys.length) && !(geminiEnabled && geminiKeys.length) && (adminMayUsePremiumVoice && providerLanguage === "en" && openAIEnabled && openAIKeys.length) === false && !(providerLanguage === "en" && hfFallbackEnabled && hfTokens.length)) {
    return json({ error: language === "sw" ? "Kiswahili audio needs ELEVENLABS_API_KEY_1 or GEMINI_API_KEY_1 in Supabase Edge Function secrets." : "No speech provider is configured. Add an ElevenLabs or Gemini API key; OpenAI TTS is also available when OPENAI_API_KEY_1 is configured." }, 503);
  }
  const hfModel = Deno.env.get("HF_TTS_MODEL") || "facebook/mms-tts-eng";
  const hfEndpoint = Deno.env.get("HF_TTS_URL") || `https://router.huggingface.co/hf-inference/models/${hfModel}`;
  const geminiModel = Deno.env.get("GEMINI_TTS_MODEL") || "gemini-3.8-flash-tts";
  const elevenLabsModel = Deno.env.get("ELEVENLABS_DIALOGUE_MODEL") || "eleven_v3";
  const openAIModel = Deno.env.get("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts";
  const openAIHostVoice = Deno.env.get("OPENAI_TTS_HOST_VOICE") || "coral";
  const openAITutorVoice = Deno.env.get("OPENAI_TTS_TUTOR_VOICE") || "onyx";
  const hostVoiceId = Deno.env.get("ELEVENLABS_HOST_VOICE_ID") || "Xb7hH8MSUJpSbSDYk0k2";
  const tutorVoiceId = Deno.env.get("ELEVENLABS_TUTOR_VOICE_ID") || "onwK4e9ZLuTAKqWW03F9";
  const failures: string[] = [];
  let audio: AudioResult | null = null;

  if (adminMayUsePremiumVoice && elevenLabsKeys.length) {
    try { audio = await generateElevenLabsAudio(text, elevenLabsKeys, providerLanguage, elevenLabsModel, hostVoiceId, tutorVoiceId, hostGender, tutorGender); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio && geminiEnabled && geminiKeys.length) {
    try { audio = await generateGeminiAudio(text, geminiKeys, geminiModel, hostGender, tutorGender); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio && adminMayUsePremiumVoice && providerLanguage === "en" && openAIEnabled && openAIKeys.length) {
    try { audio = await generateOpenAIAudio(text, openAIKeys, openAIModel, openAIHostVoice, openAITutorVoice, hostGender, tutorGender); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio && providerLanguage === "en" && hfFallbackEnabled && hfTokens.length) {
    try { audio = await generateHuggingFaceAudio(plainText, hfTokens, hfModel, hfEndpoint); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!audio) {
    await admin.from("platform_activity_events").insert({ user_id: auth.user.id, event_type: "podcast_audio_failed", details: {} });
    const configuredProvider = (adminMayUsePremiumVoice && elevenLabsKeys.length) || (geminiEnabled && geminiKeys.length) || (adminMayUsePremiumVoice && openAIEnabled && openAIKeys.length) || (hfFallbackEnabled && hfTokens.length);
    return json({ error: "No configured speech provider completed this request.", detail: failures.join("; ") || "Check the configured provider keys, model IDs, and voice IDs in Supabase Edge Function secrets." }, configuredProvider ? 502 : 503);
  }

  const extension = audio.mimeType === "audio/ogg" ? "ogg" : audio.mimeType === "audio/mpeg" ? "mp3" : "wav";
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
    metadata: { model: audio.model, characters: text.length, voices: audio.voices, language },
  }).select("id,title,kind,storage_path,mime_type,status,provider,created_at").single();
  if (error) {
    await admin.storage.from("media").remove([storagePath]);
    return json({ error: `Could not record generated audio: ${error.message}` }, 500);
  }
  // Telemetry is non-critical and must never turn a successful file into a 500.
  try { await admin.from("platform_activity_events").insert({ user_id: auth.user.id, event_type: "podcast_audio_generated", details: { provider: audio.provider } }); } catch { /* non-blocking */ }
  try { await recordProviderUsage(admin, {
    userId: auth.user.id, category: "podcast", provider: audio.provider, model: audio.model,
    requestUnits: audio.requestUnits, inputUnits: text.length, unitLabel: "characters",
    details: { language, voices: audio.voices },
  }); } catch { /* non-blocking */ }
  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  if (signed.error || !signed.data?.signedUrl) return json({ error: `Audio was generated but could not be opened: ${signed.error?.message || "signed URL unavailable"}` }, 500);
  return json({ asset, signed_url: signed.data.signedUrl, mime_type: audio.mimeType });
});
