-- Allow authenticated Library uploads to become shared AI-readable documents.
-- The existing Library materials table is already group-readable; this keeps the
-- matching ai_documents/ai_chunks rows shared while preventing user ownership.
drop policy if exists "docs insert library" on public.ai_documents;
create policy "docs insert library" on public.ai_documents for insert to authenticated
  with check (scope = 'library' and owner is null);

drop policy if exists "chunks insert library" on public.ai_chunks;
create policy "chunks insert library" on public.ai_chunks for insert to authenticated
  with check (
    scope = 'library' and owner is null
    and exists (
      select 1 from public.ai_documents d
      where d.id = document_id and d.scope = 'library' and d.owner is null
    )
  );
