import { supabase } from "../data/repository";

export type MediaAssetKind =
  | "podcast_script"
  | "podcast_audio"
  | "video_lesson"
  | "film_clip"
  | "film_export"
  | "other";

export type MediaAsset = {
  id: string;
  owner_id: string;
  title: string;
  kind: MediaAssetKind;
  source_material_id: string | null;
  source_document_id: string | null;
  project_id: string | null;
  storage_path: string | null;
  mime_type: string | null;
  public_url: string | null;
  duration_seconds: number | null;
  status: "queued" | "processing" | "ready" | "failed" | "deleted";
  provider: string | null;
  provider_job_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FilmProject = {
  id: string;
  owner_id: string;
  title: string;
  brief: string;
  target_duration_seconds: number;
  aspect_ratio: string;
  status: "draft" | "queued" | "processing" | "ready" | "failed";
  provider_strategy: "fallback" | "self_hosted" | "hosted" | "manual";
  final_asset_id: string | null;
  continuity: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FilmShot = {
  id: string;
  project_id: string;
  shot_index: number;
  prompt: string;
  continuity_notes: string;
  duration_seconds: number;
  provider: string | null;
  status: "queued" | "processing" | "ready" | "failed";
  provider_job_id: string | null;
  asset_id: string | null;
  first_frame_path: string | null;
  last_frame_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listMediaAssets() {
  const { data, error } = await client()
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load media: ${error.message}`);
  return (data ?? []) as MediaAsset[];
}

export async function getMediaAssetUrl(asset: Pick<MediaAsset, "storage_path" | "public_url">) {
  if (asset.public_url) return asset.public_url;
  if (!asset.storage_path) return null;
  const { data, error } = await client().storage.from("media").createSignedUrl(asset.storage_path, 3600);
  if (error) throw new Error(`Could not open media: ${error.message}`);
  return data.signedUrl;
}

export async function uploadMediaAsset(args: {
  file: File;
  title: string;
  kind: MediaAssetKind;
  sourceMaterialId?: string;
  sourceDocumentId?: string;
  projectId?: string;
  durationSeconds?: number;
  provider?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = client();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Please sign in before uploading media.");
  const safeName = args.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${auth.user.id}/${crypto.randomUUID()}-${safeName}`;
  const upload = await db.storage.from("media").upload(path, args.file, {
    upsert: false,
    contentType: args.file.type || undefined,
  });
  if (upload.error) throw new Error(`Could not upload media: ${upload.error.message}`);
  const { data, error } = await db
    .from("media_assets")
    .insert({
      owner_id: auth.user.id,
      title: args.title,
      kind: args.kind,
      source_material_id: args.sourceMaterialId ?? null,
      source_document_id: args.sourceDocumentId ?? null,
      project_id: args.projectId ?? null,
      storage_path: path,
      mime_type: args.file.type || "application/octet-stream",
      duration_seconds: args.durationSeconds ?? null,
      provider: args.provider ?? null,
      metadata: args.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) {
    await db.storage.from("media").remove([path]);
    throw new Error(`Could not save media record: ${error.message}`);
  }
  return data as MediaAsset;
}

export async function createMediaShare(args: {
  assetId: string;
  recipientEmail?: string;
  visibility?: "link" | "group" | "private";
  expiresAt?: string;
}) {
  const db = client();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Please sign in before sharing media.");
  const { data: asset, error: assetError } = await db
    .from("media_assets")
    .select("storage_path,public_url")
    .eq("id", args.assetId)
    .single();
  if (assetError) throw new Error(`Could not find media: ${assetError.message}`);
  const { data, error } = await db
    .from("media_shares")
    .insert({
      asset_id: args.assetId,
      owner_id: auth.user.id,
      recipient_email: args.recipientEmail?.trim().toLowerCase() || null,
      visibility: args.visibility ?? "link",
      expires_at: args.expiresAt ?? null,
    })
    .select("id,asset_id,share_token,recipient_email,visibility,expires_at,revoked_at,created_at")
    .single();
  if (error) throw new Error(`Could not create share link: ${error.message}`);
  const signed = asset.public_url
    ? { signedUrl: asset.public_url }
    : asset.storage_path
      ? await db.storage.from("media").createSignedUrl(asset.storage_path, 60 * 60 * 24 * 7)
      : { data: null, error: null };
  if ("error" in signed && signed.error) throw new Error(`Could not prepare share URL: ${signed.error.message}`);
  return {
    ...data,
    // The signed URL is immediately usable by a friend without an account.
    // The share token remains stored for revocation and auditing.
    url: "signedUrl" in signed ? signed.signedUrl : signed.data?.signedUrl ?? `${window.location.origin}/share/${data.share_token}`,
  };
}

export async function revokeMediaShare(id: string) {
  const { error } = await client().from("media_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not revoke share: ${error.message}`);
}

export async function deleteMediaAsset(asset: Pick<MediaAsset, "id" | "storage_path">) {
  const db = client();
  if (asset.storage_path) {
    const removed = await db.storage.from("media").remove([asset.storage_path]);
    if (removed.error) throw new Error(`Could not delete media file: ${removed.error.message}`);
  }
  const { error } = await db.from("media_assets").delete().eq("id", asset.id);
  if (error) throw new Error(`Could not delete media record: ${error.message}`);
}

export async function createFilmProject(args: {
  title: string;
  brief: string;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  providerStrategy?: "fallback" | "self_hosted" | "hosted" | "manual";
  continuity?: Record<string, unknown>;
}) {
  const db = client();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Please sign in before creating a film project.");
  const { data, error } = await db
    .from("film_projects")
    .insert({
      owner_id: auth.user.id,
      title: args.title,
      brief: args.brief,
      target_duration_seconds: args.targetDurationSeconds ?? 900,
      aspect_ratio: args.aspectRatio ?? "16:9",
      provider_strategy: args.providerStrategy ?? "fallback",
      continuity: args.continuity ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create film project: ${error.message}`);
  return data as FilmProject;
}

export async function saveFilmShots(projectId: string, shots: Array<Pick<FilmShot, "shot_index" | "prompt" | "continuity_notes" | "duration_seconds">>) {
  const rows = shots.map((shot) => ({ project_id: projectId, ...shot }));
  const { data, error } = await client().from("film_shots").upsert(rows, { onConflict: "project_id,shot_index" }).select("*");
  if (error) throw new Error(`Could not save film shots: ${error.message}`);
  return (data ?? []) as FilmShot[];
}

export async function listFilmShots(projectId: string) {
  const { data, error } = await client().from("film_shots").select("*").eq("project_id", projectId).order("shot_index");
  if (error) throw new Error(`Could not load film shots: ${error.message}`);
  return (data ?? []) as FilmShot[];
}

export async function generateImage(args: {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
}) {
  const { data, error } = await client().functions.invoke("generate-image", {
    body: args,
  });
  if (error) throw new Error(`Image generation failed: ${error.message}`);
  if (!data?.asset) throw new Error(data?.error || "Image generation returned no asset.");
  return data as { asset: MediaAsset; signed_url: string | null };
}

export async function generateVideoJob(args: { prompt: string; projectId?: string; shotIndex?: number; seed?: number }) {
  const { data, error } = await client().functions.invoke("generate-video", {
    body: { prompt: args.prompt, project_id: args.projectId, shot_index: args.shotIndex, seed: args.seed },
  });
  if (error) throw new Error(`Video job failed: ${error.message}`);
  if (!data?.asset?.id) throw new Error(data?.error || "Video provider returned no job.");
  return data as { asset: MediaAsset; provider_job_id: string; status_url: string };
}

export async function getVideoJobStatus(assetId: string) {
  const db = client();
  const { data: session } = await db.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Please sign in before checking video status.");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-status?asset_id=${encodeURIComponent(assetId)}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Could not check video status.");
  return data as { asset: MediaAsset; status: "queued" | "processing" | "ready" | "failed"; signed_url?: string | null };
}
