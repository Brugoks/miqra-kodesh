import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';
import { InferenceClient } from 'https://esm.sh/@huggingface/inference@4.13.19';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.1-8b-instant';

const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference/models';
const HF_EMBED_MODEL = 'BAAI/bge-small-en-v1.5';
const HF_DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';
const TTS_CHUNK_LIMIT = 180;
const TTS_MAX_LENGTH = 6000;

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
    const { prompt, model, max_new_tokens = 512, provider = 'groq', task = 'chat', language = 'en' } = await request.json() as {
      prompt: string | string[];
      model?: string;
      max_new_tokens?: number;
      provider?: 'groq' | 'huggingface';
      task?: 'chat' | 'embed' | 'similarity' | 'tts';
      language?: string;
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
              tryHuggingFace = false;
            } catch (hfErr) {
              console.warn(`Hugging Face TTS error: ${(hfErr as Error).message}`);
              tryHuggingFace = false;
            }
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
