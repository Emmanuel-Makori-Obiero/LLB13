create or replace function public.get_directory_user(p_user_id uuid)
returns public.user_directory
language sql
security definer
set search_path = public
as $$
  select d from public.user_directory d where auth.uid() is not null and d.user_id = p_user_id;
$$;

revoke execute on function public.get_directory_user(uuid) from public, anon;
grant execute on function public.get_directory_user(uuid) to authenticated;
