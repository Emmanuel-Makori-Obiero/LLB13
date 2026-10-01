-- Group 13 Hub 10/10 learning engine
-- Cloud review progress, study sessions, skill analytics, paths and achievements.

create table if not exists public.learning_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id text not null,
  title text not null,
  kind text not null default 'topic',
  skill text not null default 'Legal knowledge',
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  last_quality text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, source_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode text not null default 'study',
  subject text,
  minutes integer not null default 0 check (minutes >= 0),
  score numeric check (score is null or (score >= 0 and score <= 100)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  skill text not null,
  score numeric not null default 0 check (score between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  unique(user_id, skill)
);

create table if not exists public.learning_paths (
  id text primary key,
  title text not null,
  description text not null,
  audience text not null default 'All students',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.path_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path_id text not null references public.learning_paths(id) on delete cascade,
  completed_steps integer[] not null default '{}',
  current_step integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, path_id)
);

create table if not exists public.achievements (
  id text primary key,
  title text not null,
  description text not null,
  icon text not null default 'star'
);

create table if not exists public.user_achievements (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key(user_id, achievement_id)
);

alter table public.learning_reviews enable row level security;
alter table public.study_sessions enable row level security;
alter table public.skill_scores enable row level security;
alter table public.learning_paths enable row level security;
alter table public.path_progress enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists "Users manage own learning reviews" on public.learning_reviews;
drop policy if exists "Users manage own study sessions" on public.study_sessions;
drop policy if exists "Users manage own skill scores" on public.skill_scores;
drop policy if exists "Authenticated users read learning paths" on public.learning_paths;
drop policy if exists "Users manage own path progress" on public.path_progress;
drop policy if exists "Authenticated users read achievements" on public.achievements;
drop policy if exists "Users manage own achievements" on public.user_achievements;

create policy "Users manage own learning reviews" on public.learning_reviews for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own study sessions" on public.study_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own skill scores" on public.skill_scores for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated users read learning paths" on public.learning_paths for select to authenticated using (true);
create policy "Users manage own path progress" on public.path_progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated users read achievements" on public.achievements for select to authenticated using (true);
create policy "Users manage own achievements" on public.user_achievements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.learning_reviews, public.study_sessions, public.skill_scores, public.path_progress, public.user_achievements to authenticated;
grant select on public.learning_paths, public.achievements to authenticated;

insert into public.learning_paths (id, title, description, audience, steps) values
('first-year-foundation', 'First-Year Law Foundation', 'Build the core habits and concepts every law student needs.', 'First years', '[{"title":"Read a case","skill":"Legal knowledge"},{"title":"Use IRAC","skill":"Legal writing"},{"title":"Find an authority","skill":"Research"},{"title":"Give a two-minute submission","skill":"Oral advocacy"}]'),
('moot-advocacy', 'Moot Court Advocacy', 'Move from issue spotting to confident oral submissions.', 'Moot participants', '[{"title":"Understand the record","skill":"Legal knowledge"},{"title":"Build the argument","skill":"Legal writing"},{"title":"Answer a bench question","skill":"Oral advocacy"},{"title":"Deliver a timed submission","skill":"Oral advocacy"}]'),
('kmun-delegate', 'KMUN Delegate Training', 'Learn committee procedure, diplomacy and resolution writing.', 'KMUN delegates', '[{"title":"Research your country","skill":"Research"},{"title":"Write an opening speech","skill":"Communication"},{"title":"Practise caucuses","skill":"Communication"},{"title":"Draft operative clauses","skill":"Legal writing"}]')
on conflict (id) do update set title=excluded.title, description=excluded.description, audience=excluded.audience, steps=excluded.steps;

insert into public.achievements (id, title, description, icon) values
('first-review', 'First recall', 'Complete your first active-recall review.', 'brain'),
('seven-day-streak', 'Seven-day learner', 'Study or review on seven different days.', 'flame'),
('moot-practitioner', 'Moot practitioner', 'Complete an oral advocacy practice session.', 'gavel'),
('path-starter', 'Path starter', 'Complete the first step of a learning path.', 'route'),
('source-scholar', 'Source scholar', 'Study five source-backed topics.', 'book')
on conflict (id) do update set title=excluded.title, description=excluded.description, icon=excluded.icon;

create index if not exists learning_reviews_due_idx on public.learning_reviews(user_id, due_at);
create index if not exists study_sessions_user_idx on public.study_sessions(user_id, created_at desc);
create index if not exists skill_scores_user_idx on public.skill_scores(user_id);
