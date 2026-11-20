-- Law student vertical video feed.
create table if not exists public.law_reels (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  caption text not null default '' check (char_length(caption) <= 1200),
  topic text not null default 'General' check (char_length(trim(topic)) between 1 and 80),
  video_path text not null unique,
  video_url text not null,
  cover_path text,
  cover_url text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists law_reels_feed_idx on public.law_reels (is_published, sort_order, created_at desc);
alter table public.law_reels enable row level security;

drop policy if exists "Published law reels are readable" on public.law_reels;
create policy "Published law reels are readable" on public.law_reels
  for select to authenticated using (is_published = true or public.is_super_admin());
drop policy if exists "Super admins manage law reels" on public.law_reels;
create policy "Super admins manage law reels" on public.law_reels
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin() and created_by = auth.uid());
grant select on public.law_reels to authenticated;
grant insert, update, delete on public.law_reels to authenticated;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "Law reel files are readable" on storage.objects;
create policy "Law reel files are readable" on storage.objects
  for select to authenticated using (
    bucket_id = 'media' and (
      public.is_super_admin() or exists (
        select 1 from public.law_reels r
        where r.is_published = true and (r.video_path = name or r.cover_path = name)
      )
    )
  );
drop policy if exists "Super admins upload law reel files" on storage.objects;
create policy "Super admins upload law reel files" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_super_admin());
drop policy if exists "Super admins update law reel files" on storage.objects;
create policy "Super admins update law reel files" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_super_admin()) with check (bucket_id = 'media' and public.is_super_admin());
drop policy if exists "Super admins delete law reel files" on storage.objects;
create policy "Super admins delete law reel files" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_super_admin());

create or replace function public.touch_law_reels_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists law_reels_updated_at on public.law_reels;
create trigger law_reels_updated_at before update on public.law_reels for each row execute function public.touch_law_reels_updated_at();
