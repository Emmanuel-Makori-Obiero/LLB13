-- Older tournament RPCs predate the invite-room implementation and retained the
-- PostgreSQL PUBLIC execute grant. They are not used by the current client.

do $$
begin
  if to_regprocedure('public.create_competition_room(text,text,integer,text,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.create_competition_room(text,text,integer,text,text,text,text,jsonb) from public';
  end if;
  if to_regprocedure('public.join_competition_room(uuid,text,text)') is not null then
    execute 'revoke execute on function public.join_competition_room(uuid,text,text) from public';
  end if;
  if to_regprocedure('public.expire_competition_turn(uuid)') is not null then
    execute 'revoke execute on function public.expire_competition_turn(uuid) from public';
  end if;
end;
$$;

revoke execute on function public.match_debate_room(text, text, integer, text) from public;
revoke execute on function public.record_debate_result(uuid, uuid, integer, integer, jsonb) from public;
