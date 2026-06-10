alter table public.calendar_events
  add column if not exists date_end date;
