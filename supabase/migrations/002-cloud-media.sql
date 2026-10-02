-- Group 13 Hub: cloud media library, sharing, and multi-shot film jobs.
-- Run after 001_ai.sql and the base schema.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('podcast_script', 'podcast_audio', 'video_lesson', 'film_clip', 'film_export', 'other')),
  source_material_id text references public.materials(id) on delete set null,
  source_document_id uuid references public.ai_documents(id) on delete set null,
  project_id uuid,
  storage_path text,
  mime_type text,
  public_url text,
  duration_seconds numeric,
  status text not null default 'ready' check (status in ('queued', 'processing', 'ready', 'failed', 'deleted')),
  provider text,
  provider_job_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_shares (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  recipient_email text,
  visibility text not null default 'link' check (visibility in ('link', 'group', 'private')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.film_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  brief text not null default '',
  target_duration_seconds integer not null default 900 check (target_duration_seconds between 1 and 7200),
  aspect_ratio text not null default '16:9',
  status text not null default 'draft' check (status in ('draft', 'queued', 'processing', 'ready', 'failed')),
  provider_strategy text not null default 'fallback' check (provider_strategy in ('fallback', 'self_hosted', 'hosted', 'manual')),
  final_asset_id uuid references public.media_assets(id) on delete set null,
  continuity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_assets_project_fk'
      and conrelid = 'public.media_assets'::regclass
  ) then
    alter table public.media_assets
      add constraint media_assets_project_fk foreign key (project_id) references public.film_projects(id) on delete set null;
  end if;
end $$;

create table if not exists public.film_shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.film_projects(id) on delete cascade,
  shot_index integer not null,
  prompt text not null,
  continuity_notes text not null default '',
  duration_seconds integer not null default 10 check (duration_seconds between 1 and 180),
  provider text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  provider_job_id text,
  asset_id uuid references public.media_assets(id) on delete set null,
  first_frame_path text,
  last_frame_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id, shot_index)
);

alter table public.media_assets enable row level security;
alter table public.media_shares enable row level security;
alter table public.film_projects enable row level security;
alter table public.film_shots enable row level security;

drop policy if exists "Media assets owner or shared read" on public.media_assets;
drop policy if exists "Media assets owner insert" on public.media_assets;
drop policy if exists "Media assets owner update" on public.media_assets;
drop policy if exists "Media assets owner delete" on public.media_assets;
create policy "Media assets owner or shared read" on public.media_assets
  for select to authenticated using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.media_shares s
      where s.asset_id = media_assets.id
        and s.revoked_at is null
        and (s.visibility = 'group' or s.recipient_email = (select email from auth.users where id = auth.uid()))
        and (s.expires_at is null or s.expires_at > now())
    )
  );
create policy "Media assets owner insert" on public.media_assets
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Media assets owner update" on public.media_assets
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Media assets owner delete" on public.media_assets
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "Media shares owner manage" on public.media_shares;
drop policy if exists "Media shares recipient read" on public.media_shares;
create policy "Media shares owner manage" on public.media_shares
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Media shares recipient read" on public.media_shares
  for select to authenticated using (
    recipient_email = (select email from auth.users where id = auth.uid())
    and revoked_at is null
  );

drop policy if exists "Film projects owner manage" on public.film_projects;
create policy "Film projects owner manage" on public.film_projects
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Film shots owner manage" on public.film_shots;
create policy "Film shots owner manage" on public.film_shots
  for all to authenticated using (
    exists (select 1 from public.film_projects p where p.id = film_shots.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.film_projects p where p.id = film_shots.project_id and p.owner_id = auth.uid())
  );

grant select, insert, update, delete on public.media_assets, public.media_shares, public.film_projects, public.film_shots to authenticated;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "Media files owner access" on storage.objects;
create policy "Media files owner access" on storage.objects
  for all to authenticated using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  ) with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create index if not exists media_assets_owner_created_idx on public.media_assets(owner_id, created_at desc);
create index if not exists media_shares_token_idx on public.media_shares(share_token);
create index if not exists film_shots_project_idx on public.film_shots(project_id, shot_index);

create or replace function public.touch_cloud_media_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists media_assets_updated_at on public.media_assets;
create trigger media_assets_updated_at before update on public.media_assets
for each row execute function public.touch_cloud_media_updated_at();

drop trigger if exists film_projects_updated_at on public.film_projects;
create trigger film_projects_updated_at before update on public.film_projects
for each row execute function public.touch_cloud_media_updated_at();
