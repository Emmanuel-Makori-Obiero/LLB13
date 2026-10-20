create or replace function public.get_debate_match_status()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  q public.debate_match_queue;
  r public.debate_rooms;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select * into q from public.debate_match_queue
  where user_id = auth.uid() and status in ('waiting', 'matched')
  order by created_at desc limit 1;
  if q.id is null then return jsonb_build_object('queued', false); end if;
  if q.room_id is not null then
    select * into r from public.debate_rooms where id = q.room_id;
    return jsonb_build_object('queued', false, 'room', to_jsonb(r));
  end if;
  return jsonb_build_object('queued', true, 'queue_id', q.id, 'created_at', q.created_at);
end;
$$;

revoke all on function public.get_debate_match_status() from public, anon;
grant execute on function public.get_debate_match_status() to authenticated;
