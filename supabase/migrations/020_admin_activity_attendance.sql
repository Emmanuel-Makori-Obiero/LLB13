-- Admin-only platform activity reporting and student self-check-in.
create table if not exists public.platform_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('page_view','podcast_script_generated','podcast_audio_generated','podcast_audio_failed')),
  page text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_activity_events_created_at_idx on public.platform_activity_events(created_at desc);
create index if not exists platform_activity_events_user_idx on public.platform_activity_events(user_id, created_at desc);
alter table public.platform_activity_events enable row level security;
revoke all on public.platform_activity_events from public, anon;
grant select, insert on public.platform_activity_events to authenticated;
drop policy if exists "Users record their own minimal activity" on public.platform_activity_events;
create policy "Users record their own minimal activity" on public.platform_activity_events for insert to authenticated
  with check (user_id = auth.uid() and event_type in ('page_view','podcast_script_generated','podcast_audio_generated','podcast_audio_failed'));
drop policy if exists "Admins read platform activity" on public.platform_activity_events;
create policy "Admins read platform activity" on public.platform_activity_events for select to authenticated using (public.is_super_admin());

create table if not exists public.class_attendance (
  id bigint generated always as identity primary key,
  lesson_id uuid not null references public.timetable(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (lesson_id, user_id)
);
create index if not exists class_attendance_lesson_idx on public.class_attendance(lesson_id, checked_in_at desc);
alter table public.class_attendance enable row level security;
revoke all on public.class_attendance from public, anon;
grant select on public.class_attendance to authenticated;
revoke insert on public.class_attendance from authenticated;
grant insert (lesson_id, user_id) on public.class_attendance to authenticated;
drop policy if exists "Students see own attendance and admins see all" on public.class_attendance;
create policy "Students see own attendance and admins see all" on public.class_attendance for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "Students check in to today's scheduled class" on public.class_attendance;
create policy "Students check in to today's scheduled class" on public.class_attendance for insert to authenticated
  with check (
    user_id = auth.uid()
    and (select lesson_date from public.timetable where id = lesson_id) = (now() at time zone 'Africa/Nairobi')::date
  );
drop policy if exists "Admins read AI usage and quota counts" on public.ai_usage;
create policy "Admins read AI usage and quota counts" on public.ai_usage for select to authenticated using (public.is_super_admin());
drop policy if exists "Admins read AI quota usage" on public.ai_quota_usage;
create policy "Admins read AI quota usage" on public.ai_quota_usage for select to authenticated using (public.is_super_admin());
