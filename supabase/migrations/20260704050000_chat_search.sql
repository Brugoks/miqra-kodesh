-- Full-text search over accessible chat messages.

alter table public.chat_messages
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;

create index if not exists chat_messages_fts_idx on public.chat_messages using gin (fts);

create or replace function public.chat_search_messages(org_id uuid, q text, channel_filter uuid default null)
returns table(
  id uuid,
  channel_id uuid,
  channel_name text,
  author_name text,
  body text,
  created_at timestamptz,
  headline text
)
language sql
stable
as $$
  select
    m.id,
    m.channel_id,
    c.name as channel_name,
    m.author_name,
    m.body,
    m.created_at,
    ts_headline('english', coalesce(m.body, ''), websearch_to_tsquery('english', q), 'MaxWords=18, MinWords=4') as headline
  from public.chat_messages m
  join public.chat_channels c on c.id = m.channel_id
  where c.organization_id = org_id
    and m.deleted_at is null
    and m.thread_root_id is null
    and m.fts @@ websearch_to_tsquery('english', q)
    and (channel_filter is null or m.channel_id = channel_filter)
    and public.can_access_channel(m.channel_id)
  order by ts_rank(m.fts, websearch_to_tsquery('english', q)) desc, m.created_at desc
  limit 40;
$$;

grant execute on function public.chat_search_messages(uuid, text, uuid) to authenticated;
