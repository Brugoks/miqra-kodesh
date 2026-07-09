import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Official BibleProject channel — results are restricted to this channel so the
// Resources tab can only ever surface BibleProject (Tim Mackie) content.
const BIBLEPROJECT_CHANNEL_ID = Deno.env.get('BIBLEPROJECT_CHANNEL_ID') || 'UCVfwlh9XpX2Y_tQfjeln9QA';
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const CONFIGURED_REFERER = Deno.env.get('YOUTUBE_API_REFERER');
const DEFAULT_REFERER = 'http://localhost:3000/';

// search.list costs 100 quota units against a 10,000/day free quota, and the
// queries are deterministic per study — so results are cached in
// youtube_search_cache and served from there for 14 days.
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { query, maxResults = 6 } = await request.json() as {
      query: string;
      maxResults?: number;
    };

    if (!query || typeof query !== 'string') {
      return jsonResponse({ error: 'query is required' }, 400);
    }

    const clampedMax = Math.min(Math.max(maxResults, 1), 10);
    const cacheKey = `${query.trim().toLowerCase()}::${clampedMax}`;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cached } = await admin
      .from('youtube_search_cache')
      .select('videos, fetched_at')
      .eq('query_key', cacheKey)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return jsonResponse({ videos: cached.videos, cached: true });
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'YOUTUBE_API_KEY not configured' }, 503);

    const url = new URL(SEARCH_URL);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('channelId', BIBLEPROJECT_CHANNEL_ID);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', String(clampedMax));

    const requestOrigin = request.headers.get('origin');
    const referer = CONFIGURED_REFERER || (requestOrigin ? `${requestOrigin.replace(/\/$/, '')}/` : DEFAULT_REFERER);

    const res = await fetch(url.toString(), {
      headers: {
        Referer: referer,
      },
    });
    const data = await res.json();
    await recordUsageEvent({
      provider: 'youtube',
      feature: 'search.list',
      status: res.status,
      units: 100, // search.list quota cost — https://developers.google.com/youtube/v3/determine_quota_cost
      request,
      metadata: { maxResults: clampedMax },
    });

    if (!res.ok) {
      const detail = data?.error?.message || JSON.stringify(data)?.slice(0, 300);
      // Serve a stale cache entry over an error (e.g. quota exhausted) if one exists.
      if (cached) return jsonResponse({ videos: cached.videos, cached: true, stale: true });
      return jsonResponse({ error: `YouTube API error ${res.status}`, detail }, res.status);
    }

    const videos = (data.items || [])
      .filter((i: { id?: { videoId?: string } }) => i.id?.videoId)
      .map((i: {
        id: { videoId: string };
        snippet: {
          title: string;
          description: string;
          publishedAt: string;
          thumbnails?: Record<string, { url: string }>;
        };
      }) => ({
        videoId: i.id.videoId,
        title: i.snippet.title,
        description: i.snippet.description,
        publishedAt: i.snippet.publishedAt,
        thumbnail: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || null,
      }));

    await admin.from('youtube_search_cache').upsert({
      query_key: cacheKey,
      videos,
      fetched_at: new Date().toISOString(),
    });

    return jsonResponse({ videos });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
