-- Developer-only usage metrics for DevTools.
-- Captures app-observable API calls and exposes a safe Supabase usage snapshot
-- without putting service-role credentials in the browser.

create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  feature text not null,
  status integer,
  units numeric not null default 1,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_events_provider_created_idx
  on public.api_usage_events (provider, created_at desc);

create index if not exists api_usage_events_created_idx
  on public.api_usage_events (created_at desc);

alter table public.api_usage_events enable row level security;

drop policy if exists "api_usage_events_developer_select" on public.api_usage_events;
create policy "api_usage_events_developer_select"
  on public.api_usage_events for select
  to authenticated
  using (public.is_developer());

create or replace function public.dev_usage_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  table_names text[] := array[
    'profiles',
    'organizations',
    'profile_organizations',
    'calendar_events',
    'calendar_rsvps',
    'attendance_groups',
    'attendance',
    'roster',
    'prayers',
    'prayer_amens',
    'journal_entries',
    'polls',
    'poll_votes',
    'study_series',
    'sermon_notes',
    'sermon_feedback_requests',
    'sermon_feedback',
    'discipleship_messages',
    'qa_questions',
    'qa_answers',
    'chat_channels',
    'chat_channel_members',
    'chat_messages',
    'chat_message_reactions',
    'chat_mentions',
    'push_subscriptions',
    'feedback_tickets',
    'feedback_ticket_votes',
    'feedback_ticket_comments',
    'feedback_ticket_events',
    'announcement_drafts',
    'integration_connections',
    'api_usage_events'
  ];
  table_name text;
  row_count bigint;
  table_counts jsonb := '{}'::jsonb;
  storage_total_bytes bigint := 0;
  storage_total_objects bigint := 0;
  storage_buckets jsonb := '[]'::jsonb;
  api_usage jsonb := '{}'::jsonb;
  total_auth_users bigint := 0;
  monthly_active_users bigint := 0;
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('select count(*)::bigint from public.%I', table_name) into row_count;
      table_counts := table_counts || jsonb_build_object(table_name, row_count);
    end if;
  end loop;

  select count(*)::bigint,
         count(*) filter (where last_sign_in_at >= now() - interval '30 days')::bigint
  into total_auth_users, monthly_active_users
  from auth.users;

  if to_regclass('storage.objects') is not null then
    select count(*)::bigint,
           coalesce(sum(
             case
               when metadata ? 'size' and (metadata->>'size') ~ '^[0-9]+$'
                 then (metadata->>'size')::bigint
               else 0
             end
           ), 0)::bigint
    into storage_total_objects, storage_total_bytes
    from storage.objects;

    select coalesce(jsonb_agg(bucket_row order by bucket_row->>'bucketId'), '[]'::jsonb)
    into storage_buckets
    from (
      select jsonb_build_object(
        'bucketId', bucket_id,
        'objects', count(*)::bigint,
        'bytes', coalesce(sum(
          case
            when metadata ? 'size' and (metadata->>'size') ~ '^[0-9]+$'
              then (metadata->>'size')::bigint
            else 0
          end
        ), 0)::bigint
      ) as bucket_row
      from storage.objects
      group by bucket_id
    ) buckets;
  end if;

  select coalesce(jsonb_object_agg(provider, usage_row), '{}'::jsonb)
  into api_usage
  from (
    select provider,
           jsonb_build_object(
             'todayCalls', count(*) filter (where created_at >= date_trunc('day', now())),
             'monthCalls', count(*) filter (where created_at >= date_trunc('month', now())),
             'lastMinuteCalls', count(*) filter (where created_at >= now() - interval '1 minute'),
             'todayUnits', coalesce(sum(units) filter (where created_at >= date_trunc('day', now())), 0),
             'monthUnits', coalesce(sum(units) filter (where created_at >= date_trunc('month', now())), 0),
             'errorsToday', count(*) filter (where created_at >= date_trunc('day', now()) and coalesce(status, 0) >= 400),
             'lastEventAt', max(created_at)
           ) as usage_row
    from public.api_usage_events
    where created_at >= date_trunc('month', now())
    group by provider
  ) usage_rows;

  return jsonb_build_object(
    'generatedAt', now(),
    'supabase', jsonb_build_object(
      'databaseBytes', pg_database_size(current_database()),
      'publicTableBytes', (
        select coalesce(sum(pg_total_relation_size(format('public.%I', tablename)::regclass)), 0)
        from pg_tables
        where schemaname = 'public'
      ),
      'storageBytes', storage_total_bytes,
      'storageObjects', storage_total_objects,
      'storageBuckets', storage_buckets,
      'authUsers', total_auth_users,
      'monthlyActiveUsers', monthly_active_users,
      'tableCounts', table_counts
    ),
    'apiUsage', api_usage
  );
end;
$$;

grant execute on function public.dev_usage_snapshot() to authenticated;
