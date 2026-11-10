begin;

-- Usernames are optional during onboarding, but a saved directory username must
-- still be nonempty and unique. Hashing keeps uniqueness indexed without a
-- B-tree key-size limit on long usernames.
alter table public.user_directory
  drop constraint if exists user_directory_username_check,
  drop constraint if exists user_directory_username_key;

drop index if exists public.user_directory_username_idx;
create unique index if not exists user_directory_username_hash_idx
  on public.user_directory (md5(username));

alter table public.user_directory
  add constraint user_directory_username_check
  check (username = lower(username) and username ~ '^[a-z0-9._]+$');

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
  if normalized !~ '^[a-z0-9._]+$' then
    raise exception 'Username must contain at least one letter, number, period, or underscore; numbers are optional';
  end if;
  update public.user_directory
    set username = normalized, updated_at = now()
    where user_id = auth.uid()
    returning * into result;
  if result.user_id is null then raise exception 'Username profile not found'; end if;
  update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', normalized)
    where id = auth.uid();
  return result;
exception when unique_violation then
  raise exception 'That username is already taken';
end;
$$;

revoke execute on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;

commit;
