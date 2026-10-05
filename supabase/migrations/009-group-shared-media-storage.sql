-- Allow authenticated Group 13 members to open media files explicitly shared with the group.
-- Owners retain full access through the existing policy from 002-cloud-media.sql.
drop policy if exists "Media files group shared read" on storage.objects;
create policy "Media files group shared read" on storage.objects
  for select to authenticated using (
    bucket_id = 'media'
    and exists (
      select 1
      from public.media_assets a
      join public.media_shares s on s.asset_id = a.id
      where a.storage_path = name
        and s.visibility = 'group'
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  );
