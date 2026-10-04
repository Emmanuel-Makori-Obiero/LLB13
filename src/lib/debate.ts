import { supabase } from "../data/repository";

export type DebateStatus = "waiting" | "active" | "evaluating" | "finished" | "cancelled";
export type DebateRoom = {
  id: string;
  source_id: string | null;
  source_title: string;
  duration_minutes: 10 | 20;
  status: DebateStatus;
  player_one_id: string;
  player_one_name: string;
  player_two_id: string | null;
  player_two_name: string | null;
  current_turn: number;
  started_at: string | null;
  deadline_at: string | null;
  finished_at: string | null;
  winner_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  evaluation: Record<string, unknown> | null;
  created_at: string;
};
export type DebateMessage = { id: string; room_id: string; user_id: string; display_name: string; turn_index: number; phase: "opening" | "rebuttal" | "closing"; content: string; created_at: string };
export type LeaderboardEntry = { user_id: string; display_name: string; rating: number; wins: number; losses: number; draws: number; matches: number; total_score: number; best_streak: number; current_streak: number };

function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }

export async function matchDebateRoom(sourceId: string | null, sourceTitle: string, duration: 10 | 20, displayName: string) {
  const { data, error } = await db().rpc("match_debate_room", { p_source_id: sourceId, p_source_title: sourceTitle, p_duration_minutes: duration, p_display_name: displayName });
  if (error || !data) throw new Error(error?.message || "Could not find a debate room.");
  return data as DebateRoom;
}
export async function getDebateRoom(id: string) {
  const { data, error } = await db().from("debate_rooms").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message || "Could not load the debate room.");
  return data as DebateRoom;
}
export async function listDebateMessages(roomId: string) {
  const { data, error } = await db().from("debate_messages").select("*").eq("room_id", roomId).order("turn_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DebateMessage[];
}
export async function submitDebateTurn(roomId: string, content: string, displayName: string) {
  const { data, error } = await db().rpc("submit_debate_turn", { p_room_id: roomId, p_content: content, p_display_name: displayName });
  if (error || !data) throw new Error(error?.message || "Could not submit that turn.");
  return data as DebateMessage;
}
export async function recordDebateResult(roomId: string, winnerId: string | null, playerOneScore: number, playerTwoScore: number, evaluation: Record<string, unknown>) {
  const { data, error } = await db().rpc("record_debate_result", { p_room_id: roomId, p_winner_id: winnerId, p_player_one_score: playerOneScore, p_player_two_score: playerTwoScore, p_evaluation: evaluation });
  if (error || !data) throw new Error(error?.message || "Could not record the match result.");
  return data as DebateRoom;
}
export async function listLeaderboard() {
  const { data, error } = await db().from("debate_leaderboard").select("*").order("rating", { ascending: false }).order("wins", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardEntry[];
}
export function subscribeToDebateRoom(roomId: string, onChange: () => void) {
  const channel = db().channel("debate-room-" + roomId)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_rooms", filter: "id=eq." + roomId }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_messages", filter: "room_id=eq." + roomId }, onChange);
  void channel.subscribe();
  return () => { void db().removeChannel(channel); };
}
export function subscribeToLeaderboard(onChange: () => void) {
  const channel = db().channel("debate-leaderboard").on("postgres_changes", { event: "*", schema: "public", table: "debate_leaderboard" }, onChange);
  void channel.subscribe();
  return () => { void db().removeChannel(channel); };
}
