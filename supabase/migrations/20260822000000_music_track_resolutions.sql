-- Permanent cache mapping a DRM-limited music link (Spotify, Apple Music) to a
-- playable YouTube video, so the channel Songs queue can play full tracks.
--
-- WHY THIS EXISTS: Spotify's embed only serves 30-second previews unless the
-- listener's own browser has a logged-in Spotify Premium session, so a shared
-- Spotify link can never play through for a whole group. The music-resolve
-- function looks up the song's title/artist and finds the YouTube equivalent,
-- which plays in full for everyone with no login.
--
-- YouTube's search.list costs 100 quota units against a 10,000/day free quota
-- that the Studies Resources tab also draws on, so resolutions are cached
-- FOREVER on success — a given song is looked up once for the whole app, ever.
-- Failures are cached too (youtube_id null) but expire, so a song that YouTube
-- didn't have yet gets another chance without burning quota on every play.

create table public.music_track_resolutions (
  source_url    text        primary key,   -- normalized source link (no query string)
  provider      text        not null,      -- 'Spotify' | 'Apple Music'
  query         text,                      -- the "title artist" we searched for
  youtube_id    text,                      -- null = searched and found nothing
  youtube_title text,
  resolved_at   timestamptz not null default now()
);

create index music_track_resolutions_misses_idx
  on public.music_track_resolutions (resolved_at)
  where youtube_id is null;

alter table public.music_track_resolutions enable row level security;
-- No policies: client roles get nothing. The music-resolve edge function is the
-- only reader/writer and uses the service role, matching youtube_search_cache.

-- Drop only the negative entries once they are stale. Successful matches are
-- kept indefinitely — a song's YouTube equivalent does not change, and each row
-- we keep is 100 quota units we never have to spend again.
create or replace function public.prune_music_track_resolutions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.music_track_resolutions
  where youtube_id is null and resolved_at < now() - interval '14 days';
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-music-track-resolutions') then
    perform cron.unschedule('prune-music-track-resolutions');
  end if;
end;
$$;

select cron.schedule(
  'prune-music-track-resolutions',
  '45 3 * * 0', -- Sundays at 03:45 UTC, after the youtube-search sweep
  $$select public.prune_music_track_resolutions()$$
);
