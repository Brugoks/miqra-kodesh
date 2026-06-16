-- Supabase security advisory: enable RLS on any public table that doesn't have it.
-- All tables created via migrations already have RLS enabled; this covers any tables
-- created directly via the Supabase dashboard that were missed.
do $$
declare
  rec record;
begin
  for rec in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and not rowsecurity
  loop
    execute format('alter table public.%I enable row level security', rec.tablename);
    raise notice 'Enabled RLS on public.%', rec.tablename;
  end loop;
end;
$$;
