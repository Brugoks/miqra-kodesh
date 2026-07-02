import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Resolve an ESV passage-audio mp3 URL for a human-readable reference.
// The ESV API (free key for non-commercial ministry use — api.esv.org)
// answers with a redirect to the mp3 on its CDN; we hand that URL back to
// the client instead of proxying audio bytes, so playback costs no egress.

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { reference } = (await request.json()) as { reference: string };
    if (!reference?.trim()) {
      return jsonResponse({ error: 'reference is required' }, 400);
    }

    const apiKey = Deno.env.get('ESV_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'ESV_API_KEY not configured' }, 503);
    }

    const url = `https://api.esv.org/v3/passage/audio/?q=${encodeURIComponent(reference.trim())}`;
    const res = await fetch(url, {
      headers: { Authorization: `Token ${apiKey}` },
      redirect: 'manual',
    });
    await recordUsageEvent({
      provider: 'esv',
      feature: 'passage-audio',
      status: res.status,
      request,
      metadata: { reference },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) return jsonResponse({ url: location });
      return jsonResponse({ error: 'ESV redirect had no location' }, 502);
    }

    if (res.ok) {
      // Some deployments return the mp3 directly; stream it through as a
      // fallback path.
      return new Response(res.body, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
      });
    }

    const text = await res.text();
    return jsonResponse({ error: `ESV API responded with ${res.status}`, detail: text }, res.status);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
