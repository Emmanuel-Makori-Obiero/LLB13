-- Persistent video retry state and provider health for the serverless fallback worker.
-- Run after 002-cloud-media.sql.

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_provider text,
  last_error text,
  provider_attempts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_provider_health (
  provider text primary key,
  successes bigint not null default 0,
  failures bigint not null default 0,
  consecutive_failures integer not null default 0,
  cooldown_until timestamptz,
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.video_jobs enable row level security;
alter table public.video_provider_health enable row level security;

drop policy if exists "Video jobs owner read" on public.video_jobs;
create policy "Video jobs owner read" on public.video_jobs
  for select to authenticated using (owner_id = auth.uid());

grant select on public.video_jobs to authenticated;

-- Provider health is intentionally service-role only; it is operational data.
revoke all on public.video_provider_health from anon, authenticated;

drop trigger if exists video_jobs_updated_at on public.video_jobs;
create trigger video_jobs_updated_at before update on public.video_jobs
for each row execute function public.touch_cloud_media_updated_at();

drop trigger if exists video_provider_health_updated_at on public.video_provider_health;
create trigger video_provider_health_updated_at before update on public.video_provider_health
for each row execute function public.touch_cloud_media_updated_at();

create index if not exists video_jobs_retry_idx on public.video_jobs(status, next_attempt_at);
create index if not exists video_jobs_owner_idx on public.video_jobs(owner_id, created_at desc);
