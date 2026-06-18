-- Migration to add image_path and summary columns to journal_entries.
alter table public.journal_entries add column if not exists image_path text;
alter table public.journal_entries add column if not exists summary text;
