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

alter table public.materials add column if not exists url text;
alter table public.materials add column if not exists storage_path text;

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

-- All workspace data requires a signed-in Supabase Auth user.
drop policy if exists "Group 13 units are readable" on public.units;
drop policy if exists "Group 13 materials are readable" on public.materials;
drop policy if exists "Group 13 assignments are readable" on public.assignments;
drop policy if exists "Group 13 assignments can be updated" on public.assignments;
drop policy if exists "Group 13 materials can be created" on public.materials;
drop policy if exists "Group 13 assignments can be created" on public.assignments;
drop policy if exists "Group 13 discussions are readable" on public.discussions;
drop policy if exists "Group 13 members are readable" on public.members;

create policy "Group 13 units are readable" on public.units for select to authenticated using (true);
create policy "Group 13 materials are readable" on public.materials for select to authenticated using (true);
create policy "Group 13 assignments are readable" on public.assignments for select to authenticated using (true);
create policy "Group 13 assignments can be updated" on public.assignments for update to authenticated using (true) with check (true);
create policy "Group 13 materials can be created" on public.materials for insert to authenticated with check (true);
create policy "Group 13 assignments can be created" on public.assignments for insert to authenticated with check (true);
create policy "Group 13 discussions are readable" on public.discussions for select to authenticated using (true);
create policy "Group 13 members are readable" on public.members for select to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do update set public = true;

drop policy if exists "Group 13 materials files are readable" on storage.objects;
drop policy if exists "Group 13 materials files can be uploaded" on storage.objects;
create policy "Group 13 materials files are readable" on storage.objects for select to authenticated using (bucket_id = 'materials');
create policy "Group 13 materials files can be uploaded" on storage.objects for insert to authenticated with check (bucket_id = 'materials');

grant select on table public.units, public.materials, public.assignments, public.discussions, public.members to authenticated;
grant update on table public.assignments to authenticated;
grant insert on table public.materials, public.assignments to authenticated;

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

insert into public.materials (id, title, type, unit, topic, date, source) values
  ('m1', 'Separation of powers — lecture notes', 'Lecture notes', 'Constitutional Law I', 'State structure', '29 Sep 2026', 'Lesty A.'),
  ('m2', 'Republic v Big M — case brief', 'Case brief', 'Constitutional Law I', 'Judicial review', '28 Sep 2026', 'Group 13'),
  ('m3', 'Kenya Constitution, 2010 — Chapter 10', 'Statute', 'Constitutional Law I', 'Judiciary', '27 Sep 2026', 'Shared library'),
  ('m4', 'The law of contract in Kenya (4th ed.)', 'Textbook', 'Law of Contracts I', 'Formation', '25 Sep 2026', 'Eliud K.'),
  ('m5', 'How to read a judgment quickly', 'Guide', 'Legal Systems & Methods', 'Legal method', '24 Sep 2026', 'Bianca N.'),
  ('m6', 'Past paper: Criminal Law I — 2024', 'Past paper', 'Criminal Law I', 'Revision', '22 Sep 2026', 'Shared library')
on conflict (id) do update set title = excluded.title, type = excluded.type, unit = excluded.unit, topic = excluded.topic, date = excluded.date, source = excluded.source;

insert into public.assignments (id, title, unit, due, status, owner, reviewer, brief) values
  ('a1', 'The limits of judicial review in Kenya', 'Constitutional Law I', '02 Oct 2026', 'In Progress', 'You', 'Lesty A.', 'Assess how Kenyan courts balance institutional deference with constitutional supremacy. Use two authorities and one counterargument.'),
  ('a2', 'Problem question: mens rea', 'Criminal Law I', '05 Oct 2026', 'Not Started', 'You', 'Joan W.', 'Apply the principles of intention, recklessness, and transferred malice to the supplied fact pattern.'),
  ('a3', 'Case note: Carlill v Carbolic Smoke Ball', 'Law of Contracts I', '28 Sep 2026', 'Under Review', 'You', 'Eliud K.', 'Write a structured case note explaining offer, acceptance, and unilateral contracts.'),
  ('a4', 'Citation clinic — authorities map', 'Legal Research & Writing', '24 Sep 2026', 'Completed', 'You', 'Julie M.', 'Map primary and secondary authorities for the research question.')
on conflict (id) do update set title = excluded.title, unit = excluded.unit, due = excluded.due, status = excluded.status, owner = excluded.owner, reviewer = excluded.reviewer, brief = excluded.brief;

insert into public.discussions (id, title, day, time, leader, status, prep, topics) values
  ('d1', 'Constitutional Law I', 'Tuesday, 29 September', '7:00–8:15 PM', 'Lesty A.', 'Next up', 'Prepare 3 questions by Monday, 8:00 PM', array['Separation of powers', 'Judicial review', 'Constitutional supremacy']),
  ('d2', 'Criminal Law I', 'Thursday, 01 October', '7:00–8:15 PM', 'Joan W.', 'Upcoming', 'Read the mens rea primer', array['Intention', 'Recklessness', 'Transferred malice']),
  ('d3', 'Legal Systems & Methods', 'Tuesday, 06 October', '7:00–8:15 PM', 'Bianca N.', 'Scheduled', 'Bring one difficult authority', array['Precedent', 'Ratio decidendi', 'Obiter dicta'])
on conflict (id) do update set title = excluded.title, day = excluded.day, time = excluded.time, leader = excluded.leader, status = excluded.status, prep = excluded.prep, topics = excluded.topics;
