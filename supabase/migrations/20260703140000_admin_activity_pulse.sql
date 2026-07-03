-- Admin Pulse: low-volume presence tracking plus an org-scoped dashboard RPC.
-- Presence is one row per user x feature x day; dashboard reads stay RPC-only.

create table if not exists public.app_activity_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z0-9:_-]{1,64}$'),
  day date not null default current_date,
  visits integer not null default 1 check (visits > 0),
  primary key (user_id, organization_id, feature, day)
);

create index if not exists app_activity_daily_org_day_idx
  on public.app_activity_daily (organization_id, day desc);

create index if not exists app_activity_daily_user_day_idx
  on public.app_activity_daily (user_id, day desc);

alter table public.app_activity_daily enable row level security;

drop policy if exists "users record own activity" on public.app_activity_daily;
create policy "users record own activity"
  on public.app_activity_daily for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users bump own activity" on public.app_activity_daily;
create policy "users bump own activity"
  on public.app_activity_daily for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.track_activity(p_org uuid, p_feature text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature text;
begin
  if auth.uid() is null or p_org is null then
    return;
  end if;

  v_feature := lower(trim(coalesce(p_feature, '')));
  v_feature := regexp_replace(v_feature, '[^a-z0-9:_-]+', '-', 'g');
  v_feature := trim(both '-' from v_feature);

  if v_feature = '' or length(v_feature) > 64 then
    return;
  end if;

  if coalesce((select role from public.profiles where id = auth.uid()), 'student') = 'developer' then
    return;
  end if;

  if not exists (
    select 1
    from public.profile_organizations
    where profile_id = auth.uid()
      and organization_id = p_org
  ) then
    return;
  end if;

  insert into public.app_activity_daily (user_id, organization_id, feature, day, visits)
  values (auth.uid(), p_org, v_feature, current_date, 1)
  on conflict (user_id, organization_id, feature, day)
  do update set visits = public.app_activity_daily.visits + 1;
end;
$$;

grant execute on function public.track_activity(uuid, text) to authenticated;

create or replace function public.prune_app_activity_daily()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_activity_daily
  where day < current_date - 180;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-app-activity-daily') then
    perform cron.unschedule('prune-app-activity-daily');
  end if;
end;
$$;

select cron.schedule(
  'prune-app-activity-daily',
  '30 4 * * 0', -- Sundays at 04:30 UTC
  $$select public.prune_app_activity_daily()$$
);

create or replace function public.admin_activity_pulse(target_org uuid default null, window_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_days int := greatest(1, least(coalesce(window_days, 30), 365));
  v_since timestamptz;
  v_prev_since timestamptz;
  v_current_day_start date;
  v_prev_day_start date;
  v_content_scan_since timestamptz;
begin
  if not (public.is_admin() or public.is_developer()) then
    raise exception 'admin_activity_pulse requires admin access';
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

  v_since := now() - make_interval(days => v_days);
  v_prev_since := now() - make_interval(days => v_days * 2);
  v_current_day_start := current_date - (v_days - 1);
  v_prev_day_start := current_date - ((v_days * 2) - 1);
  v_content_scan_since := least(v_prev_since, now() - interval '180 days');

  return (
    with members as (
      select
        p.id as user_id,
        coalesce(nullif(p.full_name, ''), p.email, 'Unknown') as name,
        p.email,
        p.role,
        po.created_at as joined_at
      from public.profile_organizations po
      join public.profiles p on p.id = po.profile_id
      where po.organization_id = v_org
        and coalesce(p.role, 'student') <> 'developer'
    ),
    presence_events as (
      select a.user_id, a.organization_id, a.feature, a.day, a.visits
      from public.app_activity_daily a
      join public.profiles p on p.id = a.user_id
      where a.organization_id = v_org
        and a.day >= current_date - 180
        and coalesce(p.role, 'student') <> 'developer'
    ),
    raw_content_events as (
      select
        'api:' || e.provider as kind,
        case
          when e.provider = 'api-bible' then 'bible'
          when e.provider in ('youtube', 'cloudflare-ai', 'gemini', 'openrouter', 'huggingface', 'groq') then 'studies'
          when e.provider = 'resend' then 'notifications'
          else 'api'
        end as feature,
        e.user_id,
        e.organization_id,
        e.created_at,
        greatest(coalesce(e.units, 1), 1)::int as weight,
        false as anonymous
      from public.api_usage_events e
      where e.user_id is not null
        and e.organization_id = v_org
        and e.created_at >= v_content_scan_since

      union all
      select 'chat:message', 'chat', m.author_id, m.organization_id, m.created_at, 1, false
      from public.chat_messages m
      where m.organization_id = v_org and m.created_at >= v_content_scan_since

      union all
      select 'chat:reaction', 'chat', r.user_id, m.organization_id, r.created_at, 1, false
      from public.chat_message_reactions r
      join public.chat_messages m on m.id = r.message_id
      where m.organization_id = v_org and r.created_at >= v_content_scan_since

      union all
      select 'q-and-a:question', 'qa', q.author_id, q.organization_id, q.created_at, 2, q.is_anonymous
      from public.qa_questions q
      where q.organization_id = v_org and q.created_at >= v_content_scan_since

      union all
      select 'q-and-a:answer', 'qa', a.author_id, a.organization_id, a.created_at, 2, a.is_anonymous
      from public.qa_answers a
      where a.organization_id = v_org and a.created_at >= v_content_scan_since

      union all
      select 'q-and-a:vote', 'qa', v.user_id, q.organization_id, v.created_at, 1, false
      from public.qa_question_votes v
      join public.qa_questions q on q.id = v.question_id
      where q.organization_id = v_org and v.created_at >= v_content_scan_since

      union all
      select 'q-and-a:vote', 'qa', v.user_id, a.organization_id, v.created_at, 1, false
      from public.qa_answer_votes v
      join public.qa_answers a on a.id = v.answer_id
      where a.organization_id = v_org and v.created_at >= v_content_scan_since

      union all
      select 'prayer:request', 'fellowship', p.user_id, p.organization_id, p.created_at, 2, false
      from public.prayers p
      where p.user_id is not null and p.organization_id = v_org and p.created_at >= v_content_scan_since

      union all
      select 'prayer:amen', 'fellowship', a.user_id, a.organization_id, a.created_at, 1, false
      from public.prayer_amens a
      where a.organization_id = v_org and a.created_at >= v_content_scan_since

      union all
      select 'journal:entry', 'fellowship', j.user_id, j.organization_id, j.created_at, 3, false
      from public.journal_entries j
      where j.organization_id = v_org and j.created_at >= v_content_scan_since

      union all
      select 'journal:comment', 'fellowship', c.user_id, c.organization_id, c.created_at, 1, false
      from public.journal_comments c
      where c.organization_id = v_org and c.created_at >= v_content_scan_since

      union all
      select 'sermon:note', 'sermons', n.user_id, n.organization_id, n.created_at, 2, false
      from public.sermon_notes n
      where n.user_id is not null and n.organization_id = v_org and n.created_at >= v_content_scan_since

      union all
      select 'sermon:feedback-request', 'sermons', r.requester_id, r.organization_id, r.created_at, 2, false
      from public.sermon_feedback_requests r
      where r.requester_id is not null and r.organization_id = v_org and r.created_at >= v_content_scan_since

      union all
      select 'sermon:feedback', 'sermons', f.responder_id, f.organization_id, f.created_at, 2, false
      from public.sermon_feedback f
      where f.responder_id is not null and f.organization_id = v_org and f.created_at >= v_content_scan_since

      union all
      select 'attendance:session', 'leader-portal', a.created_by, a.organization_id, a.created_at, 2, false
      from public.attendance a
      where a.created_by is not null and a.organization_id = v_org and a.created_at >= v_content_scan_since

      union all
      select 'groups:meeting-plan', 'leader-portal', gm.updated_by, ag.organization_id, gm.updated_at, 2, false
      from public.group_meetings gm
      join public.attendance_groups ag on ag.id = gm.group_id
      where gm.updated_by is not null and ag.organization_id = v_org and gm.updated_at >= v_content_scan_since
    ),
    content_events as (
      select e.*
      from raw_content_events e
      join public.profiles p on p.id = e.user_id
      where coalesce(p.role, 'student') <> 'developer'
    ),
    baseline_modules(feature) as (
      values
        ('dashboard'),
        ('studies'),
        ('bible'),
        ('chat'),
        ('qa'),
        ('discipleship'),
        ('calendar'),
        ('fellowship'),
        ('sermons'),
        ('feedback'),
        ('forms'),
        ('integrations'),
        ('leader-portal')
    ),
    daily_days as (
      select generate_series(v_current_day_start, current_date, interval '1 day')::date as day
    ),
    daily_presence as (
      select day, count(distinct user_id)::int as active_users, coalesce(sum(visits), 0)::int as visits
      from presence_events
      where day >= v_current_day_start
      group by day
    ),
    daily_content as (
      select date_trunc('day', created_at)::date as day, count(*)::int as events
      from content_events
      where created_at >= v_since
      group by 1
    ),
    module_current as (
      select feature, user_id, sum(visits)::int as visits, 0::int as events, 0::int as score
      from presence_events
      where day >= v_current_day_start
      group by feature, user_id

      union all
      select feature, user_id, 0, count(*)::int, coalesce(sum(weight), 0)::int
      from content_events
      where created_at >= v_since
      group by feature, user_id
    ),
    module_previous as (
      select feature, user_id, sum(visits)::int as visits, 0::int as events, 0::int as score
      from presence_events
      where day >= v_prev_day_start and day < v_current_day_start
      group by feature, user_id

      union all
      select feature, user_id, 0, count(*)::int, coalesce(sum(weight), 0)::int
      from content_events
      where created_at >= v_prev_since and created_at < v_since
      group by feature, user_id
    ),
    module_rollup as (
      select feature,
             count(distinct user_id)::int as users,
             coalesce(sum(visits), 0)::int as visits,
             coalesce(sum(events), 0)::int as events,
             coalesce(sum(score), 0)::int as score
      from module_current
      group by feature
    ),
    module_prev_rollup as (
      select feature,
             count(distinct user_id)::int as users,
             coalesce(sum(visits), 0)::int as visits,
             coalesce(sum(events), 0)::int as events,
             coalesce(sum(score), 0)::int as score
      from module_previous
      group by feature
    ),
    module_features as (
      select feature from baseline_modules
      union
      select feature from module_rollup
      union
      select feature from module_prev_rollup
    ),
    user_activity_current as (
      select user_id,
             coalesce(sum(visits), 0)::int as visits,
             coalesce(sum(events), 0)::int as events,
             coalesce(sum(score), 0)::int as content_score,
             max(last_seen)::date as last_seen
      from (
        select user_id, visits, 0::int as events, visits as score, day as last_seen
        from presence_events
        where day >= v_current_day_start

        union all
        select user_id, 0, 1, weight, created_at::date
        from content_events
        where created_at >= v_since
      ) a
      group by user_id
    ),
    last_presence as (
      select user_id, max(day)::date as last_seen
      from presence_events
      group by user_id
    ),
    last_content as (
      select user_id, max(created_at)::date as last_seen
      from content_events
      group by user_id
    ),
    member_last_seen as (
      select
        m.user_id,
        m.name,
        case
          when lp.last_seen is not null and lc.last_seen is not null then greatest(lp.last_seen, lc.last_seen)
          else coalesce(lp.last_seen, lc.last_seen)
        end as last_seen
      from members m
      left join last_presence lp on lp.user_id = m.user_id
      left join last_content lc on lc.user_id = m.user_id
    ),
    totals_json as (
      select jsonb_build_object(
        'dau', (select count(distinct user_id)::int from presence_events where day = current_date),
        'prevDau', (select count(distinct user_id)::int from presence_events where day = current_date - 1),
        'wau', (select count(distinct user_id)::int from presence_events where day >= current_date - 6),
        'prevWau', (select count(distinct user_id)::int from presence_events where day >= current_date - 13 and day < current_date - 6),
        'mau', (select count(distinct user_id)::int from presence_events where day >= current_date - 29),
        'prevMau', (select count(distinct user_id)::int from presence_events where day >= current_date - 59 and day < current_date - 29),
        'members', (select count(*)::int from members),
        'newMembers', (select count(*)::int from members where joined_at >= v_since),
        'prevNewMembers', (select count(*)::int from members where joined_at >= v_prev_since and joined_at < v_since),
        'contentEvents', (select count(*)::int from content_events where created_at >= v_since),
        'prevContentEvents', (select count(*)::int from content_events where created_at >= v_prev_since and created_at < v_since),
        'contentScore', (select coalesce(sum(weight), 0)::int from content_events where created_at >= v_since),
        'prevContentScore', (select coalesce(sum(weight), 0)::int from content_events where created_at >= v_prev_since and created_at < v_since),
        'presenceRows', (select count(*)::int from presence_events where day >= v_current_day_start)
      ) as value
    ),
    daily_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'activeUsers', coalesce(dp.active_users, 0),
        'visits', coalesce(dp.visits, 0),
        'events', coalesce(dc.events, 0)
      ) order by d.day), '[]'::jsonb) as value
      from daily_days d
      left join daily_presence dp on dp.day = d.day
      left join daily_content dc on dc.day = d.day
    ),
    modules_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'feature', f.feature,
        'users', coalesce(m.users, 0),
        'visits', coalesce(m.visits, 0),
        'events', coalesce(m.events, 0),
        'score', coalesce(m.score, 0),
        'prevUsers', coalesce(pm.users, 0),
        'prevVisits', coalesce(pm.visits, 0),
        'prevEvents', coalesce(pm.events, 0),
        'prevScore', coalesce(pm.score, 0)
      ) order by coalesce(m.users, 0) desc, coalesce(m.visits, 0) + coalesce(m.events, 0) desc, f.feature), '[]'::jsonb) as value
      from module_features f
      left join module_rollup m on m.feature = f.feature
      left join module_prev_rollup pm on pm.feature = f.feature
    ),
    recent_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', r.kind,
        'feature', r.feature,
        'userName', case when r.anonymous then 'Anonymous' else coalesce(nullif(p.full_name, ''), p.email, 'Unknown') end,
        'at', r.created_at
      ) order by r.created_at desc), '[]'::jsonb) as value
      from (
        select *
        from content_events
        where created_at >= v_since
        order by created_at desc
        limit 20
      ) r
      join public.profiles p on p.id = r.user_id
    ),
    power_users_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', ranked.user_id,
        'name', ranked.name,
        'score', ranked.score,
        'visits', ranked.visits,
        'events', ranked.events,
        'lastSeen', ranked.last_seen
      ) order by ranked.score desc, ranked.last_seen desc), '[]'::jsonb) as value
      from (
        select
          a.user_id,
          coalesce(nullif(p.full_name, ''), p.email, 'Unknown') as name,
          (a.visits + a.content_score)::int as score,
          a.visits,
          a.events,
          a.last_seen
        from user_activity_current a
        join public.profiles p on p.id = a.user_id
        order by (a.visits + a.content_score) desc, a.last_seen desc
        limit 10
      ) ranked
    ),
    quiet_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', q.user_id,
        'name', q.name,
        'lastSeen', q.last_seen
      ) order by q.last_seen asc nulls first, q.name), '[]'::jsonb) as value
      from (
        select user_id, name, last_seen
        from member_last_seen
        where last_seen is null or last_seen < current_date - 13
        order by last_seen asc nulls first, name
        limit 25
      ) q
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'organizationId', v_org,
      'windowDays', v_days,
      'totals', (select value from totals_json),
      'daily', (select value from daily_json),
      'modules', (select value from modules_json),
      'recent', (select value from recent_json),
      'powerUsers', (select value from power_users_json),
      'quiet', (select value from quiet_json)
    )
  );
end;
$$;

grant execute on function public.admin_activity_pulse(uuid, int) to authenticated;

notify pgrst, 'reload schema';
