-- Add a foreign key constraint from journal_entries to profiles to allow joins
alter table public.journal_entries
  add constraint journal_entries_user_id_profiles_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;
