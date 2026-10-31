-- Study groups and accountability attendance are separate from lesson attendance.
-- This migration only creates new tables, helpers, triggers, policies, and RPCs.

create table if not exists public.group_leaders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  leader_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (user_id)
);

create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  kind text not null check (kind in ('daily', 'project')),
  title text not null check (length(btrim(title)) between 1 and 120),
  project_label text,
  session_date date not null,
  check_in_cutoff time,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (project_label is null or length(project_label) <= 120)
);

create table if not exists public.group_attendance (
  session_id uuid not null references public.group_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'excused', 'absent')),
  note text check (note is null or length(note) <= 200),
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists study_group_members_group_idx on public.study_group_members(group_id, joined_at);
create index if not exists group_sessions_group_date_idx on public.group_sessions(group_id, session_date desc);
create index if not exists group_attendance_user_idx on public.group_attendance(user_id, marked_at desc);

alter table public.group_leaders enable row level security;
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.group_sessions enable row level security;
alter table public.group_attendance enable row level security;

revoke all on table public.group_leaders from public, anon, authenticated;
revoke all on table public.study_groups from public, anon, authenticated;
revoke all on table public.study_group_members from public, anon, authenticated;
revoke all on table public.group_sessions from public, anon, authenticated;
revoke all on table public.group_attendance from public, anon, authenticated;

grant select (id, name, leader_id, created_at) on public.study_groups to authenticated;
grant select (group_id, user_id, display_name, joined_at) on public.study_group_members to authenticated;
grant select (id, group_id, kind, title, project_label, session_date, check_in_cutoff, status, created_by, created_at) on public.group_sessions to authenticated;
grant select (session_id, user_id, status, note, marked_by, marked_at) on public.group_attendance to authenticated;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.study_group_members m
    where m.group_id = target_group_id and m.user_id = auth.uid()
  );
$$;

drop policy if exists "Members and admins read visible study groups" on public.study_groups;
create policy "Members and admins read visible study groups" on public.study_groups
  for select to authenticated
  using (public.is_super_admin() or leader_id = auth.uid() or public.is_group_member(id));

drop policy if exists "Members and admins read visible group rosters" on public.study_group_members;
create policy "Members and admins read visible group rosters" on public.study_group_members
  for select to authenticated
  using (public.is_super_admin() or public.is_group_member(group_id));

drop policy if exists "Members and admins read visible group sessions" on public.group_sessions;
create policy "Members and admins read visible group sessions" on public.group_sessions
  for select to authenticated
  using (public.is_super_admin() or public.is_group_member(group_id));

drop policy if exists "Members and admins read visible group attendance" on public.group_attendance;
create policy "Members and admins read visible group attendance" on public.group_attendance
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.group_sessions s
      where s.id = session_id and public.is_group_member(s.group_id)
    )
  );

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.study_group_members m
    where m.group_id = target_group_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_create_study_group()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    public.is_super_admin()
    or exists (select 1 from public.group_leaders l where l.user_id = auth.uid())
  );
$$;

create or replace function public.group_member_limit()
returns integer
language sql
immutable
security definer
set search_path = public, auth
as $$
  select 15;
$$;

create or replace function public.make_group_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := uuid_send(gen_random_uuid());
  result_code text := '';
  index_value integer;
begin
  for index_value in 0..7 loop
    result_code := result_code || substr(alphabet, (get_byte(random_bytes, index_value) % 32) + 1, 1);
  end loop;
  return result_code;
end;
$$;

create or replace function public.enforce_study_group_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  locked_group_id uuid;
  member_count integer;
begin
  if tg_op = 'UPDATE' and new.group_id = old.group_id then
    return new;
  end if;
  select g.id into locked_group_id
  from public.study_groups g
  where g.id = new.group_id
  for update;
  if locked_group_id is null then
    raise exception 'Study group not found';
  end if;
  select count(*) into member_count
  from public.study_group_members m
  where m.group_id = new.group_id and m.user_id <> new.user_id;
  if member_count >= public.group_member_limit() then
    raise exception using errcode = 'P0001',
      message = format('GROUP_FULL: This group already has %s members.', public.group_member_limit());
  end if;
  return new;
end;
$$;

drop trigger if exists study_group_members_capacity on public.study_group_members;
create trigger study_group_members_capacity
  before insert or update of group_id, user_id on public.study_group_members
  for each row execute function public.enforce_study_group_capacity();

create or replace function public.enforce_group_attendance_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_group_id uuid;
begin
  select s.group_id into target_group_id
  from public.group_sessions s where s.id = new.session_id;
  if target_group_id is null then
    raise exception 'Group session not found';
  end if;
  if not exists (
    select 1 from public.study_group_members m
    where m.group_id = target_group_id and m.user_id = new.user_id
  ) then
    raise exception 'Attendance can only be recorded for a member of this group';
  end if;
  if new.note is not null and length(new.note) > 200 then
    raise exception 'Attendance notes must be 200 characters or fewer';
  end if;
  return new;
end;
$$;

drop trigger if exists group_attendance_membership on public.group_attendance;
create trigger group_attendance_membership
  before insert or update on public.group_attendance
  for each row execute function public.enforce_group_attendance_membership();

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_group_id uuid;
  new_code text;
  display_label text;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a group'; end if;
  if not public.can_create_study_group() then raise exception 'Only an approved group leader or admin can create a group'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Group name must be 1 to 80 characters'; end if;
  if exists (select 1 from public.study_group_members m where m.user_id = auth.uid()) then
    raise exception 'Leave your current group before creating another one';
  end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Member')
    into display_label from auth.users u where u.id = auth.uid();
  new_code := public.make_group_invite_code();
  insert into public.study_groups (name, leader_id, invite_code)
    values (btrim(p_name), auth.uid(), new_code) returning id into new_group_id;
  insert into public.study_group_members (group_id, user_id, display_name)
    values (new_group_id, auth.uid(), display_label);
  return new_group_id;
end;
$$;

create or replace function public.join_group(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_group_id uuid;
  display_label text;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a group'; end if;
  if exists (select 1 from public.study_group_members m where m.user_id = auth.uid()) then
    raise exception 'You already belong to a group. Leave it before joining another one.';
  end if;
  select g.id into target_group_id from public.study_groups g
  where g.invite_code = upper(btrim(coalesce(p_invite_code, '')));
  if target_group_id is null then raise exception 'Invite code not found. Check the 8-character code and try again.'; end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Member')
    into display_label from auth.users u where u.id = auth.uid();
  begin
    insert into public.study_group_members (group_id, user_id, display_name)
      values (target_group_id, auth.uid(), display_label);
  exception when unique_violation then
    if exists (select 1 from public.study_group_members m where m.user_id = auth.uid()) then
      raise exception 'You already belong to a group. Leave it before joining another one.';
    end if;
    raise;
  end;
  return target_group_id;
end;
$$;

create or replace function public.leave_group()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before leaving a group'; end if;
  select m.group_id into current_group_id from public.study_group_members m where m.user_id = auth.uid();
  if current_group_id is null then raise exception 'You are not currently in a group'; end if;
  if exists (select 1 from public.study_groups g where g.id = current_group_id and g.leader_id = auth.uid()) then
    raise exception 'The leader cannot leave the group. Delete the group or ask an admin to manage it.';
  end if;
  delete from public.study_group_members where group_id = current_group_id and user_id = auth.uid();
end;
$$;

create or replace function public.get_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare result_code text;
begin
  if auth.uid() is null then raise exception 'Sign in to view the invite code'; end if;
  select g.invite_code into result_code from public.study_groups g
  where g.id = p_group_id
    and (g.leader_id = auth.uid() or public.is_super_admin());
  if result_code is null then raise exception 'Only the group leader or admin can view this invite code'; end if;
  return result_code;
end;
$$;

create or replace function public.reset_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_code text;
begin
  if auth.uid() is null then raise exception 'Sign in to reset the invite code'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then
    raise exception 'Only the group leader or admin can reset this invite code';
  end if;
  new_code := public.make_group_invite_code();
  update public.study_groups set invite_code = new_code where id = p_group_id;
  return new_code;
end;
$$;

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before renaming a group'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Group name must be 1 to 80 characters'; end if;
  update public.study_groups set name = btrim(p_name)
  where id = p_group_id and (leader_id = auth.uid() or public.is_super_admin());
  if not found then raise exception 'Only the group leader or admin can rename this group'; end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before managing the roster'; end if;
  if p_user_id = auth.uid() and exists (select 1 from public.study_groups g where g.id = p_group_id and g.leader_id = auth.uid()) then
    raise exception 'The leader cannot remove themselves. Delete the group or ask an admin to manage it.';
  end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then
    raise exception 'Only the group leader or admin can remove members';
  end if;
  delete from public.study_group_members where group_id = p_group_id and user_id = p_user_id;
  if not found then raise exception 'That member is no longer in this group'; end if;
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
  where id = p_group_id and (leader_id = auth.uid() or public.is_super_admin());
  if not found then raise exception 'Only the group leader or admin can delete this group'; end if;
end;
$$;

create or replace function public.create_session(
  p_group_id uuid,
  p_kind text,
  p_title text,
  p_session_date date,
  p_project_label text default null,
  p_check_in_cutoff time default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare new_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a session'; end if;
  if p_kind not in ('daily', 'project') then raise exception 'Choose a daily or project session'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Session title must be 1 to 120 characters'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then
    raise exception 'Only the group leader or admin can create sessions';
  end if;
  insert into public.group_sessions (group_id, kind, title, project_label, session_date, check_in_cutoff, created_by)
  values (p_group_id, p_kind, btrim(p_title), nullif(btrim(p_project_label), ''), p_session_date, p_check_in_cutoff, auth.uid())
  returning id into new_session_id;
  return new_session_id;
end;
$$;

create or replace function public.close_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before closing a session'; end if;
  update public.group_sessions s set status = 'closed'
  where s.id = p_session_id and s.status = 'open'
    and exists (select 1 from public.study_groups g where g.id = s.group_id and (g.leader_id = auth.uid() or public.is_super_admin()));
  if not found then raise exception 'Only the group leader or admin can close an open session'; end if;
end;
$$;

create or replace function public.delete_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before deleting a session'; end if;
  delete from public.group_sessions s
  where s.id = p_session_id
    and exists (select 1 from public.study_groups g where g.id = s.group_id and (g.leader_id = auth.uid() or public.is_super_admin()));
  if not found then raise exception 'Only the group leader or admin can delete this session'; end if;
end;
$$;

create or replace function public.mark_attendance(
  p_session_id uuid,
  p_user_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_group_id uuid; session_state text;
begin
  if auth.uid() is null then raise exception 'Sign in before marking attendance'; end if;
  if p_status not in ('present', 'late', 'excused', 'absent') then raise exception 'Choose a valid attendance status'; end if;
  if p_note is not null and length(p_note) > 200 then raise exception 'Attendance notes must be 200 characters or fewer'; end if;
  select s.group_id, s.status into target_group_id, session_state
  from public.group_sessions s where s.id = p_session_id;
  if target_group_id is null then raise exception 'Group session not found'; end if;
  if session_state <> 'open' then raise exception 'Attendance can only be changed while the session is open'; end if;
  if not exists (select 1 from public.study_groups g where g.id = target_group_id and (g.leader_id = auth.uid() or public.is_super_admin())) then
    raise exception 'Only the group leader or admin can mark attendance';
  end if;
  if not exists (select 1 from public.study_group_members m where m.group_id = target_group_id and m.user_id = p_user_id) then
    raise exception 'Attendance can only be recorded for a member of this group';
  end if;
  insert into public.group_attendance (session_id, user_id, status, note, marked_by)
  values (p_session_id, p_user_id, p_status, nullif(p_note, ''), auth.uid())
  on conflict (session_id, user_id) do update
    set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, marked_at = now();
end;
$$;

create or replace function public.check_in(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_group_id uuid; session_state text; cutoff time; target_date date; checkin_status text;
begin
  if auth.uid() is null then raise exception 'Sign in before checking in'; end if;
  select s.group_id, s.status, s.check_in_cutoff, s.session_date
    into target_group_id, session_state, cutoff, target_date
  from public.group_sessions s where s.id = p_session_id;
  if target_group_id is null then raise exception 'Group session not found'; end if;
  if session_state <> 'open' then raise exception 'This session is closed'; end if;
  if not public.is_group_member(target_group_id) then raise exception 'Only a member of this group can check in'; end if;
  checkin_status := case
    when cutoff is not null and (now() at time zone 'Africa/Nairobi') > (target_date + cutoff) then 'late'
    else 'present'
  end;
  insert into public.group_attendance (session_id, user_id, status, marked_by)
  values (p_session_id, auth.uid(), checkin_status, auth.uid())
  on conflict (session_id, user_id) do nothing;
  select a.status into checkin_status from public.group_attendance a
  where a.session_id = p_session_id and a.user_id = auth.uid();
  return checkin_status;
end;
$$;

create or replace function public.group_attendance_summary(p_group_id uuid, p_from date, p_to date)
returns table (
  group_id uuid,
  user_id uuid,
  display_name text,
  sessions_held bigint,
  present bigint,
  late bigint,
  excused bigint,
  absent bigint,
  attendance_percentage numeric,
  last_active_date date
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to read group attendance'; end if;
  if not (public.is_super_admin() or public.is_group_member(p_group_id)) then raise exception 'Only group members and admins can read this summary'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid date range'; end if;
  return query
  with roster as (
    select m.group_id, m.user_id, m.display_name, m.joined_at::date as joined_date
    from public.study_group_members m where m.group_id = p_group_id
  ), totals as (
    select r.group_id, r.user_id,
      count(s.id) filter (where s.status = 'closed') as sessions_held,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'present') as present,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'late') as late,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'excused') as excused,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'absent') as absent,
      max(s.session_date) filter (where a.status in ('present', 'late')) as last_active_date
    from roster r
    left join public.group_sessions s on s.group_id = r.group_id and s.session_date between greatest(p_from, r.joined_date) and p_to
    left join public.group_attendance a on a.session_id = s.id and a.user_id = r.user_id
    group by r.group_id, r.user_id
  )
  select r.group_id, r.user_id, r.display_name,
    coalesce(t.sessions_held, 0), coalesce(t.present, 0), coalesce(t.late, 0),
    coalesce(t.excused, 0), coalesce(t.absent, 0),
    case when coalesce(t.sessions_held, 0) = 0 then 0::numeric
      when coalesce(t.sessions_held, 0) - coalesce(t.excused, 0) <= 0 then 100::numeric
      else round(100.0 * (coalesce(t.present, 0) + coalesce(t.late, 0)) / (t.sessions_held - t.excused), 1) end,
    t.last_active_date
  from roster r left join totals t on t.group_id = r.group_id and t.user_id = r.user_id
  order by r.display_name;
end;
$$;

create or replace function public.lecturer_attendance_summary(p_from date, p_to date)
returns table (
  group_id uuid,
  group_name text,
  user_id uuid,
  display_name text,
  sessions_held bigint,
  present bigint,
  late bigint,
  excused bigint,
  absent bigint,
  attendance_percentage numeric,
  last_active_date date
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception 'Only approved admins can read all group attendance'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid date range'; end if;
  return query
  with roster as (
    select m.group_id, g.name as group_name, m.user_id, m.display_name, m.joined_at::date as joined_date
    from public.study_group_members m join public.study_groups g on g.id = m.group_id
  ), totals as (
    select r.group_id, r.user_id,
      count(s.id) filter (where s.status = 'closed') as sessions_held,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'present') as present,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'late') as late,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'excused') as excused,
      count(a.session_id) filter (where s.status = 'closed' and a.status = 'absent') as absent,
      max(s.session_date) filter (where a.status in ('present', 'late')) as last_active_date
    from roster r
    left join public.group_sessions s on s.group_id = r.group_id and s.session_date between greatest(p_from, r.joined_date) and p_to
    left join public.group_attendance a on a.session_id = s.id and a.user_id = r.user_id
    group by r.group_id, r.user_id
  )
  select r.group_id, r.group_name, r.user_id, r.display_name,
    coalesce(t.sessions_held, 0), coalesce(t.present, 0), coalesce(t.late, 0),
    coalesce(t.excused, 0), coalesce(t.absent, 0),
    case when coalesce(t.sessions_held, 0) = 0 then 0::numeric
      when coalesce(t.sessions_held, 0) - coalesce(t.excused, 0) <= 0 then 100::numeric
      else round(100.0 * (coalesce(t.present, 0) + coalesce(t.late, 0)) / (t.sessions_held - t.excused), 1) end,
    t.last_active_date
  from roster r left join totals t on t.group_id = r.group_id and t.user_id = r.user_id
  order by r.group_name, r.display_name;
end;
$$;

create or replace function public.admin_list_group_leaders()
returns table (user_id uuid, email text, display_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_primary_admin() then raise exception 'Only the primary admin can manage approved group leaders'; end if;
  return query
    select l.user_id, u.email::text,
      coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1))::text,
      l.created_at
    from public.group_leaders l join auth.users u on u.id = l.user_id
    order by lower(u.email);
end;
$$;

create or replace function public.admin_set_group_leader_email(p_email text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_user_id uuid;
begin
  if auth.uid() is null or not public.is_primary_admin() then raise exception 'Only the primary admin can manage approved group leaders'; end if;
  if length(btrim(coalesce(p_email, ''))) = 0 then raise exception 'Enter the account email'; end if;
  select u.id into target_user_id from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null
  limit 1;
  if target_user_id is null then raise exception 'No registered account with a verified email was found'; end if;
  if p_enabled then
    insert into public.group_leaders (user_id, granted_by) values (target_user_id, auth.uid())
      on conflict (user_id) do nothing;
  else
    delete from public.group_leaders where user_id = target_user_id;
  end if;
end;
$$;

-- Invite codes are not selectable from study_groups. Only the leader/admin RPCs above expose them.
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.can_create_study_group() from public, anon;
revoke all on function public.group_member_limit() from public, anon;
revoke all on function public.make_group_invite_code() from public, anon, authenticated;
revoke all on function public.enforce_study_group_capacity() from public, anon, authenticated;
revoke all on function public.enforce_group_attendance_membership() from public, anon, authenticated;
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.leave_group() from public, anon;
revoke all on function public.get_invite_code(uuid) from public, anon;
revoke all on function public.reset_invite_code(uuid) from public, anon;
revoke all on function public.rename_group(uuid, text) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.create_session(uuid, text, text, date, text, time) from public, anon;
revoke all on function public.close_session(uuid) from public, anon;
revoke all on function public.delete_session(uuid) from public, anon;
revoke all on function public.mark_attendance(uuid, uuid, text, text) from public, anon;
revoke all on function public.check_in(uuid) from public, anon;
revoke all on function public.group_attendance_summary(uuid, date, date) from public, anon;
revoke all on function public.lecturer_attendance_summary(date, date) from public, anon;
revoke all on function public.admin_list_group_leaders() from public, anon;
revoke all on function public.admin_set_group_leader_email(text, boolean) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.can_create_study_group() to authenticated;
grant execute on function public.group_member_limit() to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group() to authenticated;
grant execute on function public.get_invite_code(uuid) to authenticated;
grant execute on function public.reset_invite_code(uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.create_session(uuid, text, text, date, text, time) to authenticated;
grant execute on function public.close_session(uuid) to authenticated;
grant execute on function public.delete_session(uuid) to authenticated;
grant execute on function public.mark_attendance(uuid, uuid, text, text) to authenticated;
grant execute on function public.check_in(uuid) to authenticated;
grant execute on function public.group_attendance_summary(uuid, date, date) to authenticated;
grant execute on function public.lecturer_attendance_summary(date, date) to authenticated;
grant execute on function public.admin_list_group_leaders() to authenticated;
grant execute on function public.admin_set_group_leader_email(text, boolean) to authenticated;

-- Make the new tables available for the page's scoped realtime refreshes when the project has it enabled.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['study_groups', 'study_group_members', 'group_sessions', 'group_attendance'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end;
$$;
