import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type OpenRouterRequest = {
  prompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  feature?: string;
  userId?: string | null;
  organizationId?: string | null;
  temperature?: number;
  maxTokens?: number;
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_SYSTEM =
  'You are a careful Bible-study assistant. Be concise, humble about uncertainty, and avoid unsupported claims.';

function paidModelsAllowed() {
  return Deno.env.get('OPENROUTER_ALLOW_PAID_MODELS') === 'true';
}

function isFreeModel(model: string) {
  return model === 'openrouter/free' || model.endsWith(':free');
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await request.json()) as OpenRouterRequest;
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'OPENROUTER_API_KEY not configured' }, 503);

    let requestedModel = body.model?.trim();
    if (!requestedModel || requestedModel === DEFAULT_MODEL) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        try {
          const admin = createClient(supabaseUrl, serviceKey);
          const { data: setting } = await admin
            .from('app_ai_settings')
            .select('value')
            .eq('key', 'openrouter_model')
            .maybeSingle();
          if (setting?.value) {
            requestedModel = setting.value;
          }
        } catch {
          // Fall back to DEFAULT_MODEL if table not available yet
        }
      }
    }
    const model = requestedModel || DEFAULT_MODEL;
    if (!isFreeModel(model) && !paidModelsAllowed()) {
      return jsonResponse({
        error: 'Paid OpenRouter models are disabled. Use openrouter/free or a model ID ending in :free.',
        requestedModel: model,
      }, 400);
    }

    const messages = body.messages?.length
      ? body.messages
      : [
          { role: 'system' as const, content: DEFAULT_SYSTEM },
          { role: 'user' as const, content: body.prompt?.trim() || '' },
        ];

    if (!messages.some((message) => message.role === 'user' && message.content.trim())) {
      return jsonResponse({ error: 'prompt or messages with user content is required' }, 400);
    }

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('OPENROUTER_HTTP_REFERER') || 'http://localhost:5173',
        'X-Title': Deno.env.get('OPENROUTER_APP_TITLE') || 'Miqra Kodesh',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: clampNumber(body.temperature, 0.3, 0, 1.5),
        max_tokens: clampNumber(body.maxTokens, 900, 1, 2000),
      }),
    });

    const responseText = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Provider response is surfaced below as detail.
    }

    await recordUsageEvent({
      provider: 'openrouter',
      feature: body.feature || 'chat-completion',
      status: response.status,
      units: Number(data?.usage?.prompt_tokens) || 1,
      organizationId: body.organizationId ?? null,
      userId: body.userId ?? null,
      metadata: {
        model,
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });

    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : null;
      const friendly = response.status === 429
        ? 'OpenRouter is rate limited right now. Please wait a bit before trying again.'
        : `OpenRouter responded with ${response.status}`;
      return jsonResponse({
        error: friendly,
        retryAfterSeconds,
        detail: data?.error?.message ?? responseText,
      }, response.status);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) return jsonResponse({ error: 'No content returned from OpenRouter' }, 500);

    return jsonResponse({
      content,
      model: data?.model || model,
      usage: data?.usage ?? null,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
