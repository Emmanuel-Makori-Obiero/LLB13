-- Atomic per-student hourly quotas for AI-generated content.
-- Apply this migration before deploying the updated Edge Functions.
create table if not exists public.ai_quota_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'podcast', 'image', 'video')),
  created_at timestamptz not null default now()
);
create index if not exists ai_quota_usage_user_kind_time
  on public.ai_quota_usage (user_id, kind, created_at desc);
alter table public.ai_quota_usage enable row level security;

-- The service-role Edge Functions are the only callers. Students never read or write this table.
revoke all on table public.ai_quota_usage from public, anon, authenticated;

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
  if p_kind not in ('text', 'podcast', 'image', 'video') then raise exception 'Unknown AI quota kind'; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Invalid AI quota'; end if;

  -- Serialize reservations for one student and kind. Different students/types do not block each other.
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
