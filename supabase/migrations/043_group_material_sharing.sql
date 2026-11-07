-- Leader-managed group resources and attendance reset controls.

create table if not exists public.group_material_shares (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  material_id text references public.materials(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 180),
  share_scope text not null check (share_scope in ('group', 'session', 'unit')),
  session_id uuid references public.group_sessions(id) on delete cascade,
  unit_name text,
  storage_path text,
  mime_type text,
  file_size bigint,
  shared_by uuid not null references auth.users(id) on delete cascade,
  library_material_id text references public.materials(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint group_material_scope_values check (
    (share_scope = 'group' and session_id is null and nullif(btrim(coalesce(unit_name, '')), '') is null)
    or (share_scope = 'session' and session_id is not null and nullif(btrim(coalesce(unit_name, '')), '') is null)
    or (share_scope = 'unit' and session_id is null and nullif(btrim(coalesce(unit_name, '')), '') is not null)
  ),
  constraint group_material_source check (material_id is not null or storage_path is not null)
);

create index if not exists group_material_shares_group_idx
  on public.group_material_shares(group_id, created_at desc);
create index if not exists group_material_shares_session_idx
  on public.group_material_shares(session_id)
  where session_id is not null;
create index if not exists group_material_shares_unit_idx
  on public.group_material_shares(group_id, unit_name)
  where unit_name is not null;

alter table public.group_material_shares enable row level security;
revoke all on public.group_material_shares from public, anon, authenticated;
grant select on public.group_material_shares to authenticated;

drop policy if exists "Group members read shared group materials" on public.group_material_shares;
create policy "Group members read shared group materials" on public.group_material_shares
  for select to authenticated
  using (public.is_super_admin() or public.is_group_member(group_id));

create or replace function public.clear_group_session_attendance(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_group_id uuid;
  removed_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in before clearing attendance'; end if;
  select group_id into target_group_id from public.group_sessions where id = p_session_id;
  if target_group_id is null then raise exception 'Group session not found'; end if;
  if not exists (
    select 1 from public.study_groups g
    where g.id = target_group_id and (g.leader_id = auth.uid() or public.is_super_admin())
  ) then raise exception 'Only the group leader or admin can clear attendance'; end if;
  delete from public.group_attendance where session_id = p_session_id;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

create or replace function public.create_group_material_share(
  p_group_id uuid,
  p_title text,
  p_share_scope text,
  p_session_id uuid default null,
  p_unit_name text default null,
  p_material_id text default null,
  p_storage_path text default null,
  p_mime_type text default null,
  p_file_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_id uuid;
  normalized_unit text := nullif(btrim(coalesce(p_unit_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in before sharing a material'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then
    raise exception 'Only the group leader or admin can share materials';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'Material title must be 1 to 180 characters'; end if;
  if p_share_scope not in ('group', 'session', 'unit') then raise exception 'Choose a group, session, or unit scope'; end if;
  if p_material_id is null and p_storage_path is null then raise exception 'Choose a Library material or upload a file'; end if;
  if p_material_id is not null and not exists (select 1 from public.materials where id = p_material_id) then raise exception 'Library material not found'; end if;
  if p_share_scope = 'session' and (p_session_id is null or not exists (select 1 from public.group_sessions s where s.id = p_session_id and s.group_id = p_group_id)) then raise exception 'Choose a session from this group'; end if;
  if p_share_scope = 'unit' and normalized_unit is null then raise exception 'Choose a unit'; end if;
  if p_share_scope = 'group' and (p_session_id is not null or normalized_unit is not null) then raise exception 'Group-wide shares cannot target a session or unit'; end if;
  if p_share_scope <> 'session' and p_session_id is not null then raise exception 'This share does not target a session'; end if;
  if p_share_scope <> 'unit' and normalized_unit is not null then raise exception 'This share does not target a unit'; end if;
  if p_storage_path is not null and p_storage_path not like p_group_id::text || '/%' then raise exception 'Invalid group material path'; end if;
  insert into public.group_material_shares (group_id, material_id, title, share_scope, session_id, unit_name, storage_path, mime_type, file_size, shared_by)
  values (p_group_id, p_material_id, btrim(p_title), p_share_scope, p_session_id, normalized_unit, p_storage_path, p_mime_type, p_file_size, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.mark_group_material_published(p_share_id uuid, p_library_material_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before publishing a group material'; end if;
  if p_library_material_id is null or not exists (select 1 from public.materials where id = p_library_material_id) then raise exception 'Library material not found'; end if;
  update public.group_material_shares s
  set library_material_id = p_library_material_id
  where s.id = p_share_id
    and (s.shared_by = auth.uid() or exists (select 1 from public.study_groups g where g.id = s.group_id and (g.leader_id = auth.uid() or public.is_super_admin())));
  if not found then raise exception 'Only the group leader or original uploader can publish this material'; end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('group-materials', 'group-materials', false)
on conflict (id) do update set public = false;

drop policy if exists "Group members read group material files" on storage.objects;
create policy "Group members read group material files" on storage.objects
  for select to authenticated using (
    bucket_id = 'group-materials'
    and exists (
      select 1 from public.study_group_members m
      where m.group_id = (storage.foldername(name))[1]::uuid and m.user_id = auth.uid()
    )
  );
drop policy if exists "Group leaders upload group material files" on storage.objects;
create policy "Group leaders upload group material files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'group-materials'
    and exists (
      select 1 from public.study_groups g
      where g.id = (storage.foldername(name))[1]::uuid and (g.leader_id = auth.uid() or public.is_super_admin())
    )
  );
drop policy if exists "Group leaders delete group material files" on storage.objects;
create policy "Group leaders delete group material files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'group-materials'
    and exists (
      select 1 from public.study_groups g
      where g.id = (storage.foldername(name))[1]::uuid and (g.leader_id = auth.uid() or public.is_super_admin())
    )
  );

grant execute on function public.clear_group_session_attendance(uuid) to authenticated;
grant execute on function public.create_group_material_share(uuid, text, text, uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.mark_group_material_published(uuid, text) to authenticated;
