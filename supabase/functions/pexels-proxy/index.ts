import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const PEXELS_API_URL = 'https://api.pexels.com/v1';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { query = '', perPage = 18, orientation = '' } = await request.json() as {
      query?: string;
      perPage?: number;
      orientation?: string;
    };

    const apiKey = Deno.env.get('PEXELS_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'PEXELS_API_KEY not configured' }, 503);

    // Empty query falls back to Pexels' curated feed (like GIPHY trending).
    const endpoint = query.trim() ? 'search' : 'curated';
    const url = new URL(`${PEXELS_API_URL}/${endpoint}`);
    url.searchParams.set('per_page', String(Math.min(Math.max(perPage, 1), 30)));
    if (query.trim()) url.searchParams.set('query', query.trim());
    if (['landscape', 'portrait', 'square'].includes(orientation)) {
      url.searchParams.set('orientation', orientation);
    }

    const response = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({
        error: `Pexels API error ${response.status}`,
        detail: data?.error || JSON.stringify(data).slice(0, 300),
      }, response.status);
    }

    const photos = (data.photos || []).map((photo: {
      id: number;
      alt?: string;
      photographer?: string;
      photographer_url?: string;
      url?: string;
      avg_color?: string;
      src?: { medium?: string; large?: string; large2x?: string; original?: string };
    }) => ({
      id: photo.id,
      alt: photo.alt || 'Photo',
      photographer: photo.photographer || 'Unknown',
      photographerUrl: photo.photographer_url || '',
      pageUrl: photo.url || '',
      avgColor: photo.avg_color || '#222',
      thumbUrl: photo.src?.medium || photo.src?.large || '',
      fullUrl: photo.src?.large2x || photo.src?.large || photo.src?.original || '',
    })).filter((photo: { thumbUrl: string; fullUrl: string }) => photo.thumbUrl && photo.fullUrl);

    return jsonResponse({ photos });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
