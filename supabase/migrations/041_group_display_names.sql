-- Give every learner-created study group a consistent shared display name.
-- Example: "Jewels" is stored and shown as "Jewels Law Study Hub".

create or replace function public.study_group_display_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  base_name text;
begin
  base_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+law study hub\s*$', '', 'i');
  base_name := regexp_replace(base_name, '\s+', ' ', 'g');
  if length(base_name) = 0 then
    raise exception 'Group name must be 1 to 63 characters before the Law Study Hub suffix';
  end if;
  if length(base_name) > 63 then
    raise exception 'Group name must be 1 to 63 characters before the Law Study Hub suffix';
  end if;
  return base_name || ' Law Study Hub';
end;
$$;

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_group_id uuid;
  new_code text;
  display_label text;
  normalized_name text;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a group'; end if;
  if not public.can_create_study_group() then raise exception 'Only an approved group leader or admin can create a group'; end if;
  normalized_name := public.study_group_display_name(p_name);
  if exists (select 1 from public.study_group_members m where m.user_id = auth.uid()) then
    raise exception 'Leave your current group before creating another one';
  end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Member')
    into display_label from auth.users u where u.id = auth.uid();
  new_code := public.make_group_invite_code();
  insert into public.study_groups (name, leader_id, invite_code)
    values (normalized_name, auth.uid(), new_code) returning id into new_group_id;
  insert into public.study_group_members (group_id, user_id, display_name)
    values (new_group_id, auth.uid(), display_label);
  return new_group_id;
end;
$$;

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_name text;
begin
  if auth.uid() is null then raise exception 'Sign in before renaming a group'; end if;
  normalized_name := public.study_group_display_name(p_name);
  update public.study_groups
  set name = normalized_name
  where id = p_group_id
    and (leader_id = auth.uid() or public.is_super_admin());
  if not found then
    raise exception 'Only the group leader or super admin can rename this group';
  end if;
end;
$$;

revoke all on function public.study_group_display_name(text) from public, anon;
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
