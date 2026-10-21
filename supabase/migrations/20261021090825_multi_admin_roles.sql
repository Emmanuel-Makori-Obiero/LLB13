-- Add delegated administrators while preserving the verified founder account
-- as the only principal that may grant or revoke administrator roles.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_primary_admin_account(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = target_user_id
      and lower(u.email) = 'elmakobiero@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_primary_admin_account(auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_primary_admin()
    or exists (
      select 1
      from public.admin_users a
      where a.user_id = auth.uid()
    );
$$;

-- Keep every existing policy and RPC that calls is_super_admin() working, but
-- make that legacy check recognize delegated admins as well.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_admin();
$$;

revoke all on function public.is_primary_admin_account(uuid) from public, anon, authenticated;
revoke all on function public.is_primary_admin() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_primary_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.admin_list_accounts_with_roles()
returns table (
  id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  is_primary_admin boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce(u.raw_user_meta_data->>'display_name', '')::text,
      u.created_at,
      u.last_sign_in_at,
      (public.is_primary_admin_account(u.id) or exists (
        select 1 from public.admin_users a where a.user_id = u.id
      )) as is_admin,
      public.is_primary_admin_account(u.id) as is_primary_admin
    from auth.users u
    order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_account_admin(target uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_primary_admin() then
    raise exception 'Only the primary admin can grant or revoke admin access';
  end if;
  if target is null then raise exception 'Choose a registered account'; end if;
  if not exists (
    select 1 from auth.users u
    where u.id = target and u.email_confirmed_at is not null
  ) then
    raise exception 'The account must have a verified email before becoming an admin';
  end if;
  if public.is_primary_admin_account(target) then
    if not enabled then raise exception 'The primary admin role cannot be removed'; end if;
    return;
  end if;
  if enabled then
    insert into public.admin_users (user_id, granted_by)
    values (target, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.admin_users where user_id = target;
  end if;
end;
$$;

create or replace function public.admin_remove_account(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if target is null or target = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  if public.is_primary_admin_account(target) then
    raise exception 'The primary admin account cannot be removed';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = target)
     and not public.is_primary_admin() then
    raise exception 'Only the primary admin can remove another admin account';
  end if;
  if not exists (select 1 from auth.users u where u.id = target) then
    raise exception 'Account not found';
  end if;
  delete from public.materials where owner_id = target;
  delete from public.discussions where created_by = target and instant = true;
  delete from auth.users where id = target;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_primary_admin() then
    raise exception 'The primary admin account cannot be deleted from the app';
  end if;
  delete from public.materials where owner_id = auth.uid();
  delete from public.discussions where created_by = auth.uid() and instant = true;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.admin_list_accounts_with_roles() from public, anon;
revoke all on function public.admin_set_account_admin(uuid, boolean) from public, anon;
revoke all on function public.admin_remove_account(uuid) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.admin_list_accounts_with_roles() to authenticated;
grant execute on function public.admin_set_account_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_remove_account(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
