-- Group 13's shared class timetable is strictly Monday–Friday.
-- Personal study events live in a separate table and are intentionally unaffected.

create or replace function public.enforce_group_timetable_weekdays()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if extract(isodow from new.lesson_date) in (6, 7) then
    raise exception 'Group 13 classes may only be scheduled Monday through Friday.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_timetable_weekdays on public.timetable;
create trigger guard_group_timetable_weekdays
  before insert or update on public.timetable
  for each row execute function public.enforce_group_timetable_weekdays();

-- The uploaded source/structured preview is an admin workbench, not a second
-- student-facing timetable. Members see only the approved public timetable.
drop policy if exists "Signed-in users can view structured timetable uploads"
  on public.shared_timetable_uploads;
create policy "Super admin can view structured timetable uploads"
  on public.shared_timetable_uploads for select to authenticated
  using (public.is_super_admin());
