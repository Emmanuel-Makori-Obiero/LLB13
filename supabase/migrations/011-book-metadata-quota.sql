-- Give the Library book-title extractor its own high-cap bucket.
-- It must not consume ordinary text-AI credits, while still retaining an abuse guard.
alter table public.ai_quota_usage
  drop constraint if exists ai_quota_usage_kind_check;
alter table public.ai_quota_usage
  add constraint ai_quota_usage_kind_check
  check (kind in ('text', 'book_metadata', 'podcast', 'image', 'video'));

create or replace function public.reserve_ai_quota(
  p_user_id uuid,
  p_kind text,
  p_limit integer,
  p_window_seconds integer default 3600
) returns table(
  allowed boolean,
  used integer,
  quota integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_used integer;
  oldest_at timestamptz;
  retry_after integer;
begin
  if p_user_id is null then raise exception 'A user is required'; end if;
  if p_kind not in ('text', 'book_metadata', 'podcast', 'image', 'video') then raise exception 'Unknown AI quota kind'; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Invalid AI quota'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_kind, 0));
  delete from public.ai_quota_usage
    where created_at < now() - make_interval(secs => p_window_seconds);

  select count(*)::integer, min(created_at)
    into current_used, oldest_at
    from public.ai_quota_usage
   where user_id = p_user_id
     and kind = p_kind
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if current_used >= p_limit then
    retry_after := greatest(1, ceil(extract(epoch from (oldest_at + make_interval(secs => p_window_seconds) - now())))::integer);
    return query select false, current_used, p_limit, retry_after;
    return;
  end if;

  insert into public.ai_quota_usage(user_id, kind) values (p_user_id, p_kind);
  return query select true, current_used + 1, p_limit, 0;
end;
$$;

revoke execute on function public.reserve_ai_quota(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_quota(uuid, text, integer, integer) to service_role;
