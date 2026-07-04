-- Multi-attachment support for chat messages. Images keep using the public
-- chat-images bucket; non-image files use a private bucket with channel-scoped
-- signed URL access.

alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Users upload chat files" on storage.objects;
create policy "Users upload chat files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[3] = auth.uid()::text
    and exists (
      select 1
      from public.chat_channels c
      where c.id::text = (storage.foldername(name))[2]
        and c.organization_id::text = (storage.foldername(name))[1]
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
      where c.id::text = (storage.foldername(name))[2]
        and c.organization_id::text = (storage.foldername(name))[1]
        and public.can_access_channel(c.id)
    )
  );

drop policy if exists "Users delete own chat files" on storage.objects;
create policy "Users delete own chat files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[3] = auth.uid()::text
  );
