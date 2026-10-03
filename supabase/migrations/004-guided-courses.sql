-- Source-grounded guided syllabi, lesson checkpoints, and Kaizen quiz progress.
create table if not exists public.guided_courses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null,
  source_document_ids uuid[] not null default '{}',
  source_labels jsonb not null default '[]'::jsonb,
  syllabus jsonb not null default '{}'::jsonb,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guided_course_progress (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.guided_courses(id) on delete cascade,
  learner uuid not null references auth.users(id) on delete cascade,
  lesson_index integer not null check (lesson_index >= 0),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','repeat')),
  score integer check (score between 0 and 100),
  attempts integer not null default 0,
  last_answer jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(course_id, learner, lesson_index)
);

alter table public.guided_courses enable row level security;
alter table public.guided_course_progress enable row level security;

drop policy if exists "Learners manage own guided courses" on public.guided_courses;
create policy "Learners manage own guided courses" on public.guided_courses
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "Learners manage own course progress" on public.guided_course_progress;
create policy "Learners manage own course progress" on public.guided_course_progress
  for all to authenticated using (learner = auth.uid()) with check (learner = auth.uid());

grant select, insert, update, delete on public.guided_courses to authenticated;
grant select, insert, update, delete on public.guided_course_progress to authenticated;

create index if not exists guided_courses_owner_idx on public.guided_courses(owner, updated_at desc);
create index if not exists guided_progress_course_idx on public.guided_course_progress(course_id, learner, lesson_index);

-- Let the owner choose whether a syllabus is private or visible to Group 13 members.
alter table public.guided_courses add column if not exists visibility text not null default 'private' check (visibility in ('private','group'));

drop policy if exists "Learners manage own guided courses" on public.guided_courses;
drop policy if exists "Learners read shared guided courses" on public.guided_courses;
create policy "Owners manage own guided courses" on public.guided_courses
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Members read shared guided courses" on public.guided_courses
  for select to authenticated using (visibility = 'group');

create index if not exists guided_courses_visibility_idx on public.guided_courses(visibility, updated_at desc);
