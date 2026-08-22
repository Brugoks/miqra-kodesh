import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';
import { InferenceClient } from 'https://esm.sh/@huggingface/inference@4.13.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.1-8b-instant was decommissioned 2026-08-16. Env-overridable so the
// next decommission is a `supabase secrets set` instead of a redeploy.
// HF_PROXY_GROQ_MODEL scopes an override to this function; GROQ_MODEL is the
// shared default (berean-analysis reads it too, via BEREAN_GROQ_MODEL first).
const GROQ_DEFAULT_MODEL = Deno.env.get('HF_PROXY_GROQ_MODEL')
  || Deno.env.get('GROQ_MODEL')
  || 'llama-3.3-70b-versatile';

const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference/models';
const HF_EMBED_MODEL = 'BAAI/bge-small-en-v1.5';
const HF_DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';
const TTS_CHUNK_LIMIT = 180;
const TTS_MAX_LENGTH = 6000;
const HF_FREE_MONTHLY_CREDIT_USD = 0.10;
const HF_PRO_MONTHLY_CREDIT_USD = 2.00;

type AudioClip = {
  audio: string;
  audioFormat: string;
  provider: 'huggingface' | 'google-translate';
};

function arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

function splitTtsText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > TTS_CHUNK_LIMIT) {
    const candidate = remaining.slice(0, TTS_CHUNK_LIMIT + 1);
    const sentenceBreak = Math.max(
      candidate.lastIndexOf('. '),
      candidate.lastIndexOf('? '),
      candidate.lastIndexOf('! '),
      candidate.lastIndexOf('; '),
    );
    const wordBreak = candidate.lastIndexOf(' ');
    const splitAt = sentenceBreak >= Math.floor(TTS_CHUNK_LIMIT * 0.55)
      ? sentenceBreak + 1
      : (wordBreak > 0 ? wordBreak : TTS_CHUNK_LIMIT);

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function requireDeveloper(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  const userClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: isDeveloper, error } = await userClient.rpc('is_developer');
  if (error || !isDeveloper) throw new Error('Developer role required');
}

async function getHuggingFaceBillingUsage(request: Request, hfToken: string) {
  await requireDeveloper(request);

  const whoamiResponse = await fetch('https://huggingface.co/api/whoami-v2', {
    headers: { Authorization: `Bearer ${hfToken}` },
  });
  if (!whoamiResponse.ok) {
    return jsonResponse({ error: 'Could not load Hugging Face account information' }, 502);
  }
  const account = await whoamiResponse.json();

  const now = new Date();
  const startDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
  ));
  const usageResponse = await fetch(
    'https://huggingface.co/api/settings/billing/usage-by-inference-session'
      + `?startDate=${encodeURIComponent(startDate.toISOString())}`
      + `&endDate=${encodeURIComponent(now.toISOString())}`,
    { headers: { Authorization: `Bearer ${hfToken}` } },
  );
  if (!usageResponse.ok) {
    const detail = await usageResponse.text();
    return jsonResponse({
      error: 'Could not load Hugging Face billing usage',
      detail: detail.slice(0, 500),
    }, usageResponse.status);
  }

  const usage = await usageResponse.json();
  const sessions = (usage?.periods || []).flatMap(
    (period: { sessions?: Array<{ requestCount?: number; costCents?: number }> }) =>
      period.sessions || [],
  );
  const spentUsd = sessions.reduce(
    (sum: number, session: { costCents?: number }) =>
      sum + Number(session.costCents || 0),
    0,
  ) / 100;
  const billedRequests = sessions.reduce(
    (sum: number, session: { requestCount?: number }) =>
      sum + Number(session.requestCount || 0),
    0,
  );
  const monthlyCreditUsd = account?.isPro
    ? HF_PRO_MONTHLY_CREDIT_USD
    : HF_FREE_MONTHLY_CREDIT_USD;

  return jsonResponse({
    plan: account?.isPro ? 'pro' : 'free',
    spentUsd,
    monthlyCreditUsd,
    remainingUsd: Math.max(0, monthlyCreditUsd - spentUsd),
    billedRequests,
    periodStart: startDate.toISOString(),
    periodEnd: now.toISOString(),
  });
}

async function fetchAudio(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';

  if (!response.ok) {
    return { response, contentType, buffer: null, detail: await response.text() };
  }

  const buffer = await response.arrayBuffer();
  const looksLikeAudio = contentType.startsWith('audio/')
    || contentType === 'application/octet-stream';

  if (!looksLikeAudio || buffer.byteLength === 0) {
    const detail = new TextDecoder().decode(buffer).slice(0, 500);
    return { response, contentType, buffer: null, detail };
  }

  return { response, contentType, buffer, detail: '' };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const {
      prompt,
      model,
      max_new_tokens = 512,
      provider = 'groq',
      task = 'chat',
      language = 'en',
      allow_fallback = true,
    } = await request.json() as {
      prompt?: string | string[];
      model?: string;
      max_new_tokens?: number;
      provider?: 'groq' | 'huggingface';
      task?: 'chat' | 'embed' | 'similarity' | 'tts' | 'billing';
      language?: string;
      allow_fallback?: boolean;
    };

    if (provider === 'huggingface' && task === 'billing') {
      const hfToken = Deno.env.get('HF_TOKEN');
      if (!hfToken) return jsonResponse({ error: 'HF_TOKEN not configured' }, 503);
      return await getHuggingFaceBillingUsage(request, hfToken);
    }

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
          request,
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
        const modelId = model || 'hexgrad/Kokoro-82M';
        const textPrompt = Array.isArray(prompt) ? prompt.join(' ') : prompt;

        if (textPrompt.length > TTS_MAX_LENGTH) {
          return jsonResponse({ error: `TTS text must be ${TTS_MAX_LENGTH} characters or fewer` }, 400);
        }
        if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language)) {
          return jsonResponse({ error: 'Invalid TTS language code' }, 400);
        }

        const textChunks = splitTtsText(textPrompt);
        if (!textChunks.length) return jsonResponse({ error: 'prompt is required' }, 400);

        const clips: AudioClip[] = [];
        let tryHuggingFace = true;
        let huggingFaceError = '';
        const hf = new InferenceClient(hfToken);

        for (const chunk of textChunks) {
          if (tryHuggingFace) {
            try {
              const audioBlob = await hf.textToSpeech({
                model: modelId,
                inputs: chunk,
                provider: 'auto',
              });

              await recordUsageEvent({
                provider: 'huggingface',
                feature: 'tts',
                status: 200,
                request,
                metadata: { model: modelId },
              });

              if (audioBlob.size > 0) {
                clips.push({
                  audio: arrayBufferToBase64(await audioBlob.arrayBuffer()),
                  audioFormat: audioBlob.type || 'audio/wav',
                  provider: 'huggingface',
                });
                continue;
              }

              console.warn('Hugging Face TTS returned an empty audio response.');
              huggingFaceError = 'Hugging Face returned an empty audio response';
              tryHuggingFace = false;
            } catch (hfErr) {
              huggingFaceError = (hfErr as Error).message;
              console.warn(`Hugging Face TTS error: ${huggingFaceError}`);
              const errorStatus = Number(
                (hfErr as { response?: { status?: number }; status?: number })?.response?.status
                ?? (hfErr as { httpResponse?: { status?: number } })?.httpResponse?.status
                ?? (hfErr as { status?: number })?.status
              );
              const messageStatus = Number.parseInt(
                huggingFaceError.match(/\b(?:status|error)?\s*(4\d{2}|5\d{2})\b/i)?.[1] || '',
                10,
              );
              const status = Number.isFinite(errorStatus)
                ? errorStatus
                : (Number.isFinite(messageStatus) ? messageStatus : 500);
              await recordUsageEvent({
                provider: 'huggingface',
                feature: 'tts',
                status,
                request,
                metadata: {
                  model: modelId,
                  error: huggingFaceError.slice(0, 500),
                  creditExhausted: status === 402
                    || /credit|quota|billing|payment required/i.test(huggingFaceError),
                },
              });
              tryHuggingFace = false;
            }
          }

          if (!allow_fallback) {
            return jsonResponse({
              error: `Hugging Face TTS failed: ${huggingFaceError || 'provider unavailable'}`,
              provider: 'huggingface',
              model: modelId,
              unavailable: true,
            });
          }

          const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(language)}&client=tw-ob`;
          const googleResult = await fetchAudio(googleUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
              Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1',
            },
          });

          await recordUsageEvent({
            provider: 'google-translate',
            feature: 'tts',
            status: googleResult.response.status,
            request,
            metadata: { language, model: 'google-translate-tts-fallback' },
          });

          if (!googleResult.buffer) {
            return jsonResponse({
              error: `TTS failed for both providers. Google returned ${googleResult.response.status}: ${googleResult.detail.slice(0, 500)}`,
            }, 502);
          }

          clips.push({
            audio: arrayBufferToBase64(googleResult.buffer),
            audioFormat: googleResult.contentType || 'audio/mpeg',
            provider: 'google-translate',
          });
        }

        const providers = [...new Set(clips.map((clip) => clip.provider))];
        return jsonResponse({
          // Keep the original single-clip fields for older clients.
          audio: clips[0].audio,
          audioFormat: clips[0].audioFormat,
          clips,
          provider: providers.length === 1 ? providers[0] : 'mixed',
          model: providers.includes('huggingface') ? modelId : 'google-translate-tts-fallback',
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
          request,
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
        request,
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
      request,
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
