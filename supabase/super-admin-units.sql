-- Run this in Supabase SQL Editor after schema.sql.
-- Replace the email below with the exact email used to sign in to the app.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and lower(email) = lower('elmakobiero@gmail.com')
      and email_confirmed_at is not null
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

grant select, insert, update, delete on table public.units to authenticated;

drop policy if exists "Admin manages units" on public.units;
create policy "Admin manages units"
on public.units
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Optional: add a first unit directly.
-- insert into public.units (id, name, code, lead, progress, next, color)
-- values (gen_random_uuid()::text, 'Constitutional Law I', 'LAW 113', 'To be assigned', 0, 'To be scheduled', '#2F5D50');
