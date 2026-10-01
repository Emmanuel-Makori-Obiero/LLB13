-- AI assignment extraction, group announcements, and in-app notifications.
-- Run after schema.sql and transcripts.sql.

create table if not exists public.assignment_extractions (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid references public.transcripts(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  unit text not null default '',
  due text not null default '',
  brief text not null default '',
  source_excerpt text not null default '',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  assignment_id text references public.assignments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assignment_extractions_transcript_idx
  on public.assignment_extractions (transcript_id, created_at desc);

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default 'Group 13 member',
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid references public.group_announcements(id) on delete cascade,
  kind text not null default 'announcement',
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read_at, created_at desc);

alter table public.assignment_extractions enable row level security;
alter table public.group_announcements enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Members can read assignment extractions" on public.assignment_extractions;
drop policy if exists "Members can create assignment extractions" on public.assignment_extractions;
drop policy if exists "Authors can update assignment extractions" on public.assignment_extractions;
drop policy if exists "Members can read announcements" on public.group_announcements;
drop policy if exists "Members can create announcements" on public.group_announcements;
drop policy if exists "Members can read own notifications" on public.notifications;
drop policy if exists "Members can update own notifications" on public.notifications;
drop policy if exists "Members can create notifications" on public.notifications;

create policy "Members can read assignment extractions" on public.assignment_extractions for select to authenticated using (true);
create policy "Members can create assignment extractions" on public.assignment_extractions for insert to authenticated with check (created_by = auth.uid());
create policy "Authors can update assignment extractions" on public.assignment_extractions for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "Members can read announcements" on public.group_announcements for select to authenticated using (true);
create policy "Members can create announcements" on public.group_announcements for insert to authenticated with check (created_by = auth.uid());
create policy "Members can read own notifications" on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy "Members can update own notifications" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "Members can create notifications" on public.notifications for insert to authenticated with check (recipient_id = auth.uid() or exists (select 1 from public.members where public.members.user_id = recipient_id));

grant select, insert, update on table public.assignment_extractions to authenticated;
grant select, insert on table public.group_announcements to authenticated;
grant select, insert, update on table public.notifications to authenticated;

-- Enable realtime for live group announcements and notification badges.
alter publication supabase_realtime add table public.group_announcements;
alter publication supabase_realtime add table public.notifications;
