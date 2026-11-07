-- Allow delegated administrators, including campus representatives, to manage
-- approved group leaders. Primary-admin-only account role management is unchanged.

create or replace function public.admin_list_group_leaders()
returns table (user_id uuid, email text, display_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authorized administrator can view approved group leaders';
  end if;
  return query
    select l.user_id, u.email::text,
      coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1))::text,
      l.created_at
    from public.group_leaders l join auth.users u on u.id = l.user_id
    order by lower(u.email);
end;
$$;

create or replace function public.admin_set_group_leader_email(p_email text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authorized administrator can manage approved group leaders';
  end if;
  if length(btrim(coalesce(p_email, ''))) = 0 then raise exception 'Enter the account email'; end if;
  select u.id into target_user_id from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null
  limit 1;
  if target_user_id is null then raise exception 'No registered account with a verified email was found'; end if;
  if p_enabled then
    insert into public.group_leaders (user_id, granted_by) values (target_user_id, auth.uid())
      on conflict (user_id) do nothing;
  else
    delete from public.group_leaders where user_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.admin_list_group_leaders() from public, anon;
revoke all on function public.admin_set_group_leader_email(text, boolean) from public, anon;
grant execute on function public.admin_list_group_leaders() to authenticated;
grant execute on function public.admin_set_group_leader_email(text, boolean) to authenticated;
