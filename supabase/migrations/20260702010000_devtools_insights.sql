-- DevTools insights: usage trends, top consumers, cron job health, RLS
-- coverage, slow-query stats, and nightly quota alerting. All RPCs are
-- developer-gated, matching dev_usage_snapshot().

-- Let the service role pass developer gates. Service-key callers already
-- bypass RLS entirely, so this only affects security-definer RPC guards —
-- needed so the cron-invoked quota-alert function can read dev_usage_snapshot().
create or replace function public.is_developer()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) = 'developer'
  or coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role';
$$;

-- ── Daily usage trend per provider ─────────────────────────────────────────
create or replace function public.dev_usage_daily(days integer default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row order by row->>'day')
    from (
      select jsonb_build_object(
        'day', to_char(created_at at time zone 'utc', 'YYYY-MM-DD'),
        'provider', provider,
        'calls', count(*),
        'errors', count(*) filter (where status is not null and (status < 200 or status >= 300)),
        'units', coalesce(sum(units), 0)
      ) as row
      from public.api_usage_events
      where created_at >= now() - make_interval(days => greatest(1, least(days, 90)))
      group by 1
    ) t
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.dev_usage_daily(integer) to authenticated;

-- ── Top consumers by organization and by user ──────────────────────────────
create or replace function public.dev_top_consumers(days integer default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(days, 90)));
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'orgs', coalesce((
      select jsonb_agg(row)
      from (
        select jsonb_build_object(
          'name', coalesce(o.name, '(no organization)'),
          'provider', e.provider,
          'calls', count(*),
          'errors', count(*) filter (where e.status is not null and (e.status < 200 or e.status >= 300))
        ) as row
        from public.api_usage_events e
        left join public.organizations o on o.id = e.organization_id
        where e.created_at >= since
        group by o.name, e.provider
        order by count(*) desc
        limit 25
      ) t
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(row)
      from (
        select jsonb_build_object(
          'name', coalesce(p.full_name, p.email, '(anonymous)'),
          'provider', e.provider,
          'calls', count(*),
          'errors', count(*) filter (where e.status is not null and (e.status < 200 or e.status >= 300))
        ) as row
        from public.api_usage_events e
        left join public.profiles p on p.id = e.user_id
        where e.created_at >= since
        group by p.full_name, p.email, e.provider
        order by count(*) desc
        limit 25
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.dev_top_consumers(integer) to authenticated;

-- ── pg_cron job health ──────────────────────────────────────────────────────
create or replace function public.dev_cron_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(job_row order by job_row->>'jobname')
    from (
      select jsonb_build_object(
        'jobname', j.jobname,
        'schedule', j.schedule,
        'active', j.active,
        'lastRun', (
          select jsonb_build_object(
            'status', d.status,
            'startTime', d.start_time,
            'durationMs', round(extract(epoch from (d.end_time - d.start_time)) * 1000),
            'message', left(coalesce(d.return_message, ''), 300)
          )
          from cron.job_run_details d
          where d.jobid = j.jobid
          order by d.start_time desc
          limit 1
        ),
        'recentFailures', (
          select count(*)
          from cron.job_run_details d
          where d.jobid = j.jobid
            and d.status = 'failed'
            and d.start_time >= now() - interval '7 days'
        )
      ) as job_row
      from cron.job j
    ) t
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.dev_cron_status() to authenticated;

-- ── RLS coverage: public tables without RLS or without any policy ──────────
create or replace function public.dev_rls_coverage()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'rlsEnabled', c.relrowsecurity,
      'policyCount', (
        select count(*) from pg_policy p where p.polrelid = c.oid
      )
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        not c.relrowsecurity
        or not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      )
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.dev_rls_coverage() to authenticated;

-- ── Top statements by total execution time (needs pg_stat_statements) ──────
create or replace function public.dev_top_queries()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  begin
    select jsonb_agg(row)
    into result
    from (
      select jsonb_build_object(
        'query', left(query, 300),
        'calls', calls,
        'totalMs', round(total_exec_time::numeric, 1),
        'meanMs', round(mean_exec_time::numeric, 2),
        'rows', rows
      ) as row
      from extensions.pg_stat_statements
      where query not ilike '%pg_stat_statements%'
        and query not ilike 'select jsonb_agg%'
      order by total_exec_time desc
      limit 12
    ) t;
  exception when undefined_table or insufficient_privilege then
    return jsonb_build_object('unavailable', true);
  end;

  return coalesce(result, '[]'::jsonb);
end;
$$;

grant execute on function public.dev_top_queries() to authenticated;

-- ── Quota alerting ──────────────────────────────────────────────────────────
-- Dedupe log: one alert per metric + severity per day.
create table if not exists public.quota_alerts (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  level text not null,          -- 'watch' (>=75%) | 'critical' (>=90%)
  percent numeric,
  detail text,
  alerted_on date not null default current_date,
  created_at timestamptz not null default now()
);

create unique index if not exists quota_alerts_dedupe_idx
  on public.quota_alerts (metric, level, alerted_on);

alter table public.quota_alerts enable row level security;

drop policy if exists "quota_alerts_developer_select" on public.quota_alerts;
create policy "quota_alerts_developer_select"
  on public.quota_alerts for select
  to authenticated
  using (public.is_developer());
-- Writes happen with the service role only (quota-alert function).

-- Email category toggle so alerts respect the DevTools email switchboard.
insert into public.app_email_settings (email_type, label, description, sort_order) values
  ('quota_alert', 'Quota Alerts', 'Emails developers when an API quota or Supabase free-tier limit passes 75% / 90%.', 90)
on conflict (email_type) do nothing;

-- Vault token authenticating the pg_cron call to the quota-alert function.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'quota_alert_cron_token') then
    perform vault.create_secret(md5(random()::text), 'quota_alert_cron_token');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'quota-alert-daily') then
    perform cron.unschedule('quota-alert-daily');
  end if;
end;
$$;

select cron.schedule(
  'quota-alert-daily',
  '0 7 * * *', -- Daily at 7:00 AM UTC
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/quota-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'quota_alert_cron_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
