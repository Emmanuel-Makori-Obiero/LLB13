-- A user's private history may point only to a shared Library source or a source they own.
-- This prevents attaching another user's private paper ID to an otherwise owner-scoped review.
drop policy if exists "Users manage own exam analyses" on public.exam_analyses;
create policy "Users manage own exam analyses"
  on public.exam_analyses for all to authenticated
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and (
      source_document_id is null
      or exists (
        select 1
        from public.ai_documents d
        where d.id = source_document_id
          and (d.scope = 'library' or d.owner = auth.uid())
      )
    )
  );
