-- Legal Arena event layer: easy-to-understand matchmaking, points, and an AI fallback.
-- Demo rows are explicitly marked as bots so they are not mistaken for real students.

alter table public.debate_leaderboard
  add column if not exists points integer not null default 0,
  add column if not exists is_bot boolean not null default false,
  add column if not exists tagline text not null default '';

create table if not exists public.debate_match_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text not null default 'Player',
  source_id text,
  source_title text not null,
  duration_minutes integer not null check (duration_minutes in (10, 20)),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'master')),
  motion text not null,
  case_brief jsonb not null,
  role text not null check (role in ('claimant', 'defendant')),
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  room_id uuid,
  created_at timestamptz not null default now()
);

alter table public.debate_match_queue enable row level security;
drop policy if exists "Players can read their own match request" on public.debate_match_queue;
create policy "Players can read their own match request" on public.debate_match_queue
  for select to authenticated using (user_id = auth.uid());
revoke all on public.debate_match_queue from anon, authenticated;
grant select on public.debate_match_queue to authenticated;

create index if not exists debate_match_queue_waiting_idx
  on public.debate_match_queue (status, difficulty, created_at);

-- AI players do not pretend to be auth users. They are kept separately and exposed
-- through the universal leaderboard view below.
create table if not exists public.debate_ai_players (
  user_id uuid primary key, display_name text not null, rating integer not null default 1000,
  points integer not null default 0, wins integer not null default 0, losses integer not null default 0,
  draws integer not null default 0, matches integer not null default 0, total_score integer not null default 0,
  best_streak integer not null default 0, current_streak integer not null default 0,
  tagline text not null default 'AI opponent', updated_at timestamptz not null default now()
);
alter table public.debate_ai_players enable row level security;
drop policy if exists "Anyone signed in can read AI players" on public.debate_ai_players;
create policy "Anyone signed in can read AI players" on public.debate_ai_players for select to authenticated using (true);
revoke all on public.debate_ai_players from anon, authenticated;
grant select on public.debate_ai_players to authenticated;
insert into public.debate_ai_players (user_id, display_name, rating, points, wins, losses, draws, matches, total_score, tagline)
values
  ('00000000-0000-0000-0000-000000000001', 'AI • BriefBot', 1180, 1420, 14, 4, 2, 20, 1540, 'Demo AI · clear and structured'),
  ('00000000-0000-0000-0000-000000000002', 'AI • CaseMate', 1115, 1190, 11, 6, 3, 20, 1370, 'Demo AI · evidence focused'),
  ('00000000-0000-0000-0000-000000000003', 'AI • RebuttalPro', 1060, 980, 9, 8, 3, 20, 1280, 'Demo AI · strong rebuttals')
on conflict (user_id) do update set display_name=excluded.display_name,rating=excluded.rating,points=excluded.points,wins=excluded.wins,losses=excluded.losses,draws=excluded.draws,matches=excluded.matches,total_score=excluded.total_score,tagline=excluded.tagline,updated_at=now();
drop view if exists public.debate_leaderboard_universal;
create view public.debate_leaderboard_universal with (security_invoker = true) as
select user_id, display_name, rating, wins, losses, draws, matches, total_score, best_streak, current_streak, points, false as is_bot, 'Student advocate'::text as tagline from public.debate_leaderboard
union all
select user_id, display_name, rating, wins, losses, draws, matches, total_score, best_streak, current_streak, points, true as is_bot, tagline from public.debate_ai_players;
grant select on public.debate_leaderboard_universal to authenticated;

create or replace function public.find_debate_match(
  p_source_id text,
  p_source_title text,
  p_duration_minutes integer,
  p_difficulty text,
  p_motion text,
  p_case_brief jsonb,
  p_display_name text,
  p_role text default 'claimant'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  mine public.debate_match_queue;
  other public.debate_match_queue;
  created public.debate_rooms;
  code text;
  p1_role text;
  p2_role text;
begin
  if auth.uid() is null then raise exception 'Please sign in before finding an opponent'; end if;
  if p_role not in ('claimant', 'defendant') then raise exception 'Choose Proposer or Opposer'; end if;
  if p_duration_minutes not in (10, 20) then raise exception 'Choose 10 or 20 minutes'; end if;
  if p_difficulty not in ('beginner', 'intermediate', 'master') then raise exception 'Choose a valid level'; end if;
  if p_case_brief is null or jsonb_typeof(p_case_brief) <> 'object' then raise exception 'Generate the case packet first'; end if;
  if p_source_id is null or not exists (select 1 from public.materials where id = p_source_id) then raise exception 'Choose a library source first'; end if;

  delete from public.debate_match_queue where user_id = auth.uid();
  select * into other from public.debate_match_queue
  where status = 'waiting'
    and difficulty = p_difficulty
    and duration_minutes = p_duration_minutes
    and role <> p_role
    and user_id <> auth.uid()
  order by created_at asc
  for update skip locked limit 1;

  if other.id is null then
    insert into public.debate_match_queue (user_id, display_name, source_id, source_title, duration_minutes, difficulty, motion, case_brief, role)
    values (auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Player'), p_source_id, coalesce(nullif(trim(p_source_title), ''), 'Kenyan law debate'), p_duration_minutes, p_difficulty, coalesce(nullif(trim(p_motion), ''), 'A legal issue for discussion'), p_case_brief, p_role)
    returning * into mine;
    return jsonb_build_object('queued', true, 'queue_id', mine.id);
  end if;

  p1_role := other.role;
  p2_role := p_role;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.debate_rooms (
        source_id, source_title, duration_minutes, status, player_one_id, player_one_name,
        player_two_id, player_two_name, difficulty, motion, case_brief,
        player_one_role, player_two_role, started_at, turn_seconds, share_code, turn_deadline_at
      ) values (
        other.source_id, other.source_title, other.duration_minutes, 'active', other.user_id, other.display_name,
        auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Player'), other.difficulty, other.motion, other.case_brief,
        p1_role, p2_role, now(), greatest(30, ceil((other.duration_minutes * 60)::numeric / 6)::integer), code,
        now() + make_interval(secs => greatest(30, ceil((other.duration_minutes * 60)::numeric / 6)::integer)
      ) returning * into created;
      exit;
    exception when unique_violation then
    end;
  end loop;
  update public.debate_match_queue set status = 'matched', room_id = created.id where id = other.id;
  return jsonb_build_object('queued', false, 'room', to_jsonb(created));
end;
$$;

create or replace function public.get_debate_match_status()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare q public.debate_match_queue; r public.debate_rooms;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select * into q from public.debate_match_queue where user_id = auth.uid() and status in ('waiting', 'matched') order by created_at desc limit 1;
  if q.id is null then return jsonb_build_object('queued', false); end if;
  if q.room_id is not null then
    select * into r from public.debate_rooms where id = q.room_id;
    return jsonb_build_object('queued', false, 'room', to_jsonb(r));
  end if;
  return jsonb_build_object('queued', true, 'queue_id', q.id, 'created_at', q.created_at);
end;
$$;

create or replace function public.create_ai_debate_room(
  p_source_id text,
  p_source_title text,
  p_duration_minutes integer,
  p_difficulty text,
  p_motion text,
  p_case_brief jsonb,
  p_display_name text,
  p_host_role text default 'claimant'
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare created public.debate_rooms; bot_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  delete from public.debate_match_queue where user_id = auth.uid();
  insert into public.debate_rooms (
    source_id, source_title, duration_minutes, status, player_one_id, player_one_name,
    player_two_id, player_two_name, difficulty, motion, case_brief, player_one_role,
    player_two_role, started_at, turn_seconds, share_code, turn_deadline_at
  ) values (
    p_source_id, coalesce(nullif(trim(p_source_title), ''), 'Kenyan law debate'), p_duration_minutes, 'active', auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Player'),
    bot_id, 'AI • BriefBot', p_difficulty, nullif(trim(p_motion), ''), p_case_brief, p_host_role,
    case when p_host_role = 'claimant' then 'defendant' else 'claimant' end, now(), greatest(30, ceil((p_duration_minutes * 60)::numeric / 6)::integer), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    now() + make_interval(secs => greatest(30, ceil((p_duration_minutes * 60)::numeric / 6)::integer)
  ) returning * into created;
  return created;
end;
$$;

create or replace function public.submit_bot_debate_turn(p_room_id uuid, p_content text)
returns public.debate_messages
language plpgsql security definer set search_path = public
as $$
declare room public.debate_rooms; inserted public.debate_messages; phase_name text;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 8000 then raise exception 'AI turn is outside the allowed length'; end if;
  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null or room.status <> 'active' then raise exception 'This room is not accepting AI turns'; end if;
  if room.player_two_id <> '00000000-0000-0000-0000-000000000001' or room.player_one_id <> auth.uid() then raise exception 'This is not your AI match'; end if;
  if mod(room.current_turn, 2) <> 1 then raise exception 'It is the human player''s turn'; end if;
  if room.turn_deadline_at is not null and room.turn_deadline_at <= now() then raise exception 'The AI turn timer has ended'; end if;
  phase_name := case when room.current_turn < 2 then 'opening' when room.current_turn < 4 then 'rebuttal' else 'closing' end;
  insert into public.debate_messages (room_id, user_id, display_name, turn_index, phase, content)
  values (room.id, room.player_two_id, room.player_two_name, room.current_turn, phase_name, trim(p_content)) returning * into inserted;
  update public.debate_rooms set current_turn = current_turn + 1, status = case when current_turn + 1 >= 6 then 'evaluating' else 'active' end, turn_deadline_at = case when current_turn + 1 >= 6 then null else now() + make_interval(secs => room.turn_seconds) end where id = room.id;
  return inserted;
end;
$$;

-- Add points to the existing secure completion path.
create or replace function public.complete_debate_evaluation(
  p_room_id uuid, p_winner_id uuid, p_player_one_score integer, p_player_two_score integer, p_evaluation jsonb
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare room public.debate_rooms; updated public.debate_rooms; loser uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Only the secure evaluator can record a result'; end if;
  if p_player_one_score not between 0 and 100 or p_player_two_score not between 0 and 100 then raise exception 'Scores must be between 0 and 100'; end if;
  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.status = 'finished' then return room; end if;
  if room.status <> 'evaluating' or room.current_turn < 6 then raise exception 'This room is not ready for evaluation'; end if;
  if p_winner_id is not null and p_winner_id <> room.player_one_id and p_winner_id <> room.player_two_id then raise exception 'Winner must be a room participant'; end if;
  loser := case when p_winner_id = room.player_one_id then room.player_two_id when p_winner_id = room.player_two_id then room.player_one_id else null end;
  update public.debate_rooms set status = 'finished', finished_at = now(), winner_id = p_winner_id, player_one_score = p_player_one_score, player_two_score = p_player_two_score, evaluation = coalesce(p_evaluation, '{}'::jsonb) where id = room.id returning * into updated;
  insert into public.debate_leaderboard (user_id, display_name, is_bot, tagline) values (room.player_one_id, room.player_one_name, false, 'Student advocate') on conflict (user_id) do nothing;
  if room.player_two_id <> '00000000-0000-0000-0000-000000000001' then
    insert into public.debate_leaderboard (user_id, display_name, is_bot, tagline) values (room.player_two_id, coalesce(room.player_two_name, 'Opponent'), false, 'Student advocate') on conflict (user_id) do nothing;
  end if;
  update public.debate_leaderboard set matches = matches + 1, total_score = total_score + p_player_one_score, points = points + p_player_one_score + case when p_winner_id = room.player_one_id then 25 when p_winner_id is null then 10 else 5 end, wins = wins + case when p_winner_id = room.player_one_id then 1 else 0 end, losses = losses + case when loser = room.player_one_id then 1 else 0 end, draws = draws + case when p_winner_id is null then 1 else 0 end, rating = greatest(0, rating + case when p_winner_id = room.player_one_id then 24 when loser = room.player_one_id then -18 else 4 end), current_streak = case when p_winner_id = room.player_one_id then current_streak + 1 else 0 end, best_streak = greatest(best_streak, case when p_winner_id = room.player_one_id then current_streak + 1 else best_streak end), updated_at = now() where user_id = room.player_one_id;
  if room.player_two_id = '00000000-0000-0000-0000-000000000001' then
    update public.debate_ai_players set matches = matches + 1, total_score = total_score + p_player_two_score, points = points + p_player_two_score + case when p_winner_id = room.player_two_id then 25 when p_winner_id is null then 10 else 5 end, wins = wins + case when p_winner_id = room.player_two_id then 1 else 0 end, losses = losses + case when loser = room.player_two_id then 1 else 0 end, draws = draws + case when p_winner_id is null then 1 else 0 end, updated_at = now() where user_id = room.player_two_id;
  else
    update public.debate_leaderboard set matches = matches + 1, total_score = total_score + p_player_two_score, points = points + p_player_two_score + case when p_winner_id = room.player_two_id then 25 when p_winner_id is null then 10 else 5 end, wins = wins + case when p_winner_id = room.player_two_id then 1 else 0 end, losses = losses + case when loser = room.player_two_id then 1 else 0 end, draws = draws + case when p_winner_id is null then 1 else 0 end, rating = greatest(0, rating + case when p_winner_id = room.player_two_id then 24 when loser = room.player_two_id then -18 else 4 end), current_streak = case when p_winner_id = room.player_two_id then current_streak + 1 else 0 end, best_streak = greatest(best_streak, case when p_winner_id = room.player_two_id then current_streak + 1 else best_streak end), updated_at = now() where user_id = room.player_two_id;
  end if;
  return updated;
end;
$$;

revoke all on function public.find_debate_match(text,text,integer,text,text,jsonb,text,text) from public, anon;
revoke all on function public.get_debate_match_status() from public, anon;
revoke all on function public.create_ai_debate_room(text,text,integer,text,text,jsonb,text,text) from public, anon;
revoke all on function public.submit_bot_debate_turn(uuid,text) from public, anon;
grant execute on function public.find_debate_match(text,text,integer,text,text,jsonb,text,text) to authenticated;
grant execute on function public.get_debate_match_status() to authenticated;
grant execute on function public.create_ai_debate_room(text,text,integer,text,text,jsonb,text,text) to authenticated;
grant execute on function public.submit_bot_debate_turn(uuid,text) to authenticated;
