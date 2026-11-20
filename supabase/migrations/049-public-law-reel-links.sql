-- Allow shared links to open published Law Reels without an account.
drop policy if exists "Published law reels are readable" on public.law_reels;
create policy "Published law reels are readable"
  on public.law_reels
  for select to anon, authenticated
  using (is_published = true or public.is_super_admin());

grant select on public.law_reels to anon;

-- The media bucket remains private; only files belonging to published reels
-- can be read anonymously. Upload, update, and delete policies remain scoped
-- to authenticated users by the earlier migrations.
drop policy if exists "Law reel files are readable" on storage.objects;
create policy "Law reel files are readable"
  on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'media' and (
      public.is_super_admin() or exists (
        select 1
        from public.law_reels r
        where r.is_published = true
          and (r.video_path = name or r.cover_path = name)
      )
    )
  );
