alter table public.materials
  add column if not exists target_years text[] not null default '{}';

create index if not exists materials_target_years_gin_idx
  on public.materials using gin (target_years);
