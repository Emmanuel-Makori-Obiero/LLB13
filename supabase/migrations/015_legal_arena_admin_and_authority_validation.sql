-- Bring existing production rooms in line with the self-contained Legal Arena
-- migration: retain configured super-admins, provide the bootstrap fallback, and
-- validate case-packet source boundaries on the server.

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
      -- Generate a different private invite code.
    end;
  end loop;
end;
$$;

revoke all on function public.is_arena_tournament_admin() from public, anon;
revoke execute on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) from anon;
grant execute on function public.is_arena_tournament_admin() to authenticated;
grant execute on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) to authenticated;
