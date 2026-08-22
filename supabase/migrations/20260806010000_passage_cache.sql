-- Server-side chapter cache for fetched passage text.
--
-- bible-proxy had no cache at any layer: every lookup hit the upstream API
-- fresh. Measured over 90 days of api_usage_events, 383 ESV calls covered only
-- 183 distinct passages and just 120 distinct chapters, because real requests
-- are verse ranges within a handful of chapters (ROM.8.26-30, ROM.5.6-10,
-- JHN.3.14-18). Caching whole chapters and slicing ranges out of them cuts
-- upstream calls by ~69% immediately, and the hit rate keeps climbing: Scripture
-- is immutable and finite, so a cached chapter never goes stale and there are
-- only 1,189 of them in the whole Bible (~4.5 MB of text).
--
-- Rows are keyed '<translation>:<chapterId>' e.g. 'esv:ROM.8'.
--
-- Deliberately NOT a permanent mirror. bible-proxy applies ESV_CACHE_TTL_DAYS
-- (default 30) and re-fetches anything older, which keeps this a performance
-- cache rather than a stored replica of a licensed text. Raising or removing the
-- TTL for ESV is a licensing decision for Crossway, not a technical one. Public
-- domain / CC translations carry no such restriction.

create table if not exists public.passage_cache (
  cache_key   text primary key,
  translation text not null,
  chapter_id  text not null,
  reference   text,
  content     text not null,
  fetched_at  timestamptz not null default now()
);

alter table public.passage_cache enable row level security;

-- No policies, by design. The cache is read and written only by the bible-proxy
-- edge function via the service-role key, which bypasses RLS. Clients must go
-- through the proxy so that usage stays measured and the API key stays server
-- side; a direct client read would bypass both.

create index if not exists passage_cache_fetched_idx on public.passage_cache (fetched_at);
