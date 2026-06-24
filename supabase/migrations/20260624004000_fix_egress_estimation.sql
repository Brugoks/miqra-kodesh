-- Redefine dev_usage_snapshot() to estimate egress using pg_stat_statements.
-- This accurately measures query counts and rows sent to client, bypassing sequential scans.

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
  table_stats jsonb := '{}'::jsonb;
  storage_total_bytes bigint := 0;
  storage_total_objects bigint := 0;
  storage_buckets jsonb := '[]'::jsonb;
  api_usage jsonb := '{}'::jsonb;
  total_auth_users bigint := 0;
  monthly_active_users bigint := 0;
  db_commits bigint := 0;
  db_tup_returned bigint := 0;
  est_egress_bytes bigint := 0;
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
             'lastMinuteUnits', coalesce(sum(units) filter (where created_at >= now() - interval '1 minute'), 0),
             'todayUnits', coalesce(sum(units) filter (where created_at >= date_trunc('day', now())), 0),
             'monthUnits', coalesce(sum(units) filter (where created_at >= date_trunc('month', now())), 0),
             'errorsToday', count(*) filter (where created_at >= date_trunc('day', now()) and coalesce(status, 0) >= 400),
             'lastEventAt', max(created_at)
           ) as usage_row
    from public.api_usage_events
    where created_at >= date_trunc('month', now())
    group by provider
  ) usage_rows;

  select coalesce(jsonb_object_agg(relname, jsonb_build_object(
    'seqScan', coalesce(seq_scan, 0),
    'seqTupRead', coalesce(seq_tup_read, 0),
    'idxScan', coalesce(idx_scan, 0),
    'idxTupFetch', coalesce(idx_tup_fetch, 0),
    'inserted', coalesce(n_tup_ins, 0),
    'updated', coalesce(n_tup_upd, 0),
    'deleted', coalesce(n_tup_del, 0)
  )), '{}'::jsonb)
  into table_stats
  from pg_stat_user_tables
  where schemaname = 'public';

  if to_regclass('extensions.pg_stat_statements') is not null then
    select coalesce(sum(calls), 0)::bigint, coalesce(sum(rows), 0)::bigint
    into db_commits, db_tup_returned
    from extensions.pg_stat_statements
    where query not like '%pg_%' and query not like '%dev_usage_snapshot%';
    
    -- Estimate: 1100 bytes per query call, plus 300 bytes per returned/affected tuple
    est_egress_bytes := db_commits * 1100 + db_tup_returned * 300;
  else
    -- Fallback to user tables stats if pg_stat_statements is not accessible
    select coalesce(sum(idx_tup_fetch), 0)::bigint, coalesce(sum(n_tup_ins + n_tup_upd), 0)::bigint
    into db_tup_returned, db_commits
    from pg_stat_user_tables
    where schemaname = 'public';
    
    est_egress_bytes := db_commits * 300 + db_tup_returned * 150;
  end if;

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
      'tableCounts', table_counts,
      'tableStats', table_stats,
      'egressBytes', est_egress_bytes
    ),
    'apiUsage', api_usage
  );
end;
$$;

grant execute on function public.dev_usage_snapshot() to authenticated;
