create table if not exists public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  book_key text not null,
  book_title text not null,
  review_text text not null,
  content_fingerprint text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists book_reviews_book_key_created_at_idx on public.book_reviews(book_key, created_at desc);
create unique index if not exists book_reviews_book_fingerprint_idx on public.book_reviews(book_key, content_fingerprint);

alter table public.book_reviews enable row level security;
revoke all on public.book_reviews from public, anon;
grant select, insert on public.book_reviews to authenticated;

drop policy if exists "Authenticated users read book review context" on public.book_reviews;
create policy "Authenticated users read book review context" on public.book_reviews
  for select to authenticated using (true);

drop policy if exists "Users save their own book reviews" on public.book_reviews;
create policy "Users save their own book reviews" on public.book_reviews
  for insert to authenticated with check (created_by = auth.uid());
