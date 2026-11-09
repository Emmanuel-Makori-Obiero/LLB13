create extension if not exists pg_trgm;

create or replace function public.search_user_directory(p_query text default '')
returns table(user_id uuid, username text, display_name text)
language sql
security definer
set search_path = public
as $$
  with input as (
    select lower(btrim(coalesce(p_query, ''))) as q
  )
  select d.user_id, d.username, d.display_name
  from public.user_directory d, input
  where auth.uid() is not null
    and (
      input.q = ''
      or d.username ilike '%' || input.q || '%'
      or d.display_name ilike '%' || btrim(coalesce(p_query, '')) || '%'
      or lower(d.username) % input.q
      or lower(d.display_name) % input.q
    )
  order by
    case when input.q = '' then 0 else 1 end,
    case when lower(d.username) = input.q then 0 else 1 end,
    case when lower(d.username) like input.q || '%' then 0 else 1 end,
    case when lower(d.display_name) like lower(btrim(coalesce(p_query, ''))) || '%' then 0 else 1 end,
    greatest(similarity(lower(d.username), input.q), similarity(lower(d.display_name), lower(btrim(coalesce(p_query, ''))))) desc,
    d.username
  limit 30;
$$;

revoke execute on function public.search_user_directory(text) from public, anon;
grant execute on function public.search_user_directory(text) to authenticated;
