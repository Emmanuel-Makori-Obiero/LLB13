-- Shared Group 13 timetable proposals.
-- Approval replaces public.timetable atomically and stores a rollback snapshot.
-- Run after admin.sql and timetable-representative-permissions.sql.

create table if not exists public.timetable_proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instruction text not null default '',
  source_filename text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'reverted')),
  proposed_lessons jsonb not null default '[]'::jsonb,
  rationale text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.timetable_snapshots (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.timetable_proposals(id) on delete cascade,
  lessons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid()
);

create index if not exists timetable_proposals_created_at_idx
  on public.timetable_proposals(created_at desc);
create index if not exists timetable_snapshots_proposal_idx
  on public.timetable_snapshots(proposal_id);

alter table public.timetable_proposals enable row level security;
alter table public.timetable_snapshots enable row level security;

drop policy if exists "Only super admin can read timetable proposals" on public.timetable_proposals;
create policy "Only super admin can read timetable proposals"
  on public.timetable_proposals for select to authenticated
  using (public.is_super_admin());
drop policy if exists "Only super admin can create timetable proposals" on public.timetable_proposals;
create policy "Only super admin can create timetable proposals"
  on public.timetable_proposals for insert to authenticated
  with check (public.is_super_admin() and created_by = auth.uid());
drop policy if exists "Only super admin can update timetable proposals" on public.timetable_proposals;
create policy "Only super admin can update timetable proposals"
  on public.timetable_proposals for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admin deletes timetable proposal history" on public.timetable_proposals;
create policy "Super admin deletes timetable proposal history"
  on public.timetable_proposals for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.timetable_proposals to authenticated;

create or replace function public.admin_apply_timetable_proposal(proposal_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  proposal public.timetable_proposals;
  inserted_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can approve timetable proposals';
  end if;

  select * into proposal
  from public.timetable_proposals
  where id = proposal_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending timetable proposal not found'; end if;

  insert into public.timetable_snapshots (proposal_id, lessons, created_by)
  select proposal.id,
    coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'created_by' order by t.lesson_date, t.start_time nulls last), '[]'::jsonb),
    auth.uid()
  from public.timetable t;

  truncate table public.timetable;

  insert into public.timetable (
    unit, topic, lesson_date, start_time, end_time,
    representative, representatives, venue, created_by
  )
  select
    nullif(trim(item->>'unit'), ''),
    nullif(trim(item->>'topic'), ''),
    (item->>'lesson_date')::date,
    nullif(trim(item->>'start_time'), '')::time,
    nullif(trim(item->>'end_time'), '')::time,
    nullif(trim(item->>'representative'), ''),
    case when jsonb_typeof(item->'representatives') = 'array'
      then array(select jsonb_array_elements_text(item->'representatives'))
      else '{}'::text[] end,
    nullif(trim(item->>'venue'), ''),
    auth.uid()
  from jsonb_array_elements(proposal.proposed_lessons) item
  where nullif(trim(item->>'unit'), '') is not null
    and nullif(trim(item->>'topic'), '') is not null
    and nullif(trim(item->>'lesson_date'), '') is not null;

  get diagnostics inserted_count = row_count;
  update public.timetable_proposals
    set status = 'approved', approved_at = now()
    where id = proposal.id;
  return inserted_count;
end;
$$;

create or replace function public.admin_rollback_timetable_proposal(proposal_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  proposal public.timetable_proposals;
  snapshot public.timetable_snapshots;
  restored_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can roll back timetable proposals';
  end if;

  select * into proposal
  from public.timetable_proposals p
  where p.id = proposal_id and p.status = 'approved'
    and p.id = (select id from public.timetable_proposals where status = 'approved' order by approved_at desc limit 1)
  for update;
  if not found then raise exception 'Only the most recently approved timetable can be rolled back'; end if;

  select * into snapshot from public.timetable_snapshots s where s.proposal_id = proposal.id;
  if not found then raise exception 'No previous timetable snapshot exists for this approval'; end if;

  truncate table public.timetable;
  insert into public.timetable (unit, topic, lesson_date, start_time, end_time, representative, representatives, venue, created_by)
  select
    nullif(trim(item->>'unit'), ''), nullif(trim(item->>'topic'), ''),
    (item->>'lesson_date')::date, nullif(trim(item->>'start_time'), '')::time,
    nullif(trim(item->>'end_time'), '')::time, nullif(trim(item->>'representative'), ''),
    case when jsonb_typeof(item->'representatives') = 'array'
      then array(select jsonb_array_elements_text(item->'representatives')) else '{}'::text[] end,
    nullif(trim(item->>'venue'), ''), auth.uid()
  from jsonb_array_elements(snapshot.lessons) item;
  get diagnostics restored_count = row_count;
  update public.timetable_proposals set status = 'reverted' where id = proposal.id;
  return restored_count;
end;
$$;

revoke execute on function public.admin_apply_timetable_proposal(uuid) from public, anon;
revoke execute on function public.admin_rollback_timetable_proposal(uuid) from public, anon;
grant execute on function public.admin_apply_timetable_proposal(uuid) to authenticated;
grant execute on function public.admin_rollback_timetable_proposal(uuid) to authenticated;
