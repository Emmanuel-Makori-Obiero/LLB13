-- Admin-only provider usage ledger.
-- Provider billing credits are not interchangeable, so this stores request units
-- plus measurable provider units (characters, seconds, or tokens when available).
create table if not exists public.ai_provider_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('text', 'book_metadata', 'podcast', 'image', 'video', 'transcription', 'live_voice', 'search', 'other')),
  provider text not null,
  model text,
  status text not null default 'success' check (status in ('success', 'failure', 'quota_denied')),
  request_units integer not null default 1 check (request_units >= 0),
  input_units bigint not null default 0 check (input_units >= 0),
  output_units bigint not null default 0 check (output_units >= 0),
  unit_label text not null default 'requests',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_provider_usage_created_idx on public.ai_provider_usage(created_at desc);
create index if not exists ai_provider_usage_category_idx on public.ai_provider_usage(category, created_at desc);
create index if not exists ai_provider_usage_user_idx on public.ai_provider_usage(user_id, created_at desc);
alter table public.ai_provider_usage enable row level security;
revoke all on public.ai_provider_usage from public, anon, authenticated;
grant select on public.ai_provider_usage to authenticated;
drop policy if exists "Admins read provider usage ledger" on public.ai_provider_usage;
create policy "Admins read provider usage ledger" on public.ai_provider_usage
  for select to authenticated using (public.is_super_admin());

-- Keep the existing quota table useful for the admin dashboard's remaining counts.
drop policy if exists "Admins read AI usage and quota counts" on public.ai_usage;
create policy "Admins read AI usage and quota counts" on public.ai_usage for select to authenticated using (public.is_super_admin());
drop policy if exists "Admins read AI quota usage" on public.ai_quota_usage;
create policy "Admins read AI quota usage" on public.ai_quota_usage for select to authenticated using (public.is_super_admin());
