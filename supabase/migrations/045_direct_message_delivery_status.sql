alter table public.direct_messages add column if not exists delivered_at timestamptz;

-- A recipient may acknowledge delivery without gaining access to messages outside their inbox.
drop policy if exists "Recipients mark messages delivered" on public.direct_messages;
create policy "Recipients mark messages delivered" on public.direct_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create index if not exists direct_messages_recipient_delivery_idx
  on public.direct_messages (recipient_id, delivered_at, read_at);
