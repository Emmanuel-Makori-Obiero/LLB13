-- A single site-wide theme fallback. Personal profile themes and uploaded wallpapers
-- remain stored in user metadata and always take precedence in the application.
create table if not exists public.site_appearance_settings (
  singleton boolean primary key default true check (singleton),
  default_theme_id text null,
  updated_by uuid null references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint site_appearance_default_theme_check check (
    default_theme_id is null or default_theme_id = any (
      array['light', 'dark', 'halloween', 'forest', 'ocean', 'nairobi']::text[]
    )
  )
);

comment on table public.site_appearance_settings is
  'Public-readable platform appearance defaults; only the primary admin can change them.';

insert into public.site_appearance_settings (singleton, default_theme_id)
values (true, null)
on conflict (singleton) do nothing;

alter table public.site_appearance_settings enable row level security;
revoke all on table public.site_appearance_settings from anon, authenticated;
grant select on table public.site_appearance_settings to anon, authenticated;
drop policy if exists site_appearance_settings_public_read on public.site_appearance_settings;
create policy site_appearance_settings_public_read
  on public.site_appearance_settings
  for select
  to anon, authenticated
  using (true);

create or replace function public.admin_set_default_wallpaper_theme(p_theme_id text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_primary_admin(), false) then
    raise exception 'Only the primary administrator can change the platform wallpaper default.'
      using errcode = '42501';
  end if;

  if p_theme_id is not null and p_theme_id <> all (
    array['light', 'dark', 'halloween', 'forest', 'ocean', 'nairobi']::text[]
  ) then
    raise exception 'Unknown wallpaper theme.' using errcode = '22023';
  end if;

  insert into public.site_appearance_settings (
    singleton, default_theme_id, updated_by, updated_at
  ) values (
    true, p_theme_id, auth.uid(), now()
  )
  on conflict (singleton) do update
    set default_theme_id = excluded.default_theme_id,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return p_theme_id;
end;
$function$;

revoke all on function public.admin_set_default_wallpaper_theme(text) from public;
grant execute on function public.admin_set_default_wallpaper_theme(text) to authenticated;
