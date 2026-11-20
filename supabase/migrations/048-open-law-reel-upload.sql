drop policy if exists "Super admins manage law reels" on public.law_reels;
create policy "Administrators manage law reels" on public.law_reels
  for all to authenticated using (public.is_super_admin())
  with check (public.is_super_admin() and created_by = auth.uid());
create policy "Students upload law reels" on public.law_reels
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Super admins upload law reel files" on storage.objects;
create policy "Students upload law reel files" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'law-reels');
