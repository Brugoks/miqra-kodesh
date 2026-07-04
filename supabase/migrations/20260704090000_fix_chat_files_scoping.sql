-- Fix inner query scoping conflicts on "name" for the chat-files storage policies.
-- Because public.chat_channels has a column named "name", referencing "name" without qualification
-- inside the EXISTS subquery bound it to "c.name" rather than "storage.objects.name",
-- which caused the RLS check to always evaluate to false and fail with an RLS violation on uploads/reads.

drop policy if exists "Users upload chat files" on storage.objects;
create policy "Users upload chat files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(storage.objects.name))[3] = auth.uid()::text
    and exists (
      select 1
      from public.chat_channels c
      where c.id::text = (storage.foldername(storage.objects.name))[2]
        and c.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and public.can_access_channel(c.id)
    )
  );

drop policy if exists "Channel members read chat files" on storage.objects;
create policy "Channel members read chat files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and exists (
      select 1
      from public.chat_channels c
      where c.id::text = (storage.foldername(storage.objects.name))[2]
        and c.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and public.can_access_channel(c.id)
    )
  );

drop policy if exists "Users delete own chat files" on storage.objects;
create policy "Users delete own chat files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (storage.foldername(storage.objects.name))[3] = auth.uid()::text
  );
