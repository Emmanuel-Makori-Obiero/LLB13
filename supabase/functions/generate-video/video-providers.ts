export type VideoProvider = {
  id: string;
  label: string;
  space: string;
  apiName: string;
  buildInput: (prompt: string, seed: number) => unknown[];
};

const clean = (value: string) => value.replace(/\/$/, "");

const builtIns: VideoProvider[] = [
  {
    id: "openking-wan22",
    label: "OpenKing Wan2.2",
    space: "https://openking-wan2-video-generation.hf.space",
    apiName: "generate_video",
    buildInput: (prompt, seed) => [prompt, null, 512, 512, 25, 20, 5, seed],
  },
  {
    id: "pyramid-flow",
    label: "Pyramid Flow",
    space: "https://pyramid-flow-pyramid-flow.hf.space",
    apiName: "generate_video",
    buildInput: (prompt) => [prompt, null, 3, 7, 7, 8],
  },
  {
    id: "ltx-video-fast",
    label: "LTX-Video Fast",
    space: "https://lightricks-ltx-video-distilled.hf.space",
    apiName: "text_to_video",
    buildInput: (prompt, seed) => [prompt, "", null, null, 512, 704, "text-to-video", 3, null, seed, true, 3, false],
  },
];

export function providerChain(): VideoProvider[] {
  const customSpace = Deno.env.get("HF_VIDEO_SPACE");
  const order = Deno.env.get("HF_VIDEO_PROVIDER_ORDER");
  const byId = new Map(builtIns.map((provider) => [provider.id, provider]));
  if (customSpace) {
    byId.set("custom-hf-space", {
      id: "custom-hf-space",
      label: "Configured Hugging Face Space",
      space: clean(customSpace),
      apiName: Deno.env.get("HF_VIDEO_API_NAME") || "generate_video",
      buildInput: (prompt, seed) => [prompt, null, 512, 512, 25, 20, 5, seed],
    });
  }
  const ids = order
    ? order.split(",").map((item) => item.trim()).filter(Boolean)
    : customSpace
      ? ["custom-hf-space", "pyramid-flow", "ltx-video-fast"]
      : ["openking-wan22", "pyramid-flow", "ltx-video-fast"];
  return ids.map((id) => byId.get(id)).filter((provider): provider is VideoProvider => Boolean(provider));
}

export async function submitVideo(provider: VideoProvider, prompt: string, seed: number, headers: Record<string, string>) {
  const space = new URL(clean(provider.space));
  if (space.protocol !== "https:" || space.username || space.password) {
    throw new Error(`${provider.label} must use a credential-safe HTTPS Space URL.`);
  }
  const response = await fetch(`${space.origin}/gradio_api/call/${provider.apiName}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ data: provider.buildInput(prompt, seed) }),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* provider may return plain text */ }
  if (!response.ok) throw new Error(`${provider.label} rejected the job (${response.status}): ${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)}`);
  const eventId = body && typeof body === "object" && "event_id" in body ? String((body as { event_id: unknown }).event_id || "") : "";
  if (!eventId) throw new Error(`${provider.label} returned no queue event id.`);
  return { eventId, provider };
}
