import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { strongsId } = await request.json() as { strongsId: string };

    if (!strongsId) {
      return jsonResponse({ error: 'strongsId is required' }, 400);
    }

    // Validate format: H or G followed by 1-5 digits
    const normalized = strongsId.trim().toUpperCase();
    if (!/^[HG]\d{1,5}$/.test(normalized)) {
      return jsonResponse({ error: 'Invalid Strongs number. Use format H1234 or G1234.' }, 400);
    }

    const url = `https://api.openbible.info/strongs/${normalized}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'miqra-kodesh/1.0' },
    });

    if (!res.ok) {
      return jsonResponse({ error: `OpenBible responded with ${res.status}` }, res.status);
    }

    const data = await res.json();
    return jsonResponse({ strongsId: normalized, data });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
