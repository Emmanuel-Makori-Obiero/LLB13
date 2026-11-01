create table if not exists public.notification_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscribed boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_subscriptions enable row level security;
revoke all on public.notification_subscriptions from anon, public;
grant select, insert, update on public.notification_subscriptions to authenticated;
drop policy if exists "Users manage their notification subscription" on public.notification_subscriptions;
create policy "Users manage their notification subscription" on public.notification_subscriptions for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop trigger if exists notification_subscriptions_updated_at on public.notification_subscriptions;
create or replace function public.touch_notification_subscription_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;
create trigger notification_subscriptions_updated_at before update on public.notification_subscriptions for each row execute function public.touch_notification_subscription_updated_at();