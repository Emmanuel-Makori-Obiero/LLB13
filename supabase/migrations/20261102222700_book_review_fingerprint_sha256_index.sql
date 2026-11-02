-- Keep exact-pair duplicate protection while keeping long normalized review text
-- out of the B-tree key. This changes the index only; existing review rows stay intact.
CREATE UNIQUE INDEX IF NOT EXISTS book_reviews_book_fingerprint_sha256_idx
  ON public.book_reviews (
    book_key,
    (extensions.digest(content_fingerprint, 'sha256'))
  );

DROP INDEX IF EXISTS public.book_reviews_book_fingerprint_idx;
