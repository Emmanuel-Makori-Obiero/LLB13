-- Enable push updates for Growth Studio's user-scoped activity and progress.
-- Realtime publication membership does not bypass table grants or RLS.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['platform_activity_events', 'skill_scores', 'user_achievements', 'path_progress'] loop
      if to_regclass(format('public.%I', v_table)) is not null
         and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = v_table
         ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
