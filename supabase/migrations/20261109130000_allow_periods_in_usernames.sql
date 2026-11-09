begin;

alter table public.user_directory drop constraint if exists user_directory_username_check;
alter table public.user_directory add constraint user_directory_username_check check (username = lower(username) and username ~ '^[a-z0-9._]{3,30}$');

create or replace function public.set_my_username(p_username text)
returns public.user_directory
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.user_directory;
  normalized text := lower(btrim(p_username));
begin
  if auth.uid() is null then raise exception 'Sign in before changing your username'; end if;
  if normalized !~ '^[a-z0-9._]{3,30}$' then raise exception 'Username must be 3 to 30 characters using letters, numbers, periods, or underscores'; end if;
  update public.user_directory set username = normalized, updated_at = now() where user_id = auth.uid() returning * into result;
  if result.user_id is null then raise exception 'Username profile not found'; end if;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', normalized) where id = auth.uid();
  return result;
exception when unique_violation then raise exception 'That username is already taken';
end;
$$;

revoke execute on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;

commit;
