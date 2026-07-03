-- Server-side cache for youtube-proxy search results.
--
-- YouTube's search.list costs 100 quota units per call against a 10,000/day
-- free quota — ~50 uncached Resources-tab visits (2 searches each) would
-- exhaust it. Queries are deterministic per study ("<book> overview",
-- "<topic> word study theme"), so a shared cache converts nearly every visit
-- into a free hit. The proxy (service role) is the only reader/writer.

create table public.youtube_search_cache (
  query_key  text        primary key,   -- normalized query + max results
  videos     jsonb       not null,
  fetched_at timestamptz not null default now()
);

alter table public.youtube_search_cache enable row level security;
-- No policies: client roles get nothing; the edge function uses service role.

-- Weekly sweep of stale entries (cache TTL is enforced by the proxy; this
-- just keeps the table from growing forever).
create or replace function public.prune_youtube_search_cache()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.youtube_search_cache where fetched_at < now() - interval '30 days';
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-youtube-search-cache') then
    perform cron.unschedule('prune-youtube-search-cache');
  end if;
end;
$$;

select cron.schedule(
  'prune-youtube-search-cache',
  '30 3 * * 0', -- Sundays at 03:30 UTC
  $$select public.prune_youtube_search_cache()$$
);
