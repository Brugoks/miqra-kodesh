-- Lightweight chat activity inbox: recent mentions, quote replies to your
-- messages, and reactions to your messages.

create or replace function public.chat_activity_items()
returns table(
  item_type text,
  message_id uuid,
  channel_id uuid,
  channel_name text,
  actor_id uuid,
  actor_name text,
  body text,
  emoji text,
  created_at timestamptz
)
language sql
stable
as $$
  select
    'mention'::text as item_type,
    m.message_id,
    m.channel_id,
    c.name as channel_name,
    m.actor_id,
    m.actor_name,
    msg.body,
    null::text as emoji,
    m.created_at
  from public.chat_mentions m
  join public.chat_channels c on c.id = m.channel_id
  join public.chat_messages msg on msg.id = m.message_id
  where m.mentioned_user_id = auth.uid()
    and m.created_at >= now() - interval '7 days'
    and public.can_access_channel(m.channel_id)

  union all

  select
    'reply'::text,
    reply.id,
    reply.channel_id,
    c.name,
    reply.author_id,
    reply.author_name,
    reply.body,
    null::text,
    reply.created_at
  from public.chat_messages reply
  join public.chat_messages root on root.id = reply.reply_to_id
  join public.chat_channels c on c.id = reply.channel_id
  where root.author_id = auth.uid()
    and reply.author_id <> auth.uid()
    and reply.created_at >= now() - interval '7 days'
    and public.can_access_channel(reply.channel_id)

  union all

  select
    'reaction'::text,
    msg.id,
    msg.channel_id,
    c.name,
    r.user_id,
    coalesce(p.full_name, p.email),
    msg.body,
    r.emoji,
    r.created_at
  from public.chat_message_reactions r
  join public.chat_messages msg on msg.id = r.message_id
  join public.chat_channels c on c.id = msg.channel_id
  left join public.profiles p on p.id = r.user_id
  where msg.author_id = auth.uid()
    and r.user_id <> auth.uid()
    and r.created_at >= now() - interval '7 days'
    and public.can_access_channel(msg.channel_id)

  order by created_at desc
  limit 50;
$$;

grant execute on function public.chat_activity_items() to authenticated;
