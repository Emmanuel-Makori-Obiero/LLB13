-- Run this in Supabase SQL Editor AFTER schema.sql and super-admin-units.sql.
-- Shared lecture transcripts: every signed-in member can read them,
-- the uploader (or the super admin) can delete them.

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  unit text,
  language text,
  uploader_name text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  duration_seconds integer,
  total_chunks integer,
  status text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.transcript_chunks (
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  idx integer not null,
  start_seconds numeric not null default 0,
  text text not null default '',
  segments jsonb,
  primary key (transcript_id, idx)
);

-- Tracks audio seconds sent to the free provider so the whole group stays inside its quota.
-- Only the edge function (service role) touches this table.
create table if not exists public.transcription_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  seconds integer not null,
  created_at timestamptz not null default now()
);
create index if not exists transcription_usage_created_idx on public.transcription_usage (created_at);

alter table public.transcripts enable row level security;
alter table public.transcript_chunks enable row level security;
alter table public.transcription_usage enable row level security;

drop policy if exists "Members can read transcripts" on public.transcripts;
drop policy if exists "Members can create transcripts" on public.transcripts;
drop policy if exists "Owners can update transcripts" on public.transcripts;
drop policy if exists "Owners and admin can delete transcripts" on public.transcripts;
drop policy if exists "Members can read transcript chunks" on public.transcript_chunks;

create policy "Members can read transcripts" on public.transcripts for select to authenticated using (true);
create policy "Members can create transcripts" on public.transcripts for insert to authenticated with check (created_by = auth.uid());
create policy "Owners can update transcripts" on public.transcripts for update to authenticated using (created_by = auth.uid() or public.is_super_admin()) with check (true);
create policy "Owners and admin can delete transcripts" on public.transcripts for delete to authenticated using (created_by = auth.uid() or public.is_super_admin());
create policy "Members can read transcript chunks" on public.transcript_chunks for select to authenticated using (true);

grant select, insert, update, delete on table public.transcripts to authenticated;
grant select on table public.transcript_chunks to authenticated;
