-- Add a foreign key constraint from journal_comments to profiles to allow joins
alter table public.journal_comments
  add constraint journal_comments_user_id_profiles_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;
