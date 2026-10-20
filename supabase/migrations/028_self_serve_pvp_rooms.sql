-- Self-serve PVP event rooms: any authenticated member may host a two-seat room,
-- and an invitee explicitly chooses the available proposer/opposer side.
-- The existing claimant/defendant values are retained for compatibility with
-- the judge and leaderboard; the UI presents them as proposer/opposer.

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
  if p_duration_minutes not in (10, 20) then raise exception 'Duration must be 10 or 20 minutes'; end if;
  if p_difficulty not in ('beginner', 'intermediate', 'master') then raise exception 'Choose Beginner, Intermediate, or Master'; end if;
  if p_host_role not in ('claimant', 'defendant') then raise exception 'Choose proposer or opposer'; end if;
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
        p_source_id, coalesce(nullif(trim(p_source_title), ''), 'Kenyan law competition'),
        p_duration_minutes, 'waiting', auth.uid(),
        coalesce(nullif(trim(p_display_name), ''), 'Tournament host'), p_difficulty,
        nullif(trim(p_motion), ''), p_case_brief, p_host_role,
        greatest(30, ceil((p_duration_minutes * 60)::numeric / 6)::integer), code
      ) returning * into created;
      return created;
    exception when unique_violation then
      -- Retry only the extremely unlikely invite-code collision.
    end;
  end loop;
end;
$$;

drop function if exists public.join_debate_room(text, text);
create or replace function public.join_debate_room(
  p_share_code text,
  p_display_name text,
  p_join_role text
) returns public.debate_rooms
language plpgsql security definer set search_path = public
as $$
declare
  room public.debate_rooms;
  joined public.debate_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_join_role not in ('claimant', 'defendant') then raise exception 'Choose proposer or opposer'; end if;
  select * into room from public.debate_rooms where share_code = upper(trim(p_share_code)) for update;
  if room.id is null then raise exception 'This invite link is not valid'; end if;
  if room.player_one_id = auth.uid() then return room; end if;
  if room.status <> 'waiting' or room.player_two_id is not null then raise exception 'This room already has its two players'; end if;
  if room.player_one_role = p_join_role then raise exception 'That side is already taken. Choose the other side.'; end if;
  update public.debate_rooms
  set player_two_id = auth.uid(),
      player_two_name = coalesce(nullif(trim(p_display_name), ''), 'Opponent'),
      player_two_role = p_join_role,
      status = 'active', started_at = now(), deadline_at = null,
      turn_deadline_at = now() + make_interval(secs => room.turn_seconds)
  where id = room.id
  returning * into joined;
  return joined;
end;
$$;

revoke all on function public.join_debate_room(text, text, text) from public, anon;
grant execute on function public.join_debate_room(text, text, text) to authenticated;
