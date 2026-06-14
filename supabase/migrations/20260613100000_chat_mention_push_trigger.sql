-- Deliver web push for @mentions server-side (consistent for everyone),
-- instead of relying on the sender's browser to call the function.
-- The hook secret lives in Vault (name: 'push_hook_secret'); set it once with:
--   select vault.create_secret('<secret>', 'push_hook_secret');

create extension if not exists pg_net;

create or replace function public.notify_chat_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch text;
  msg text;
  secret text;
begin
  select name into ch from public.chat_channels where id = NEW.channel_id;
  select coalesce(left(body, 140), '📷 photo') into msg from public.chat_messages where id = NEW.message_id;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;

  perform net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(secret, '')
    ),
    body := jsonb_build_object(
      'userIds', jsonb_build_array(NEW.mentioned_user_id),
      'title', coalesce(NEW.actor_name, 'Someone') || ' mentioned you in #' || coalesce(ch, 'chat'),
      'body', coalesce(msg, ''),
      'url', '/chat'
    )
  );
  return NEW;
end;
$$;

drop trigger if exists chat_mention_push on public.chat_mentions;
create trigger chat_mention_push
  after insert on public.chat_mentions
  for each row execute function public.notify_chat_mention();
