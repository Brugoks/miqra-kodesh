-- 20260613100000_chat_mention_push_trigger.sql was already applied before
-- chat gained channel deep links. Re-apply the function body in a new
-- migration so production mentions open the relevant channel.

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
  select coalesce(left(body, 140), 'Attachment') into msg from public.chat_messages where id = NEW.message_id;
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
      'url', '/chat?channel=' || NEW.channel_id::text
    )
  );
  return NEW;
end;
$$;
