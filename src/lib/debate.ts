import { supabase } from "../data/repository";
import type { KenyaLawCaseResult } from "./kenyaLaw";

export type DebateStatus = "waiting" | "active" | "evaluating" | "finished" | "cancelled";
export type DebateDifficulty = "beginner" | "intermediate" | "master";
export type DebateRole = "claimant" | "defendant";

export type DebateCaseBrief = {
  title: string;
  question: string;
  packet: string;
  authorities: KenyaLawCaseResult[];
  materials: { title: string; type: string; topic: string; source: string; url?: string }[];
  sourceBasis: string;
};

export type DebateRoom = {
  id: string;
  source_id: string | null;
  source_title: string;
  duration_minutes: 10 | 20;
  difficulty: DebateDifficulty;
  motion: string | null;
  case_brief: DebateCaseBrief | null;
  share_code: string;
  status: DebateStatus;
  player_one_id: string;
  player_one_name: string;
  player_one_role: DebateRole;
  player_two_id: string | null;
  player_two_name: string | null;
  player_two_role: DebateRole | null;
  current_turn: number;
  turn_seconds: number;
  started_at: string | null;
  deadline_at: string | null;
  turn_deadline_at: string | null;
  finished_at: string | null;
  winner_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  evaluation: DebateEvaluation | null;
  created_at: string;
};

export type DebateMessage = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  turn_index: number;
  phase: "opening" | "rebuttal" | "closing";
  content: string;
  created_at: string;
};

export type DebateEvaluation = {
  playerOneScore?: number;
  playerTwoScore?: number;
  winner?: "one" | "two" | "draw";
  summary?: string;
  playerOneFeedback?: string;
  playerTwoFeedback?: string;
  evidenceAssessment?: string;
  authorityAssessment?: string;
  retryAdvice?: string;
  [key: string]: unknown;
};

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  total_score: number;
  best_streak: number;
  current_streak: number;
};

function db() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function createDebateRoom(input: {
  sourceId: string | null;
  sourceTitle: string;
  duration: 10 | 20;
  difficulty: DebateDifficulty;
  motion: string;
  caseBrief: DebateCaseBrief;
  displayName: string;
  hostRole: DebateRole;
}) {
  const { data, error } = await db().rpc("create_debate_room", {
    p_source_id: input.sourceId,
    p_source_title: input.sourceTitle,
    p_duration_minutes: input.duration,
    p_difficulty: input.difficulty,
    p_motion: input.motion,
    p_case_brief: input.caseBrief,
    p_display_name: input.displayName,
    p_host_role: input.hostRole,
  });
  if (error || !data) throw new Error(error?.message || "Could not create the invite room.");
  return data as DebateRoom;
}

export async function joinDebateRoom(shareCode: string, displayName: string) {
  const { data, error } = await db().rpc("join_debate_room", {
    p_share_code: shareCode,
    p_display_name: displayName,
  });
  if (error || !data) throw new Error(error?.message || "Could not join the invite room.");
  return data as DebateRoom;
}

export async function getDebateRoom(id: string) {
  const { data, error } = await db().from("debate_rooms").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message || "Could not load the debate room.");
  return data as DebateRoom;
}

export async function listDebateMessages(roomId: string) {
  const { data, error } = await db()
    .from("debate_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("turn_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DebateMessage[];
}

export async function submitDebateTurn(roomId: string, content: string) {
  const { data, error } = await db().rpc("submit_debate_turn", {
    p_room_id: roomId,
    p_content: content,
    p_display_name: null,
  });
  if (error || !data) throw new Error(error?.message || "Could not submit that turn.");
  return data as DebateMessage;
}

export async function expireDebateTurn(roomId: string) {
  const { data, error } = await db().rpc("expire_debate_turn", { p_room_id: roomId });
  if (error || !data) throw new Error(error?.message || "Could not advance the timed-out turn.");
  return data as DebateMessage;
}

export async function requestDebateEvaluation(roomId: string) {
  const { data, error } = await db().functions.invoke("evaluate-debate", { body: { roomId } });
  if (error) {
    let message = "The secure evaluator could not finish yet.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* Keep the useful default. */
    }
    throw new Error(message);
  }
  return data as { status?: string; room?: DebateRoom };
}

export async function listLeaderboard() {
  const { data, error } = await db()
    .from("debate_leaderboard")
    .select("*")
    .order("rating", { ascending: false })
    .order("wins", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardEntry[];
}

export function subscribeToDebateRoom(roomId: string, onChange: () => void) {
  const channel = db()
    .channel("debate-room-" + roomId)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_rooms", filter: "id=eq." + roomId }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debate_messages", filter: "room_id=eq." + roomId }, onChange);
  void channel.subscribe();
  return () => { void db().removeChannel(channel); };
}

export function subscribeToLeaderboard(onChange: () => void) {
  const channel = db().channel("debate-leaderboard").on(
    "postgres_changes",
    { event: "*", schema: "public", table: "debate_leaderboard" },
    onChange,
  );
  void channel.subscribe();
  return () => { void db().removeChannel(channel); };
}
