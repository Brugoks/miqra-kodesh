// Conversation guide generator for the discipleship pathway. Each session's
// guide (opener, three questions, practice) is generated once by Gemini —
// grounded in the passage text fetched from bible-api.com (public domain,
// keyless) — and cached in discipleship_guides for every future reader.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PROMPT_VERSION = 'discipleship-guide-v1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    opener: { type: 'string', description: 'A disarming, relational warm-up question unrelated to performance' },
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string' },
      description: 'Three discussion questions moving from the text, to the heart, to real life this week',
    },
    practice: { type: 'string', description: 'One small, concrete practice to try before the next meeting' },
  },
  required: ['opener', 'questions', 'practice'],
};

function buildPrompt(session: { title: string; passage: string; focus: string }, passageText: string) {
  return [
    'Create a one-meeting discipleship conversation guide for two people (a discipler and the person they are walking with).',
    'They are ordinary church members, possibly students — warm, plain language, zero jargon, no guilt.',
    '',
    `Session title: ${session.title}`,
    `Focus: ${session.focus}`,
    `Passage (${session.passage}, WEB translation):`,
    passageText,
    '',
    'Produce:',
    '- opener: one warm-up question anyone could answer, loosely related to the theme.',
    '- questions: exactly three. The first should look closely at what the passage actually says; the second should move to the heart (honest self-reflection); the third should land in concrete everyday life this week.',
    '- practice: one small, specific practice to try before the next meeting (something doable in under 15 minutes).',
    'Stay faithful to the passage. Do not invent quotes. Keep each item to at most two sentences.',
  ].join('\n');
}

// 'Ephesians 2:1-10' is already a bible-api.com friendly query.
async function fetchPassageText(passage: string): Promise<string | null> {
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(passage)}?translation=web`);
    if (!res.ok) return null;
    const data = await res.json();
    const text = String(data?.text || '').replace(/\s+/g, ' ').trim();
    return text || null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { sessionId, title, passage, focus } = (await request.json()) as {
      sessionId: string; title: string; passage: string; focus: string;
    };
    if (!sessionId || !/^[a-z]+-[a-z]+$/.test(sessionId) || !title || !passage || !focus) {
      return jsonResponse({ error: 'sessionId, title, passage, and focus are required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Cache hit → free and instant for everyone after the first request.
    const { data: cached } = await admin
      .from('discipleship_guides')
      .select('content')
      .eq('session_id', sessionId)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle();
    if (cached?.content) {
      return jsonResponse({ guide: cached.content, cached: true });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 503);

    const passageText = await fetchPassageText(passage);
    if (!passageText) {
      return jsonResponse({ error: `Could not load the passage text for ${passage}.` }, 502);
    }

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'You write discipleship conversation guides. Faithfulness to the passage, warmth, and practicality matter more than cleverness.',
          }],
        },
        contents: [{ parts: [{ text: buildPrompt({ title, passage, focus }, passageText) }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 900,
          responseMimeType: 'application/json',
          responseSchema: GUIDE_SCHEMA,
        },
      }),
    });
    const data = await res.json();
    await recordUsageEvent({
      provider: 'gemini',
      feature: 'discipleship-guide',
      status: res.status,
      request,
      metadata: { sessionId, passage, model: GEMINI_MODEL },
    });

    if (!res.ok) {
      return jsonResponse({
        error: res.status === 429
          ? 'Gemini is temporarily rate limited. Please try again shortly.'
          : `Guide generation failed with status ${res.status}.`,
        detail: data?.error?.message,
      }, res.status);
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let guide: { opener?: string; questions?: string[]; practice?: string };
    try {
      guide = JSON.parse(rawText);
    } catch {
      return jsonResponse({ error: 'Guide response was not valid JSON.' }, 502);
    }
    if (!guide?.opener || !Array.isArray(guide.questions) || guide.questions.length !== 3 || !guide.practice) {
      return jsonResponse({ error: 'Guide response was incomplete.' }, 502);
    }

    await admin.from('discipleship_guides').upsert({
      session_id: sessionId,
      prompt_version: PROMPT_VERSION,
      content: guide,
    });

    return jsonResponse({ guide, cached: false });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
