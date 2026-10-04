-- Realtime multiplayer infrastructure for the Group 13 Games Hub.
-- Players are authenticated Supabase users. Room membership and turn order are enforced server-side.

create table if not exists public.debate_rooms (
  id uuid primary key default gen_random_uuid(),
  source_id text,
  source_title text not null,
  duration_minutes integer not null default 10 check (duration_minutes in (10, 20)),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'evaluating', 'finished', 'cancelled')),
  player_one_id uuid not null references auth.users(id) on delete cascade,
  player_one_name text not null default 'Player 1',
  player_two_id uuid references auth.users(id) on delete set null,
  player_two_name text,
  current_turn integer not null default 0 check (current_turn between 0 and 6),
  started_at timestamptz,
  deadline_at timestamptz,
  finished_at timestamptz,
  winner_id uuid references auth.users(id) on delete set null,
  player_one_score integer check (player_one_score between 0 and 100),
  player_two_score integer check (player_two_score between 0 and 100),
  evaluation jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.debate_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.debate_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  turn_index integer not null check (turn_index between 0 and 5),
  phase text not null check (phase in ('opening', 'rebuttal', 'closing')),
  content text not null check (char_length(trim(content)) between 1 and 8000),
  created_at timestamptz not null default now(),
  unique (room_id, turn_index)
);

create table if not exists public.debate_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  matches integer not null default 0,
  total_score integer not null default 0,
  best_streak integer not null default 0,
  current_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.debate_rooms enable row level security;
alter table public.debate_messages enable row level security;
alter table public.debate_leaderboard enable row level security;

drop policy if exists "Debate participants can read rooms" on public.debate_rooms;
drop policy if exists "Authenticated users can create rooms" on public.debate_rooms;
drop policy if exists "Debate participants can update rooms" on public.debate_rooms;
drop policy if exists "Debate participants can read messages" on public.debate_messages;
drop policy if exists "Debate participants can insert messages" on public.debate_messages;
drop policy if exists "Authenticated users can read leaderboard" on public.debate_leaderboard;

create policy "Debate participants can read rooms" on public.debate_rooms
  for select to authenticated
  using (player_one_id = auth.uid() or player_two_id = auth.uid() or status = 'waiting');

create policy "Authenticated users can create rooms" on public.debate_rooms
  for insert to authenticated
  with check (player_one_id = auth.uid());

create policy "Debate participants can update rooms" on public.debate_rooms
  for update to authenticated
  using (player_one_id = auth.uid() or player_two_id = auth.uid())
  with check (player_one_id = auth.uid() or player_two_id = auth.uid());

create policy "Debate participants can read messages" on public.debate_messages
  for select to authenticated
  using (exists (select 1 from public.debate_rooms r where r.id = room_id and (r.player_one_id = auth.uid() or r.player_two_id = auth.uid())));

create policy "Debate participants can insert messages" on public.debate_messages
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.debate_rooms r where r.id = room_id and (r.player_one_id = auth.uid() or r.player_two_id = auth.uid())));

create policy "Authenticated users can read leaderboard" on public.debate_leaderboard
  for select to authenticated using (true);

grant select, insert, update on public.debate_rooms to authenticated;
grant select, insert on public.debate_messages to authenticated;
grant select on public.debate_leaderboard to authenticated;

create or replace function public.match_debate_room(
  p_source_id text,
  p_source_title text,
  p_duration_minutes integer,
  p_display_name text
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare
  matched public.debate_rooms;
  created public.debate_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_minutes not in (10, 20) then raise exception 'Duration must be 10 or 20 minutes'; end if;

  select * into matched
  from public.debate_rooms
  where status = 'waiting'
    and duration_minutes = p_duration_minutes
    and (source_id is not distinct from p_source_id)
    and player_one_id <> auth.uid()
  order by created_at asc
  for update skip locked
  limit 1;

  if matched.id is not null then
    update public.debate_rooms
    set player_two_id = auth.uid(),
        player_two_name = coalesce(nullif(trim(p_display_name), ''), 'Player 2'),
        status = 'active',
        started_at = now(),
        deadline_at = now() + make_interval(mins => duration_minutes)
    where id = matched.id
    returning * into created;
    return created;
  end if;

  insert into public.debate_rooms (source_id, source_title, duration_minutes, player_one_id, player_one_name)
  values (p_source_id, coalesce(nullif(trim(p_source_title), ''), 'Selected source'), p_duration_minutes, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Player 1'))
  returning * into created;
  return created;
end;
$$;

grant execute on function public.match_debate_room(text, text, integer, text) to authenticated;

create or replace function public.submit_debate_turn(
  p_room_id uuid,
  p_content text,
  p_display_name text
) returns public.debate_messages
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  inserted public.debate_messages;
  expected uuid;
  phase_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 8000 then raise exception 'Turn must contain between 1 and 8000 characters'; end if;
  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.status <> 'active' then raise exception 'This room is not accepting turns'; end if;
  if room.deadline_at is not null and room.deadline_at < now() then raise exception 'The match timer has ended'; end if;
  if room.current_turn >= 6 then raise exception 'All turns have been submitted'; end if;

  expected := case when mod(room.current_turn, 2) = 0 then room.player_one_id else room.player_two_id end;
  if expected <> auth.uid() then raise exception 'It is the other player''s turn'; end if;
  phase_name := case when room.current_turn < 2 then 'opening' when room.current_turn < 4 then 'rebuttal' else 'closing' end;

  insert into public.debate_messages (room_id, user_id, display_name, turn_index, phase, content)
  values (room.id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Player'), room.current_turn, phase_name, trim(p_content))
  returning * into inserted;

  update public.debate_rooms
  set current_turn = current_turn + 1,
      status = case when current_turn + 1 >= 6 then 'evaluating' else 'active' end
  where id = room.id;
  return inserted;
end;
$$;

grant execute on function public.submit_debate_turn(uuid, text, text) to authenticated;

create or replace function public.record_debate_result(
  p_room_id uuid,
  p_winner_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_evaluation jsonb
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  updated public.debate_rooms;
  loser uuid;
  one_streak integer;
  two_streak integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_player_one_score not between 0 and 100 or p_player_two_score not between 0 and 100 then raise exception 'Scores must be between 0 and 100'; end if;
  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if auth.uid() <> room.player_one_id and auth.uid() <> room.player_two_id then raise exception 'Only participants can record a result'; end if;
  if room.status = 'finished' then return room; end if;
  if room.current_turn < 6 then raise exception 'Both players must complete all turns'; end if;
  if p_winner_id is not null and p_winner_id <> room.player_one_id and p_winner_id <> room.player_two_id then raise exception 'Winner must be a room participant'; end if;

  loser := case when p_winner_id = room.player_one_id then room.player_two_id when p_winner_id = room.player_two_id then room.player_one_id else null end;
  update public.debate_rooms
  set status = 'finished', finished_at = now(), winner_id = p_winner_id,
      player_one_score = p_player_one_score, player_two_score = p_player_two_score, evaluation = p_evaluation
  where id = room.id returning * into updated;

  insert into public.debate_leaderboard (user_id, display_name) values (room.player_one_id, room.player_one_name), (room.player_two_id, coalesce(room.player_two_name, 'Player 2')) on conflict (user_id) do nothing;
  select current_streak into one_streak from public.debate_leaderboard where user_id = room.player_one_id;
  select current_streak into two_streak from public.debate_leaderboard where user_id = room.player_two_id;

  update public.debate_leaderboard set matches = matches + 1, total_score = total_score + p_player_one_score,
    wins = wins + case when p_winner_id = room.player_one_id then 1 else 0 end,
    losses = losses + case when loser = room.player_one_id then 1 else 0 end,
    draws = draws + case when p_winner_id is null then 1 else 0 end,
    rating = greatest(0, rating + case when p_winner_id = room.player_one_id then 24 when loser = room.player_one_id then -18 else 4 end),
    current_streak = case when p_winner_id = room.player_one_id then current_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when p_winner_id = room.player_one_id then current_streak + 1 else best_streak end), updated_at = now()
  where user_id = room.player_one_id;
  update public.debate_leaderboard set matches = matches + 1, total_score = total_score + p_player_two_score,
    wins = wins + case when p_winner_id = room.player_two_id then 1 else 0 end,
    losses = losses + case when loser = room.player_two_id then 1 else 0 end,
    draws = draws + case when p_winner_id is null then 1 else 0 end,
    rating = greatest(0, rating + case when p_winner_id = room.player_two_id then 24 when loser = room.player_two_id then -18 else 4 end),
    current_streak = case when p_winner_id = room.player_two_id then current_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when p_winner_id = room.player_two_id then current_streak + 1 else best_streak end), updated_at = now()
  where user_id = room.player_two_id;
  return updated;
end;
$$;

grant execute on function public.record_debate_result(uuid, uuid, integer, integer, jsonb) to authenticated;

-- Realtime broadcasts room and message changes, plus leaderboard updates.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debate_rooms') then alter publication supabase_realtime add table public.debate_rooms; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debate_messages') then alter publication supabase_realtime add table public.debate_messages; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debate_leaderboard') then alter publication supabase_realtime add table public.debate_leaderboard; end if;
end $$;
