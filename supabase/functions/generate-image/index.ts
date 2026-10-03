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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hfTokens = secretKeys("HF_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !hfTokens.length) {
    return json({ error: "Image generation is not configured on the server." }, 503);
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

  let generated: Response | null = null;
  let detail = "";
  for (let attempt = 0; attempt < hfTokens.length; attempt += 1) {
    generated = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${hfTokens[attempt]}`, "Content-Type": "application/json", Accept: "image/png, application/json" },
      body: JSON.stringify({ inputs: prompt, parameters: { width, height, num_inference_steps: 4 } }),
    });
    if (generated.ok) break;
    detail = (await generated.text()).slice(0, 1200);
    if (![401, 403, 408, 429, 500, 502, 503, 504].includes(generated.status)) break;
  }
  if (!generated?.ok) return json({ error: `Hugging Face generation failed (${generated?.status || "network"}).`, detail }, 502);
  const contentType = generated.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) {
    return json({ error: "Hugging Face returned a non-image response.", detail: (await generated.text()).slice(0, 1200) }, 502);
  }

  const bytes = new Uint8Array(await generated.arrayBuffer());
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
      provider: "huggingface",
      metadata: { model, prompt, width, height },
    })
    .select("id,title,kind,storage_path,mime_type,status,provider,created_at")
    .single();
  if (insertError) return json({ error: `Could not record generated image: ${insertError.message}` }, 500);

  const signed = await admin.storage.from("media").createSignedUrl(storagePath, 3600);
  return json({ asset, signed_url: signed.data?.signedUrl ?? null });
});
