-- Run this in Supabase SQL Editor AFTER schema.sql, super-admin-units.sql and
-- timetable-representative-permissions.sql.
-- Lets every unit and every timetable lesson have one or more representatives.
-- Representatives are matched to auth.users.user_metadata.display_name.

-- 1. Units: list of representatives (units.lead stays as a readable "A, B" summary).
alter table public.units add column if not exists representatives text[] not null default '{}';
update public.units
set representatives = array[lead]
where cardinality(representatives) = 0 and lead is not null and lead <> 'To be assigned';

-- 2. Timetable lessons: list of representatives (timetable.representative stays as the first one).
alter table public.timetable add column if not exists representatives text[] not null default '{}';
update public.timetable
set representatives = array[representative]
where cardinality(representatives) = 0 and representative is not null and representative <> '';

-- 3. Any representative of the lesson, or of the lesson's unit, can edit or delete it.
drop policy if exists "Owners admins and representatives can edit lessons" on public.timetable;
drop policy if exists "Owners admins and representatives can delete lessons" on public.timetable;

create policy "Owners admins and representatives can edit lessons" on public.timetable for update to authenticated using (
  created_by = auth.uid()
  or public.is_super_admin()
  or representative = (auth.jwt() -> 'user_metadata' ->> 'display_name')
  or (auth.jwt() -> 'user_metadata' ->> 'display_name') = any(representatives)
  or exists (
    select 1 from public.units u
    where u.name = timetable.unit
      and (auth.jwt() -> 'user_metadata' ->> 'display_name') = any(u.representatives)
  )
) with check (true);

create policy "Owners admins and representatives can delete lessons" on public.timetable for delete to authenticated using (
  created_by = auth.uid()
  or public.is_super_admin()
  or representative = (auth.jwt() -> 'user_metadata' ->> 'display_name')
  or (auth.jwt() -> 'user_metadata' ->> 'display_name') = any(representatives)
  or exists (
    select 1 from public.units u
    where u.name = timetable.unit
      and (auth.jwt() -> 'user_metadata' ->> 'display_name') = any(u.representatives)
  )
);
