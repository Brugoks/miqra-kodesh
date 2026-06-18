-- Migration to add visibility column to public.journal_entries.
alter table public.journal_entries add column if not exists visibility text not null default 'private';
