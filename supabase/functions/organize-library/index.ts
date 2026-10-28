import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const secretKeyEntries = (baseName: string) => Array.from({ length: 20 }, (_, index) => index + 1).map((slot) => ({ slot, value: Deno.env.get(`${baseName}_${slot}`)?.trim() ?? "" })).filter((entry, index, all) => entry.value && all.findIndex((candidate) => candidate.value === entry.value) === index);
const failoverKeyCandidates = (entries: { slot: number; value: string }[], attemptIndex: number) => { const ordered = [...entries].sort((a, b) => b.slot - a.slot); const start = attemptIndex % Math.max(1, ordered.length); return [...ordered.slice(start), ...ordered.slice(0, start)]; };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (name: string) => Deno.env.get(name) ?? "";
const adminClient = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

function toBase64(bytes: Uint8Array) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(out);
}
function parseJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const object = fenced.match(/\{[\s\S]*\}/)?.[0];
  if (!object) throw new Error("Gemini returned no metadata JSON");
  return JSON.parse(object);
}
function retrySeconds(status: number, text: string) {
  const match = text.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  return Math.min(3600, Math.max(20, Math.ceil(Number(match?.[1] ?? (status === 429 ? 60 : 30)))));
}
async function gemini(file: Uint8Array, mimeType: string, key: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [
      { inlineData: { mimeType: mimeType || "application/octet-stream", data: toBase64(file) } },
      { text: `You are organizing a law-school past-paper library. Read the attached paper itself; do not trust its filename or folder names. Return ONLY valid JSON with exactly these fields: {"title":"","unit":"","course_code":"","topic":"","exam_year":null,"exam_session":"","paper_variant":"Regular","confidence":0}. Derive the best human-readable title from the paper heading and contents. Identify the actual law unit from the paper, including a new unit name such as Family Law when appropriate. CRITICAL: unit must be a subject name, never a month, date, semester label, academic year, filename fragment, or folder name. CRITICAL: course_code must be a code visibly printed in the paper; never use a month/year such as APRIL 2024, AUG 2025, or DEC 2022 as a course code. If the paper does not show a reliable course code, return an empty string. Use null only when the paper truly does not contain the value. exam_session should be a concise label such as "April 2021", "August 2022", or "December 2023". paper_variant may be Regular, Supplementary, Resit, Evening, Morning, Special, or another clearly stated variant. Do not invent a course code or year. confidence is a number from 0 to 1. Keep title under 180 characters.` },
    ] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error(text.slice(0, 700)), { providerStatus: response.status });
  const body = JSON.parse(text);
  return parseJson(body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in required." }, 401);
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  const admin = adminClient();
  const { data: allowed } = await userClient.rpc("is_admin", {});
  if (!allowed) return json({ error: "Admin access required." }, 403);
  let body: { action?: string; job_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }

  if (body.action === "start") {
    const { data: active } = await admin.from("library_organize_jobs").select("*").in("status", ["running", "paused"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (active) return json({ job: active, resumed: true });
    const { count } = await admin.from("materials").select("id", { count: "exact", head: true }).not("archive_path", "is", null).eq("organization_status", "pending");
    const { data: job, error } = await admin.from("library_organize_jobs").insert({ started_by: user.id, status: "running", total: count ?? 0 }).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json({ job, resumed: false });
  }
  if (body.action === "latest") {
    const { data: latest } = await admin.from("library_organize_jobs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return json({ job: latest ?? null });
  }
  if (!body.job_id) return json({ error: "job_id is required." }, 400);
  const { data: job, error: jobError } = await admin.from("library_organize_jobs").select("*").eq("id", body.job_id).limit(1).maybeSingle();
  if (jobError || !job) return json({ error: "Organizer job not found." }, 404);
  if (body.action === "status") return json({ job });
  if (body.action !== "step") return json({ error: "Unknown action." }, 400);
  if (job.next_retry_at && new Date(job.next_retry_at).getTime() > Date.now()) return json({ job, paused: true, retry_after_seconds: Math.ceil((new Date(job.next_retry_at).getTime() - Date.now()) / 1000) });

  const { data: material } = await admin.from("materials").select("id,title,storage_path,mime_type,archive_path,organization_status").not("archive_path", "is", null).eq("organization_status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!material) {
    const { data: completed } = await admin.from("library_organize_jobs").update({ status: "completed", next_retry_at: null }).eq("id", job.id).select("*").single();
    return json({ job: completed ?? { ...job, status: "completed" }, done: true });
  }
  await admin.from("materials").update({ organization_status: "processing", organization_error: null }).eq("id", material.id);
  const downloaded = await admin.storage.from("materials").download(material.storage_path);
  if (downloaded.error || !downloaded.data) {
    const detail = downloaded.error?.message ?? "Could not download original paper";
    await admin.from("materials").update({ organization_status: "failed", organization_error: detail }).eq("id", material.id);
    const { data: failedJob } = await admin.from("library_organize_jobs").update({ processed: job.processed + 1, failed: job.failed + 1, last_material_id: material.id, last_error: detail }).eq("id", job.id).select("*").single();
    return json({ job: failedJob ?? job, failed_material: material.id });
  }
  const keys = failoverKeyCandidates(secretKeyEntries("GEMINI_API_KEY"), job.processed);
  if (!keys.length) return json({ error: "No GEMINI_API_KEY_* secret is configured." }, 503);
  let metadata: Record<string, unknown> | null = null;
  let lastError = "";
  for (const candidate of keys) {
    try { metadata = await gemini(new Uint8Array(await downloaded.data.arrayBuffer()), material.mime_type ?? "application/pdf", candidate.value); break; }
    catch (cause) { lastError = cause instanceof Error ? cause.message : String(cause); const status = Number((cause as { providerStatus?: number }).providerStatus ?? 0); if (status === 429 || status >= 500) continue; break; }
  }
  if (!metadata) {
    const pause = retrySeconds(429, lastError);
    await admin.from("materials").update({ organization_status: "failed", organization_error: lastError }).eq("id", material.id);
    const { data: pausedJob } = await admin.from("library_organize_jobs").update({ status: "paused", next_retry_at: new Date(Date.now() + pause * 1000).toISOString(), last_material_id: material.id, last_error: lastError }).eq("id", job.id).select("*").single();
    return json({ job: pausedJob ?? job, paused: true, retry_after_seconds: pause, error: lastError });
  }
  const clean = (value: unknown, fallback = "") => typeof value === "string" ? value.trim().slice(0, 240) || fallback : fallback;
  const looksLikeDateOrSession = (value: string) => /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s_-]*20\d{2}$/i.test(value) || /\b20\d{2}\b/.test(value) && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value);
  const validUnit = (value: unknown) => { const candidate = clean(value, "Unclassified"); return looksLikeDateOrSession(candidate) ? "Unclassified" : candidate; };
  const validCourseCode = (value: unknown) => { const candidate = clean(value); if (!candidate || looksLikeDateOrSession(candidate) || !/[A-Za-z]/.test(candidate) || !/\d/.test(candidate)) return null; return candidate; };
  const year = Number(metadata.exam_year);
  const { error: updateError } = await admin.from("materials").update({
    title: clean(metadata.title, material.title), unit: validUnit(metadata.unit), topic: clean(metadata.topic, material.title),
    course_code: validCourseCode(metadata.course_code), exam_year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
    exam_session: clean(metadata.exam_session, "Unspecified session"), paper_variant: clean(metadata.paper_variant, "Regular"),
    metadata_confidence: Math.min(1, Math.max(0, Number(metadata.confidence) || 0)), organization_status: "ready", organization_error: null, organized_at: new Date().toISOString(),
  }).eq("id", material.id);
  if (updateError) return json({ error: updateError.message }, 500);
  const { data: nextJob } = await admin.from("library_organize_jobs").update({ processed: job.processed + 1, succeeded: job.succeeded + 1, last_material_id: material.id, last_error: null, status: "running", next_retry_at: null }).eq("id", job.id).select("*").single();
  return json({ job: nextJob ?? job, organized_material: material.id });
});
