-- The public carousel filters on is_active, so readers need column-level
-- SELECT access to that column as well as the returned poster fields.
grant select (id, title, image_url, storage_path, link_url, ai_analysis, is_active, created_at)
on public.club_posters to anon, authenticated;
