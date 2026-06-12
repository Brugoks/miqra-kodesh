-- Migration to update leader_briefings primary key id from 'current' to the organization_id string
-- to prevent primary key conflicts across multiple organizations.

update public.leader_briefings
  set id = organization_id::text
  where id = 'current';

alter table public.leader_briefings alter column id drop default;
