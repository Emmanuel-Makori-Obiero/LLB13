create table if not exists public.learning_reward_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner',
  points integer not null default 0,
  weekly_points integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_activity_date date,
  achievement_rank text not null default 'New Learner',
  visibility text not null default 'group',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint learning_reward_profiles_visibility_check check (visibility in ('public','group','anonymous','hidden'))
);

create table if not exists public.learning_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  activity_type text not null,
  points integer not null check (points > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index if not exists learning_reward_events_user_date_idx on public.learning_reward_events(user_id, created_at desc);
create index if not exists learning_reward_profiles_points_idx on public.learning_reward_profiles(weekly_points desc, points desc);

alter table public.learning_reward_profiles enable row level security;
alter table public.learning_reward_events enable row level security;
revoke all on public.learning_reward_profiles, public.learning_reward_events from anon, public;
grant select on public.learning_reward_profiles to authenticated;
grant select on public.learning_reward_events to authenticated;
drop policy if exists "Authenticated users can read reward profiles" on public.learning_reward_profiles;
create policy "Authenticated users can read reward profiles" on public.learning_reward_profiles for select to authenticated using (visibility <> 'hidden' or user_id = auth.uid());
drop policy if exists "Users can read own reward events" on public.learning_reward_events;
create policy "Users can read own reward events" on public.learning_reward_events for select to authenticated using (user_id = auth.uid());

create or replace function public.learning_rank_for_points(total integer)
returns text language sql immutable as $$
  select case when total >= 10000 then 'Legal Mastery Fellow'
    when total >= 6000 then 'Moot Court Strategist'
    when total >= 3000 then 'Advanced Scholar'
    when total >= 1500 then 'Reasoning Advocate'
    when total >= 750 then 'Legal Analyst'
    when total >= 300 then 'Rule Builder'
    when total >= 100 then 'Case Explorer'
    else 'New Learner' end
$$;

create or replace function public.award_learning_reward(p_event_key text, p_activity_type text, p_points integer, p_display_name text default 'Learner', p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  profile public.learning_reward_profiles;
  event_inserted boolean := false;
  today date := current_date;
  next_streak integer;
  next_weekly integer;
begin
  if uid is null then raise exception 'Please sign in before earning points'; end if;
  if p_event_key is null or trim(p_event_key) = '' then raise exception 'Reward event key is required'; end if;
  if p_points is null or p_points < 1 or p_points > 500 then raise exception 'Reward points are outside the allowed range'; end if;
  insert into public.learning_reward_profiles(user_id, display_name)
    values (uid, coalesce(nullif(trim(p_display_name), ''), 'Learner'))
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.learning_reward_events(user_id, event_key, activity_type, points, metadata)
    values (uid, trim(p_event_key), coalesce(nullif(trim(p_activity_type), ''), 'learning'), p_points, coalesce(p_metadata, '{}'::jsonb))
    on conflict (user_id, event_key) do nothing;
  event_inserted := found;
  select * into profile from public.learning_reward_profiles where user_id = uid for update;
  if event_inserted then
    next_streak := case when profile.last_activity_date = today then profile.current_streak when profile.last_activity_date = today - 1 then profile.current_streak + 1 else 1 end;
    next_weekly := case when date_trunc('week', coalesce(profile.updated_at, now())) = date_trunc('week', now()) then profile.weekly_points + p_points else p_points end;
    update public.learning_reward_profiles set points = points + p_points, weekly_points = next_weekly, current_streak = next_streak, best_streak = greatest(best_streak, next_streak), last_activity_date = today, achievement_rank = public.learning_rank_for_points(points + p_points), updated_at = now() where user_id = uid returning * into profile;
  end if;
  return jsonb_build_object('awarded', event_inserted, 'points', profile.points, 'weekly_points', profile.weekly_points, 'current_streak', profile.current_streak, 'best_streak', profile.best_streak, 'achievement_rank', profile.achievement_rank);
end;
$$;

grant execute on function public.award_learning_reward(text,text,integer,text,jsonb) to authenticated;

drop view if exists public.learning_leaderboard;
create view public.learning_leaderboard with (security_invoker = true) as
select row_number() over (order by p.weekly_points desc, p.points desc, p.updated_at asc) as rank,
  p.user_id,
  case when p.visibility = 'anonymous' then 'Anonymous learner' else p.display_name end as display_name,
  p.points,
  p.weekly_points,
  p.current_streak,
  p.best_streak,
  p.achievement_rank,
  p.visibility
from public.learning_reward_profiles p
where p.visibility <> 'hidden';
grant select on public.learning_leaderboard to authenticated;
