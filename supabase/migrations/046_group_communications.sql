-- Group recordings, announcements, public usernames, and private direct messages.

alter table public.group_material_shares
  add column if not exists content_kind text not null default 'resource';

alter table public.group_material_shares drop constraint if exists group_material_shares_content_kind;
alter table public.group_material_shares
  add constraint group_material_shares_content_kind
  check (content_kind in ('resource', 'class_recording', 'discussion_recording'));

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.study_groups(id) on delete cascade,
  author_name text not null default 'Group leader',
  title text not null check (length(btrim(title)) between 3 and 180),
  message text,
  body text,
  created_by uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.group_announcements add column if not exists group_id uuid references public.study_groups(id) on delete cascade;
alter table public.group_announcements add column if not exists body text;
alter table public.group_announcements add column if not exists pinned boolean not null default false;
alter table public.group_announcements add column if not exists updated_at timestamptz not null default now();
update public.group_announcements set body = coalesce(nullif(body, ''), message) where body is null and message is not null;
create index if not exists group_announcements_group_idx on public.group_announcements(group_id, pinned desc, created_at desc);
alter table public.group_announcements enable row level security;
revoke all on public.group_announcements from public, anon, authenticated;
grant select on public.group_announcements to authenticated;
grant insert, update, delete on public.group_announcements to authenticated;
drop policy if exists "Members can read announcements" on public.group_announcements;
drop policy if exists "Members can create announcements" on public.group_announcements;
drop policy if exists "Group members read announcements" on public.group_announcements;
create policy "Group members read announcements" on public.group_announcements for select to authenticated
  using (public.is_super_admin() or public.is_group_member(group_id));
drop policy if exists "Group leaders manage announcements" on public.group_announcements;
create policy "Group leaders manage announcements" on public.group_announcements for all to authenticated
  using (exists (select 1 from public.study_groups g where g.id = group_id and (g.leader_id = auth.uid() or public.is_super_admin())))
  with check (exists (select 1 from public.study_groups g where g.id = group_id and (g.leader_id = auth.uid() or public.is_super_admin())) and created_by = auth.uid());

create or replace function public.create_group_announcement(p_group_id uuid, p_title text, p_body text, p_pinned boolean default false)
returns public.group_announcements language plpgsql security definer set search_path = public, auth as $$
declare created public.group_announcements;
begin
  if auth.uid() is null then raise exception 'Sign in before posting an announcement'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then raise exception 'Only the group leader or admin can post announcements'; end if;
  insert into public.group_announcements(group_id, title, message, body, created_by, author_name, pinned)
  values (p_group_id, btrim(p_title), btrim(p_body), btrim(p_body), auth.uid(), coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', 'Group leader'), coalesce(p_pinned, false)) returning * into created;
  return created;
end; $$;
grant execute on function public.create_group_announcement(uuid, text, text, boolean) to authenticated;

-- Extend the existing secure group-share RPC without changing its original call contract.
drop function if exists public.create_group_material_share(uuid, text, text, uuid, text, text, text, text, bigint);
create or replace function public.create_group_material_share(
  p_group_id uuid, p_title text, p_share_scope text, p_session_id uuid default null,
  p_unit_name text default null, p_material_id text default null, p_storage_path text default null,
  p_mime_type text default null, p_file_size bigint default null, p_content_kind text default 'resource'
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare new_id uuid; normalized_unit text := nullif(btrim(coalesce(p_unit_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in before sharing a material'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then raise exception 'Only the group leader or admin can share materials'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 180 then raise exception 'Title must be 1 to 180 characters'; end if;
  if p_share_scope not in ('group', 'session', 'unit') then raise exception 'Choose a group, session, or unit scope'; end if;
  if p_content_kind not in ('resource', 'class_recording', 'discussion_recording') then raise exception 'Choose a valid recording type'; end if;
  if p_material_id is null and p_storage_path is null then raise exception 'Choose a Library material or upload a file'; end if;
  if p_material_id is not null and not exists (select 1 from public.materials where id = p_material_id) then raise exception 'Library material not found'; end if;
  if p_share_scope = 'session' and (p_session_id is null or not exists (select 1 from public.group_sessions s where s.id = p_session_id and s.group_id = p_group_id)) then raise exception 'Choose a session from this group'; end if;
  if p_share_scope = 'unit' and normalized_unit is null then raise exception 'Choose a unit'; end if;
  if p_share_scope = 'group' and (p_session_id is not null or normalized_unit is not null) then raise exception 'Group-wide shares cannot target a session or unit'; end if;
  if p_share_scope <> 'session' and p_session_id is not null then raise exception 'This share does not target a session'; end if;
  if p_share_scope <> 'unit' and normalized_unit is not null then raise exception 'This share does not target a unit'; end if;
  if p_storage_path is not null and p_storage_path not like p_group_id::text || '/%' then raise exception 'Invalid group material path'; end if;
  insert into public.group_material_shares(group_id, material_id, title, share_scope, session_id, unit_name, storage_path, mime_type, file_size, shared_by, content_kind)
  values (p_group_id, p_material_id, btrim(p_title), p_share_scope, p_session_id, normalized_unit, p_storage_path, p_mime_type, p_file_size, auth.uid(), p_content_kind)
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function public.create_group_material_share(uuid, text, text, uuid, text, text, text, text, bigint, text) to authenticated;

create table if not exists public.user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null default 'Learner',
  updated_at timestamptz not null default now()
);
create index if not exists user_directory_username_idx on public.user_directory(username);
alter table public.user_directory enable row level security;
revoke all on public.user_directory from public, anon, authenticated;
grant select on public.user_directory to authenticated;
create or replace function public.ensure_user_directory_row() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare base text; candidate text;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'learner'), '[^a-z0-9_]+', '', 'g'));
  base := left(case when length(base) < 3 then base || 'user' else base end, 23);
  candidate := left(base || '_' || replace(new.id::text, '-', ''), 30);
  insert into public.user_directory(user_id, username, display_name)
  values (new.id, candidate, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'Learner'))
  on conflict (user_id) do update set display_name = excluded.display_name;
  return new;
end; $$;
drop trigger if exists ensure_user_directory_row on auth.users;
create trigger ensure_user_directory_row after insert or update of raw_user_meta_data on auth.users for each row execute function public.ensure_user_directory_row();
insert into public.user_directory(user_id, username, display_name)
select u.id,
  left(lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'learner'), '[^a-z0-9_]+', '', 'g')) || '_' || replace(u.id::text, '-', ''), 30),
  coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1), 'Learner')
from auth.users u
on conflict (user_id) do nothing;

create or replace function public.set_my_username(p_username text) returns public.user_directory language plpgsql security definer set search_path = public, auth as $$
declare result public.user_directory; normalized text := lower(btrim(p_username));
begin
  if auth.uid() is null then raise exception 'Sign in before changing your username'; end if;
  if normalized !~ '^[a-z0-9_]{3,30}$' then raise exception 'Username must be 3 to 30 characters using letters, numbers, or underscores'; end if;
  update public.user_directory set username = normalized, updated_at = now() where user_id = auth.uid() returning * into result;
  if result.user_id is null then raise exception 'Username profile not found'; end if;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', normalized) where id = auth.uid();
  return result;
exception when unique_violation then raise exception 'That username is already taken';
end; $$;
grant execute on function public.set_my_username(text) to authenticated;

create or replace function public.search_user_directory(p_query text default '')
returns table(user_id uuid, username text, display_name text) language sql security definer set search_path = public as $$
  select d.user_id, d.username, d.display_name from public.user_directory d
  where auth.uid() is not null and (btrim(coalesce(p_query, '')) = '' or d.username ilike '%' || lower(btrim(p_query)) || '%' or d.display_name ilike '%' || btrim(p_query) || '%')
  order by d.username limit 30;
$$;
grant execute on function public.search_user_directory(text) to authenticated;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_pair_idx on public.direct_messages(sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_recipient_idx on public.direct_messages(recipient_id, created_at desc);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon, authenticated;
grant select, insert, update on public.direct_messages to authenticated;
drop policy if exists "Users read their direct messages" on public.direct_messages;
create policy "Users read their direct messages" on public.direct_messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "Users send direct messages" on public.direct_messages;
create policy "Users send direct messages" on public.direct_messages for insert to authenticated with check (sender_id = auth.uid() and sender_id <> recipient_id);
drop policy if exists "Recipients mark messages read" on public.direct_messages;
create policy "Recipients mark messages read" on public.direct_messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_announcements') then alter publication supabase_realtime add table public.group_announcements; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages') then alter publication supabase_realtime add table public.direct_messages; end if;
end $$;
