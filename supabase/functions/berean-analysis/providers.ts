// AI provider layer: Gemini (default), OpenRouter, and Groq, each with
// retry/backoff on transient failures, plus a fallback chain driven by env
// flags. Errors are typed (transient vs configuration) so callAi knows when
// falling back is worthwhile.

const GEMINI_MODEL = Deno.env.get('BEREAN_GEMINI_MODEL') || 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL =
  Deno.env.get('BEREAN_OPENROUTER_MODEL') || Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = Deno.env.get('BEREAN_GROQ_MODEL') || Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';
const AI_PROVIDER = (Deno.env.get('BEREAN_AI_PROVIDER') || 'gemini').toLowerCase();
const OPENROUTER_FALLBACK_ENABLED = Deno.env.get('BEREAN_OPENROUTER_FALLBACK_ENABLED') !== 'false';
const GROQ_FALLBACK_ENABLED = Deno.env.get('BEREAN_GROQ_FALLBACK_ENABLED') !== 'false';
const GEMINI_FALLBACK_ENABLED = Deno.env.get('BEREAN_GEMINI_FALLBACK_ENABLED') !== 'false';

const SYSTEM_PROMPT =
  'You are a careful, theologically humble Bible-study assistant helping church leaders examine teaching the way the Bereans did (Acts 17:11). Accuracy, source fidelity, and humility about uncertainty matter more than sounding confident. You annotate; the human leader decides.';

export type AiProvider = 'gemini' | 'openrouter' | 'groq';
export type AiResult = {
  parsed: any;
  usage: any;
  provider: AiProvider;
  model: string;
};

export class AiProviderError extends Error {
  provider: AiProvider;
  transient: boolean;
  configuration: boolean;
  status: number | null;

  constructor(
    provider: AiProvider,
    message: string,
    options: { transient?: boolean; configuration?: boolean; status?: number | null } = {},
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = provider;
    this.transient = Boolean(options.transient);
    this.configuration = Boolean(options.configuration);
    this.status = options.status ?? null;
  }
}

function paidOpenRouterModelsAllowed() {
  return Deno.env.get('OPENROUTER_ALLOW_PAID_MODELS') === 'true';
}

function isFreeOpenRouterModel(model: string) {
  return model === 'openrouter/free' || model.endsWith(':free');
}

function isFallbackCandidate(error: unknown) {
  return error instanceof AiProviderError && (error.transient || error.configuration);
}

export function aiModelLabel(result: Pick<AiResult, 'provider' | 'model'>) {
  return `${result.provider}:${result.model}`;
}

export function usageUnits(usage: any) {
  return Number(usage?.promptTokenCount ?? usage?.prompt_tokens ?? usage?.total_tokens) || 1;
}

export function parseJsonContent(text: string) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

async function callGemini(
  prompt: string,
  schema: Record<string, unknown>,
  maxOutputTokens: number,
): Promise<AiResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new AiProviderError('gemini', 'GEMINI_API_KEY not configured', { configuration: true, status: 503 });
  }
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* handled below */ }
    if (!response.ok) {
      const detail = data?.error?.message || `status ${response.status}`;
      const isTransient = response.status === 429 || response.status === 503
        || /high demand|rate limit|quota|try again/i.test(detail);
      if (isTransient && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (isTransient) {
        throw new AiProviderError(
          'gemini',
          'The AI review service is busy right now. Please wait a moment and try again.',
          { transient: true, status: response.status },
        );
      }
      const isConfiguration = response.status === 401 || response.status === 403
        || /api key|permission|disabled|not found/i.test(detail);
      throw new AiProviderError('gemini', `Gemini request failed: ${detail}`, {
        configuration: isConfiguration,
        status: response.status,
      });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    try {
      return {
        parsed: parseJsonContent(text),
        usage: data?.usageMetadata,
        provider: 'gemini',
        model: GEMINI_MODEL,
      };
    } catch {
      throw new AiProviderError(
        'gemini',
        'The AI review service returned an incomplete response. Please try again.',
        { transient: true },
      );
    }
  }
  throw new AiProviderError(
    'gemini',
    'The AI review service is busy right now. Please wait a moment and try again.',
    { transient: true, status: 503 },
  );
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function callOpenRouter(
  prompt: string,
  schema: Record<string, unknown>,
  maxOutputTokens: number,
  schemaName: string,
): Promise<AiResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new AiProviderError('openrouter', 'OPENROUTER_API_KEY not configured', {
      configuration: true,
      status: 503,
    });
  }
  let model = OPENROUTER_MODEL.trim();
  if (model === 'openrouter/free') {
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
          model = setting.value.trim();
        }
      } catch {
        // Fall back to OPENROUTER_MODEL
      }
    }
  }
  if (!isFreeOpenRouterModel(model) && !paidOpenRouterModelsAllowed()) {
    throw new AiProviderError(
      'openrouter',
      'Paid OpenRouter models are disabled. Use openrouter/free or a model ID ending in :free, or set OPENROUTER_ALLOW_PAID_MODELS=true.',
      { configuration: true, status: 400 },
    );
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: Math.min(maxOutputTokens, 4096),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: false,
        schema,
      },
    },
    plugins: [{ id: 'response-healing' }],
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('OPENROUTER_HTTP_REFERER') || 'http://localhost:5173',
        'X-Title': Deno.env.get('OPENROUTER_APP_TITLE') || 'Miqra Kodesh',
        'X-OpenRouter-Title': Deno.env.get('OPENROUTER_APP_TITLE') || 'Miqra Kodesh',
      },
      body,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* surfaced below */ }
    if (!response.ok) {
      const detail = data?.error?.message || raw || `status ${response.status}`;
      const isTransient = response.status === 429 || response.status === 503
        || /high demand|rate limit|quota|try again|overloaded/i.test(detail);
      if (isTransient && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (isTransient) {
        throw new AiProviderError(
          'openrouter',
          'The AI review service is busy right now. Please wait a moment and try again.',
          { transient: true, status: response.status },
        );
      }
      const isConfiguration = response.status === 401 || response.status === 403;
      const structuredOutputUnsupported = /response_format|json_schema|structured/i.test(detail);
      throw new AiProviderError(
        'openrouter',
        structuredOutputUnsupported
          ? `OpenRouter model ${model} does not support Berean's structured JSON output. Choose a model with structured output support.`
          : `OpenRouter request failed: ${detail}`,
        { configuration: structuredOutputUnsupported || isConfiguration, status: response.status },
      );
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content || '');
    try {
      return {
        parsed: parseJsonContent(text),
        usage: data?.usage,
        provider: 'openrouter',
        model: data?.model || model,
      };
    } catch {
      throw new AiProviderError(
        'openrouter',
        'The AI review service returned an incomplete response. Please try again.',
        { transient: true },
      );
    }
  }
  throw new AiProviderError(
    'openrouter',
    'The AI review service is busy right now. Please wait a moment and try again.',
    { transient: true, status: 503 },
  );
}

async function callGroq(
  prompt: string,
  schema: Record<string, unknown>,
  maxOutputTokens: number,
): Promise<AiResult> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new AiProviderError('groq', 'GROQ_API_KEY not configured', {
      configuration: true,
      status: 503,
    });
  }

  const model = GROQ_MODEL.trim();
  const schemaInstruction = `${prompt}

Return only valid JSON matching this schema:
${JSON.stringify(schema)}`;
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: schemaInstruction },
    ],
    temperature: 0.2,
    max_tokens: maxOutputTokens,
    response_format: { type: 'json_object' },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* surfaced below */ }
    if (!response.ok) {
      const detail = data?.error?.message || raw || `status ${response.status}`;
      const isTransient = response.status === 429 || response.status === 503
        || /rate limit|quota|try again|overloaded|service unavailable/i.test(detail);
      if (isTransient && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (isTransient) {
        throw new AiProviderError(
          'groq',
          'The AI review service is busy right now. Please wait a moment and try again.',
          { transient: true, status: response.status },
        );
      }
      const isConfiguration = response.status === 401 || response.status === 403;
      const structuredOutputUnsupported = /response_format|json_schema|structured|schema/i.test(detail);
      throw new AiProviderError(
        'groq',
        structuredOutputUnsupported
          ? `Groq model ${model} does not support Berean's structured JSON output. Choose a model with structured output support.`
          : `Groq request failed: ${detail}`,
        { configuration: structuredOutputUnsupported || isConfiguration, status: response.status },
      );
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content || '');
    try {
      return {
        parsed: parseJsonContent(text),
        usage: data?.usage,
        provider: 'groq',
        model: data?.model || model,
      };
    } catch {
      throw new AiProviderError(
        'groq',
        'The AI review service returned an incomplete response. Please try again.',
        { transient: true },
      );
    }
  }
  throw new AiProviderError(
    'groq',
    'The AI review service is busy right now. Please wait a moment and try again.',
    { transient: true, status: 503 },
  );
}

export async function callAi(
  prompt: string,
  schema: Record<string, unknown>,
  maxOutputTokens: number,
  schemaName: string,
): Promise<AiResult> {
  const primaryProvider: AiProvider = AI_PROVIDER === 'openrouter'
    ? 'openrouter'
    : AI_PROVIDER === 'groq'
      ? 'groq'
      : 'gemini';
  const providers: AiProvider[] = [primaryProvider];
  if (primaryProvider !== 'gemini' && GEMINI_FALLBACK_ENABLED) providers.push('gemini');
  if (primaryProvider !== 'openrouter' && OPENROUTER_FALLBACK_ENABLED) providers.push('openrouter');
  if (primaryProvider !== 'groq' && GROQ_FALLBACK_ENABLED) providers.push('groq');
  let primaryError: unknown = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      if (provider === 'openrouter') return await callOpenRouter(prompt, schema, maxOutputTokens, schemaName);
      if (provider === 'groq') return await callGroq(prompt, schema, maxOutputTokens);
      return await callGemini(prompt, schema, maxOutputTokens);
    } catch (error) {
      if (!primaryError) primaryError = error;
      const nextProvider = providers[index + 1];
      if (nextProvider && isFallbackCandidate(error)) continue;
      if (index > 0 && error instanceof AiProviderError && error.configuration && primaryError) {
        throw primaryError;
      }
      throw error;
    }
  }

  throw primaryError instanceof Error
    ? primaryError
    : new Error('The AI review service is unavailable right now. Please try again.');
}
