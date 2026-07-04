-- Voice messages reuse the private chat-files bucket, and forwarded messages
-- keep a small pointer back to their source without duplicating message rows.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array[
      'audio/aac',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ]::text[]
  ) as mime
)
where id = 'chat-files';

alter table public.chat_messages
  add column if not exists forwarded_from jsonb;
