-- Optional assignment audience tags; empty remains shared to all cohorts.
alter table public.assignments
  add column if not exists target_years text[] not null default '{}';
create index if not exists assignments_target_years_gin_idx
  on public.assignments using gin (target_years);
