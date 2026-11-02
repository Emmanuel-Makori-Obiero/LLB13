-- Supabase may grant newly-created public-schema functions directly to anon
-- through project default privileges; revoke that explicit grant as well.
revoke all on function public.admin_set_default_wallpaper_theme(text) from anon;
