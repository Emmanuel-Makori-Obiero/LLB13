import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretKeys } from "../_shared/keys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function findGeminiImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeminiImage(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const outputImage = record.output_image;
  if (outputImage && typeof outputImage === "object" && typeof (outputImage as Record<string, unknown>).data === "string") {
    return (outputImage as Record<string, string>).data;
  }
  const contentType = `${String(record.type ?? "")} ${String(record.mime_type ?? record.mimeType ?? "")}`.toLowerCase();
  if (typeof record.data === "string" && contentType.includes("image")) return record.data;
  for (const [key, child] of Object.entries(record)) {
    const found = findGeminiImage(child);
    if (found && (key.toLowerCase().includes("image") || contentType.includes("image"))) return found;
  }
  return null;
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/^data:image\/[^;]+;base64,/i, "").replace(/\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function generateGeminiImage(prompt: string, keys: string[]) {
  const model = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";
  const failures: string[] = [];
  for (const key of keys) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: prompt,
          response_format: { type: "image", mime_type: "image/png", aspect_ratio: "1:1", image_size: "1K" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const raw = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { payload = raw; }
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "error" in payload
          ? String(((payload as { error?: { message?: unknown } }).error?.message) ?? "")
          : typeof payload === "string" ? payload.slice(0, 500) : "Provider returned an error.";
        failures.push(`Gemini image ${response.status}: ${detail}`);
        continue;
      }
      const encoded = findGeminiImage(payload);
      if (!encoded) throw new Error("Gemini returned no image data.");
      const bytes = decodeBase64(encoded);
      if (bytes.length < 100) throw new Error("Gemini returned an empty image.");
      return { bytes, model };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(failures.slice(-3).join("; ") || "Gemini image generation did not return an image.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hfTokens = secretKeys("HF_TOKEN");
  const geminiKeys = secretKeys("GEMINI_API_KEY");
  const geminiEnabled = Deno.env.get("GEMINI_IMAGE_ENABLED")?.toLowerCase() === "true";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || (!hfTokens.length && !(geminiEnabled && geminiKeys.length))) {
    return json({ error: "Image generation is not configured. Add an HF token, or explicitly enable a billable Gemini image fallback." }, 503);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Sign in before generating an image." }, 401);

  let body: { prompt?: string; model?: string; width?: number; height?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 8) return json({ error: "Provide a descriptive image prompt." }, 400);
  if (prompt.length > 3000) return json({ error: "Prompt is too long." }, 400);

  const model = String(body.model || "black-forest-labs/FLUX.1-schnell");
  const width = Math.min(1536, Math.max(512, Number(body.width) || 1024));
  const height = Math.min(1536, Math.max(512, Number(body.height) || 1024));
  const endpoint = Deno.env.get("HF_IMAGE_URL") || `https://router.huggingface.co/hf-inference/models/${model}`;
  let bytes: Uint8Array | null = null;
  let provider = "huggingface";
  let actualModel = model;
  const failures: string[] = [];
  for (let attempt = 0; attempt < hfTokens.length && !bytes; attempt += 1) {
    try {
      const generated = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${hfTokens[attempt]}`, "Content-Type": "application/json", Accept: "image/png, application/json" },
        body: JSON.stringify({ inputs: prompt, parameters: { width, height, num_inference_steps: 4 } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (generated.ok) {
        const contentType = generated.headers.get("content-type") || "image/png";
        if (!contentType.startsWith("image/")) failures.push(`Hugging Face returned a non-image response: ${(await generated.text()).slice(0, 500)}`);
        else {
          const image = new Uint8Array(await generated.arrayBuffer());
          if (image.length < 100) failures.push("Hugging Face returned an empty image.");
          else bytes = image;
        }
      } else {
        failures.push(`Hugging Face ${generated.status}: ${(await generated.text()).slice(0, 700)}`);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!bytes && geminiEnabled && geminiKeys.length) {
    try {
      const generated = await generateGeminiImage(prompt, geminiKeys);
      bytes = generated.bytes;
      provider = "gemini";
      actualModel = generated.model;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!bytes) return json({ error: "No configured image provider generated a file.", detail: failures.join("; ") || "Configure HF_TOKEN_1 or opt in to the Gemini API fallback." }, failures.length ? 502 : 503);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const assetId = crypto.randomUUID();
  const storagePath = `${auth.user.id}/generated/${assetId}.png`;
  const upload = await admin.storage.from("media").upload(storagePath, bytes, {
    contentType: "image/png",
    upsert: false,
  });
  if (upload.error) return json({ error: `Could not store generated image: ${upload.error.message}` }, 500);

  const { data: asset, error: insertError } = await admin
    .from("media_assets")
    .insert({
      id: assetId,
      owner_id: auth.user.id,
      title: prompt.slice(0, 90),
      kind: "other",
      storage_path: storagePath,
      mime_type: "image/png",
      status: "ready",
      provider,
      metadata: { model: actualModel, prompt, width, height },
    })
    .select("id,title,kind,storage_path,mime_type,status,provider,created_at")
    .single();
  if (insertError) {
    const cleanup = await admin.storage.from("media").remove([storagePath]);
    if (cleanup.error) console.error("Could not remove orphaned generated image", cleanup.error.message);
    return json({ error: `Could not record generated image: ${insertError.message}` }, 500);
  }

  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  return json({ asset, signed_url: signed.data?.signedUrl ?? null });
});
