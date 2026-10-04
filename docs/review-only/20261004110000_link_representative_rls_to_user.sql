-- APPLIED AFTER EXPLICIT USER APPROVAL on 2026-10-04.
-- Supabase ledger version: 20261004084308.
-- This file remains an audit copy outside the active migration directory;
-- do not replay it blindly or use it as a substitute for ledger reconciliation.
-- The live policies on 2026-10-04 authorized representatives by comparing an
-- editable auth.jwt() user_metadata.display_name to a meeting/timetable name.
-- The app lets signed-in users edit that metadata. These replacement policies
-- resolve representative access through the protected members.user_id link.
-- Apply-time read-only preflight: all 3 distinct representative names found in
-- discussions, timetable and units had protected members.user_id links (3/3).
-- Do not run a blanket `supabase db push` until the
-- live migration history and the legacy local migration filenames are reconciled.

begin;

drop policy if exists "Representatives can end their meetings" on public.discussions;
create policy "Representatives can end their meetings"
  on public.discussions
  for delete to authenticated
  using (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and lower(btrim(m.name)) = lower(btrim(discussions.leader))
    )
  );

drop policy if exists "Representatives can manage their meetings" on public.discussions;
create policy "Representatives can manage their meetings"
  on public.discussions
  for update to authenticated
  using (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and lower(btrim(m.name)) = lower(btrim(discussions.leader))
    )
  )
  with check (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and lower(btrim(m.name)) = lower(btrim(discussions.leader))
    )
  );

drop policy if exists "Owners admins and representatives can delete lessons" on public.timetable;
create policy "Owners admins and representatives can delete lessons"
  on public.timetable
  for delete to authenticated
  using (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and (
          lower(btrim(m.name)) = lower(btrim(timetable.representative))
          or exists (
            select 1
            from unnest(coalesce(timetable.representatives, array[]::text[])) as r(name)
            where lower(btrim(r.name)) = lower(btrim(m.name))
          )
          or exists (
            select 1
            from public.units u
            where u.name = timetable.unit
              and exists (
                select 1
                from unnest(coalesce(u.representatives, array[]::text[])) as r(name)
                where lower(btrim(r.name)) = lower(btrim(m.name))
              )
          )
        )
    )
  );

drop policy if exists "Owners admins and representatives can edit lessons" on public.timetable;
create policy "Owners admins and representatives can edit lessons"
  on public.timetable
  for update to authenticated
  using (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and (
          lower(btrim(m.name)) = lower(btrim(timetable.representative))
          or exists (
            select 1
            from unnest(coalesce(timetable.representatives, array[]::text[])) as r(name)
            where lower(btrim(r.name)) = lower(btrim(m.name))
          )
          or exists (
            select 1
            from public.units u
            where u.name = timetable.unit
              and exists (
                select 1
                from unnest(coalesce(u.representatives, array[]::text[])) as r(name)
                where lower(btrim(r.name)) = lower(btrim(m.name))
              )
          )
        )
    )
  )
  with check (
    created_by = auth.uid()
    or is_super_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and (
          lower(btrim(m.name)) = lower(btrim(timetable.representative))
          or exists (
            select 1
            from unnest(coalesce(timetable.representatives, array[]::text[])) as r(name)
            where lower(btrim(r.name)) = lower(btrim(m.name))
          )
          or exists (
            select 1
            from public.units u
            where u.name = timetable.unit
              and exists (
                select 1
                from unnest(coalesce(u.representatives, array[]::text[])) as r(name)
                where lower(btrim(r.name)) = lower(btrim(m.name))
              )
          )
        )
    )
  );

commit;
