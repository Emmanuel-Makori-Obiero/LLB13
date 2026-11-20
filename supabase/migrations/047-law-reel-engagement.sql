create table if not exists public.law_reel_likes (
  reel_id uuid not null references public.law_reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create table if not exists public.law_reel_saves (
  reel_id uuid not null references public.law_reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create table if not exists public.law_reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.law_reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists law_reel_comments_feed_idx on public.law_reel_comments(reel_id, created_at desc);
alter table public.law_reel_likes enable row level security;
alter table public.law_reel_saves enable row level security;
alter table public.law_reel_comments enable row level security;

create policy "Students read reel likes" on public.law_reel_likes for select to authenticated using (true);
create policy "Students manage own reel likes" on public.law_reel_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Students read reel saves" on public.law_reel_saves for select to authenticated using (user_id = auth.uid());
create policy "Students manage own reel saves" on public.law_reel_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Students read reel comments" on public.law_reel_comments for select to authenticated using (true);
create policy "Students create own reel comments" on public.law_reel_comments for insert to authenticated with check (user_id = auth.uid());
create policy "Students delete own reel comments" on public.law_reel_comments for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.law_reel_likes, public.law_reel_saves, public.law_reel_comments to authenticated;

create or replace function public.get_law_reel_comments(p_reel_id uuid)
returns table(id uuid, reel_id uuid, user_id uuid, username text, body text, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select c.id, c.reel_id, c.user_id,
    coalesce(nullif(d.username, ''), nullif(d.display_name, ''), 'Law student') as username,
    c.body, c.created_at
  from public.law_reel_comments c
  left join public.user_directory d on d.user_id = c.user_id
  where c.reel_id = p_reel_id
  order by c.created_at desc
  limit 100;
$$;
grant execute on function public.get_law_reel_comments(uuid) to authenticated;
