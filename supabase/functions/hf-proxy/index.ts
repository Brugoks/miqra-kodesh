import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

// Default model — Mistral 7B Instruct is reliable on the free HF tier
const DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { prompt, model, max_new_tokens = 512 } = await request.json() as {
      prompt: string;
      model?: string;
      max_new_tokens?: number;
    };

    if (!prompt) return jsonResponse({ error: 'prompt is required' }, 400);

    const hfToken = Deno.env.get('HF_TOKEN');
    if (!hfToken) return jsonResponse({ error: 'HF_TOKEN not configured' }, 503);

    const modelId = model || DEFAULT_MODEL;
    const url = `https://api-inference.huggingface.co/models/${modelId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens,
          temperature: 0.85,
          top_p: 0.92,
          do_sample: true,
          return_full_text: false,
        },
        options: {
          wait_for_model: true,  // wait through cold starts instead of 503
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return jsonResponse({ error: `HuggingFace error ${res.status}: ${body}` }, res.status);
    }

    const data = await res.json();
    // HF returns [{ generated_text: "..." }]
    const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
    return jsonResponse({ text: text?.trim() ?? '' });

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
