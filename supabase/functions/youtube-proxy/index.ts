import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

// Official BibleProject channel — results are restricted to this channel so the
// Resources tab can only ever surface BibleProject (Tim Mackie) content.
const BIBLEPROJECT_CHANNEL_ID = Deno.env.get('BIBLEPROJECT_CHANNEL_ID') || 'UCVfwlh9XpX2Y_tQfjeln9QA';
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

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
    url.searchParams.set('maxResults', String(Math.min(Math.max(maxResults, 1), 10)));

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok) {
      const detail = data?.error?.message || JSON.stringify(data)?.slice(0, 300);
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

    return jsonResponse({ videos });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
