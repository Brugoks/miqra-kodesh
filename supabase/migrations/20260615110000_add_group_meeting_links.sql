alter table public.group_meetings
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.group_meetings.links is
  'Member-accessible resource links for this meeting, stored as [{ "label": text, "url": text }].';
