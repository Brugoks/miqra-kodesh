import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent, extractUserIdFromRequest } from '../_shared/usage.ts';

// Resolve a DRM-limited music link (Spotify, Apple Music) to a playable YouTube
// video id, so the channel Songs queue can play the song IN FULL.
//
// WHY: Spotify's embed serves 30-second previews unless the listener's own
// browser has a logged-in Spotify Premium session — see
// https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting.
// Nothing on our side can unlock that, so for a shared group playlist we play
// the YouTube equivalent instead, which streams in full with no login.
//
// HOW: scrape the song page's Open Graph tags for title + artist, then run one
// YouTube search. Spotify's og:description is "<artist> · <album> · Song · <year>",
// so "<og:title> <artist>" is a strong query.
//
// QUOTA: search.list costs 100 units of a shared 10,000/day budget that the
// Studies Resources tab also spends. Two guardrails:
//   1. Every result is cached in music_track_resolutions — successes forever,
//      misses for 14 days — so a song costs quota once for the whole app, ever.
//   2. MUSIC_RESOLVE_DAILY_LIMIT caps new lookups per day (default 40 = 4,000
//      units), leaving the Resources tab the majority of the budget.
// Over the limit we return { videoId: null }, and the client falls back to the
// original embed — a 30-second preview, exactly today's behavior. Never an error.

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_MUSIC_CATEGORY = '10';
const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 250_000;
const MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 40;
const SEARCH_QUOTA_UNITS = 100;

// Hosts whose embeds are preview-limited and therefore worth re-pointing at
// YouTube. YouTube and SoundCloud already play in full, so they never get here.
const RESOLVABLE: Record<string, string> = {
  'open.spotify.com': 'Spotify',
  'music.apple.com': 'Apple Music',
};

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// Strip query/hash so the same song shared with different ?si= tracking params
// is one cache row rather than many.
function normalizeUrl(parsed: URL): string {
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

// Numeric forms matter here, not just the named ones: Spotify writes
// "Don&#x27;t Forget The Lord", and an undecoded &#x27; in the search query is
// enough to lose the match entirely. YouTube escapes its snippet titles too.
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Last: an escaped &amp;lt; must not become a tag on the way through.
    .replace(/&amp;/g, '&');
}

function extractMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return null;
}

// "<artist> · <album> · Song · <year>" (Spotify) or "Listen to X by Artist on
// Apple Music" — take the first · segment, which is the artist on both.
function artistFromDescription(description: string | null): string {
  if (!description) return '';
  const first = description.split('·')[0].trim();
  // Apple Music phrases it as prose; pull the artist out of "... by <artist> ...".
  const by = first.match(/\bby\s+(.+?)(?:\s+on\s+Apple Music)?$/i);
  return (by?.[1] || first).slice(0, 80);
}

// Build the search query from the song page's own metadata.
async function describeSong(href: string): Promise<{ query: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(href, {
      signal: controller.signal,
      headers: {
        // Spotify serves Open Graph tags to crawlers; a browser-ish UA is what
        // gets the tag-bearing HTML rather than the JS app shell.
        'User-Agent': 'Mozilla/5.0 (compatible; MiqraKodesh/1.0; +https://miqra-kodesh.com)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) return null;

    let html = '';
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }

    const title = extractMeta(html, 'og:title');
    if (!title) return null;
    const artist = artistFromDescription(extractMeta(html, 'og:description'));
    return { query: `${title} ${artist}`.trim().slice(0, 120) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// New (uncached) resolutions performed since midnight UTC. Fails open at 0 so a
// telemetry hiccup never blocks playback.
async function resolutionsToday(): Promise<number> {
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await adminClient()
      .from('api_usage_events')
      .select('id')
      .eq('provider', 'youtube')
      .eq('feature', 'music-resolve')
      .gte('created_at', since.toISOString());
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url) return jsonResponse({ error: 'url is required' }, 400);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const provider = RESOLVABLE[host];
    if (!provider) {
      // YouTube/SoundCloud already play in full; nothing to resolve.
      return jsonResponse({ videoId: null, reason: 'not_resolvable' });
    }

    const sourceUrl = normalizeUrl(parsed);
    const admin = adminClient();

    const { data: cached } = await admin
      .from('music_track_resolutions')
      .select('youtube_id, youtube_title, resolved_at')
      .eq('source_url', sourceUrl)
      .maybeSingle();

    if (cached?.youtube_id) {
      return jsonResponse({ videoId: cached.youtube_id, title: cached.youtube_title, cached: true });
    }
    if (cached && Date.now() - new Date(cached.resolved_at).getTime() < MISS_TTL_MS) {
      // Known miss — don't spend quota re-asking for a song YouTube didn't have.
      return jsonResponse({ videoId: null, reason: 'cached_miss', cached: true });
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) return jsonResponse({ videoId: null, reason: 'not_configured' });

    const dailyLimit = Number(Deno.env.get('MUSIC_RESOLVE_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
    if (dailyLimit > 0 && (await resolutionsToday()) >= dailyLimit) {
      // Not an error: the client falls back to the preview embed for now and
      // this song resolves tomorrow.
      return jsonResponse({ videoId: null, reason: 'daily_limit' });
    }

    const described = await describeSong(parsed.href);
    if (!described?.query) {
      return jsonResponse({ videoId: null, reason: 'no_metadata' });
    }

    const searchUrl = new URL(SEARCH_URL);
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoEmbeddable', 'true');
    searchUrl.searchParams.set('videoCategoryId', YOUTUBE_MUSIC_CATEGORY);
    searchUrl.searchParams.set('order', 'relevance');
    searchUrl.searchParams.set('q', described.query);
    searchUrl.searchParams.set('maxResults', '1');

    const referer = Deno.env.get('YOUTUBE_API_REFERER');
    const res = await fetch(searchUrl.toString(), {
      headers: referer ? { Referer: referer } : undefined,
    });

    await recordUsageEvent({
      provider: 'youtube',
      feature: 'music-resolve',
      status: res.status,
      units: res.ok ? SEARCH_QUOTA_UNITS : 0,
      request,
      userId: extractUserIdFromRequest(request),
      metadata: { source_url: sourceUrl, query: described.query, music_provider: provider },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return jsonResponse({ videoId: null, reason: `youtube_${res.status}`, detail: detail.slice(0, 300) });
    }

    const data = await res.json();
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId || null;
    // YouTube returns snippet titles HTML-escaped ("Holy &quot;Holy&quot;").
    const videoTitle = item?.snippet?.title ? decodeEntities(item.snippet.title) : null;

    // Record the outcome either way — a miss is worth remembering for 14 days.
    // The PostgREST builder is a thenable, not a Promise, so it has no .catch();
    // await it and swallow the error rather than losing a resolution we paid for.
    try {
      await admin.from('music_track_resolutions').upsert({
        source_url: sourceUrl,
        provider,
        query: described.query,
        youtube_id: videoId,
        youtube_title: videoTitle,
        resolved_at: new Date().toISOString(),
      });
    } catch { /* cache write is best-effort; the result still goes back */ }

    return jsonResponse({ videoId, title: videoTitle, query: described.query, cached: false });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
