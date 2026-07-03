-- Push notification to the reflection author when someone comments or replies
-- on their journal entry. Self-comments are skipped.

create extension if not exists pg_net;

create or replace function public.notify_journal_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_author_id uuid;
  entry_title     text;
  sender_name     text;
  secret          text;
begin
  select user_id, left(title, 80)
    into entry_author_id, entry_title
    from public.journal_entries
   where id = NEW.journal_id;

  if entry_author_id is null or entry_author_id = NEW.user_id then
    return NEW;
  end if;

  select coalesce(full_name, email, 'Someone')
    into sender_name
    from public.profiles
   where id = NEW.user_id;

  select decrypted_secret
    into secret
    from vault.decrypted_secrets
   where name = 'push_hook_secret'
   limit 1;

  perform net.http_post(
    url     := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(secret, '')
    ),
    body    := jsonb_build_object(
      'userIds', jsonb_build_array(entry_author_id),
      'title',   sender_name || ' replied to your reflection',
      'body',    coalesce(entry_title, left(NEW.body, 100), 'Someone replied to your reflection'),
      'url',     '/fellowship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists journal_reply_push on public.journal_comments;
create trigger journal_reply_push
  after insert on public.journal_comments
  for each row execute function public.notify_journal_reply();

notify pgrst, 'reload schema';
