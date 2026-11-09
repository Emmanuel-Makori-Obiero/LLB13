-- Allow members to report safety, abuse, or copyright concerns through the private support inbox.
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check check (category in ('complaint','technical','suggestion','account','safety','other'));
