-- Ensure default #sermons-messages chat channel exists for all organizations
--
-- chat_channels has no plain unique constraint on (organization_id, name).
-- Uniqueness is enforced by a PARTIAL unique index,
-- chat_channels_org_name_public_key ... WHERE (NOT is_private), so a bare
-- `on conflict (organization_id, name)` cannot infer an arbiter index and
-- fails with 42P10. Restating the index predicate in the inference clause is
-- what lets Postgres match it.
--
-- is_private is written explicitly rather than left to its default, since the
-- inference clause above is only valid for rows the partial index covers.
insert into public.chat_channels (organization_id, name, description, category, position, is_private)
select
  id as organization_id,
  'sermons-messages' as name,
  'Community discussion & short reflections on weekly sermons and messages' as description,
  'Community' as category,
  1 as position,
  false as is_private
from public.organizations
on conflict (organization_id, name) where not is_private do update
set description = excluded.description;
