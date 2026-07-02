-- Fix dev_usage_daily: the jsonb_build_object contained aggregates, so
-- GROUP BY 1 (the whole expression) was invalid. Aggregate in an inner
-- query grouped by day + provider, then build the JSON rows outside.

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
    select jsonb_agg(
      jsonb_build_object(
        'day', s.day,
        'provider', s.provider,
        'calls', s.calls,
        'errors', s.errors,
        'units', s.units
      ) order by s.day
    )
    from (
      select
        to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
        provider,
        count(*) as calls,
        count(*) filter (where status is not null and (status < 200 or status >= 300)) as errors,
        coalesce(sum(units), 0) as units
      from public.api_usage_events
      where created_at >= now() - make_interval(days => greatest(1, least(days, 90)))
      group by 1, 2
    ) s
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.dev_usage_daily(integer) to authenticated;
