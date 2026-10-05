import { supabase } from "../data/repository";

export type YouTubeItem = { id: string; playlist_id: string; title: string; url: string; position: number };
export type YouTubePlaylist = { id: string; user_id: string; title: string; items: YouTubeItem[] };

export function youtubePlaylistExportText(playlist: Pick<YouTubePlaylist, "title" | "items">) {
  const songs = playlist.items.map((item, index) => `${index + 1}. ${item.title}\n${item.url}`);
  return `${playlist.title}\n\n${songs.join("\n\n")}\n`;
}

export function youtubePlaylistExportJson(playlist: Pick<YouTubePlaylist, "title" | "items">) {
  return JSON.stringify({
    title: playlist.title,
    items: playlist.items.map(({ title, url, position }) => ({ title, url, position })),
  }, null, 2);
}

function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }

export async function loadYouTubePlaylist(): Promise<YouTubePlaylist> {
  const client = db();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Sign in to use your playlist.");
  let { data: playlist, error } = await client.from("youtube_playlists").select("id,user_id,title").eq("user_id", user.user.id).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`Could not load YouTube playlist: ${error.message}`);
  if (!playlist) {
    const created = await client.from("youtube_playlists").insert({ user_id: user.user.id, title: "My YouTube playlist" }).select("id,user_id,title").single();
    if (created.error || !created.data) throw new Error(`Could not create YouTube playlist: ${created.error?.message ?? "unknown error"}`);
    playlist = created.data;
  }
  const items = await client.from("youtube_playlist_items").select("id,playlist_id,title,url,position").eq("playlist_id", playlist.id).order("position").limit(200);
  if (items.error) throw new Error(`Could not load playlist songs: ${items.error.message}`);
  return { ...playlist, items: (items.data ?? []) as YouTubeItem[] };
}

export async function addYouTubeItem(playlistId: string, title: string, url: string) {
  const client = db();
  const { data: item, error } = await client.from("youtube_playlist_items").insert({ playlist_id: playlistId, title: title.trim(), url: url.trim(), position: 0 }).select("id,playlist_id,title,url,position").single();
  if (error || !item) throw new Error(`Could not add song: ${error?.message ?? "unknown error"}`);
  const { data: rows } = await client.from("youtube_playlist_items").select("id").eq("playlist_id", playlistId).order("created_at").limit(200);
  if (rows?.length) await Promise.all(rows.map((row, index) => client.from("youtube_playlist_items").update({ position: index }).eq("id", row.id)));
  return item as YouTubeItem;
}

export async function removeYouTubeItem(id: string) {
  const { error } = await db().from("youtube_playlist_items").delete().eq("id", id);
  if (error) throw new Error(`Could not remove song: ${error.message}`);
}
