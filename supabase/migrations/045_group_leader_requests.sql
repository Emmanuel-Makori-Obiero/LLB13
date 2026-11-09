-- Student-submitted requests for approved group-leader access.
create table if not exists public.group_leader_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists group_leader_requests_status_created_idx
  on public.group_leader_requests(status, created_at desc);
create unique index if not exists group_leader_requests_one_pending_per_user_idx
  on public.group_leader_requests(user_id) where status = 'pending';

alter table public.group_leader_requests enable row level security;
revoke all on table public.group_leader_requests from public, anon;
grant select, insert on public.group_leader_requests to authenticated;

drop policy if exists "Students manage their own leader requests" on public.group_leader_requests;
create policy "Students manage their own leader requests" on public.group_leader_requests
  for select to authenticated using (user_id = auth.uid());
create policy "Students submit their own leader requests" on public.group_leader_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and (message is null or length(message) <= 500));

create or replace function public.submit_group_leader_request(p_message text default null)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.group_leader_requests;
  created public.group_leader_requests;
begin
  if auth.uid() is null then raise exception 'Please sign in before requesting group-leader access'; end if;
  if length(btrim(coalesce(p_message, ''))) > 500 then raise exception 'The request message must be 500 characters or fewer'; end if;

  select * into existing from public.group_leader_requests r
    where r.user_id = auth.uid() and r.status = 'pending'
    order by r.created_at desc limit 1;
  if existing.id is not null then
    return query select existing.id, existing.status, existing.created_at;
    return;
  end if;

  insert into public.group_leader_requests(user_id, message)
    values (auth.uid(), nullif(btrim(p_message), ''))
    returning * into created;
  return query select created.id, created.status, created.created_at;
end;
$$;

create or replace function public.get_my_group_leader_request()
returns table (id uuid, status text, message text, created_at timestamptz, reviewed_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.id, r.status, r.message, r.created_at, r.reviewed_at
  from public.group_leader_requests r
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 1;
$$;

create or replace function public.admin_list_group_leader_requests()
returns table (id uuid, user_id uuid, email text, display_name text, message text, status text, created_at timestamptz, reviewed_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authorized administrator can view group-leader requests';
  end if;
  return query
    select r.id, r.user_id, u.email::text,
      coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1))::text,
      r.message, r.status, r.created_at, r.reviewed_at
    from public.group_leader_requests r
    join auth.users u on u.id = r.user_id
    order by case when r.status = 'pending' then 0 else 1 end, r.created_at desc;
end;
$$;

create or replace function public.admin_review_group_leader_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.group_leader_requests;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authorized administrator can review group-leader requests';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'The request decision is invalid'; end if;

  select * into request_row from public.group_leader_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'The group-leader request was not found'; end if;
  if request_row.status <> 'pending' then raise exception 'This group-leader request has already been reviewed'; end if;

  if p_decision = 'approved' then
    insert into public.group_leaders(user_id, granted_by)
      values (request_row.user_id, auth.uid())
      on conflict (user_id) do nothing;
  end if;
  update public.group_leader_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;
end;
$$;

revoke all on function public.submit_group_leader_request(text) from public, anon;
revoke all on function public.get_my_group_leader_request() from public, anon;
revoke all on function public.admin_list_group_leader_requests() from public, anon;
revoke all on function public.admin_review_group_leader_request(uuid, text) from public, anon;
grant execute on function public.submit_group_leader_request(text) to authenticated;
grant execute on function public.get_my_group_leader_request() to authenticated;
grant execute on function public.admin_list_group_leader_requests() to authenticated;
grant execute on function public.admin_review_group_leader_request(uuid, text) to authenticated;
