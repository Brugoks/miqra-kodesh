import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type BibleRequest = {
  bibleId: string;
  passageId: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { bibleId, passageId } = (await request.json()) as BibleRequest;

    if (!bibleId || !passageId) {
      return jsonResponse({ error: 'bibleId and passageId are required' }, 400);
    }

    const apiKey = Deno.env.get('API_BIBLE_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'API_BIBLE_KEY not configured' }, 503);
    }

    const url =
      `https://api.scripture.api.bible/v1/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}` +
      `?content-type=text&include-verse-numbers=true&include-titles=false`;

    const res = await fetch(url, { headers: { 'api-key': apiKey } });
    await recordUsageEvent({
      provider: 'api-bible',
      feature: 'passage',
      status: res.status,
      metadata: { bibleId, passageId },
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: `api.bible responded with ${res.status}`, detail: text }, res.status);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
