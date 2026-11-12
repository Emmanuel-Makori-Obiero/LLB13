create table if not exists public.acts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_title text not null default '',
  chapter text not null default '',
  edition text not null default '',
  source text not null default '',
  source_url text not null default '',
  assent_date text not null default '',
  commencement_date text not null default '',
  preamble text not null default '',
  sections jsonb not null default '[]'::jsonb,
  schedules jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.acts enable row level security;

drop policy if exists "signed in users can read acts" on public.acts;
create policy "signed in users can read acts" on public.acts
  for select to authenticated using (true);

drop policy if exists "admins can create acts" on public.acts;
create policy "admins can create acts" on public.acts
  for insert to authenticated with check ((select public.is_super_admin()) and created_by = auth.uid());

drop policy if exists "admins can update acts" on public.acts;
create policy "admins can update acts" on public.acts
  for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists "admins can delete acts" on public.acts;
create policy "admins can delete acts" on public.acts
  for delete to authenticated using ((select public.is_super_admin()));

create index if not exists acts_updated_at_idx on public.acts(updated_at desc);
