create table if not exists public.notes_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  original_text text not null check (char_length(original_text) between 1 and 100000),
  review jsonb not null,
  research_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notes_reviews_user_created_idx
  on public.notes_reviews (user_id, created_at desc);

alter table public.notes_reviews enable row level security;

create policy "Students read own notes reviews"
  on public.notes_reviews for select to authenticated
  using (auth.uid() = user_id);

create policy "Students create own notes reviews"
  on public.notes_reviews for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Students update own notes reviews"
  on public.notes_reviews for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Students delete own notes reviews"
  on public.notes_reviews for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.notes_reviews to authenticated;
