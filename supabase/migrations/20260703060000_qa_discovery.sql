-- Phase 2: tags, text/search metadata, and semantic Q&R discovery.

create extension if not exists vector;

alter table public.qa_questions
  add column if not exists tag text,
  add column if not exists embedding vector(384);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qa_questions_tag_check'
       and conrelid = 'public.qa_questions'::regclass
  ) then
    alter table public.qa_questions
      add constraint qa_questions_tag_check
      check (tag in ('bible','faith-basics','relationships','church-life','hard-questions','other'));
  end if;
end;
$$;

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
            'tag', q.tag,
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
            'author_role', case when a.is_anonymous then null else a.author_role end,
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

create or replace function public.qa_thread(target_question_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select q.organization_id
    into target_org_id
    from public.qa_questions q
   where q.id = target_question_id;

  if target_org_id is null then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = target_org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  return (
    with visible_questions as (
      select q.*
        from public.qa_questions q
       where q.id = target_question_id
    ),
    visible_answers as (
      select a.*
        from public.qa_answers a
       where a.question_id = target_question_id
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
            'tag', q.tag,
            'image_path', q.image_path,
            'resolved_at', q.resolved_at,
            'created_at', q.created_at,
            'updated_at', q.updated_at
          )
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
            'author_role', case when a.is_anonymous then null else a.author_role end,
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
        where v.question_id = target_question_id
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
      'has_more', false
    )
  );
end;
$$;

grant execute on function public.qa_thread(uuid) to authenticated;

create or replace function public.match_qa_questions(
  target_org_id uuid,
  query_embedding vector(384),
  match_count int default 5,
  exclude_question_id uuid default null
)
returns table (
  id uuid,
  title text,
  tag text,
  resolved_at timestamptz,
  answer_count bigint,
  vote_count bigint,
  similarity float
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = target_org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  return query
    select
      q.id,
      q.title,
      q.tag,
      q.resolved_at,
      (select count(*) from public.qa_answers a where a.question_id = q.id) as answer_count,
      (select count(*) from public.qa_question_votes v where v.question_id = q.id) as vote_count,
      1 - (q.embedding <=> query_embedding) as similarity
    from public.qa_questions q
   where q.organization_id = target_org_id
     and q.embedding is not null
     and (exclude_question_id is null or q.id <> exclude_question_id)
   order by q.embedding <=> query_embedding
   limit least(greatest(coalesce(match_count, 5), 1), 10);
end;
$$;

grant execute on function public.match_qa_questions(uuid, vector(384), integer, uuid) to authenticated;

create or replace function public.qa_related_questions(
  target_question_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  tag text,
  resolved_at timestamptz,
  answer_count bigint,
  vote_count bigint,
  similarity float
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
  source_embedding vector(384);
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select q.organization_id, q.embedding
    into target_org_id, source_embedding
    from public.qa_questions q
   where q.id = target_question_id;

  if target_org_id is null then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = target_org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  if source_embedding is null then
    return;
  end if;

  return query
    select
      q.id,
      q.title,
      q.tag,
      q.resolved_at,
      (select count(*) from public.qa_answers a where a.question_id = q.id) as answer_count,
      (select count(*) from public.qa_question_votes v where v.question_id = q.id) as vote_count,
      1 - (q.embedding <=> source_embedding) as similarity
    from public.qa_questions q
   where q.organization_id = target_org_id
     and q.embedding is not null
     and q.id <> target_question_id
   order by q.embedding <=> source_embedding
   limit least(greatest(coalesce(match_count, 5), 1), 10);
end;
$$;

grant execute on function public.qa_related_questions(uuid, integer) to authenticated;
