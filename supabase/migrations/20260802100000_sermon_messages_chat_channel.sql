-- Ensure default #sermons-messages chat channel exists for all organizations
insert into public.chat_channels (organization_id, name, description, category, position)
select 
  id as organization_id,
  'sermons-messages' as name,
  'Community discussion & short reflections on weekly sermons and messages' as description,
  'Community' as category,
  1 as position
from public.organizations
on conflict (organization_id, name) do update
set description = excluded.description;
