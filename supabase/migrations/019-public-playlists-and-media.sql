-- Public playlist/media contract used by the share links in the web app.
alter table public.youtube_playlists add column if not exists is_public boolean not null default true;
alter table public.media_resources add column if not exists is_public boolean not null default true;

drop policy if exists "Public YouTube playlists are readable by everyone" on public.youtube_playlists;
create policy "Public YouTube playlists are readable by everyone" on public.youtube_playlists
  for select to anon, authenticated using (is_public = true);
drop policy if exists "Public YouTube playlist items are readable by everyone" on public.youtube_playlist_items;
create policy "Public YouTube playlist items are readable by everyone" on public.youtube_playlist_items
  for select to anon, authenticated using (exists (select 1 from public.youtube_playlists p where p.id = playlist_id and p.is_public = true));
grant select on public.youtube_playlists, public.youtube_playlist_items to anon;

drop policy if exists "Public media resources are readable by everyone" on public.media_resources;
create policy "Public media resources are readable by everyone" on public.media_resources
  for select to anon, authenticated using (is_public = true);
grant select on public.media_resources to anon;

-- Existing users asked for their playlist to be public by default; future app-created playlists use this same default.
update public.youtube_playlists set title = 'Emmanuels playlist', is_public = true where title = 'My YouTube playlist';
