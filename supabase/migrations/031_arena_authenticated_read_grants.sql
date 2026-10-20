-- Explicit API grants for the Legal Arena's authenticated, RLS-filtered read surfaces.
-- Room and message policies still restrict records to the room participants.
grant usage on schema public to authenticated;
revoke all on table public.debate_rooms, public.debate_messages, public.debate_leaderboard,
  public.debate_match_queue, public.debate_ai_players, public.debate_leaderboard_universal
  from anon, public;
grant select on table public.debate_rooms, public.debate_messages,
  public.debate_leaderboard, public.debate_match_queue,
  public.debate_ai_players, public.debate_leaderboard_universal to authenticated;
