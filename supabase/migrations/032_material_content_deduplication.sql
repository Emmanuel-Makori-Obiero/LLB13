alter table public.materials
  add column if not exists file_sha256 text;

create unique index if not exists materials_file_sha256_unique
  on public.materials (file_sha256)
  where file_sha256 is not null;

comment on column public.materials.file_sha256 is
  'SHA-256 fingerprint of the uploaded file bytes, used to prevent duplicate Library uploads.';
