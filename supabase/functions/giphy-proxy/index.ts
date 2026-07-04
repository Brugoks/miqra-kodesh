import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { query = '', limit = 20 } = await request.json() as {
      query?: string;
      limit?: number;
    };

    const apiKey = Deno.env.get('GIPHY_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'GIPHY_API_KEY not configured' }, 503);

    const endpoint = query.trim() ? 'search' : 'trending';
    const url = new URL(`${GIPHY_API_URL}/${endpoint}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 30)));
    url.searchParams.set('rating', 'pg');
    if (query.trim()) url.searchParams.set('q', query.trim());

    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({
        error: `GIPHY API error ${response.status}`,
        detail: data?.meta?.msg || JSON.stringify(data).slice(0, 300),
      }, response.status);
    }

    const gifs = (data.data || []).map((gif: {
      id: string;
      title?: string;
      images?: {
        fixed_height?: { url?: string };
        fixed_height_small?: { url?: string };
      };
    }) => ({
      id: gif.id,
      title: gif.title || 'GIF',
      url: gif.images?.fixed_height?.url || gif.images?.fixed_height_small?.url || '',
      previewUrl: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || '',
    })).filter((gif: { url: string; previewUrl: string }) => gif.url && gif.previewUrl);

    return jsonResponse({ gifs });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
