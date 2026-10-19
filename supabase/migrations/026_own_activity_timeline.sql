-- Let each member see their own recent page and AI activity in Growth Studio.
-- The existing super-admin SELECT policy remains unchanged and additive.
drop policy if exists "Users read own minimal activity" on public.platform_activity_events;
create policy "Users read own minimal activity" on public.platform_activity_events
  for select to authenticated
  using (user_id = auth.uid());
