-- Group 13 Hub: saved lecture notes / summaries with a private-or-shared choice.
-- Run in the Supabase SQL Editor AFTER transcripts.sql and super-admin-units.sql.
--
-- Each member can save one "notes" and one "summary" per transcript.
-- visibility = 'private' -> only the author can see it
-- visibility = 'group'   -> every signed-in member can read it (only the author can edit/unshare)

create table if not exists public.transcript_notes (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name text,
  kind text not null check (kind in ('notes', 'summary')),
  content text not null check (length(content) between 1 and 200000),
  visibility text not null default 'private' check (visibility in ('private', 'group')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transcript_id, owner, kind)
);

create index if not exists transcript_notes_transcript_idx
  on public.transcript_notes (transcript_id, visibility);

-- The author's display name is filled in by the database from their account,
-- so nobody can post notes under someone else's name.
create or replace function public.set_transcript_note_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.owner_name := coalesce(
    nullif((select u.raw_user_meta_data ->> 'display_name' from auth.users u where u.id = new.owner), ''),
    'A Group 13 member'
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transcript_notes_meta on public.transcript_notes;
create trigger transcript_notes_meta
  before insert or update on public.transcript_notes
  for each row execute function public.set_transcript_note_meta();

alter table public.transcript_notes enable row level security;

drop policy if exists "Read own or shared notes" on public.transcript_notes;
drop policy if exists "Members add own notes" on public.transcript_notes;
drop policy if exists "Authors update own notes" on public.transcript_notes;
drop policy if exists "Authors and admin delete notes" on public.transcript_notes;

create policy "Read own or shared notes" on public.transcript_notes
  for select to authenticated
  using (owner = auth.uid() or visibility = 'group');

create policy "Members add own notes" on public.transcript_notes
  for insert to authenticated
  with check (owner = auth.uid());

create policy "Authors update own notes" on public.transcript_notes
  for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy "Authors and admin delete notes" on public.transcript_notes
  for delete to authenticated
  using (owner = auth.uid() or public.is_super_admin());

grant select, insert, update, delete on table public.transcript_notes to authenticated;
