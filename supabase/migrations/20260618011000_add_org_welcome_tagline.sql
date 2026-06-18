-- Add a per-organization welcome tagline that admins can customize
alter table public.organizations add column if not exists welcome_tagline text;
