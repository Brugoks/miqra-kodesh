import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Cloudflare Workers AI — FLUX.1 [schnell]: fast, high-quality text-to-image.
// Returns JSON { result: { image: "<base64 jpeg>" } }.
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { prompt, steps = 6, seed } = await request.json() as {
      prompt: string;
      steps?: number;
      seed?: number;
    };

    if (!prompt || typeof prompt !== 'string') {
      return jsonResponse({ error: 'prompt is required' }, 400);
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
    if (!accountId || !token) {
      return jsonResponse({ error: 'Cloudflare credentials not configured' }, 503);
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // schnell supports up to 8 steps; clamp to be safe. seed varies output on regenerate.
      body: JSON.stringify({
        prompt,
        steps: Math.min(Math.max(steps, 1), 8),
        ...(typeof seed === 'number' ? { seed } : {}),
      }),
    });

    const data = await res.json().catch(() => null);
    await recordUsageEvent({
      provider: 'cloudflare-ai',
      feature: 'text-to-image',
      status: res.status,
      units: 1,
      metadata: { model: CF_MODEL, steps: Math.min(Math.max(steps, 1), 8) },
    });

    if (!res.ok || !data?.success || !data?.result?.image) {
      const detail = data?.errors?.[0]?.message || JSON.stringify(data)?.slice(0, 400) || 'unknown';
      return jsonResponse({ error: `Cloudflare AI error ${res.status}`, detail }, res.ok ? 502 : res.status);
    }

    // result.image is base64-encoded JPEG.
    const dataUrl = `data:image/jpeg;base64,${data.result.image}`;
    return jsonResponse({ image: dataUrl, model: CF_MODEL });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
