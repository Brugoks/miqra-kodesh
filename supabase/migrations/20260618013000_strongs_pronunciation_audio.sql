-- Authorized Strong's pronunciation recordings.
-- Upload files using their normalized Strong's ID, e.g. G3056.mp3 or H1697.mp3.

alter table public.strongs_lexicon
  add column if not exists audio_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'strongs-pronunciations',
  'strongs-pronunciations',
  true,
  2097152,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read Strong's pronunciations" on storage.objects;
create policy "Public read Strong's pronunciations"
  on storage.objects for select
  using (bucket_id = 'strongs-pronunciations');
