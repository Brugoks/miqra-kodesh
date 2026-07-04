-- Push notifications for private chats and channels where the user opted into
-- all-message notifications. @mention push remains handled by chat_mentions;
-- this trigger skips messages containing mention markup to avoid double-pushes.

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.chat_channels%rowtype;
  msg text;
  secret text;
  recipients uuid[];
begin
  if new.author_id is null or coalesce(new.body, '') like '%@[%](%)%' then
    return new;
  end if;

  select * into ch from public.chat_channels where id = new.channel_id;
  if ch.id is null then
    return new;
  end if;

  select array_agg(distinct recipient_id) into recipients
  from (
    select cm.user_id as recipient_id
    from public.chat_channel_members cm
    where ch.is_private and cm.channel_id = new.channel_id

    union

    select ch.created_by as recipient_id
    where ch.is_private and ch.created_by is not null

    union

    select p.user_id as recipient_id
    from public.chat_channel_prefs p
    where p.channel_id = new.channel_id and p.level = 'all'
  ) r
  left join public.chat_channel_prefs pref
    on pref.channel_id = new.channel_id and pref.user_id = r.recipient_id
  left join public.chat_channel_reads reads
    on reads.channel_id = new.channel_id and reads.user_id = r.recipient_id
  where r.recipient_id is not null
    and r.recipient_id <> new.author_id
    and coalesce(pref.level, case when ch.is_private then 'all' else 'mentions' end) <> 'none'
    and (pref.muted_until is null or pref.muted_until < now())
    and (reads.last_read_at is null or reads.last_read_at < now() - interval '30 seconds');

  if recipients is null or array_length(recipients, 1) is null then
    return new;
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;
  msg := coalesce(left(new.body, 140), case when new.image_url is not null then 'Photo' else 'New message' end);

  perform net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(secret, '')
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(recipients),
      'title', coalesce(new.author_name, 'Someone') || ' in #' || coalesce(ch.name, 'chat'),
      'body', msg,
      'url', '/chat?channel=' || new.channel_id::text
    )
  );

  return new;
end;
$$;

drop trigger if exists chat_message_push on public.chat_messages;
create trigger chat_message_push
  after insert on public.chat_messages
  for each row execute function public.notify_chat_message();
