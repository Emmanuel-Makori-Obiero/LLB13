-- Persist every administrator class-timetable upload so all signed-in users can see it.
-- The extracted text and structured rows are stored because browser File objects are not shared state.
create table if not exists public.timetable_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  mime_type text,
  extracted_text text not null default '',
  structured_rows jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists timetable_uploads_created_at_idx
  on public.timetable_uploads(created_at desc);

alter table public.timetable_uploads enable row level security;
drop policy if exists "Signed-in users can view shared timetable uploads" on public.timetable_uploads;
create policy "Signed-in users can view shared timetable uploads"
  on public.timetable_uploads for select to authenticated using (true);

drop policy if exists "Super admin can create shared timetable uploads" on public.timetable_uploads;
create policy "Super admin can create shared timetable uploads"
  on public.timetable_uploads for insert to authenticated
  with check (public.is_super_admin() and created_by = auth.uid());

grant select on public.timetable_uploads to authenticated;
grant insert on public.timetable_uploads to authenticated;
