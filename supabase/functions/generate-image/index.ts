import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretKeys } from "../_shared/keys.ts";
import { reserveAiQuota } from "../_shared/quotas.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function imageData(value: string) { const match = value.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i); return { mimeType: match?.[1] || "image/png", data: match?.[2] || value.replace(/^data:image\/[^;]+;base64,/i, "") }; }
function decodeBase64(value: string): Uint8Array { const binary = atob(value.replace(/^data:image\/[\w.+-]+;base64,/i, "").replace(/\s/g, "")); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function findImageData(value: unknown): string | null {
  if (Array.isArray(value)) { for (const item of value) { const found = findImageData(item); if (found) return found; } return null; }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["output_image", "image", "inline_data", "inlineData"]) { const child = record[key]; if (child && typeof child === "object" && typeof (child as Record<string, unknown>).data === "string") return String((child as Record<string, unknown>).data); }
  const type = `${String(record.type ?? "")} ${String(record.mime_type ?? record.mimeType ?? "")}`.toLowerCase();
  if (type.includes("image") && typeof record.data === "string") return record.data;
  for (const child of Object.values(record)) { const found = findImageData(child); if (found) return found; }
  return null;
}
function findText(value: unknown): string { if (Array.isArray(value)) return value.map(findText).filter(Boolean).join("\n"); if (!value || typeof value !== "object") return ""; const record = value as Record<string, unknown>; if (typeof record.text === "string") return record.text; return Object.values(record).map(findText).filter(Boolean).join("\n"); }
async function geminiImage(args: { prompt: string; keys: string[]; imageBase64?: string; imageMimeType?: string; model: string; aspectRatio: string; imageSize: string }) {
  const failures: string[] = [];
  const input = args.imageBase64 ? [{ type: "text", text: args.prompt }, { type: "image", data: imageData(args.imageBase64).data, mime_type: args.imageMimeType || imageData(args.imageBase64).mimeType }] : [{ type: "text", text: args.prompt }];
  for (const key of args.keys) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ model: args.model, input, response_format: { type: "image", mime_type: "image/png", aspect_ratio: args.aspectRatio, image_size: args.imageSize } }), signal: AbortSignal.timeout(120_000) });
      const raw = await response.text(); let payload: unknown; try { payload = JSON.parse(raw); } catch { payload = raw; }
      if (!response.ok) { failures.push(`Gemini image ${response.status}: ${typeof payload === "string" ? payload.slice(0, 500) : findText(payload).slice(0, 500)}`); continue; }
      const encoded = findImageData(payload); if (!encoded) throw new Error("Gemini returned no image data.");
      const bytes = decodeBase64(encoded); if (bytes.length < 100) throw new Error("Gemini returned an empty image.");
      return { bytes, model: args.model };
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  throw new Error(failures.slice(-3).join("; ") || "Gemini image generation did not return an image.");
}
async function analyzeGemini(args: { prompt: string; keys: string[]; imageBase64: string; imageMimeType: string; model: string }) {
  const source = imageData(args.imageBase64); const failures: string[] = [];
  for (const key of args.keys) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: args.imageMimeType || source.mimeType, data: source.data } }, { text: args.prompt }] }] }), signal: AbortSignal.timeout(120_000) });
      const raw = await response.text(); let payload: unknown; try { payload = JSON.parse(raw); } catch { payload = raw; }
      if (!response.ok) { failures.push(`Gemini vision ${response.status}: ${typeof payload === "string" ? payload.slice(0, 500) : findText(payload).slice(0, 500)}`); continue; }
      const text = findText(payload).trim(); if (!text) throw new Error("Gemini returned no analysis text."); return text;
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  throw new Error(failures.slice(-3).join("; ") || "Gemini image analysis did not return text.");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKeys = secretKeys("GEMINI_API_KEY"); const geminiEnabled = Deno.env.get("GEMINI_IMAGE_ENABLED")?.toLowerCase() !== "false";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Image generation is missing Supabase server configuration." }, 503);
  const authHeader = req.headers.get("Authorization") ?? ""; const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } }); const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before using Image Studio." }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey);
  let body: { operation?: "generate" | "edit" | "analyze"; prompt?: string; image_base64?: string; image_mime_type?: string; model?: string; width?: number; height?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const operation = body.operation || (body.image_base64 ? "edit" : "generate"); const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 8) return json({ error: "Provide a descriptive prompt or question for the image." }, 400);
  if (prompt.length > 3000) return json({ error: "Prompt is too long." }, 400);
  if (body.image_base64 && body.image_base64.length > 24_000_000) return json({ error: "Image is too large. Choose an image under about 18 MB." }, 413);
  if ((operation === "edit" || operation === "analyze") && !body.image_base64) return json({ error: "Upload an image before asking Image Studio to revise or analyze it." }, 400);
  try { const quota = await reserveAiQuota(admin, auth.user.id, "image"); if (!quota.allowed) return json({ error: `Hourly image limit reached (${quota.quota}). Try again later.`, retry_after_seconds: quota.retry_after_seconds }, 429); } catch (error) { return json({ error: error instanceof Error ? error.message : "AI quota service is unavailable." }, 503); }
  if (!geminiEnabled || !geminiKeys.length) return json({ error: "Gemini image tools are not configured. Add GEMINI_API_KEY_1 and set GEMINI_IMAGE_ENABLED=true in Supabase Edge Function secrets." }, 503);
  const imageModel = body.model || Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image"; const visionModel = Deno.env.get("GEMINI_VISION_MODEL") || "gemini-2.5-flash";
  try {
    if (operation === "analyze") return json({ analysis: await analyzeGemini({ prompt, keys: geminiKeys, imageBase64: body.image_base64!, imageMimeType: body.image_mime_type || "image/png", model: visionModel }), provider: "gemini-vision", model: visionModel });
    const width = Math.min(1536, Math.max(512, Number(body.width) || 1024)); const height = Math.min(1536, Math.max(512, Number(body.height) || 1024)); const ratio = width / height > 1.6 ? "16:9" : width / height < 0.7 ? "9:16" : "1:1";
    const generated = await geminiImage({ prompt, keys: geminiKeys, imageBase64: body.image_base64, imageMimeType: body.image_mime_type, model: imageModel, aspectRatio: ratio, imageSize: "1K" });
    const assetId = crypto.randomUUID(); const storagePath = `${auth.user.id}/generated/${assetId}.png`; const upload = await admin.storage.from("media").upload(storagePath, generated.bytes, { contentType: "image/png", upsert: false });
    if (upload.error) return json({ error: `Could not store generated image: ${upload.error.message}` }, 500);
    const { data: asset, error: insertError } = await admin.from("media_assets").insert({ id: assetId, owner_id: auth.user.id, title: prompt.slice(0, 90), kind: "other", storage_path: storagePath, mime_type: "image/png", public_url: admin.storage.from("media").getPublicUrl(storagePath).data.publicUrl, status: "ready", provider: "gemini", metadata: { model: generated.model, operation, prompt, width, height } }).select("id,title,kind,storage_path,mime_type,status,provider,created_at").single();
    if (insertError) { await admin.storage.from("media").remove([storagePath]); return json({ error: `Could not record generated image: ${insertError.message}` }, 500); }
    const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600); return json({ asset, signed_url: signed.data?.signedUrl ?? null, provider: "gemini", model: generated.model });
  } catch (error) { return json({ error: "Gemini image request failed.", detail: error instanceof Error ? error.message : String(error) }, 502); }
});
