-- Admin-facing activity metrics for identifying power users and feature usage.
-- The function returns org-scoped aggregates; it does not expose raw content.

create or replace function public.admin_activity_metrics(target_org uuid default null, window_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_days int := greatest(1, least(coalesce(window_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(window_days, 30), 365)));
  v_power_users jsonb := '[]'::jsonb;
  v_features jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
begin
  if not (public.is_admin() or public.is_developer()) then
    raise exception 'admin_activity_metrics requires admin access';
  end if;

  v_org := coalesce(target_org, public.get_my_organization_id());

  if v_org is null then
    raise exception 'No organization selected';
  end if;

  if not public.is_developer()
     and not exists (
       select 1
       from public.profile_organizations po
       where po.profile_id = auth.uid()
         and po.organization_id = v_org
     ) then
    raise exception 'You do not have access to this organization';
  end if;

  with activity_events as (
    select 'api:' || provider as feature, user_id, organization_id, created_at, greatest(coalesce(units, 1), 1)::int as weight
    from public.api_usage_events
    where user_id is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'chat:message', author_id, organization_id, created_at, 1
    from public.chat_messages
    where organization_id = v_org and created_at >= v_since

    union all
    select 'chat:reaction', r.user_id, m.organization_id, r.created_at, 1
    from public.chat_message_reactions r
    join public.chat_messages m on m.id = r.message_id
    where m.organization_id = v_org and r.created_at >= v_since

    union all
    select 'q-and-a:question', author_id, organization_id, created_at, 2
    from public.qa_questions
    where organization_id = v_org and created_at >= v_since

    union all
    select 'q-and-a:answer', author_id, organization_id, created_at, 2
    from public.qa_answers
    where organization_id = v_org and created_at >= v_since

    union all
    select 'q-and-a:vote', v.user_id, q.organization_id, v.created_at, 1
    from public.qa_question_votes v
    join public.qa_questions q on q.id = v.question_id
    where q.organization_id = v_org and v.created_at >= v_since

    union all
    select 'q-and-a:vote', v.user_id, a.organization_id, v.created_at, 1
    from public.qa_answer_votes v
    join public.qa_answers a on a.id = v.answer_id
    where a.organization_id = v_org and v.created_at >= v_since

    union all
    select 'prayer:request', user_id, organization_id, created_at, 2
    from public.prayers
    where user_id is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'prayer:amen', user_id, organization_id, created_at, 1
    from public.prayer_amens
    where organization_id = v_org and created_at >= v_since

    union all
    select 'journal:entry', user_id, organization_id, created_at, 3
    from public.journal_entries
    where organization_id = v_org and created_at >= v_since

    union all
    select 'journal:comment', user_id, organization_id, created_at, 1
    from public.journal_comments
    where organization_id = v_org and created_at >= v_since

    union all
    select 'sermon:note', user_id, organization_id, created_at, 2
    from public.sermon_notes
    where user_id is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'sermon:feedback-request', requester_id, organization_id, created_at, 2
    from public.sermon_feedback_requests
    where requester_id is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'sermon:feedback', responder_id, organization_id, created_at, 2
    from public.sermon_feedback
    where responder_id is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'attendance:session', created_by, organization_id, created_at, 2
    from public.attendance
    where created_by is not null and organization_id = v_org and created_at >= v_since

    union all
    select 'groups:meeting-plan', gm.updated_by, ag.organization_id, gm.updated_at, 2
    from public.group_meetings gm
    join public.attendance_groups ag on ag.id = gm.group_id
    where gm.updated_by is not null and ag.organization_id = v_org and gm.updated_at >= v_since
  ),
  feature_rollup as (
    select
      feature,
      count(*)::int as events,
      count(distinct user_id)::int as users,
      coalesce(sum(weight), 0)::int as score,
      count(*) filter (where created_at >= now() - interval '1 day')::int as today_events,
      count(*) filter (where created_at >= now() - interval '7 days')::int as week_events,
      max(created_at) as last_event_at
    from activity_events
    group by feature
  ),
  user_rollup as (
    select
      user_id,
      count(*)::int as events,
      coalesce(sum(weight), 0)::int as score,
      max(created_at) as last_active_at,
      jsonb_object_agg(feature, feature_count order by feature) as feature_counts
    from (
      select user_id, feature, count(*)::int as feature_count, sum(weight)::int as feature_weight, max(created_at) as last_feature_at
      from activity_events
      group by user_id, feature
    ) feature_counts
    group by user_id
  ),
  daily_rollup as (
    select
      date_trunc('day', created_at)::date as day,
      count(*)::int as events,
      count(distinct user_id)::int as users
    from activity_events
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', ranked.id,
    'fullName', ranked.full_name,
    'email', ranked.email,
    'role', ranked.role,
    'avatarUrl', ranked.avatar_url,
    'events', ranked.events,
    'score', ranked.score,
    'lastActiveAt', ranked.last_active_at,
    'featureCounts', coalesce(ranked.feature_counts, '{}'::jsonb)
  ) order by ranked.score desc, ranked.events desc, ranked.last_active_at desc), '[]'::jsonb)
  into v_power_users
  from (
    select
      p.id,
      p.full_name,
      p.email,
      p.role,
      p.avatar_url,
      u.events,
      u.score,
      u.last_active_at,
      u.feature_counts
    from user_rollup u
    join public.profiles p on p.id = u.user_id
    order by u.score desc, u.events desc, u.last_active_at desc
    limit 25
  ) ranked;

  with activity_events as (
    select 'api:' || provider as feature, user_id, organization_id, created_at, greatest(coalesce(units, 1), 1)::int as weight
    from public.api_usage_events
    where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select 'chat:message', author_id, organization_id, created_at, 1 from public.chat_messages where organization_id = v_org and created_at >= v_since
    union all select 'chat:reaction', r.user_id, m.organization_id, r.created_at, 1 from public.chat_message_reactions r join public.chat_messages m on m.id = r.message_id where m.organization_id = v_org and r.created_at >= v_since
    union all select 'q-and-a:question', author_id, organization_id, created_at, 2 from public.qa_questions where organization_id = v_org and created_at >= v_since
    union all select 'q-and-a:answer', author_id, organization_id, created_at, 2 from public.qa_answers where organization_id = v_org and created_at >= v_since
    union all select 'q-and-a:vote', v.user_id, q.organization_id, v.created_at, 1 from public.qa_question_votes v join public.qa_questions q on q.id = v.question_id where q.organization_id = v_org and v.created_at >= v_since
    union all select 'q-and-a:vote', v.user_id, a.organization_id, v.created_at, 1 from public.qa_answer_votes v join public.qa_answers a on a.id = v.answer_id where a.organization_id = v_org and v.created_at >= v_since
    union all select 'prayer:request', user_id, organization_id, created_at, 2 from public.prayers where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select 'prayer:amen', user_id, organization_id, created_at, 1 from public.prayer_amens where organization_id = v_org and created_at >= v_since
    union all select 'journal:entry', user_id, organization_id, created_at, 3 from public.journal_entries where organization_id = v_org and created_at >= v_since
    union all select 'journal:comment', user_id, organization_id, created_at, 1 from public.journal_comments where organization_id = v_org and created_at >= v_since
    union all select 'sermon:note', user_id, organization_id, created_at, 2 from public.sermon_notes where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select 'sermon:feedback-request', requester_id, organization_id, created_at, 2 from public.sermon_feedback_requests where requester_id is not null and organization_id = v_org and created_at >= v_since
    union all select 'sermon:feedback', responder_id, organization_id, created_at, 2 from public.sermon_feedback where responder_id is not null and organization_id = v_org and created_at >= v_since
    union all select 'attendance:session', created_by, organization_id, created_at, 2 from public.attendance where created_by is not null and organization_id = v_org and created_at >= v_since
    union all select 'groups:meeting-plan', gm.updated_by, ag.organization_id, gm.updated_at, 2 from public.group_meetings gm join public.attendance_groups ag on ag.id = gm.group_id where gm.updated_by is not null and ag.organization_id = v_org and gm.updated_at >= v_since
  ),
  feature_rollup as (
    select feature, count(*)::int as events, count(distinct user_id)::int as users, coalesce(sum(weight), 0)::int as score,
      count(*) filter (where created_at >= now() - interval '1 day')::int as today_events,
      count(*) filter (where created_at >= now() - interval '7 days')::int as week_events,
      max(created_at) as last_event_at
    from activity_events group by feature
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'feature', feature,
    'events', events,
    'users', users,
    'score', score,
    'todayEvents', today_events,
    'weekEvents', week_events,
    'lastEventAt', last_event_at
  ) order by score desc, events desc), '[]'::jsonb)
  into v_features
  from feature_rollup;

  with activity_events as (
    select user_id, created_at from public.api_usage_events where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select author_id, created_at from public.chat_messages where organization_id = v_org and created_at >= v_since
    union all select r.user_id, r.created_at from public.chat_message_reactions r join public.chat_messages m on m.id = r.message_id where m.organization_id = v_org and r.created_at >= v_since
    union all select author_id, created_at from public.qa_questions where organization_id = v_org and created_at >= v_since
    union all select author_id, created_at from public.qa_answers where organization_id = v_org and created_at >= v_since
    union all select v.user_id, v.created_at from public.qa_question_votes v join public.qa_questions q on q.id = v.question_id where q.organization_id = v_org and v.created_at >= v_since
    union all select v.user_id, v.created_at from public.qa_answer_votes v join public.qa_answers a on a.id = v.answer_id where a.organization_id = v_org and v.created_at >= v_since
    union all select user_id, created_at from public.prayers where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.prayer_amens where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.journal_entries where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.journal_comments where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.sermon_notes where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select requester_id, created_at from public.sermon_feedback_requests where requester_id is not null and organization_id = v_org and created_at >= v_since
    union all select responder_id, created_at from public.sermon_feedback where responder_id is not null and organization_id = v_org and created_at >= v_since
    union all select created_by, created_at from public.attendance where created_by is not null and organization_id = v_org and created_at >= v_since
    union all select gm.updated_by, gm.updated_at from public.group_meetings gm join public.attendance_groups ag on ag.id = gm.group_id where gm.updated_by is not null and ag.organization_id = v_org and gm.updated_at >= v_since
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', day,
    'events', events,
    'users', users
  ) order by day asc), '[]'::jsonb)
  into v_daily
  from (
    select date_trunc('day', created_at)::date as day, count(*)::int as events, count(distinct user_id)::int as users
    from activity_events
    group by 1
  ) d;

  with activity_events as (
    select user_id, created_at from public.api_usage_events where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select author_id, created_at from public.chat_messages where organization_id = v_org and created_at >= v_since
    union all select r.user_id, r.created_at from public.chat_message_reactions r join public.chat_messages m on m.id = r.message_id where m.organization_id = v_org and r.created_at >= v_since
    union all select author_id, created_at from public.qa_questions where organization_id = v_org and created_at >= v_since
    union all select author_id, created_at from public.qa_answers where organization_id = v_org and created_at >= v_since
    union all select v.user_id, v.created_at from public.qa_question_votes v join public.qa_questions q on q.id = v.question_id where q.organization_id = v_org and v.created_at >= v_since
    union all select v.user_id, v.created_at from public.qa_answer_votes v join public.qa_answers a on a.id = v.answer_id where a.organization_id = v_org and v.created_at >= v_since
    union all select user_id, created_at from public.prayers where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.prayer_amens where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.journal_entries where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.journal_comments where organization_id = v_org and created_at >= v_since
    union all select user_id, created_at from public.sermon_notes where user_id is not null and organization_id = v_org and created_at >= v_since
    union all select requester_id, created_at from public.sermon_feedback_requests where requester_id is not null and organization_id = v_org and created_at >= v_since
    union all select responder_id, created_at from public.sermon_feedback where responder_id is not null and organization_id = v_org and created_at >= v_since
    union all select created_by, created_at from public.attendance where created_by is not null and organization_id = v_org and created_at >= v_since
    union all select gm.updated_by, gm.updated_at from public.group_meetings gm join public.attendance_groups ag on ag.id = gm.group_id where gm.updated_by is not null and ag.organization_id = v_org and gm.updated_at >= v_since
  )
  select jsonb_build_object(
    'totalEvents', count(*)::int,
    'activeUsers', count(distinct user_id)::int,
    'todayEvents', count(*) filter (where created_at >= now() - interval '1 day')::int,
    'weekEvents', count(*) filter (where created_at >= now() - interval '7 days')::int
  )
  into v_totals
  from activity_events;

  return jsonb_build_object(
    'generatedAt', now(),
    'organizationId', v_org,
    'windowDays', v_days,
    'totals', coalesce(v_totals, '{}'::jsonb),
    'powerUsers', v_power_users,
    'features', v_features,
    'dailyActivity', v_daily
  );
end;
$$;

grant execute on function public.admin_activity_metrics(uuid, int) to authenticated;
