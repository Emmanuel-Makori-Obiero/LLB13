-- Supabase's default function privileges grant new public-schema RPCs to anon.
-- Invite-room transitions require an authenticated user, so revoke the inherited
-- anonymous grants explicitly. On older production databases, obsolete tournament
-- RPCs are disabled only when they exist.

revoke execute on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) from anon;
revoke execute on function public.join_debate_room(text, text) from anon;
revoke execute on function public.submit_debate_turn(uuid, text, text) from anon;
revoke execute on function public.expire_debate_turn(uuid) from anon;
revoke execute on function public.complete_debate_evaluation(uuid, uuid, integer, integer, jsonb) from anon;
revoke execute on function public.match_debate_room(text, text, integer, text) from anon;
revoke execute on function public.record_debate_result(uuid, uuid, integer, integer, jsonb) from anon;

do $$
begin
  if to_regprocedure('public.create_competition_room(text,text,integer,text,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.create_competition_room(text,text,integer,text,text,text,text,jsonb) from anon, authenticated';
  end if;
  if to_regprocedure('public.join_competition_room(uuid,text,text)') is not null then
    execute 'revoke execute on function public.join_competition_room(uuid,text,text) from anon, authenticated';
  end if;
  if to_regprocedure('public.expire_competition_turn(uuid)') is not null then
    execute 'revoke execute on function public.expire_competition_turn(uuid) from anon, authenticated';
  end if;
end;
$$;

-- Keep only the authenticated participant RPCs and the service-role result writer.
grant execute on function public.create_debate_room(text, text, integer, text, text, jsonb, text, text) to authenticated;
grant execute on function public.join_debate_room(text, text) to authenticated;
grant execute on function public.submit_debate_turn(uuid, text, text) to authenticated;
grant execute on function public.expire_debate_turn(uuid) to authenticated;
grant execute on function public.complete_debate_evaluation(uuid, uuid, integer, integer, jsonb) to service_role;
