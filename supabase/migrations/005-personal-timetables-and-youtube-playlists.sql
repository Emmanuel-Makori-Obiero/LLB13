-- Personal member schedules and persistent YouTube playlists.
-- Applied to the connected LLB13 Supabase project through the Dashboard MCP.

-- personal_timetable already exists in this project with owner uuid and lesson fields.
drop policy if exists "Users manage personal timetable" on public.personal_timetable;
create policy "Users manage personal timetable" on public.personal_timetable
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.personal_timetable to authenticated;

create table if not exists public.youtube_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My YouTube playlist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.youtube_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.youtube_playlists(id) on delete cascade,
  title text not null,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.youtube_playlists enable row level security;
alter table public.youtube_playlist_items enable row level security;
create policy "Users manage own YouTube playlists" on public.youtube_playlists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own YouTube playlist items" on public.youtube_playlist_items
  for all to authenticated using (exists (select 1 from public.youtube_playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.youtube_playlists p where p.id = playlist_id and p.user_id = auth.uid()));
grant select, insert, update, delete on public.youtube_playlists, public.youtube_playlist_items to authenticated;

create index if not exists personal_timetable_owner_date_idx on public.personal_timetable(owner, lesson_date, start_time);
create index if not exists youtube_playlist_items_position_idx on public.youtube_playlist_items(playlist_id, position);
