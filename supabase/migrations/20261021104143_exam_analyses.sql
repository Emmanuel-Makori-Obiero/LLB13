create table if not exists public.exam_analyses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  paper_title text not null check (length(btrim(paper_title)) > 0),
  source_document_id uuid references public.ai_documents(id) on delete set null,
  student_answers text not null default '',
  analysis text not null check (length(btrim(analysis)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists exam_analyses_owner_created_idx
  on public.exam_analyses (owner, created_at desc);

alter table public.exam_analyses enable row level security;
drop policy if exists "Users manage own exam analyses" on public.exam_analyses;
create policy "Users manage own exam analyses"
  on public.exam_analyses for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

revoke all on table public.exam_analyses from public, anon, authenticated;
grant select, insert, update, delete on table public.exam_analyses to authenticated;
