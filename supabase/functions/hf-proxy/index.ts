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

      // Text-To-Speech — returns base64 audio string
      if (task === 'tts') {
        const modelId = model || 'facebook/mms-tts-eng';
        const textPrompt = Array.isArray(prompt) ? prompt.join(' ') : prompt;

        try {
          // Try Hugging Face Serverless Inference API directly
          const hfUrl = `https://api-inference.huggingface.co/models/${modelId}`;
          const res = await fetch(hfUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: textPrompt }),
          });

          if (res.ok) {
            await recordUsageEvent({
              provider: 'huggingface',
              feature: 'tts',
              status: res.status,
              metadata: { model: modelId },
            });
            const arrayBuffer = await res.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let chunks = [];
            for (let i = 0; i < uint8.length; i += 8192) {
              chunks.push(String.fromCharCode.apply(null, uint8.subarray(i, i + 8192)));
            }
            const base64 = btoa(chunks.join(''));
            return jsonResponse({
              audio: base64,
              audioFormat: 'audio/flac',
              provider: 'huggingface',
              model: modelId
            });
          } else {
            console.warn(`Hugging Face TTS failed (status ${res.status}), trying Google Translate TTS fallback.`);
          }
        } catch (hfErr) {
          console.warn(`Hugging Face TTS error: ${(hfErr as Error).message}. Trying Google Translate TTS fallback.`);
        }

        // Fallback to Google Translate TTS
        const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textPrompt)}&tl=en&client=tw-ob`;
        const res = await fetch(googleUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
          },
        });
        await recordUsageEvent({
          provider: 'google-translate',
          feature: 'tts',
          status: res.status,
          metadata: { model: 'google-translate-tts-fallback' },
        });
        if (!res.ok) {
          const body = await res.text();
          return jsonResponse({ error: `Hugging Face and Google Translate TTS both failed. Google error ${res.status}: ${body}` }, res.status);
        }
        const arrayBuffer = await res.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let chunks = [];
        for (let i = 0; i < uint8.length; i += 8192) {
          chunks.push(String.fromCharCode.apply(null, uint8.subarray(i, i + 8192)));
        }
        const base64 = btoa(chunks.join(''));
        return jsonResponse({
          audio: base64,
          audioFormat: 'audio/mpeg',
          provider: 'google-translate',
          model: 'google-translate-tts-fallback'
        });
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
