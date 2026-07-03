-- Phase 0: serve Q&R board data through an API-boundary mask so anonymous
-- authorship never reaches non-author, non-admin clients.

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
