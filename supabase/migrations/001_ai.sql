-- Group 13 Hub: AI materials store (user uploads + shared library) with full-text retrieval.
-- Run in the Supabase SQL Editor.

create table if not exists ai_documents (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('user','library')),
  title       text not null,
  citation    text,                 -- e.g. "Constitution of Kenya 2010, Art. 27" or "Author, Book (ed.)"
  created_at  timestamptz not null default now()
);

create table if not exists ai_chunks (
  id          bigserial primary key,
  document_id uuid not null references ai_documents(id) on delete cascade,
  owner       uuid,
  scope       text not null check (scope in ('user','library')),
  idx         int  not null,
  content     text not null,
  tsv         tsvector generated always as (to_tsvector('english', content)) stored
);
create index if not exists ai_chunks_tsv_idx  on ai_chunks using gin (tsv);
create index if not exists ai_chunks_doc_idx  on ai_chunks (document_id, idx);

create table if not exists ai_usage (
  id         bigserial primary key,
  user_id    uuid not null,
  feature    text,
  provider   text,
  model      text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on ai_usage (user_id, created_at desc);

alter table ai_documents enable row level security;
alter table ai_chunks    enable row level security;
alter table ai_usage     enable row level security;   -- no policies: service role only

-- Everyone signed in can read the shared library; users read/write only their own uploads.
-- Library rows are inserted by you (service role / SQL editor), not by students.
create policy "docs read"   on ai_documents for select to authenticated
  using (scope = 'library' or owner = auth.uid());
create policy "docs insert" on ai_documents for insert to authenticated
  with check (scope = 'user' and owner = auth.uid());
create policy "docs delete" on ai_documents for delete to authenticated
  using (scope = 'user' and owner = auth.uid());

create policy "chunks read"   on ai_chunks for select to authenticated
  using (scope = 'library' or owner = auth.uid());
create policy "chunks insert" on ai_chunks for insert to authenticated
  with check (
    scope = 'user' and owner = auth.uid()
    and exists (select 1 from ai_documents d where d.id = document_id and d.owner = auth.uid())
  );

-- q must be a to_tsquery string like 'tort | negligence | duty' (the edge function builds it from sanitized tokens).
create or replace function ai_search(q text, p_scope text, p_doc_ids uuid[], p_limit int default 8)
returns table (chunk_id bigint, document_id uuid, title text, citation text, idx int, content text, rank real)
language sql stable security invoker as $$
  select c.id, c.document_id, d.title, d.citation, c.idx, c.content, ts_rank_cd(c.tsv, query)::real
  from ai_chunks c
  join ai_documents d on d.id = c.document_id,
       to_tsquery('english', q) query
  where c.tsv @@ query
    and (p_scope = 'any' or c.scope = p_scope)
    and (p_doc_ids is null or c.document_id = any (p_doc_ids))
  order by 7 desc
  limit p_limit;
$$;
