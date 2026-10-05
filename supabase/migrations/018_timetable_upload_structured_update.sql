-- Allow the super admin to publish AI-generated structured rows into the shared preview.
drop policy if exists "Super admin can update structured timetable uploads" on public.shared_timetable_uploads;
create policy "Super admin can update structured timetable uploads"
  on public.shared_timetable_uploads for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant update on public.shared_timetable_uploads to authenticated;
