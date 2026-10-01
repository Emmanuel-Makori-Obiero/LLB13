-- Add lesson-level metadata to shared lecture transcripts.
-- Run this once in the Supabase SQL Editor after supabase/transcripts.sql.

alter table public.transcripts
  add column if not exists lesson_number integer,
  add column if not exists lesson_title text;

create index if not exists transcripts_unit_lesson_idx
  on public.transcripts (unit, lesson_number, created_at desc);
