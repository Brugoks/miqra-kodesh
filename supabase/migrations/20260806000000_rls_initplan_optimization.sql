-- Evaluate RLS helper functions once per query instead of once per row.
--
-- Policies call their helpers bare -- `is_developer() or organization_id =
-- get_my_organization_id()` -- and Postgres treats a bare STABLE function in a
-- policy as part of the per-row filter. Every helper runs
-- `select role from public.profiles where id = auth.uid()`, so each protected
-- query re-reads profiles once for every candidate row. pg_stat_user_tables
-- showed 103,860,423 tuples read from a 35-row profiles table, and counting the
-- 6,459 rows of api_usage_events took ~110ms with `Filter:
-- is_developer_unscoped()` applied per row.
--
-- Wrapping a row-independent call in a scalar subquery turns it into an
-- InitPlan: computed once, before the scan, then compared as a constant.
--
--   per row:        is_developer() or organization_id = get_my_organization_id()
--   once per query: (select is_developer()) or organization_id = (select get_my_organization_id())
--
-- Same semantics and same security -- these functions take no arguments and do
-- not reference the row, so hoisting them cannot change any result. Only the
-- number of times they run changes.
--
-- Applied with ALTER POLICY rather than DROP/CREATE so command type, grantee
-- roles and the permissive flag are all preserved untouched; only the USING and
-- WITH CHECK expressions are rewritten. can_access_channel(channel_id) and
-- friends are deliberately absent from the list below: they take the row as an
-- argument, so they must stay per-row.

do $$
declare
  pol record;
  new_q text;
  new_w text;
  stmt text;
  f text;
  changed int := 0;
  -- Zero-argument, row-independent helpers only.
  fns text[] := array[
    'auth.uid',
    'auth.jwt',
    'get_my_organization_id',
    'is_developer_unscoped',
    'is_developer',
    'is_leader',
    'is_admin',
    'is_service_role',
    'dev_org_scoping_active',
    'can_create_events',
    'can_manage_channels'
  ];
begin
  for pol in
    select c.relname as tbl,
           p.polname as name,
           p.polcmd  as cmd,
           pg_get_expr(p.polqual, p.polrelid)      as q,
           pg_get_expr(p.polwithcheck, p.polrelid) as w
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
  loop
    new_q := pol.q;
    new_w := pol.w;

    foreach f in array fns loop
      -- Schema-qualified form first, via a placeholder, so public.is_admin()
      -- cannot turn into public.(select is_admin()).
      new_q := replace(new_q, 'public.' || f || '()', '@@' || f || '@@');
      new_q := replace(new_q, f || '()',              '@@' || f || '@@');
      new_q := replace(new_q, '@@' || f || '@@',      '(select ' || f || '())');

      new_w := replace(new_w, 'public.' || f || '()', '@@' || f || '@@');
      new_w := replace(new_w, f || '()',              '@@' || f || '@@');
      new_w := replace(new_w, '@@' || f || '@@',      '(select ' || f || '())');
    end loop;

    -- Skip policies with no helper calls to hoist.
    if new_q is not distinct from pol.q and new_w is not distinct from pol.w then
      continue;
    end if;

    stmt := format('alter policy %I on public.%I', pol.name, pol.tbl);
    -- INSERT policies carry only WITH CHECK; SELECT/DELETE carry only USING.
    if new_q is not null and pol.cmd <> 'a' then
      stmt := stmt || format(' using (%s)', new_q);
    end if;
    if new_w is not null then
      stmt := stmt || format(' with check (%s)', new_w);
    end if;

    execute stmt;
    changed := changed + 1;
  end loop;

  raise notice 'RLS InitPlan rewrite applied to % policies', changed;
end $$;
