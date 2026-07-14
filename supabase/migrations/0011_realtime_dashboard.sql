-- 0011_realtime_dashboard.sql
-- Enable Supabase Realtime so the local Obsidian "Mission Control" dashboard can
-- live-subscribe to table changes. This is additive, safe, and reversible.
-- Realtime still respects Row Level Security, so subscribers only receive rows
-- they are allowed to read.
--
-- The dashboard also works WITHOUT this migration (it falls back to polling),
-- so applying this is optional but gives you true push-based live updates.

do $$
declare
  t text;
  tables text[] := array[
    'agents', 'vault_documents', 'memories', 'briefings',
    'conversations', 'messages', 'deals', 'revenue_events',
    'content_posts', 'meetings', 'commitments', 'tasks', 'people'
  ];
begin
  -- Ensure the default Supabase realtime publication exists.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      -- Add table to the realtime publication (idempotent).
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception
        when duplicate_object then null; -- already in the publication
        when others then raise notice 'skip publication for %: %', t, sqlerrm;
      end;

      -- Send full old-row data on UPDATE/DELETE so the dashboard can reconcile.
      begin
        execute format('alter table public.%I replica identity full', t);
      exception
        when others then raise notice 'skip replica identity for %: %', t, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- To undo:
--   alter publication supabase_realtime drop table public.<name>;
