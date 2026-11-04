import { supabase } from "../data/repository";

export type RewardSummary = {
  points: number;
  weekly_points: number;
  current_streak: number;
  best_streak: number;
  achievement_rank: string;
};
export type RewardLeaderboardEntry = RewardSummary & { rank: number; user_id: string; display_name: string; visibility: string };

export const POINT_VALUES = {
  daily_quiz: 10,
  guided_challenge: 25,
  case_reading: 15,
  retry: 15,
  game_round: 15,
  streak_3: 20,
  streak_7: 75,
  streak_14: 150,
  streak_30: 400,
} as const;

export async function getRewardSummary(userId: string): Promise<RewardSummary | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("learning_reward_profiles").select("points,weekly_points,current_streak,best_streak,achievement_rank").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RewardSummary | null;
}

export async function awardReward(args: { eventKey: string; activityType: string; points: number; displayName: string; metadata?: Record<string, unknown> }): Promise<RewardSummary | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("award_learning_reward", { p_event_key: args.eventKey, p_activity_type: args.activityType, p_points: args.points, p_display_name: args.displayName, p_metadata: args.metadata ?? {} });
  if (error) throw new Error(error.message);
  return data as RewardSummary;
}

export async function listRewardLeaderboard(limit = 50): Promise<RewardLeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("learning_leaderboard").select("rank,user_id,display_name,points,weekly_points,current_streak,best_streak,achievement_rank,visibility").order("rank", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RewardLeaderboardEntry[];
}

export async function updateRewardVisibility(userId: string, visibility: "public" | "group" | "anonymous" | "hidden") {
  if (!supabase) return;
  const { error } = await supabase.from("learning_reward_profiles").update({ visibility }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
