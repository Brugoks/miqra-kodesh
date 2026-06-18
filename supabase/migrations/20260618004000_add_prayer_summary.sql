-- Migration to add summary column to public.prayers.
alter table public.prayers add column summary text;
