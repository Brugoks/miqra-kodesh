-- Phase 1: accepted answers, resolved questions, leader-role snapshots, and
-- push notifications when an answer is accepted.

create extension if not exists pg_net;

alter table public.qa_answers
  add column if not exists is_accepted boolean not null default false,
  add column if not exists author_role text;

alter table public.qa_questions
  add column if not exists resolved_at timestamptz;

create or replace function public.qa_board(
  org_id uuid,
  page_limit integer default 50,
  page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = qa_board.org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  return (
    with paged_questions as (
      select q.*
        from public.qa_questions q
       where q.organization_id = qa_board.org_id
       order by q.created_at desc
       limit safe_limit + 1
      offset safe_offset
    ),
    visible_questions as (
      select *
        from paged_questions
       order by created_at desc
       limit safe_limit
    ),
    visible_answers as (
      select a.*
        from public.qa_answers a
       where a.question_id in (select q.id from visible_questions q)
       order by a.created_at asc
    )
    select jsonb_build_object(
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'organization_id', q.organization_id,
            'author_id', case
              when q.is_anonymous and q.author_id <> caller_id and not public.is_admin() then null
              else q.author_id
            end,
            'author_name', case
              when q.is_anonymous and q.author_id <> caller_id and not public.is_admin() then null
              else q.author_name
            end,
            'is_mine', q.author_id = caller_id,
            'is_anonymous', q.is_anonymous,
            'title', q.title,
            'body', q.body,
            'image_path', q.image_path,
            'resolved_at', q.resolved_at,
            'created_at', q.created_at,
            'updated_at', q.updated_at
          )
          order by q.created_at desc
        )
        from visible_questions q
      ), '[]'::jsonb),
      'answers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'question_id', a.question_id,
            'organization_id', a.organization_id,
            'author_id', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_id
            end,
            'author_name', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_name
            end,
            'is_mine', a.author_id = caller_id,
            'is_anonymous', a.is_anonymous,
            'author_role', a.author_role,
            'is_accepted', a.is_accepted,
            'body', a.body,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          )
          order by a.created_at asc
        )
        from visible_answers a
      ), '[]'::jsonb),
      'question_votes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'question_id', v.question_id,
            'user_id', v.user_id
          )
        )
        from public.qa_question_votes v
        where v.question_id in (select q.id from visible_questions q)
      ), '[]'::jsonb),
      'answer_votes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'answer_id', v.answer_id,
            'user_id', v.user_id
          )
        )
        from public.qa_answer_votes v
        where v.answer_id in (select a.id from visible_answers a)
      ), '[]'::jsonb),
      'has_more', (select count(*) > safe_limit from paged_questions)
    )
  );
end;
$$;

grant execute on function public.qa_board(uuid, integer, integer) to authenticated;

create or replace function public.qa_accept_answer(target_answer_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_question_id uuid;
  question_author_id uuid;
  next_resolved_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select a.question_id, q.author_id
    into target_question_id, question_author_id
    from public.qa_answers a
    join public.qa_questions q on q.id = a.question_id
   where a.id = target_answer_id;

  if target_question_id is null then
    raise exception 'Answer not found.' using errcode = 'P0002';
  end if;

  if caller_id <> question_author_id and not public.is_admin() then
    raise exception 'Only the question author or an admin can accept an answer.' using errcode = '42501';
  end if;

  if accept then
    update public.qa_answers
       set is_accepted = false
     where question_id = target_question_id
       and id <> target_answer_id
       and is_accepted = true;

    update public.qa_answers
       set is_accepted = true
     where id = target_answer_id;

    update public.qa_questions
       set resolved_at = coalesce(resolved_at, now()),
           updated_at = now()
     where id = target_question_id
     returning resolved_at into next_resolved_at;
  else
    update public.qa_answers
       set is_accepted = false
     where id = target_answer_id;

    if exists (
      select 1 from public.qa_answers
       where question_id = target_question_id
         and is_accepted = true
    ) then
      select resolved_at into next_resolved_at
        from public.qa_questions
       where id = target_question_id;
    else
      update public.qa_questions
         set resolved_at = null,
             updated_at = now()
       where id = target_question_id
       returning resolved_at into next_resolved_at;
    end if;
  end if;

  return jsonb_build_object(
    'question_id', target_question_id,
    'answer_id', target_answer_id,
    'accepted', accept,
    'resolved_at', next_resolved_at
  );
end;
$$;

grant execute on function public.qa_accept_answer(uuid, boolean) to authenticated;

create or replace function public.notify_qa_answer_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_title text;
  secret text;
begin
  if not NEW.is_accepted or coalesce(OLD.is_accepted, false) = true then
    return NEW;
  end if;

  select left(title, 80)
    into q_title
    from public.qa_questions
   where id = NEW.question_id;

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
      'userIds', jsonb_build_array(NEW.author_id),
      'title',   'Your answer was accepted',
      'body',    coalesce(q_title, 'Your Q&R response was marked accepted'),
      'url',     '/qa'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists qa_answer_accepted_push on public.qa_answers;
create trigger qa_answer_accepted_push
  after update of is_accepted on public.qa_answers
  for each row execute function public.notify_qa_answer_accepted();
