-- Run this migration after schema.sql and admin.sql.
-- Unit representatives are matched to auth.users.user_metadata.display_name,
-- which is also the name stored in units.lead and discussions.leader.

create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  unit text not null,
  topic text not null,
  lesson_date date not null,
  start_time time,
  end_time time,
  representative text,
  venue text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.timetable enable row level security;
drop policy if exists "Timetable is readable by members" on public.timetable;
drop policy if exists "Members can add timetable lessons" on public.timetable;
drop policy if exists "Owners admins and representatives can edit lessons" on public.timetable;
drop policy if exists "Owners admins and representatives can delete lessons" on public.timetable;

create policy "Timetable is readable by members" on public.timetable for select to authenticated using (true);
create policy "Members can add timetable lessons" on public.timetable for insert to authenticated with check (created_by = auth.uid());
create policy "Owners admins and representatives can edit lessons" on public.timetable for update to authenticated using (
  created_by = auth.uid()
  or public.is_super_admin()
  or representative = (auth.jwt() -> 'user_metadata' ->> 'display_name')
) with check (true);
create policy "Owners admins and representatives can delete lessons" on public.timetable for delete to authenticated using (
  created_by = auth.uid()
  or public.is_super_admin()
  or representative = (auth.jwt() -> 'user_metadata' ->> 'display_name')
);
grant select, insert, update, delete on table public.timetable to authenticated;

alter table public.discussions add column if not exists instant boolean not null default false;
alter table public.discussions add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;
drop policy if exists "Representatives can manage their meetings" on public.discussions;
create policy "Representatives can manage their meetings" on public.discussions for update to authenticated using (
  leader = (auth.jwt() -> 'user_metadata' ->> 'display_name')
  or created_by = auth.uid()
  or public.is_super_admin()
) with check (true);
drop policy if exists "Representatives can end their meetings" on public.discussions;
create policy "Representatives can end their meetings" on public.discussions for delete to authenticated using (
  leader = (auth.jwt() -> 'user_metadata' ->> 'display_name')
  or created_by = auth.uid()
  or public.is_super_admin()
);
grant update on table public.discussions to authenticated;
