-- Calendar events for Adventure Christian Church (from July–September 2026 bulletin)
do $$
declare
  org_id uuid;
begin
  select id into org_id
  from public.organizations
  where name ilike '%adventure christian%'
  limit 1;

  if org_id is null then
    raise exception 'Organization "Adventure Christian Church" not found — check the name in the organizations table.';
  end if;

  insert into public.calendar_events (title, date, date_end, location, category, organization_id) values
    ('Men''s Breakfast',                '2026-07-11', null,         null,           'event', org_id),
    ('Girls Gather',                    '2026-07-22', null,         null,           'event', org_id),
    ('Staycation 2026 – Middle School', '2026-07-27', '2026-07-29', null,           'event', org_id),
    ('Girls Gather',                    '2026-08-26', null,         null,           'event', org_id),
    ('Men''s Retreat',                  '2026-09-25', '2026-09-27', 'Mount Hermon', 'event', org_id);
end $$;
