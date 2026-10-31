-- Harden study-group mutations and add a super-admin-managed poster feed.
-- Group rename/delete must remain leader or super-admin only, including direct RPC calls.

revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.delete_group(uuid) from public;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before renaming a group'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Group name must be 1 to 80 characters';
  end if;
  update public.study_groups
  set name = btrim(p_name)
  where id = p_group_id
    and (leader_id = auth.uid() or public.is_super_admin());
  if not found then
    raise exception 'Only the group leader or super admin can rename this group';
  end if;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before deleting a group'; end if;
  delete from public.study_groups
  where id = p_group_id
    and (leader_id = auth.uid() or public.is_super_admin());
  if not found then
    raise exception 'Only the group leader or super admin can delete this group';
  end if;
end;
$$;

-- Club posters are public read-only content, but only the super admin can create,
-- edit, activate, or delete them.
create table if not exists public.club_posters (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  image_url text not null,
  storage_path text not null unique,
  link_url text,
  ai_analysis text not null check (length(btrim(ai_analysis)) > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.club_posters enable row level security;
revoke all on table public.club_posters from public, anon, authenticated;
grant select (id, title, image_url, storage_path, link_url, ai_analysis, created_at) on public.club_posters to anon, authenticated;
grant insert, update, delete on public.club_posters to authenticated;

drop policy if exists "Active club posters are public" on public.club_posters;
create policy "Active club posters are public" on public.club_posters
  for select to anon, authenticated using (is_active or public.is_super_admin());
drop policy if exists "Super admin manages club posters" on public.club_posters;
create policy "Super admin manages club posters" on public.club_posters
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin() and created_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('club-posters', 'club-posters', true)
on conflict (id) do update set public = true;

drop policy if exists "Club posters are readable" on storage.objects;
create policy "Club posters are readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'club-posters');
drop policy if exists "Super admin uploads club posters" on storage.objects;
create policy "Super admin uploads club posters" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'club-posters' and public.is_super_admin());
drop policy if exists "Super admin deletes club posters" on storage.objects;
create policy "Super admin deletes club posters" on storage.objects
  for delete to authenticated
  using (bucket_id = 'club-posters' and public.is_super_admin());

alter table public.club_posters replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_posters'
  ) then
    alter publication supabase_realtime add table public.club_posters;
  end if;
end $$;
