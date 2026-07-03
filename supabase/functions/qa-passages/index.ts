// Q&R scripture exploration and leaders-only answer draft assist.
// Passage suggestions are generated once per question/source hash and cached.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PROMPT_VERSION = 'qa-passages-v1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LEADER_ROLES = ['developer', 'admin', 'leader', 'student_leader', 'parent_leader'];

const PASSAGES_SCHEMA = {
  type: 'object',
  properties: {
    passages: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['reference', 'why'],
      },
    },
  },
  required: ['passages'],
};

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    draft: { type: 'string' },
    passages: PASSAGES_SCHEMA.properties.passages,
  },
  required: ['draft', 'passages'],
};

async function hashSource(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildPassagePrompt(question: { title: string; body: string | null }) {
  return [
    'Suggest 2 to 4 Bible passages that would help someone study this church Q&R question.',
    'Use canonical book names and readable references like "John 3:16-18".',
    'For each passage, include a brief why note in no more than two sentences.',
    'This is a starting point for study, not an authoritative answer.',
    '',
    `Question: ${question.title}`,
    question.body ? `Details: ${question.body}` : '',
  ].filter(Boolean).join('\n');
}

function buildDraftPrompt(question: { title: string; body: string | null }) {
  return [
    'Write a short pastoral starting draft for a church leader answering this Q&R question.',
    'Use warm, humble language. Do not overclaim. Do not shame the asker.',
    'Keep the draft to 3 or 4 sentences and include plain Bible references where helpful.',
    'Also suggest 2 to 4 passages with one-line why notes using canonical references like "John 3:16-18".',
    '',
    `Question: ${question.title}`,
    question.body ? `Details: ${question.body}` : '',
  ].filter(Boolean).join('\n');
}

async function callGemini(prompt: string, schema: Record<string, unknown>, feature: string, request: Request) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return { error: jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 503) };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: 'You help church members study Scripture carefully. Be concise, pastoral, and grounded.',
        }],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  const data = await res.json();
  await recordUsageEvent({
    provider: 'gemini',
    feature,
    status: res.status,
    request,
    metadata: { model: GEMINI_MODEL },
  });

  if (!res.ok) {
    return {
      error: jsonResponse({
        error: res.status === 429
          ? 'Gemini is temporarily rate limited. Please try again shortly.'
          : `Gemini request failed with status ${res.status}.`,
        detail: data?.error?.message,
      }, res.status),
    };
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    return { data: JSON.parse(rawText) };
  } catch {
    return { error: jsonResponse({ error: 'Gemini response was not valid JSON.' }, 502) };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { questionId, task = 'passages' } = (await request.json()) as {
      questionId?: string;
      task?: 'passages' | 'draft';
    };
    if (!questionId) return jsonResponse({ error: 'questionId is required' }, 400);

    const authHeader = request.headers.get('Authorization') || '';
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: question, error: questionError } = await admin
      .from('qa_questions')
      .select('id, organization_id, title, body')
      .eq('id', questionId)
      .maybeSingle();
    if (questionError) return jsonResponse({ error: questionError.message }, 500);
    if (!question) return jsonResponse({ error: 'Question not found' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = profile?.role || 'student';

    if (role !== 'developer') {
      const { data: membership } = await admin
        .from('profile_organizations')
        .select('profile_id')
        .eq('profile_id', user.id)
        .eq('organization_id', question.organization_id)
        .maybeSingle();
      if (!membership) return jsonResponse({ error: 'You can only use this for your organization.' }, 403);
    }

    if (task === 'draft' && !LEADER_ROLES.includes(role)) {
      return jsonResponse({ error: 'Leader role required' }, 403);
    }

    const sourceHash = await hashSource(`${question.title}\n${question.body || ''}`);

    if (task === 'passages') {
      const { data: cached } = await admin
        .from('qa_passage_suggestions')
        .select('content')
        .eq('question_id', question.id)
        .eq('prompt_version', PROMPT_VERSION)
        .eq('source_hash', sourceHash)
        .maybeSingle();
      if (cached?.content) return jsonResponse({ passages: cached.content.passages || [], cached: true });

      const generated = await callGemini(buildPassagePrompt(question), PASSAGES_SCHEMA, 'qa-passages', request);
      if (generated.error) return generated.error;
      const content = generated.data as { passages?: Array<{ reference: string; why: string }> };
      if (!Array.isArray(content.passages) || content.passages.length < 2) {
        return jsonResponse({ error: 'Passage response was incomplete.' }, 502);
      }

      await admin.from('qa_passage_suggestions').upsert({
        question_id: question.id,
        prompt_version: PROMPT_VERSION,
        source_hash: sourceHash,
        content,
        created_at: new Date().toISOString(),
      });

      return jsonResponse({ passages: content.passages, cached: false });
    }

    const generated = await callGemini(buildDraftPrompt(question), DRAFT_SCHEMA, 'qa-draft', request);
    if (generated.error) return generated.error;
    const content = generated.data as { draft?: string; passages?: Array<{ reference: string; why: string }> };
    if (!content.draft || !Array.isArray(content.passages)) {
      return jsonResponse({ error: 'Draft response was incomplete.' }, 502);
    }

    return jsonResponse({ draft: content.draft, passages: content.passages, cached: false });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
