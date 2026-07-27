import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent, extractUserIdFromRequest } from '../_shared/usage.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Generate speech from scripture text using a configured Fish Audio voice
// clone ("Read aloud"). Voice ids and the API key live ONLY here as Supabase
// secrets — the client sends plain text (and an optional voice_id) and we
// return MP3 bytes. Neither the key nor voice ids ship to the browser.
//
// COST GUARDRAILS (Fish Audio is billed per character):
//   1. Cache: every synthesized chunk is stored in the private `tts-cache`
//      bucket, keyed by hash(model:voice:text). Scripture is static, so a given
//      chapter+voice is paid for once, then served free forever after.
//   2. Per-user daily cap: authenticated callers may synthesize up to
//      FISH_DAILY_CHAR_LIMIT new characters/day (cache hits don't count).
//   3. Optional global cap: FISH_GLOBAL_DAILY_CHAR_LIMIT backstops the whole
//      credit pool across all users (0/unset = disabled).
//   Synthesis (cache miss) requires a signed-in user; cache hits are free and
//   served to anyone.
//
// LICENSING: serving a cloned voice to end-users requires a PAID Fish Audio
// plan. The free `s2.1-pro-free` tier carries no SLA and is not licensed for
// production / multi-user commercial use.
//
// Voice registry: secrets FISH_VOICE_1_ID / FISH_VOICE_1_LABEL, _2_, _3_, …
// (label optional — falls back to "Voice N"). GET returns the list of
// {id,label} without exposing keys.

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';
const FISH_MODEL = 's2.1-pro-free';
const MAX_CHARS = 1000; // safety cap; the client chunks longer passages
const CACHE_BUCKET = 'tts-cache';
const DEFAULT_DAILY_CHAR_LIMIT = 20_000; // per user per day (~5-10 chapters)

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

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

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Sum of characters actually synthesized (feature 'tts' — cache misses only)
// since midnight UTC, optionally scoped to one user. Fails open on error so a
// telemetry hiccup never blocks read-aloud.
async function charsSynthesizedToday(userId?: string | null): Promise<number> {
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    let query = adminClient()
      .from('api_usage_events')
      .select('units')
      .eq('provider', 'fish-audio')
      .eq('feature', 'tts')
      .gte('created_at', since.toISOString());
    if (userId) query = query.eq('user_id', userId);
    const { data } = await query;
    return (data ?? []).reduce((sum, r) => sum + Number(r.units || 0), 0);
  } catch {
    return 0;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // GET /functions/v1/fish-tts -> available voices + the configured caps.
  // The caps are only knowable here (they are secrets on this function), and
  // DevTools needs them to chart usage against a real limit rather than a
  // hardcoded guess. These are config numbers, not credentials — the API key
  // and nothing derived from it is ever returned.
  if (request.method === 'GET') {
    return jsonResponse({
      voices: listVoices(),
      limits: {
        model: FISH_MODEL,
        cacheBucket: CACHE_BUCKET,
        maxCharsPerRequest: MAX_CHARS,
        perUserDailyChars: Number(Deno.env.get('FISH_DAILY_CHAR_LIMIT') ?? DEFAULT_DAILY_CHAR_LIMIT),
        globalDailyChars: Number(Deno.env.get('FISH_GLOBAL_DAILY_CHAR_LIMIT') ?? 0),
        configured: !!Deno.env.get('FISH_API_KEY'),
      },
    });
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

    const admin = adminClient();
    const cacheKey = await sha256Hex(`${FISH_MODEL}:${voiceId}:${clean}`);
    const cachePath = `${voiceId}/${cacheKey}.mp3`;

    // 1. Cache hit — free, served to anyone (auth not required).
    const cached = await admin.storage.from(CACHE_BUCKET).download(cachePath).catch(() => null);
    if (cached?.data) {
      const buf = new Uint8Array(await cached.data.arrayBuffer());
      await recordUsageEvent({
        provider: 'fish-audio',
        feature: 'tts-cache',
        status: 200,
        units: 0,
        request,
        metadata: { chars: clean.length, voice_id: voiceId, cache: 'hit' },
      });
      return new Response(buf, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' },
      });
    }

    // 2. Cache miss = a paid synthesis. Require a signed-in user and enforce caps.
    const userId = extractUserIdFromRequest(request);
    if (!userId) {
      return jsonResponse({ error: 'Sign in to use read-aloud.', code: 'auth_required' }, 401);
    }

    const perUserLimit = Number(Deno.env.get('FISH_DAILY_CHAR_LIMIT') ?? DEFAULT_DAILY_CHAR_LIMIT);
    if (perUserLimit > 0) {
      const used = await charsSynthesizedToday(userId);
      if (used + clean.length > perUserLimit) {
        await recordUsageEvent({
          provider: 'fish-audio',
          feature: 'tts-blocked',
          status: 429,
          units: 0,
          request,
          metadata: { chars: clean.length, used, limit: perUserLimit, scope: 'user' },
        });
        return jsonResponse(
          { error: 'Daily read-aloud limit reached. Please try again tomorrow.', code: 'daily_limit' },
          429,
        );
      }
    }

    const globalLimit = Number(Deno.env.get('FISH_GLOBAL_DAILY_CHAR_LIMIT') ?? 0);
    if (globalLimit > 0) {
      const usedGlobal = await charsSynthesizedToday();
      if (usedGlobal + clean.length > globalLimit) {
        await recordUsageEvent({
          provider: 'fish-audio',
          feature: 'tts-blocked',
          status: 429,
          units: 0,
          request,
          metadata: { chars: clean.length, used: usedGlobal, limit: globalLimit, scope: 'global' },
        });
        return jsonResponse(
          { error: 'Read-aloud is temporarily unavailable (daily capacity reached).', code: 'capacity' },
          429,
        );
      }
    }

    // 3. Synthesize.
    const res = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: FISH_MODEL,
      },
      body: JSON.stringify({ text: clean, reference_id: voiceId, format: 'mp3' }),
    });

    await recordUsageEvent({
      provider: 'fish-audio',
      feature: 'tts',
      status: res.status,
      units: res.ok ? clean.length : 0, // only bill characters we actually got
      request,
      metadata: { chars: clean.length, voice_id: voiceId, cache: 'miss' },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return jsonResponse({ error: `Fish Audio ${res.status}`, detail: detail.slice(0, 500) }, 502);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());

    // 4. Populate the cache (best-effort — a failure just costs a future call).
    await admin.storage
      .from(CACHE_BUCKET)
      .upload(cachePath, bytes, { contentType: 'audio/mpeg', upsert: true })
      .catch(() => {});

    // Return as octet-stream (not audio/mpeg): the supabase-js functions client
    // parses responses by Content-Type and only treats JSON / octet-stream / pdf
    // as binary — any audio/* type is decoded as text, corrupting the MP3 bytes.
    // The browser sniffs the actual bytes, so playback is unaffected.
    return new Response(bytes, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' },
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
