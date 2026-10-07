// Supabase Edge Function: transcribes ONE audio chunk (up to ~25 MB) with Groq's free Whisper API.
// The browser splits long recordings into 10-minute chunks and calls this once per chunk.
//
// Secrets needed:  supabase secrets set GROQ_API_KEY=gsk_...
// Deploy:          supabase functions deploy transcribe
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extra },
  });

const MODEL = "whisper-large-v3-turbo";
// Groq free plan: 7,200 audio seconds/hour and 28,800/day for the whole organisation.
// Stay a little under so one request never tips the group over the line.
const HOUR_LIMIT = 7000;
const DAY_LIMIT = 28000;
const MAX_BYTES = 24 * 1024 * 1024;
// Groq/Whisper rejects prompts longer than 896 characters. Keep this seed short;
// the continuation is useful for stitched recordings but must fit the provider
// limit together with the language instruction.
const LAW_PROMPT =
  "Kenyan university law lecture. Preserve names, legal terms, Kiswahili, Sheng and code-switching exactly. Common terms: statute, tort, mens rea, actus reus, locus standi, obiter dicta, ratio decidendi, Constitution of Kenya, High Court, Court of Appeal, Supreme Court.";
const WHISPER_PROMPT_LIMIT = 896;

type UsageRow = { seconds: number; created_at: string };

async function correctWrittenTranscript(
  raw: string,
  groqKey: string,
  mixedLanguage: boolean,
): Promise<string> {
  if (!raw.trim()) return raw;
  if (raw.length > 24000) return raw;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: mixedLanguage
            ? "Correct only obvious spelling and punctuation errors in this Kenyan English, Kiswahili and Sheng transcript. Preserve meaning, sentence order, names, legal terminology, code-switching and Sheng. Do not translate, summarise, add, remove or rewrite. Return only the corrected transcript."
            : "Correct only obvious spelling and punctuation errors in this Kenyan lecture transcript. Preserve meaning, sentence order, names and legal terminology. Do not translate, summarise, add, remove or rewrite. Return only the corrected transcript.",
        },
        { role: "user", content: raw },
      ],
    }),
  });
  if (!response.ok) throw new Error("correction provider unavailable");
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const corrected = data.choices?.[0]?.message?.content?.trim() ?? "";
  return corrected || raw;
}

// Seconds to wait until `add` more seconds fit inside `limit` for the rolling window.
function waitSeconds(
  rows: UsageRow[],
  limit: number,
  windowMs: number,
  add: number,
  now: number,
) {
  const inWindow = rows.filter(
    (row) => now - Date.parse(row.created_at) < windowMs,
  );
  const total = inWindow.reduce((sum, row) => sum + row.seconds, 0);
  if (total + add <= limit) return 0;
  let need = total + add - limit;
  for (const row of inWindow) {
    need -= row.seconds;
    if (need <= 0)
      return (
        Math.ceil((Date.parse(row.created_at) + windowMs - now) / 1000) + 5
      );
  }
  return Math.ceil(windowMs / 1000);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return json({ error: "POST an audio file." }, 405);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey)
    return json(
      { error: "GROQ_API_KEY is not configured on the server." },
      503,
    );

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: request.headers.get("Authorization") ?? "" },
    },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Please sign in to transcribe audio." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File))
    return json({ error: "The request must include an audio file." }, 400);
  if (audio.size > MAX_BYTES)
    return json(
      {
        error:
          "This chunk is larger than 24 MB. Use the Transcribe page, which splits long audio for you.",
      },
      413,
    );

  const requestedLanguage = String(form.get("language") ?? "")
    .trim()
    .toLowerCase();
  const mixedLanguage =
    requestedLanguage === "en-sw" ||
    requestedLanguage === "sw-en" ||
    requestedLanguage === "sw-sheng" ||
    requestedLanguage === "auto";
  const rawLanguage = requestedLanguage.split("-")[0];
  const language =
    !mixedLanguage && /^[a-z]{2}$/.test(rawLanguage) && rawLanguage !== "auto"
      ? rawLanguage
      : "";
  const transcriptId = String(form.get("transcript_id") ?? "");
  const idx = Number(form.get("idx") ?? 0);
  const offset = Number(form.get("offset") ?? 0) || 0;
  const continuation = String(form.get("continuation") ?? "").trim().slice(-1800);
  // 16 kB/s is the 128 kbps worst case, only used when the client does not send a duration.
  const estimate = Math.max(
    10,
    Math.ceil(Number(form.get("duration")) || audio.size / 16000),
  );

  if (transcriptId) {
    const { data: owned } = await admin
      .from("transcripts")
      .select("id")
      .eq("id", transcriptId)
      .eq("created_by", user.id)
      .maybeSingle();
    if (!owned)
      return json({ error: "That transcript does not belong to you." }, 403);
  }

  // Shared quota check (whole group, rolling windows).
  const now = Date.now();
  const { data: usage } = await admin
    .from("transcription_usage")
    .select("seconds,created_at")
    .gte("created_at", new Date(now - 86_400_000).toISOString())
    .order("created_at");
  const rows = (usage ?? []) as UsageRow[];
  const hourWait = waitSeconds(rows, HOUR_LIMIT, 3_600_000, estimate, now);
  const dayWait = waitSeconds(rows, DAY_LIMIT, 86_400_000, estimate, now);
  const wait = Math.max(hourWait, dayWait);
  if (wait > 0)
    return json(
      {
        error: "quota",
        scope: dayWait > hourWait ? "day" : "hour",
        retry_after: wait,
      },
      429,
      { "Retry-After": String(wait) },
    );

  const { data: reserved } = await admin
    .from("transcription_usage")
    .insert({ user_id: user.id, seconds: estimate })
    .select("id")
    .single();

  const body = new FormData();
  body.append("file", audio, audio.name || "chunk.mp3");
  body.append("model", MODEL);
  body.append("response_format", "verbose_json");
  body.append("temperature", "0");
  if (language) body.append("language", language);
  const languagePrompt = mixedLanguage
    ? requestedLanguage === "sw-sheng"
      ? "Transcribe Kenyan English, Kiswahili and Sheng. Correct obvious spelling errors in the written transcript, but preserve code-switching, names, legal terms and Sheng expressions; do not translate, standardise or replace Sheng with English."
      : "Transcribe Kenyan English and Kiswahili. Correct obvious spelling errors in the written transcript, but preserve code-switching, names and legal terms; do not translate Kiswahili into English or English into Kiswahili."
    : language === "sw"
    ? "Transcribe Kenyan Kiswahili accurately. Correct obvious spelling errors in the written transcript, but preserve Kiswahili wording, names, legal terms, code-switching and Sheng expressions; do not translate into English."
    : "Transcribe Kenyan English accurately and correct obvious spelling errors in the written transcript, while preserving names and legal terminology.";
  const seed = `${LAW_PROMPT} ${languagePrompt}`;
  const continuationLabel = " Continue naturally. Recent transcript context: ";
  const continuationBudget = Math.max(
    0,
    WHISPER_PROMPT_LIMIT - seed.length - continuationLabel.length,
  );
  const prompt = continuation
    ? `${seed}${continuationLabel}${continuation.slice(-continuationBudget)}`
    : seed;
  body.append("prompt", prompt.slice(0, WHISPER_PROMPT_LIMIT));

  const result = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body,
    },
  );
  if (!result.ok) {
    if (reserved)
      await admin.from("transcription_usage").delete().eq("id", reserved.id);
    if (result.status === 429) {
      const retry = Number(result.headers.get("retry-after")) || 120;
      return json(
        { error: "quota", scope: "provider", retry_after: retry },
        429,
        { "Retry-After": String(retry) },
      );
    }
    return json(
      {
        error: `Transcription provider error: ${(await result.text()).slice(0, 400)}`,
      },
      502,
    );
  }

  const data = (await result.json()) as {
    text?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string }[];
  };
  if (reserved && data.duration)
    await admin
      .from("transcription_usage")
      .update({ seconds: Math.ceil(data.duration) })
      .eq("id", reserved.id);
  const originalText = (data.text ?? "").trim();
  let text = originalText;
  try {
    text = await correctWrittenTranscript(originalText, groqKey, mixedLanguage);
  } catch {
    // Transcription must still succeed when the optional correction call is out
    // of quota or unavailable; the raw provider text remains downloadable.
    text = originalText;
  }
  const segments = (data.segments ?? []).map((segment) => ({
    start: Number((segment.start + offset).toFixed(2)),
    end: Number((segment.end + offset).toFixed(2)),
    text: segment.text.trim(),
  }));

  if (transcriptId) {
    const { error } = await admin.from("transcript_chunks").upsert({
      transcript_id: transcriptId,
      idx,
      start_seconds: offset,
      text,
      original_text: originalText,
      segments,
    });
    if (error)
      return json(
        { error: `Transcribed but could not save: ${error.message}` },
        500,
      );
  }
  return json({
    text,
    segments,
    duration: data.duration ?? estimate,
    saved: !!transcriptId,
  });
});
