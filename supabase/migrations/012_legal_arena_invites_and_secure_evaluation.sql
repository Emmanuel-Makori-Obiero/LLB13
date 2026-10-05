-- Legal Arena competition hardening: invite-only rooms, role assignments,
-- server-enforced turn clocks, and a service-only result writer.
-- Safe to apply after the earlier legal_games_realtime migration already on production.

alter table public.debate_rooms
  add column if not exists difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'master')),
  add column if not exists motion text,
  add column if not exists case_brief jsonb,
  add column if not exists player_one_role text not null default 'claimant' check (player_one_role in ('claimant', 'defendant')),
  add column if not exists player_two_role text check (player_two_role in ('claimant', 'defendant')),
  add column if not exists turn_deadline_at timestamptz,
  add column if not exists share_code text,
  add column if not exists turn_seconds integer not null default 120 check (turn_seconds between 30 and 900),
  add column if not exists evaluation_started_at timestamptz;

alter table public.debate_rooms
  alter column difficulty set default 'beginner',
  alter column player_one_role set default 'claimant';

update public.debate_rooms
set difficulty = 'beginner'
where difficulty is null or difficulty not in ('beginner', 'intermediate', 'master');

update public.debate_rooms
set player_one_role = 'claimant'
where player_one_role is null or player_one_role not in ('claimant', 'defendant');

update public.debate_rooms
set share_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where share_code is null or length(trim(share_code)) < 8;

alter table public.debate_rooms
  alter column share_code set not null,
  alter column share_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

create unique index if not exists debate_rooms_share_code_key
  on public.debate_rooms (share_code);

-- Rooms and messages are never written directly by browser clients. The RPCs below
-- lock and validate every state transition so a participant cannot take another
-- side's turn, amend the case packet, or overwrite scores.
drop policy if exists "Authenticated users can create rooms" on public.debate_rooms;
drop policy if exists "Debate participants can update rooms" on public.debate_rooms;
drop policy if exists "Debate participants can insert messages" on public.debate_messages;
drop policy if exists "Debate participants can read rooms" on public.debate_rooms;

create policy "Debate participants can read rooms" on public.debate_rooms
  for select to authenticated
  using (player_one_id = auth.uid() or player_two_id = auth.uid());

revoke insert, update, delete on public.debate_rooms from authenticated;
revoke insert, update, delete on public.debate_messages from authenticated;
grant select on public.debate_rooms, public.debate_messages, public.debate_leaderboard to authenticated;

-- A fresh install can host immediately without separately running the older
-- super-admin helper. Existing deployments keep their configured helper.
create or replace function public.is_arena_tournament_admin()
returns boolean
language plpgsql security definer set search_path = public, auth
stable
as $$
declare configured_admin boolean;
begin
  if to_regprocedure('public.is_super_admin()') is not null then
    execute 'select public.is_super_admin()' into configured_admin;
    return coalesce(configured_admin, false);
  end if;
  return exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = lower('elmakobiero@gmail.com')
      and email_confirmed_at is not null
  );
end;
$$;

create or replace function public.create_debate_room(
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
declare
  created public.debate_rooms;
  code text;
  authority jsonb;
  authority_url text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_arena_tournament_admin() then raise exception 'Only a super admin can create a tournament room'; end if;
  if p_duration_minutes not in (10, 20) then raise exception 'Duration must be 10 or 20 minutes'; end if;
  if p_difficulty not in ('beginner', 'intermediate', 'master') then raise exception 'Choose Beginner, Intermediate, or Master'; end if;
  if p_host_role not in ('claimant', 'defendant') then raise exception 'Choose claimant or defendant'; end if;
  if p_case_brief is null or jsonb_typeof(p_case_brief) <> 'object' then raise exception 'A case packet is required'; end if;
  if p_source_id is null or not exists (select 1 from public.materials where id = p_source_id) then raise exception 'Choose an existing library source'; end if;
  if p_case_brief ? 'authorities' and jsonb_typeof(p_case_brief->'authorities') <> 'array' then raise exception 'Case authorities must be an array'; end if;
  for authority in select value from jsonb_array_elements(coalesce(p_case_brief->'authorities', '[]'::jsonb)) loop
    authority_url := coalesce(authority->>'url', '');
    if authority_url !~ '^https://(new\.)?kenyalaw\.org/' then raise exception 'Case authorities must use official Kenya Law links'; end if;
  end loop;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.debate_rooms (
        source_id, source_title, duration_minutes, status, player_one_id,
        player_one_name, difficulty, motion, case_brief, player_one_role,
        turn_seconds, share_code
      ) values (
        p_source_id,
        coalesce(nullif(trim(p_source_title), ''), 'Kenyan law competition'),
        p_duration_minutes,
        'waiting',
        auth.uid(),
        coalesce(nullif(trim(p_display_name), ''), 'Tournament host'),
        p_difficulty,
        nullif(trim(p_motion), ''),
        p_case_brief,
        p_host_role,
        greatest(30, ceil((p_duration_minutes * 60)::numeric / 6)::integer),
        code
      ) returning * into created;
      return created;
    exception when unique_violation then
      -- A code collision is extraordinarily unlikely; generate another one.
    end;
  end loop;
end;
$$;

create or replace function public.join_debate_room(
  p_share_code text,
  p_display_name text
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  joined public.debate_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into room
  from public.debate_rooms
  where share_code = upper(trim(p_share_code))
  for update;

  if room.id is null then raise exception 'This invite link is not valid'; end if;
  if room.player_one_id = auth.uid() then return room; end if;
  if room.status <> 'waiting' or room.player_two_id is not null then raise exception 'This room already has its two players'; end if;

  update public.debate_rooms
  set player_two_id = auth.uid(),
      player_two_name = coalesce(nullif(trim(p_display_name), ''), 'Opponent'),
      player_two_role = case when room.player_one_role = 'claimant' then 'defendant' else 'claimant' end,
      status = 'active',
      started_at = now(),
      -- Each side gets an independent, server-enforced turn clock. There is no
      -- continuously running global clock, so the submitting side's time stops.
      deadline_at = null,
      turn_deadline_at = now() + make_interval(secs => room.turn_seconds)
  where id = room.id
  returning * into joined;
  return joined;
end;
$$;

create or replace function public.submit_debate_turn(
  p_room_id uuid,
  p_content text,
  p_display_name text default null
) returns public.debate_messages
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  inserted public.debate_messages;
  expected uuid;
  phase_name text;
  official_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 8000 then raise exception 'Turn must contain between 1 and 8,000 characters'; end if;

  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.status <> 'active' then raise exception 'This room is not accepting turns'; end if;
  if room.turn_deadline_at is not null and room.turn_deadline_at <= now() then raise exception 'This turn timer has ended. Advance the timed-out turn first.'; end if;
  if room.current_turn >= 6 then raise exception 'All turns have been submitted'; end if;

  expected := case when mod(room.current_turn, 2) = 0 then room.player_one_id else room.player_two_id end;
  if expected is null or expected <> auth.uid() then raise exception 'It is the other side''s turn'; end if;
  official_name := case when expected = room.player_one_id then room.player_one_name else coalesce(room.player_two_name, 'Opponent') end;
  phase_name := case when room.current_turn < 2 then 'opening' when room.current_turn < 4 then 'rebuttal' else 'closing' end;

  insert into public.debate_messages (room_id, user_id, display_name, turn_index, phase, content)
  values (room.id, expected, official_name, room.current_turn, phase_name, trim(p_content))
  returning * into inserted;

  update public.debate_rooms
  set current_turn = current_turn + 1,
      status = case when current_turn + 1 >= 6 then 'evaluating' else 'active' end,
      turn_deadline_at = case when current_turn + 1 >= 6 then null else now() + make_interval(secs => room.turn_seconds) end
  where id = room.id;
  return inserted;
end;
$$;

create or replace function public.expire_debate_turn(
  p_room_id uuid
) returns public.debate_messages
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  inserted public.debate_messages;
  expected uuid;
  phase_name text;
  official_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.status <> 'active' then raise exception 'This room is not accepting turns'; end if;
  if room.player_one_id <> auth.uid() and room.player_two_id <> auth.uid() then raise exception 'Only a participant can advance this room'; end if;
  if room.turn_deadline_at is null or room.turn_deadline_at > now() then raise exception 'The active turn is still within time'; end if;
  if room.current_turn >= 6 then raise exception 'All turns have been submitted'; end if;

  expected := case when mod(room.current_turn, 2) = 0 then room.player_one_id else room.player_two_id end;
  official_name := case when expected = room.player_one_id then room.player_one_name else coalesce(room.player_two_name, 'Opponent') end;
  phase_name := case when room.current_turn < 2 then 'opening' when room.current_turn < 4 then 'rebuttal' else 'closing' end;

  insert into public.debate_messages (room_id, user_id, display_name, turn_index, phase, content)
  values (room.id, expected, official_name, room.current_turn, phase_name, '[No submission was received before the turn timer expired.]')
  returning * into inserted;

  update public.debate_rooms
  set current_turn = current_turn + 1,
      status = case when current_turn + 1 >= 6 then 'evaluating' else 'active' end,
      turn_deadline_at = case when current_turn + 1 >= 6 then null else now() + make_interval(secs => room.turn_seconds) end
  where id = room.id;
  return inserted;
end;
$$;

create or replace function public.complete_debate_evaluation(
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
begin
  if auth.role() <> 'service_role' then raise exception 'Only the secure evaluator can record a result'; end if;
  if p_player_one_score not between 0 and 100 or p_player_two_score not between 0 and 100 then raise exception 'Scores must be between 0 and 100'; end if;

  select * into room from public.debate_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.status = 'finished' then return room; end if;
  if room.status <> 'evaluating' or room.current_turn < 6 then raise exception 'This room is not ready for evaluation'; end if;
  if p_winner_id is not null and p_winner_id <> room.player_one_id and p_winner_id <> room.player_two_id then raise exception 'Winner must be a room participant'; end if;

  loser := case when p_winner_id = room.player_one_id then room.player_two_id when p_winner_id = room.player_two_id then room.player_one_id else null end;
  update public.debate_rooms
  set status = 'finished', finished_at = now(), winner_id = p_winner_id,
      player_one_score = p_player_one_score, player_two_score = p_player_two_score,
      evaluation = coalesce(p_evaluation, '{}'::jsonb)
  where id = room.id
  returning * into updated;

  insert into public.debate_leaderboard (user_id, display_name)
  values (room.player_one_id, room.player_one_name), (room.player_two_id, coalesce(room.player_two_name, 'Opponent'))
  on conflict (user_id) do nothing;

  update public.debate_leaderboard set
    matches = matches + 1, total_score = total_score + p_player_one_score,
    wins = wins + case when p_winner_id = room.player_one_id then 1 else 0 end,
    losses = losses + case when loser = room.player_one_id then 1 else 0 end,
    draws = draws + case when p_winner_id is null then 1 else 0 end,
    rating = greatest(0, rating + case when p_winner_id = room.player_one_id then 24 when loser = room.player_one_id then -18 else 4 end),
    current_streak = case when p_winner_id = room.player_one_id then current_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when p_winner_id = room.player_one_id then current_streak + 1 else best_streak end),
    updated_at = now()
  where user_id = room.player_one_id;

  update public.debate_leaderboard set
    matches = matches + 1, total_score = total_score + p_player_two_score,
    wins = wins + case when p_winner_id = room.player_two_id then 1 else 0 end,
    losses = losses + case when loser = room.player_two_id then 1 else 0 end,
    draws = draws + case when p_winner_id is null then 1 else 0 end,
    rating = greatest(0, rating + case when p_winner_id = room.player_two_id then 24 when loser = room.player_two_id then -18 else 4 end),
    current_streak = case when p_winner_id = room.player_two_id then current_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when p_winner_id = room.player_two_id then current_streak + 1 else best_streak end),
    updated_at = now()
  where user_id = room.player_two_id;

  return updated;
end;
$$;

-- The legacy matcher and browser-callable score writer remain in place for history,
-- but no browser role may call them after this migration.
revoke all on function public.match_debate_room(text, text, integer, text) from public, authenticated;
revoke all on function public.record_debate_result(uuid, uuid, integer, integer, jsonb) from public, authenticated;
revoke all on function public.is_arena_tournament_admin() from public, anon;

revoke all on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) from public;
revoke all on function public.join_debate_room(text, text) from public;
revoke all on function public.submit_debate_turn(uuid, text, text) from public;
revoke all on function public.expire_debate_turn(uuid) from public;
revoke all on function public.complete_debate_evaluation(uuid, uuid, integer, integer, jsonb) from public, authenticated;

grant execute on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) to authenticated;
grant execute on function public.join_debate_room(text, text) to authenticated;
grant execute on function public.submit_debate_turn(uuid, text, text) to authenticated;
grant execute on function public.expire_debate_turn(uuid) to authenticated;
grant execute on function public.complete_debate_evaluation(uuid, uuid, integer, integer, jsonb) to service_role;
grant execute on function public.is_arena_tournament_admin() to authenticated;
