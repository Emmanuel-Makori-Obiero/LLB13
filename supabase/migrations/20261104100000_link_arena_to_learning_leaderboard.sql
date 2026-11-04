drop view if exists public.learning_leaderboard;
create view public.learning_leaderboard with (security_invoker = true) as
with combined as (
  select coalesce(p.user_id, d.user_id) as user_id,
    coalesce(p.display_name, d.display_name, 'Learner') as display_name,
    coalesce(p.points, 0) + coalesce(d.points, 0) as points,
    coalesce(p.weekly_points, 0) as weekly_points,
    greatest(coalesce(p.current_streak, 0), coalesce(d.current_streak, 0)) as current_streak,
    greatest(coalesce(p.best_streak, 0), coalesce(d.best_streak, 0)) as best_streak,
    coalesce(p.visibility, 'group') as visibility
  from public.learning_reward_profiles p
  full outer join public.debate_leaderboard d on d.user_id = p.user_id
  where p.user_id is null or p.visibility <> 'hidden'
)
select row_number() over (order by weekly_points desc, points desc, user_id) as rank,
  user_id, case when visibility = 'anonymous' then 'Anonymous learner' else display_name end as display_name,
  points, weekly_points, current_streak, best_streak,
  public.learning_rank_for_points(points) as achievement_rank, visibility
from combined;
grant select on public.learning_leaderboard to authenticated;
