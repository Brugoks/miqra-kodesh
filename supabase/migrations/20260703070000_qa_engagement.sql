-- Phase 3: follow questions, follower answer notifications, realtime tables,
-- and weekly unanswered-question digest scheduling.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.qa_question_followers (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.qa_question_followers enable row level security;

drop policy if exists "qa_question_followers_select" on public.qa_question_followers;
create policy "qa_question_followers_select" on public.qa_question_followers
  for select to authenticated
  using (user_id = auth.uid() or public.is_developer());

drop policy if exists "qa_question_followers_insert" on public.qa_question_followers;
create policy "qa_question_followers_insert" on public.qa_question_followers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and question_id in (
      select q.id from public.qa_questions q
      where public.is_developer() or q.organization_id = public.get_my_organization_id()
    )
  );

drop policy if exists "qa_question_followers_delete" on public.qa_question_followers;
create policy "qa_question_followers_delete" on public.qa_question_followers
  for delete to authenticated
  using (user_id = auth.uid() or public.is_developer());

insert into public.qa_question_followers (question_id, user_id)
select q.id, q.author_id
  from public.qa_questions q
on conflict do nothing;

do $$
begin
  alter publication supabase_realtime add table public.qa_questions;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.qa_answers;
exception when duplicate_object then null;
end;
$$;

create or replace function public.notify_qa_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_title text;
  sender_name text;
  secret text;
  recipient_ids jsonb;
begin
  select left(title, 80)
    into q_title
    from public.qa_questions
   where id = NEW.question_id;

  select jsonb_agg(f.user_id)
    into recipient_ids
    from public.qa_question_followers f
   where f.question_id = NEW.question_id
     and f.user_id <> NEW.author_id;

  if recipient_ids is null or jsonb_array_length(recipient_ids) = 0 then
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
      'userIds', recipient_ids,
      'title',   sender_name || ' answered a question you follow',
      'body',    coalesce(q_title, 'Someone responded in Q&R'),
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

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'qa_digest_cron_token') then
    perform vault.create_secret(md5(random()::text), 'qa_digest_cron_token');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'qa-leader-digest-weekly') then
    perform cron.unschedule('qa-leader-digest-weekly');
  end if;
end;
$$;

select cron.schedule(
  'qa-leader-digest-weekly',
  '0 15 * * 1',
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/qa-leader-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'qa_digest_cron_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
