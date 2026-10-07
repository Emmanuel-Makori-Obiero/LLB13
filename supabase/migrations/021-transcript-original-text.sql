-- Keep the provider transcript so learners can compare it with the corrected text.
alter table public.transcript_chunks
  add column if not exists original_text text;

update public.transcript_chunks
set original_text = text
where original_text is null;
