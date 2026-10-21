-- Carry Library cohort tags into the AI index so hidden year-specific sources
-- cannot be retrieved by a different cohort through assistant/search features.
alter table public.ai_documents
  add column if not exists target_years text[] not null default '{}';
alter table public.ai_documents
  add column if not exists material_id uuid;
create index if not exists ai_documents_target_years_gin_idx
  on public.ai_documents using gin (target_years);
create index if not exists ai_documents_material_id_idx
  on public.ai_documents (material_id);

-- Safe legacy backfill: use the existing type/unit/source citation only when all
-- matching material records have the same audience. Ambiguous rows stay shared.
with matched as (
  select d.id,
         count(*) as material_count,
         count(distinct array_to_string(m.target_years, ',')) as audience_count,
         min(array_to_string(m.target_years, ',')) as audience,
         min(m.id::text) as one_material_id
  from public.ai_documents d
  join public.materials m
    on d.citation = concat_ws(' · ', m.type, m.unit, m.source)
  where d.scope = 'library'
  group by d.id
)
update public.ai_documents d
set target_years = case when matched.audience = '' then '{}'::text[] else string_to_array(matched.audience, ',') end,
    material_id = case when matched.material_count = 1 then matched.one_material_id::uuid else null end
from matched
where d.id = matched.id and matched.audience_count = 1;
