-- Fish Audio narration metrics for DevTools.
--
-- dev_usage_snapshot() rolls every fish-audio event into a single provider
-- row, which is actively misleading for this provider: Fish Audio bills per
-- CHARACTER, and the `tts-cache` bucket means most requests cost nothing.
-- A raw call count of 500 could be $0 (all cache hits) or a real bill. This
-- RPC splits the three features the edge function records —
--   'tts'         paid synthesis (units = characters billed)
--   'tts-cache'   free cache hit  (units = 0, metadata.chars = chars served)
--   'tts-blocked' request refused by a daily cap
-- — so DevTools can show what was actually paid for and what the cache saved.
--
-- The daily window is UTC midnight, matching charsSynthesizedToday() in the
-- fish-tts function exactly, so "characters today" is the same number that
-- gets checked against FISH_DAILY_CHAR_LIMIT / FISH_GLOBAL_DAILY_CHAR_LIMIT.

create or replace function public.dev_fish_tts_metrics()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  day_start timestamptz := date_trunc('day', (now() at time zone 'utc')) at time zone 'utc';
  month_start timestamptz := date_trunc('month', (now() at time zone 'utc')) at time zone 'utc';
  totals jsonb := '{}'::jsonb;
  by_voice jsonb := '[]'::jsonb;
  top_users jsonb := '[]'::jsonb;
  cache_objects bigint := 0;
  cache_bytes bigint := 0;
begin
  if not public.is_developer() then
    raise exception 'Developer role required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'charsToday', coalesce(sum(units) filter (where feature = 'tts' and created_at >= day_start), 0),
    'charsMonth', coalesce(sum(units) filter (where feature = 'tts'), 0),
    'synthesisToday', count(*) filter (where feature = 'tts' and created_at >= day_start),
    'synthesisMonth', count(*) filter (where feature = 'tts'),
    'failuresToday', count(*) filter (where feature = 'tts' and coalesce(status, 0) >= 400 and created_at >= day_start),
    'failuresMonth', count(*) filter (where feature = 'tts' and coalesce(status, 0) >= 400),
    'cacheHitsToday', count(*) filter (where feature = 'tts-cache' and created_at >= day_start),
    'cacheHitsMonth', count(*) filter (where feature = 'tts-cache'),
    'charsFromCacheToday', coalesce(sum(chars) filter (where feature = 'tts-cache' and created_at >= day_start), 0),
    'charsFromCacheMonth', coalesce(sum(chars) filter (where feature = 'tts-cache'), 0),
    'blockedToday', count(*) filter (where feature = 'tts-blocked' and created_at >= day_start),
    'blockedMonth', count(*) filter (where feature = 'tts-blocked'),
    'lastEventAt', max(created_at)
  )
  into totals
  from (
    select
      feature,
      status,
      units,
      created_at,
      -- metadata is free-form jsonb; only trust a clean integer.
      case
        when metadata->>'chars' ~ '^[0-9]+$' then (metadata->>'chars')::numeric
        else 0
      end as chars
    from public.api_usage_events
    where provider = 'fish-audio'
      and created_at >= month_start
  ) e;

  -- Per-voice split (month). Voice labels live in edge-function secrets, so
  -- only the reference id is stored — DevTools maps it back to a label.
  select coalesce(jsonb_agg(row order by (row->>'chars')::numeric desc), '[]'::jsonb)
  into by_voice
  from (
    select jsonb_build_object(
      'voiceId', coalesce(metadata->>'voice_id', 'unknown'),
      'chars', coalesce(sum(units) filter (where feature = 'tts'), 0),
      'synthesis', count(*) filter (where feature = 'tts'),
      'cacheHits', count(*) filter (where feature = 'tts-cache')
    ) as row
    from public.api_usage_events
    where provider = 'fish-audio'
      and created_at >= month_start
      and feature in ('tts', 'tts-cache')
    group by coalesce(metadata->>'voice_id', 'unknown')
  ) v;

  -- Who is drawing down the shared daily character budget right now.
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into top_users
  from (
    select jsonb_build_object(
      'name', coalesce(
        nullif(p.full_name, ''),
        nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
        '(signed-out / unknown)'
      ),
      'chars', coalesce(sum(e.units), 0),
      'requests', count(*)
    ) as row
    from public.api_usage_events e
    left join public.profiles p on p.id = e.user_id
    where e.provider = 'fish-audio'
      and e.feature = 'tts'
      and e.created_at >= day_start
    group by p.full_name, p.email
    order by coalesce(sum(e.units), 0) desc
    limit 10
  ) u;

  if to_regclass('storage.objects') is not null then
    select count(*)::bigint,
           coalesce(sum(
             case
               when metadata ? 'size' and (metadata->>'size') ~ '^[0-9]+$'
                 then (metadata->>'size')::bigint
               else 0
             end
           ), 0)::bigint
    into cache_objects, cache_bytes
    from storage.objects
    where bucket_id = 'tts-cache';
  end if;

  return totals || jsonb_build_object(
    'byVoice', by_voice,
    'topUsersToday', top_users,
    'cache', jsonb_build_object('objects', cache_objects, 'bytes', cache_bytes),
    'dayStart', day_start,
    'monthStart', month_start,
    'generatedAt', now()
  );
end;
$$;

grant execute on function public.dev_fish_tts_metrics() to authenticated;
