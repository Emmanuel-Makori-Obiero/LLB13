-- Store author separately so Library records and AI citations can name the author.
alter table public.materials add column if not exists author text;
alter table public.ai_documents add column if not exists author text;

-- Replace the search RPC return shape so the author is available to the AI function.
drop function if exists public.ai_search(text, text, uuid[], integer);
create or replace function ai_search(q text, p_scope text, p_doc_ids uuid[], p_limit int default 8)
returns table (chunk_id bigint, document_id uuid, title text, author text, citation text, idx int, content text, rank real)
language sql stable security invoker as $$
  select c.id, c.document_id, d.title, d.author, d.citation, c.idx, c.content, ts_rank_cd(c.tsv, query)::real
  from ai_chunks c
  join ai_documents d on d.id = c.document_id,
       to_tsquery('english', q) query
  where c.tsv @@ query
    and (p_scope = 'any' or c.scope = p_scope)
    and (p_doc_ids is null or c.document_id = any (p_doc_ids))
  order by 8 desc
  limit p_limit;
$$;
