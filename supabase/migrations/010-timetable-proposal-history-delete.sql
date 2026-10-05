-- Allow the configured super admin to remove old timetable proposal records.
-- Deleting history never changes the current timetable; approval and rollback remain separate RPCs.
do $$
begin
  if to_regclass('public.timetable_proposals') is not null then
    execute 'alter table public.timetable_proposals enable row level security';
    execute 'drop policy if exists "Super admin deletes timetable proposal history" on public.timetable_proposals';
    execute 'create policy "Super admin deletes timetable proposal history" on public.timetable_proposals for delete to authenticated using (public.is_super_admin())';
    execute 'grant delete on public.timetable_proposals to authenticated';
  end if;
end $$;
