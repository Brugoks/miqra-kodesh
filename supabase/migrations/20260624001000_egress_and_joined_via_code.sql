-- 1. Add joined_via_code tracking to profiles table
alter table public.profiles add column if not exists joined_via_code boolean not null default false;

-- Seed existing profiles as true so they are not prompted to rejoin
update public.profiles set joined_via_code = true;

-- 2. Update handle_new_user trigger to populate joined_via_code
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  has_invite boolean := false;
begin
  -- Look up organization by invite code passed in raw_user_meta_data
  select id into org_id
  from public.organizations
  where invite_code = (new.raw_user_meta_data->>'invite_code');

  if org_id is not null then
    has_invite := true;
  end if;

  -- If not found, default to Charleston Baptist Church
  if org_id is null then
    org_id := public.get_default_organization_id();
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, provider, role, active_organization_id, joined_via_code, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider',
    case
      when new.email = 'markquiambao@gmail.com' then 'developer'
      else 'student'
    end,
    org_id,
    case
      when new.email = 'markquiambao@gmail.com' then true
      else has_invite
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    role = case
      when excluded.email = 'markquiambao@gmail.com' then 'developer'
      else public.profiles.role
    end,
    active_organization_id = excluded.active_organization_id,
    joined_via_code = case
      when excluded.email = 'markquiambao@gmail.com' then true
      else public.profiles.joined_via_code or excluded.joined_via_code
    end,
    updated_at = now();

  -- Add to the join table
  insert into public.profile_organizations (profile_id, organization_id)
  values (new.id, org_id)
  on conflict do nothing;

  return new;
end;
$$;

-- 3. Redefine dev_usage_snapshot() to calculate and include egressBytes
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
  db_rollbacks bigint := 0;
  total_tuples_read bigint := 0;
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

  select coalesce(xact_commit, 0), coalesce(xact_rollback, 0)
  into db_commits, db_rollbacks
  from pg_stat_database
  where datname = current_database();

  select coalesce(sum(seq_tup_read + idx_tup_fetch), 0)::bigint
  into total_tuples_read
  from pg_stat_user_tables
  where schemaname = 'public';

  -- Calculate estimated egress bytes: 1100 bytes overhead per transaction/REST query, plus 300 bytes per tuple read/returned.
  est_egress_bytes := (db_commits + db_rollbacks) * 1100 + total_tuples_read * 300;

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
