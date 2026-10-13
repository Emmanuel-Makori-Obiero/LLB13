-- Use a new RPC name so clients cannot reach an older truncate-based function.
create or replace function public.admin_apply_timetable_proposal_safe(proposal_id uuid)
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

  delete from public.timetable where true;

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

revoke execute on function public.admin_apply_timetable_proposal_safe(uuid) from public, anon;
grant execute on function public.admin_apply_timetable_proposal_safe(uuid) to authenticated;
