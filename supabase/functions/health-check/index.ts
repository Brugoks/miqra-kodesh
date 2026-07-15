// Developer-only fleet health check. Supabase secrets are project-wide, so
// this single function can report which secrets each proxy depends on are
// actually configured — booleans only, never values. Lets DevTools show a
// green/red board instead of discovering a missing key via a user-facing 503.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// secret → the features that break without it
const SECRETS: Array<{ name: string; usedBy: string; required: boolean }> = [
  { name: 'API_BIBLE_KEY', usedBy: 'Bible lookup (NASB/CSB/NLT) — falls back to WEB without it', required: true },
  { name: 'ESV_API_KEY', usedBy: 'ESV passage audio + ESV text', required: false },
  { name: 'GEMINI_API_KEY', usedBy: 'Scripture insights, commentary, discussion questions', required: true },
  { name: 'GROQ_API_KEY', usedBy: 'AI text generation (hf-proxy fast path)', required: false },
  { name: 'HF_TOKEN', usedBy: 'TTS, embeddings, semantic search', required: true },
  { name: 'OPENROUTER_API_KEY', usedBy: 'openrouter-proxy chat + image fallback', required: false },
  { name: 'CLOUDFLARE_ACCOUNT_ID', usedBy: 'Scripture image generation (FLUX)', required: true },
  { name: 'CLOUDFLARE_API_TOKEN', usedBy: 'Scripture image generation (FLUX)', required: true },
  { name: 'R2_ACCOUNT_ID', usedBy: 'R2 wiki image storage metrics', required: false },
  { name: 'R2_ACCESS_KEY_ID', usedBy: 'R2 wiki image storage metrics', required: false },
  { name: 'R2_SECRET_ACCESS_KEY', usedBy: 'R2 wiki image storage metrics', required: false },
  { name: 'R2_BUCKET', usedBy: 'R2 wiki image storage metrics', required: false },
  { name: 'R2_ENDPOINT', usedBy: 'R2 wiki image storage metrics endpoint override', required: false },
  { name: 'YOUTUBE_API_KEY', usedBy: 'BibleProject resource search', required: false },
  { name: 'RESEND_API_KEY', usedBy: 'Transactional email', required: true },
  { name: 'EMAIL_FROM', usedBy: 'Email sender identity', required: false },
  { name: 'VAPID_PUBLIC_KEY', usedBy: 'Web push notifications', required: true },
  { name: 'VAPID_PRIVATE_KEY', usedBy: 'Web push notifications', required: true },
  { name: 'PUSH_HOOK_SECRET', usedBy: 'DB-trigger push sends', required: false },
  { name: 'WIKIDATA_USER_AGENT', usedBy: 'Wikidata context cards', required: false },
  { name: 'STORAGE_GC_TOKEN', usedBy: 'Nightly storage garbage collection', required: false },
];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    // Developer-only.
    const authHeader = request.headers.get('Authorization') || '';
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'developer') {
      return jsonResponse({ error: 'Developer role required' }, 403);
    }

    const secrets = SECRETS.map((secret) => ({
      name: secret.name,
      usedBy: secret.usedBy,
      required: secret.required,
      configured: Boolean(Deno.env.get(secret.name)),
    }));

    return jsonResponse({
      checkedAt: new Date().toISOString(),
      secrets,
      missingRequired: secrets.filter((s) => s.required && !s.configured).map((s) => s.name),
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
