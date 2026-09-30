-- Group 13 Hub: super admin, ownership, instant meetings, account deletion.
-- Run AFTER supabase/schema.sql, in the Supabase SQL Editor. Safe to re-run.
-- Super admin email is set in ONE place: the is_super_admin() function below.

-- 0. Clean up an earlier draft (safe if these do not exist) -------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.member_units, public.meetings, public.profiles cascade;

-- 1. Who is the super admin? Checked on the server, never trusted from the browser
create or replace function public.is_super_admin() returns boolean
language sql security definer set search_path = public, auth stable as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'elmakobiero@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- 2. Super admin controls units and the member roster ---------------------------
grant insert, update, delete on public.units, public.members to authenticated;

drop policy if exists "Admin manages units" on public.units;
drop policy if exists "Admin manages members" on public.members;
create policy "Admin manages units" on public.units for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Admin manages members" on public.members for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- 3. Materials: every upload has an owner; owner or admin can delete -------------
alter table public.materials
  add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete set null;

drop policy if exists "Group 13 materials can be created" on public.materials;
drop policy if exists "Owner or admin deletes materials" on public.materials;
create policy "Group 13 materials can be created" on public.materials
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Owner or admin deletes materials" on public.materials
  for delete to authenticated using (owner_id = auth.uid() or public.is_super_admin());
grant delete on public.materials to authenticated;

-- the stored file itself (Supabase stamps the uploader on storage.objects.owner_id)
drop policy if exists "Owner or admin deletes material files" on storage.objects;
create policy "Owner or admin deletes material files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials' and (owner_id = (select auth.uid()::text) or public.is_super_admin()));

drop policy if exists "Owner or admin deletes profile images" on storage.objects;
create policy "Owner or admin deletes profile images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profiles' and ((storage.foldername(name))[1] = (select auth.uid()::text) or public.is_super_admin()));

-- 4. Instant meetings: any member can start one, host or admin can end it --------
alter table public.discussions add column if not exists instant boolean not null default false;
alter table public.discussions
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

drop policy if exists "Members start instant meetings" on public.discussions;
drop policy if exists "Host or admin ends meetings" on public.discussions;
create policy "Members start instant meetings" on public.discussions
  for insert to authenticated with check (created_by = auth.uid() and instant = true);
create policy "Host or admin ends meetings" on public.discussions
  for delete to authenticated using (created_by = auth.uid() or public.is_super_admin());
grant insert, delete on public.discussions to authenticated;

-- 5. Account deletion -----------------------------------------------------------
-- (The app removes the person's storage files first; SQL cannot delete stored files.)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_super_admin() then raise exception 'The super admin account cannot be deleted from the app'; end if;
  delete from public.materials where owner_id = auth.uid();
  delete from public.discussions where created_by = auth.uid() and instant = true;
  delete from auth.users where id = auth.uid();  -- todos and media cascade
end $$;

create or replace function public.admin_list_accounts()
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data->>'display_name', '')::text, u.created_at, u.last_sign_in_at
    from auth.users u order by u.created_at;
end $$;

create or replace function public.admin_remove_account(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  if target = auth.uid() then raise exception 'You cannot remove your own super admin account'; end if;
  delete from public.materials where owner_id = target;
  delete from public.discussions where created_by = target and instant = true;
  delete from auth.users where id = target;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.admin_list_accounts() from public, anon;
revoke execute on function public.admin_remove_account(uuid) from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_remove_account(uuid) to authenticated;
