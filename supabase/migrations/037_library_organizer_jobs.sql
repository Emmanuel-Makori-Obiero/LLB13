-- Resumable, admin-only AI organization for imported past papers.
alter table public.materials
  add column if not exists organization_status text not null default 'pending',
  add column if not exists organization_error text,
  add column if not exists organized_at timestamptz;

alter table public.materials
drop constraint if exists materials_organization_status_check;
alter table public.materials
add constraint materials_organization_status_check
check (organization_status in ('pending','processing','ready','failed','skipped'));

create index if not exists materials_organization_idx
  on public.materials (organization_status, created_at)
  where archive_path is not null;

create table if not exists public.library_organize_jobs (
  id uuid primary key default gen_random_uuid(),
  started_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','paused','completed','failed')),
  total integer not null default 0,
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  last_material_id text references public.materials(id) on delete set null,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_organize_jobs_started_idx
  on public.library_organize_jobs (started_by, created_at desc);

alter table public.library_organize_jobs enable row level security;
revoke all on public.library_organize_jobs from public, anon, authenticated;
create policy "Admins read organizer jobs" on public.library_organize_jobs
  for select to authenticated using (public.is_admin());

create or replace function public.touch_library_organize_job()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists library_organize_job_updated_at on public.library_organize_jobs;
create trigger library_organize_job_updated_at before update on public.library_organize_jobs
for each row execute function public.touch_library_organize_job();

comment on table public.library_organize_jobs is 'Admin-only resumable Gemini metadata extraction jobs for imported Library papers.';
