-- Private timetable entries belong only to the signed-in student.
-- The existing public.timetable remains the shared Group 13 timetable.
create table if not exists public.personal_timetable (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  unit text not null,
  topic text not null,
  lesson_date date not null,
  start_time time,
  end_time time,
  representative text,
  representatives text[] not null default '{}',
  venue text,
  created_at timestamptz not null default now()
);

create index if not exists personal_timetable_owner_date_idx on public.personal_timetable(owner, lesson_date, start_time);
alter table public.personal_timetable enable row level security;
drop policy if exists "Users manage their personal timetable" on public.personal_timetable;
create policy "Users manage their personal timetable" on public.personal_timetable for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.personal_timetable to authenticated;
