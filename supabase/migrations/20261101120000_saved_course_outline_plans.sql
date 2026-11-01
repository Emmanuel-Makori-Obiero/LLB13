create table if not exists public.saved_course_outline_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_title text not null,
  course_code text,
  source_filename text,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_course_outline_plans_user_idx on public.saved_course_outline_plans(user_id, updated_at desc);
alter table public.saved_course_outline_plans enable row level security;
revoke all on public.saved_course_outline_plans from anon, public;
grant select, insert, update, delete on public.saved_course_outline_plans to authenticated;
drop policy if exists "Users manage their saved course plans" on public.saved_course_outline_plans;
create policy "Users manage their saved course plans" on public.saved_course_outline_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists saved_course_outline_plans_updated_at on public.saved_course_outline_plans;
create or replace function public.touch_saved_course_outline_plan_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;
create trigger saved_course_outline_plans_updated_at before update on public.saved_course_outline_plans for each row execute function public.touch_saved_course_outline_plan_updated_at();
