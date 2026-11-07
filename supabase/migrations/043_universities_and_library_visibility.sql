-- University identity and audience-scoped Library materials.

alter table public.materials
  add column if not exists sharing_scope text not null default 'all',
  add column if not exists university text;

alter table public.materials drop constraint if exists materials_sharing_scope_check;
alter table public.materials add constraint materials_sharing_scope_check
  check (sharing_scope in ('all', 'university', 'private'));

update public.materials
set sharing_scope = 'all'
where sharing_scope is null or sharing_scope not in ('all', 'university', 'private');

-- Existing accounts: UoN by default, with the known University of Embu exception.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'university', case
      when lower(email) = 'mogoadexter@gmail.com' then 'University of Embu'
      else 'University of Nairobi'
    end
  )
where email is not null;

-- Replace the legacy public-read policy with audience-aware access.
drop policy if exists "Group 13 materials are readable" on public.materials;
drop policy if exists "legacy materials readable by members" on public.materials;
drop policy if exists "Group 13 materials can be created" on public.materials;
drop policy if exists "Group 13 materials can be updated" on public.materials;

create policy "Materials readable by audience" on public.materials
for select to authenticated
using (
  public.is_super_admin()
  or owner_id = auth.uid()
  or sharing_scope = 'all'
  or (
    sharing_scope = 'university'
    and university is not null
    and university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', '')
  )
);

create policy "Learners can create audience materials" on public.materials
for insert to authenticated
with check (
  owner_id = auth.uid()
  and (
    sharing_scope = 'all'
    or sharing_scope = 'private'
    or (sharing_scope = 'university' and university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', ''))
  )
);

create policy "Owners and admins can update audience materials" on public.materials
for update to authenticated
using (owner_id = auth.uid() or public.is_super_admin())
with check (
  public.is_super_admin()
  or (
    owner_id = auth.uid()
    and (
      sharing_scope = 'all'
      or sharing_scope = 'private'
      or (sharing_scope = 'university' and university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', ''))
    )
  )
);

-- Expose university in the existing admin account RPC for search and filtering.
drop function if exists public.admin_list_accounts_with_roles();
create or replace function public.admin_list_accounts_with_roles()
returns table (
  id uuid,
  email text,
  display_name text,
  university text,
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
      coalesce(u.raw_user_meta_data->>'university', '')::text,
      u.created_at,
      u.last_sign_in_at,
      (public.is_primary_admin_account(u.id) or exists (select 1 from public.admin_users a where a.user_id = u.id)) as is_admin,
      public.is_primary_admin_account(u.id) as is_primary_admin
    from auth.users u
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_accounts_with_roles() to authenticated;
