-- Group 13 Hub starter schema for Supabase.
-- Run this in Supabase SQL Editor, then add the two VITE_SUPABASE_* values locally.

create table if not exists public.units (
  id text primary key,
  name text not null,
  code text not null,
  lead text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  next text not null,
  color text not null
);

create table if not exists public.materials (
  id text primary key,
  title text not null,
  type text not null,
  unit text not null,
  topic text not null,
  date text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id text primary key,
  title text not null,
  unit text not null,
  due text not null,
  status text not null default 'Not Started',
  owner text not null,
  reviewer text not null,
  brief text not null
);

create table if not exists public.discussions (
  id text primary key,
  title text not null,
  day text not null,
  time text not null,
  leader text not null,
  status text not null,
  prep text not null,
  topics text[] not null default '{}'
);

create table if not exists public.members (
  name text primary key,
  initials text not null,
  role text not null,
  units text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  tone text not null
);

alter table public.units enable row level security;
alter table public.materials enable row level security;
alter table public.assignments enable row level security;
alter table public.discussions enable row level security;
alter table public.members enable row level security;

-- This first slice is read-only from the browser. Tighten these policies after adding auth.
create policy "Group 13 units are readable" on public.units for select to anon, authenticated using (true);
create policy "Group 13 materials are readable" on public.materials for select to anon, authenticated using (true);
create policy "Group 13 assignments are readable" on public.assignments for select to anon, authenticated using (true);
create policy "Group 13 discussions are readable" on public.discussions for select to anon, authenticated using (true);
create policy "Group 13 members are readable" on public.members for select to anon, authenticated using (true);

insert into public.units (id, name, code, lead, progress, next, color) values
  ('criminal', 'Criminal Law I', 'LAW 111', 'Joan W.', 72, 'Mens rea · Thu 7:00 PM', '#8F3E32'),
  ('constitutional', 'Constitutional Law I', 'LAW 113', 'Lesty A.', 64, 'Separation of powers · Tue 7:00 PM', '#163A34'),
  ('contracts', 'Law of Contracts I', 'LAW 115', 'Eliud K.', 48, 'Consideration · Fri 10:00 AM', '#C96E52'),
  ('systems', 'Legal Systems & Methods', 'LAW 117', 'Bianca N.', 81, 'Citation clinic · Wed 6:00 PM', '#6E7D63'),
  ('research', 'Legal Research & Writing', 'LAW 119', 'Julie M.', 55, 'Authority mapping · Mon 4:00 PM', '#6E6257'),
  ('communication', 'Communication Skills for Lawyers', 'LAW 121', 'Everyone', 39, 'Advocacy workshop · Fri 2:00 PM', '#9E7C46'),
  ('torts', 'Torts I', 'LAW 123', 'To be assigned', 28, 'Negligence primer · Thu 7:00 PM', '#536C75')
on conflict (id) do update set name = excluded.name, code = excluded.code, lead = excluded.lead, progress = excluded.progress, next = excluded.next, color = excluded.color;

insert into public.members (name, initials, role, units, progress, tone) values
  ('Lesty A.', 'LA', 'Group Leader · Constitutional Law lead', 'Constitutional Law I · Research & Writing', 86, '#8F3E32'),
  ('Joan W.', 'JW', 'Unit Lead · Criminal Law I', 'Criminal Law I · Communication Skills', 78, '#163A34'),
  ('Bianca N.', 'BN', 'Unit Lead · Legal Systems & Methods', 'Legal Systems & Methods', 73, '#6E7D63'),
  ('Eliud K.', 'EK', 'Unit Lead · Law of Contracts I', 'Law of Contracts I', 69, '#C96E52'),
  ('Julie M.', 'JM', 'Research coordinator', 'Research & Writing · Torts I', 61, '#536C75'),
  ('Mumo O.', 'MO', 'Member', 'Communication Skills · Torts I', 57, '#9E7C46')
on conflict (name) do update set initials = excluded.initials, role = excluded.role, units = excluded.units, progress = excluded.progress, tone = excluded.tone;
