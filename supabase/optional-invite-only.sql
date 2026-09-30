-- OPTIONAL: restrict sign-ups to an approved list of Group 13 emails.
-- Run in the Supabase SQL Editor ONLY if you want invite-only access.
-- Without this, anyone who signs up can read the workspace (all RLS policies allow any signed-in user).

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table public.allowed_emails enable row level security; -- no policies = not readable from the browser

create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'Email is not on the Group 13 approved list';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email on auth.users;
create trigger enforce_allowed_email
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

-- Add the admin first, then classmates (lowercase):
insert into public.allowed_emails (email) values ('emmanuelmakobiero@gmail.com') on conflict do nothing;
-- insert into public.allowed_emails (email) values ('classmate@example.com'), ('another@example.com') on conflict do nothing;
