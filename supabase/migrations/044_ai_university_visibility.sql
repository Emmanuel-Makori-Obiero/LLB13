alter table public.ai_documents add column if not exists university text;
alter table public.ai_chunks add column if not exists university text;

drop policy if exists "docs read" on public.ai_documents;
drop policy if exists "chunks read" on public.ai_chunks;
drop policy if exists "docs insert library" on public.ai_documents;
drop policy if exists "chunks insert library" on public.ai_chunks;

create policy "Audience can read AI documents" on public.ai_documents
for select to authenticated using (
  (scope = 'user' and owner = auth.uid())
  or (scope = 'library' and (university is null or university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', '')))
);

create policy "Audience can read AI chunks" on public.ai_chunks
for select to authenticated using (
  (scope = 'user' and owner = auth.uid())
  or (scope = 'library' and (university is null or university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', '')))
);

create policy "Users can insert library AI documents" on public.ai_documents
for insert to authenticated with check (
  scope = 'library' and owner is null
  and (university is null or university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', ''))
);

create policy "Users can insert library AI chunks" on public.ai_chunks
for insert to authenticated with check (
  scope = 'library' and owner is null
  and (university is null or university = nullif(auth.jwt() -> 'user_metadata' ->> 'university', ''))
  and exists (
    select 1 from public.ai_documents d
    where d.id = document_id and d.scope = 'library' and d.owner is null
  )
);
