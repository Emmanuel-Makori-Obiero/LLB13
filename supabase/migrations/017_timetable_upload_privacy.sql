-- Keep the original extracted file text private to administrators while sharing only the structured timetable.
create table if not exists public.shared_timetable_uploads (
  id uuid primary key,
  filename text not null,
  mime_type text,
  structured_rows jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.shared_timetable_uploads (id, filename, mime_type, structured_rows, created_by, created_at)
select id, filename, mime_type, structured_rows, created_by, created_at
from public.timetable_uploads
on conflict (id) do nothing;

alter table public.shared_timetable_uploads enable row level security;
drop policy if exists "Signed-in users can view structured timetable uploads" on public.shared_timetable_uploads;
create policy "Signed-in users can view structured timetable uploads"
  on public.shared_timetable_uploads for select to authenticated using (true);
drop policy if exists "Super admin can create structured timetable uploads" on public.shared_timetable_uploads;
create policy "Super admin can create structured timetable uploads"
  on public.shared_timetable_uploads for insert to authenticated
  with check (public.is_super_admin() and created_by = auth.uid());
grant select, insert on public.shared_timetable_uploads to authenticated;

-- Raw extracted text is never exposed to ordinary signed-in users.
drop policy if exists "Signed-in users can view shared timetable uploads" on public.timetable_uploads;
drop policy if exists "Super admin can view raw timetable uploads" on public.timetable_uploads;
create policy "Super admin can view raw timetable uploads"
  on public.timetable_uploads for select to authenticated using (public.is_super_admin());
