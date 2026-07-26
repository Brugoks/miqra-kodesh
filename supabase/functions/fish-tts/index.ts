import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Generate speech from scripture text using a configured Fish Audio voice
// clone ("Read aloud" in the daily reader). Voice ids and the API key live
// ONLY here as Supabase secrets — the client sends plain text (and an optional
// voice_id) and we return MP3 bytes. Neither the key nor voice ids ship to the browser.
//
// LICENSING: serving a cloned voice to end-users requires a PAID Fish Audio
// plan. The free `s2.1-pro-free` tier carries no SLA and is not licensed for
// production / multi-user commercial use. Set the secrets on a paid plan
// before enabling this for real traffic.
//
// Voice registry: secrets FISH_VOICE_1_ID / FISH_VOICE_1_LABEL, _2_, _3_, …
// (label optional — falls back to "Voice N"). GET returns the list of
// {id,label} without exposing keys.

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';
const MAX_CHARS = 1000; // safety cap; the client chunks longer passages

function listVoices(): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const id = Deno.env.get(`FISH_VOICE_${i}_ID`);
    if (!id) break;
    const label = Deno.env.get(`FISH_VOICE_${i}_LABEL`) || `Voice ${i}`;
    out.push({ id, label });
  }
  return out;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // GET /functions/v1/fish-tts -> list available voices (no keys exposed)
  if (request.method === 'GET') {
    return jsonResponse({ voices: listVoices() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await request.json()) as { text?: string; voice_id?: string };
    const clean = (body.text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return jsonResponse({ error: 'text is required' }, 400);
    if (clean.length > MAX_CHARS) {
      return jsonResponse({ error: `text too long (max ${MAX_CHARS} chars); chunk it` }, 413);
    }

    const apiKey = Deno.env.get('FISH_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Fish Audio not configured' }, 503);

    // Resolve the requested voice: explicit voice_id, else first registered,
    // else the legacy single FISH_VOICE_ID secret.
    const registered = listVoices();
    const voiceId =
      (body.voice_id && registered.find((v) => v.id === body.voice_id)?.id) ||
      registered[0]?.id ||
      Deno.env.get('FISH_VOICE_ID');
    if (!voiceId) return jsonResponse({ error: 'No Fish Audio voice configured' }, 503);

    const res = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: 's2.1-pro-free',
      },
      body: JSON.stringify({ text: clean, reference_id: voiceId, format: 'mp3' }),
    });

    await recordUsageEvent({
      provider: 'fish-audio',
      feature: 'tts',
      status: res.status,
      request,
      metadata: { chars: clean.length, voice_id: voiceId },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return jsonResponse({ error: `Fish Audio ${res.status}`, detail: detail.slice(0, 500) }, 502);
    }

    return new Response(res.body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
