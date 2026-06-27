-- Push notification to the question author when someone answers their Q&R post.
-- Mirrors the chat mention trigger pattern (pg_net + push_hook_secret from Vault).
-- Self-answers (answerer == question author) are silently skipped.

create extension if not exists pg_net;

create or replace function public.notify_qa_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_author_id uuid;
  q_title     text;
  sender_name text;
  secret      text;
begin
  select author_id, left(title, 80)
    into q_author_id, q_title
    from public.qa_questions
   where id = NEW.question_id;

  -- Skip: no author found, or answerer is the question author
  if q_author_id is null or q_author_id = NEW.author_id then
    return NEW;
  end if;

  sender_name := case
    when NEW.is_anonymous then 'Someone'
    else coalesce(NEW.author_name, 'Someone')
  end;

  select decrypted_secret into secret
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
      'userIds', jsonb_build_array(q_author_id),
      'title',   sender_name || ' answered your question',
      'body',    coalesce(q_title, 'Someone responded to your Q&R post'),
      'url',     '/qa'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists qa_answer_push on public.qa_answers;
create trigger qa_answer_push
  after insert on public.qa_answers
  for each row execute function public.notify_qa_answer();
