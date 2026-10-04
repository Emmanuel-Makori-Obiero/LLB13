import { supabase } from "../data/repository";
import {
  deleteMediaAsset,
  getMediaAssetUrl,
  uploadMediaAsset,
  type MediaAsset,
} from "./cloudMedia";

export type ScannedPage = {
  id: string;
  title: string;
  pageNumber: number;
  originalName: string;
  signedUrl: string | null;
};

export type ScannedNote = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  pages: ScannedPage[];
};

type NoteRow = Omit<ScannedNote, "pages">;

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function scanAssets(userId: string, noteId?: string) {
  let query = client()
    .from("media_assets")
    .select("*")
    .eq("owner_id", userId)
    .eq("kind", "other")
    .contains(
      "metadata",
      noteId
        ? { feature: "scanner_note_page", scan_note_id: noteId }
        : { feature: "scanner_note_page" },
    )
    .order("created_at", { ascending: true })
    .limit(1000);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load scanned pages: ${error.message}`);
  return (data ?? []) as MediaAsset[];
}

async function toScannedPage(asset: MediaAsset): Promise<ScannedPage> {
  let signedUrl: string | null = null;
  try {
    signedUrl = await getMediaAssetUrl(asset);
  } catch {
    // A note remains readable if an old or expired page object is unavailable.
  }
  const pageNumber = Number(asset.metadata.page_number);
  return {
    id: asset.id,
    title: asset.title,
    pageNumber: Number.isFinite(pageNumber) ? pageNumber : 0,
    originalName: String(asset.metadata.original_file_name ?? asset.title),
    signedUrl,
  };
}

export async function listScannedNotes(userId: string): Promise<ScannedNote[]> {
  const assets = await scanAssets(userId);
  const noteIds = [...new Set(
    assets
      .map((asset) => asset.metadata.scan_note_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )];
  if (!noteIds.length) return [];

  const { data, error } = await client()
    .from("notes")
    .select("id,user_id,title,body,created_at,updated_at")
    .eq("user_id", userId)
    .in("id", noteIds)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load your scan notes: ${error.message}`);

  const rows = (data ?? []) as NoteRow[];
  return Promise.all(
    rows.map(async (note) => {
      const pageAssets = assets
        .filter((asset) => asset.metadata.scan_note_id === note.id)
        .sort((a, b) => Number(a.metadata.page_number) - Number(b.metadata.page_number));
      return {
        ...note,
        pages: await Promise.all(pageAssets.map(toScannedPage)),
      };
    }),
  );
}

export async function createScannedNote(args: {
  userId: string;
  title: string;
  body: string;
  files: File[];
}) {
  const db = client();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user || auth.user.id !== args.userId)
    throw new Error("Please sign in to save a private scan note.");

  const { data: note, error } = await db
    .from("notes")
    .insert({ user_id: args.userId, title: args.title.trim(), body: args.body })
    .select("id,user_id,title,body,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not save your note: ${error.message}`);
  if (!note) throw new Error("The note was not returned after saving.");

  const createdAssets: MediaAsset[] = [];
  try {
    for (const [index, file] of args.files.entries()) {
      createdAssets.push(
        await uploadMediaAsset({
          file,
          title: `${args.title.trim()} — page ${index + 1}`,
          kind: "other",
          provider: "browser-ocr",
          metadata: {
            feature: "scanner_note_page",
            scan_note_id: note.id,
            page_number: index + 1,
            original_file_name: file.name,
          },
        }),
      );
    }
  } catch (cause) {
    const cleanup = await Promise.allSettled([
      ...createdAssets.map((asset) => deleteMediaAsset(asset)),
      (async () => {
        const { error } = await db
          .from("notes")
          .delete()
          .eq("id", note.id)
          .eq("user_id", args.userId);
        if (error) throw new Error(`Could not remove the incomplete note: ${error.message}`);
      })(),
    ]);
    const failedCleanup = cleanup.some((result) => result.status === "rejected");
    if (failedCleanup) {
      const message = cause instanceof Error ? cause.message : "The note could not be saved.";
      throw new Error(`${message} Some temporary scan data could not be removed; retry deleting the incomplete note or its pages.`);
    }
    throw cause;
  }
  return note as NoteRow;
}

export async function updateScannedNote(args: {
  userId: string;
  noteId: string;
  title: string;
  body: string;
}) {
  const { data, error } = await client()
    .from("notes")
    .update({ title: args.title.trim(), body: args.body })
    .eq("id", args.noteId)
    .eq("user_id", args.userId)
    .select("id,user_id,title,body,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not update your note: ${error.message}`);
  return data as NoteRow;
}

export async function deleteScannedNote(userId: string, noteId: string) {
  const db = client();
  const assets = await scanAssets(userId, noteId);
  const removed = await Promise.allSettled(assets.map((asset) => deleteMediaAsset(asset)));
  const failed = removed.filter((result) => result.status === "rejected");
  if (failed.length) {
    const reason = failed[0].status === "rejected" ? failed[0].reason : null;
    const detail = reason instanceof Error ? ` ${reason.message}` : "";
    throw new Error(`Some scanned pages could not be removed.${detail} The note remains available so you can retry deletion.`);
  }
  const { error } = await db
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", userId);
  if (error) throw new Error(`Could not delete your note: ${error.message}`);
}
