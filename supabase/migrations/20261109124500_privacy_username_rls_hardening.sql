begin;

alter table public.user_directory add column if not exists university text;
update public.user_directory d set university = nullif(u.raw_user_meta_data ->> 'university', '') from auth.users u where u.id = d.user_id and d.university is null;

create or replace function public.ensure_user_directory_row() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare base text; candidate text;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1), 'learner'), '[^a-z0-9_]+', '', 'g'));
  base := left(case when length(base) < 3 then base || 'user' else base end, 23);
  candidate := left(base || '_' || replace(new.id::text, '-', ''), 30);
  insert into public.user_directory(user_id, username, display_name, university)
  values(new.id, candidate, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1), 'Learner'), nullif(new.raw_user_meta_data->>'university',''))
  on conflict(user_id) do update set display_name = excluded.display_name;
  return new;
end; $$;

create or replace function public.current_user_university() returns text language sql stable security definer set search_path = public as $$
  select d.university from public.user_directory d where d.user_id = auth.uid();
$$;

create or replace function public.get_my_username() returns text language sql stable security definer set search_path = public, auth as $$
  select case when nullif(u.raw_user_meta_data ->> 'username', '') is null then null else d.username end
  from public.user_directory d join auth.users u on u.id = d.user_id
  where d.user_id = auth.uid();
$$;

revoke all on function public.current_user_university() from public, anon;
grant execute on function public.current_user_university() to authenticated;
revoke all on function public.get_my_username() from public, anon;
grant execute on function public.get_my_username() to authenticated;
revoke execute on function public.search_user_directory(text) from public, anon;
grant execute on function public.search_user_directory(text) to authenticated;
revoke execute on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;
revoke execute on function public.ensure_user_directory_row() from public, anon, authenticated;

 drop policy if exists "Materials readable by audience" on public.materials;
create policy "Materials readable by audience" on public.materials for select to authenticated using (is_super_admin() or owner_id = auth.uid() or sharing_scope = 'all' or (sharing_scope = 'university' and university is not null and university = public.current_user_university()));

drop policy if exists "Learners can create audience materials" on public.materials;
create policy "Learners can create audience materials" on public.materials for insert to authenticated with check (owner_id = auth.uid() and (sharing_scope in ('all','private') or (sharing_scope = 'university' and university = public.current_user_university())));

drop policy if exists "Owners and admins can update audience materials" on public.materials;
create policy "Owners and admins can update audience materials" on public.materials for update to authenticated using (owner_id = auth.uid() or is_super_admin()) with check (is_super_admin() or (owner_id = auth.uid() and (sharing_scope in ('all','private') or (sharing_scope = 'university' and university = public.current_user_university()))));

drop policy if exists "Audience can read AI documents" on public.ai_documents;
create policy "Audience can read AI documents" on public.ai_documents for select to authenticated using ((scope = 'user' and owner = auth.uid()) or (scope = 'library' and (university is null or university = public.current_user_university())));

drop policy if exists "Users can insert library AI documents" on public.ai_documents;
create policy "Users can insert library AI documents" on public.ai_documents for insert to authenticated with check (scope = 'library' and owner is null and (university is null or university = public.current_user_university()));

drop policy if exists "Audience can read AI chunks" on public.ai_chunks;
create policy "Audience can read AI chunks" on public.ai_chunks for select to authenticated using ((scope = 'user' and owner = auth.uid()) or (scope = 'library' and (university is null or university = public.current_user_university())));

drop policy if exists "Users can insert library AI chunks" on public.ai_chunks;
create policy "Users can insert library AI chunks" on public.ai_chunks for insert to authenticated with check (scope = 'library' and owner is null and (university is null or university = public.current_user_university()) and exists (select 1 from public.ai_documents d where d.id = ai_chunks.document_id and d.scope = 'library' and d.owner is null));

alter table public.user_directory enable row level security;
drop policy if exists "Users can read own directory row" on public.user_directory;
create policy "Users can read own directory row" on public.user_directory for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can update own directory row" on public.user_directory;
create policy "Users can update own directory row" on public.user_directory for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.members enable row level security;
drop policy if exists "Group 13 members are readable" on public.members;
drop policy if exists "members readable by members" on public.members;
create policy "Signed-in users can read member display rows" on public.members for select to authenticated using (auth.uid() is not null);

alter table public.g13_profiles enable row level security;
drop policy if exists "profiles readable by members" on public.g13_profiles;
create policy "Signed-in users can read profile display rows" on public.g13_profiles for select to authenticated using (auth.uid() is not null);

commit;
