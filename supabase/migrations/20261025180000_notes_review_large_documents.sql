-- Large note reviews are processed in bounded AI segments, so history must not
-- reject the complete original after the frontend has reviewed every segment.
alter table public.notes_reviews
  drop constraint if exists notes_reviews_original_text_check;

alter table public.notes_reviews
  add constraint notes_reviews_original_text_check
  check (char_length(original_text) between 1 and 500000);
