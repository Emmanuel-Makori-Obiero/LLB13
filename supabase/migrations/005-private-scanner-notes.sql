-- Scanner text reuses the account-owned notes table; original page images remain private media assets.
-- The existing LLB13 project already has this table. Create it on a fresh deployment if absent.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  project_id uuid,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;
drop policy if exists "Notes are owned by user" on public.notes;
create policy "Notes are owned by user"
  on public.notes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Notes are private to signed-in owners. Do not grant anonymous or table-wide destructive access.
revoke all privileges on table public.notes from public;
revoke all privileges on table public.notes from anon;
revoke truncate, references, trigger on table public.notes from authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

create index if not exists notes_user_updated_idx
  on public.notes(user_id, updated_at desc);

create or replace function public.touch_scanner_note_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_scanner_note_updated_at();
