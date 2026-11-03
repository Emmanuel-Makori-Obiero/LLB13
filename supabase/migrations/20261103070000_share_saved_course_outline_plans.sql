alter table public.saved_course_outline_plans
  add column if not exists visibility text not null default 'private';

alter table public.saved_course_outline_plans
  drop constraint if exists saved_course_outline_plans_visibility_check;
alter table public.saved_course_outline_plans
  add constraint saved_course_outline_plans_visibility_check
  check (visibility in ('private', 'group'));

create index if not exists saved_course_outline_plans_visibility_idx
  on public.saved_course_outline_plans(visibility, updated_at desc);

drop policy if exists "Users manage their saved course plans" on public.saved_course_outline_plans;
drop policy if exists "Owners manage their saved course plans" on public.saved_course_outline_plans;
drop policy if exists "Members read shared saved course plans" on public.saved_course_outline_plans;

create policy "Owners manage their saved course plans"
  on public.saved_course_outline_plans for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Members read shared saved course plans"
  on public.saved_course_outline_plans for select to authenticated
  using (visibility = 'group');
