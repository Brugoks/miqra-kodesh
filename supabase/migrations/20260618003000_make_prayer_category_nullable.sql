-- Migration to allow the category column to be nullable in public.prayers.
alter table public.prayers alter column category drop not null;
