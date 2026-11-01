create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 3 and 160),
  category text not null default 'complaint' check (category in ('complaint','technical','suggestion','account','other')),
  message text not null check (char_length(btrim(message)) between 10 and 8000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_created_at_idx on public.support_tickets(created_at desc);
create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, public;
grant select, insert on public.support_tickets to authenticated;
grant update on public.support_tickets to authenticated;
drop policy if exists "Users create own support tickets" on public.support_tickets;
create policy "Users create own support tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users and admins read support tickets" on public.support_tickets;
create policy "Users and admins read support tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Admins manage support tickets" on public.support_tickets;
create policy "Admins manage support tickets" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.touch_support_ticket_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at before update on public.support_tickets for each row execute function public.touch_support_ticket_updated_at();