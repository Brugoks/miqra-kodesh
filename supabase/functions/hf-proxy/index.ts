import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.1-8b-instant';

const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference/models';
const HF_EMBED_MODEL = 'BAAI/bge-small-en-v1.5';
const HF_DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { prompt, model, max_new_tokens = 512, provider = 'groq', task = 'chat' } = await request.json() as {
      prompt: string | string[];
      model?: string;
      max_new_tokens?: number;
      provider?: 'groq' | 'huggingface';
      task?: 'chat' | 'embed' | 'similarity';
    };

    if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400);

    // ── HuggingFace Inference Providers ──────────────────────────────────────
    if (provider === 'huggingface') {
      const hfToken = Deno.env.get('HF_TOKEN');
      if (!hfToken) return jsonResponse({ error: 'HF_TOKEN not configured' }, 503);

      // Embeddings — returns a float[] vector per input string
      if (task === 'embed') {
        const modelId = model || HF_EMBED_MODEL;
        const res = await fetch(`${HF_ROUTER_BASE}/${modelId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: prompt }),
        });
        await recordUsageEvent({
          provider: 'huggingface',
          feature: 'embed',
          status: res.status,
          units: Array.isArray(prompt) ? prompt.length : 1,
          metadata: { model: modelId },
        });
        if (!res.ok) {
          const body = await res.text();
          return jsonResponse({ error: `HuggingFace embed error ${res.status}: ${body}` }, res.status);
        }
        const embedding = await res.json();
        return jsonResponse({ embedding, provider: 'huggingface', model: modelId });
      }

      // Sentence similarity — returns similarity scores
      if (task === 'similarity') {
        const modelId = model || 'sentence-transformers/all-MiniLM-L6-v2';
        const res = await fetch(`${HF_ROUTER_BASE}/${modelId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: prompt }),
        });
        await recordUsageEvent({
          provider: 'huggingface',
          feature: 'similarity',
          status: res.status,
          metadata: { model: modelId },
        });
        if (!res.ok) {
          const body = await res.text();
          return jsonResponse({ error: `HuggingFace similarity error ${res.status}: ${body}` }, res.status);
        }
        const scores = await res.json();
        return jsonResponse({ scores, provider: 'huggingface', model: modelId });
      }

      // Chat completions via HF
      const modelId = model || HF_DEFAULT_MODEL;
      const res = await fetch(`${HF_ROUTER_BASE}/${modelId}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: max_new_tokens,
          temperature: 0.85,
        }),
      });
      await recordUsageEvent({
        provider: 'huggingface',
        feature: 'chat',
        status: res.status,
        metadata: { model: modelId, max_new_tokens },
      });
      if (!res.ok) {
        const body = await res.text();
        return jsonResponse({ error: `HuggingFace error ${res.status}: ${body}` }, res.status);
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      return jsonResponse({ text: text?.trim() ?? '', provider: 'huggingface' });
    }

    // ── Groq (default) ───────────────────────────────────────────────────────
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) return jsonResponse({ error: 'GROQ_API_KEY not configured' }, 503);

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || GROQ_DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: max_new_tokens,
        temperature: 0.85,
        top_p: 0.92,
      }),
    });
    await recordUsageEvent({
      provider: 'groq',
      feature: 'chat',
      status: res.status,
      metadata: { model: model || GROQ_DEFAULT_MODEL, max_new_tokens },
    });

    if (!res.ok) {
      const body = await res.text();
      return jsonResponse({ error: `Groq error ${res.status}: ${body}` }, res.status);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return jsonResponse({ text: text?.trim() ?? '', provider: 'groq' });

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
