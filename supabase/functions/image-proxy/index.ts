import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Cloudflare Workers AI — FLUX.1 [schnell]: fast, high-quality text-to-image.
// Returns JSON { result: { image: "<base64 jpeg>" } }.
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const DEFAULT_OPENROUTER_IMAGE_MODEL = 'sourceful/riverflow-v2.5-fast';

type ImageProxyRequest = {
  prompt: string;
  steps?: number;
  seed?: number;
  size?: string;
  resolution?: string;
  aspectRatio?: string;
  outputFormat?: 'jpeg' | 'png' | 'webp';
  userId?: string | null;
  organizationId?: string | null;
};

class ImageProviderError extends Error {
  provider: string;
  status: number;
  detail?: string;

  constructor(provider: string, status: number, message: string, detail?: string) {
    super(message);
    this.provider = provider;
    this.status = status;
    this.detail = detail;
  }
}

function isEnabled(value: string | undefined | null) {
  return value === 'true' || value === '1';
}

function clampSteps(value: unknown) {
  const steps = Number(value);
  if (!Number.isFinite(steps)) return 6;
  return Math.min(Math.max(steps, 1), 8);
}

function paidOpenRouterImageModelsAllowed() {
  return isEnabled(Deno.env.get('OPENROUTER_ALLOW_PAID_IMAGE_MODELS'));
}

function paidGeminiImageModelsAllowed() {
  return isEnabled(Deno.env.get('GEMINI_ALLOW_PAID_IMAGE_MODELS'));
}

function isFreeOpenRouterModel(model: string) {
  return model === 'openrouter/free' || model.endsWith(':free');
}

function canUseOpenRouterImageModel(model: string) {
  return isFreeOpenRouterModel(model) || paidOpenRouterImageModelsAllowed();
}

function shouldTryFallback(error: ImageProviderError) {
  if (isEnabled(Deno.env.get('IMAGE_FALLBACK_ON_ANY_ERROR'))) return true;
  if ([402, 403, 429, 500, 502, 503, 504].includes(error.status)) return true;
  return /quota|limit|rate|credit|billing|capacity|temporarily|unavailable/i.test(`${error.message} ${error.detail ?? ''}`);
}

function normalizeImageDataUrl(base64: string, outputFormat?: string | null) {
  const format = outputFormat === 'png' || outputFormat === 'webp' ? outputFormat : 'jpeg';
  return `data:image/${format};base64,${base64}`;
}

function normalizeMimeImageDataUrl(base64: string, mimeType?: string | null) {
  const safeMimeType = typeof mimeType === 'string' && mimeType.startsWith('image/')
    ? mimeType
    : 'image/png';
  return `data:${safeMimeType};base64,${base64}`;
}

async function generateWithCloudflare(body: ImageProxyRequest) {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!accountId || !token) {
    throw new ImageProviderError('cloudflare-ai', 503, 'Cloudflare credentials not configured');
  }

  const steps = clampSteps(body.steps);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // schnell supports up to 8 steps; clamp to be safe. Its input schema accepts
    // ONLY prompt + steps — Cloudflare now hard-rejects anything else ("Additional
    // or unevaluated properties '/seed' at '/' not allowed"), so `seed` must not be
    // forwarded here even though callers still send it (OpenRouter accepts it).
    // Losing the seed costs nothing: flux-schnell randomizes per call, so Regenerate
    // still yields a different image.
    body: JSON.stringify({ prompt: body.prompt, steps }),
  });

  const data = await res.json().catch(() => null);
  await recordUsageEvent({
    provider: 'cloudflare-ai',
    feature: 'text-to-image',
    status: res.status,
    units: 1,
    organizationId: body.organizationId ?? null,
    userId: body.userId ?? null,
    metadata: { model: CF_MODEL, steps },
  });

  if (!res.ok || !data?.success || !data?.result?.image) {
    const detail = data?.errors?.[0]?.message || JSON.stringify(data)?.slice(0, 400) || 'unknown';
    throw new ImageProviderError('cloudflare-ai', res.ok ? 502 : res.status, `Cloudflare AI error ${res.status}`, detail);
  }

  // result.image is base64-encoded JPEG.
  return {
    image: normalizeImageDataUrl(data.result.image, 'jpeg'),
    model: CF_MODEL,
    provider: 'cloudflare-ai',
  };
}

async function generateWithGemini(body: ImageProxyRequest) {
  if (!isEnabled(Deno.env.get('GEMINI_IMAGE_FALLBACK_ENABLED'))) {
    throw new ImageProviderError('gemini', 503, 'Gemini image fallback is disabled');
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) {
    throw new ImageProviderError('gemini', 503, 'GEMINI_API_KEY not configured');
  }

  const model = Deno.env.get('GEMINI_IMAGE_MODEL')?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
  if (!paidGeminiImageModelsAllowed()) {
    throw new ImageProviderError(
      'gemini',
      402,
      'Paid Gemini image models are disabled',
      'Gemini image generation is not currently free-tier free. Set GEMINI_ALLOW_PAID_IMAGE_MODELS=true only if you want to allow paid Gemini image fallback.'
    );
  }

  const res = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: body.prompt },
      ],
    }),
  });

  const responseText = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    // Provider response is surfaced below as detail.
  }

  const usage = data?.usageMetadata || data?.usage || null;
  await recordUsageEvent({
    provider: 'gemini',
    feature: 'text-to-image',
    status: res.status,
    units: Number(usage?.totalTokenCount || usage?.total_tokens) || 1,
    organizationId: body.organizationId ?? null,
    userId: body.userId ?? null,
    metadata: {
      model,
      promptTokens: usage?.promptTokenCount ?? usage?.prompt_tokens ?? null,
      responseTokens: usage?.candidatesTokenCount ?? usage?.completion_tokens ?? null,
      totalTokens: usage?.totalTokenCount ?? usage?.total_tokens ?? null,
    },
  });

  if (!res.ok) {
    const detail = data?.error?.message || responseText;
    throw new ImageProviderError('gemini', res.status, `Gemini image error ${res.status}`, detail);
  }

  const outputImage = data?.output_image || data?.outputImage;
  const imageData = outputImage?.data || outputImage?.inlineData?.data;
  const mimeType = outputImage?.mime_type || outputImage?.mimeType || outputImage?.inlineData?.mimeType;

  if (!imageData) {
    throw new ImageProviderError('gemini', 502, 'Gemini returned no image', responseText.slice(0, 400));
  }

  return {
    image: normalizeMimeImageDataUrl(imageData, mimeType),
    model,
    provider: 'gemini',
    usage,
  };
}

async function generateWithOpenRouter(body: ImageProxyRequest) {
  if (!isEnabled(Deno.env.get('OPENROUTER_IMAGE_FALLBACK_ENABLED'))) {
    throw new ImageProviderError('openrouter', 503, 'OpenRouter image fallback is disabled');
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new ImageProviderError('openrouter', 503, 'OPENROUTER_API_KEY not configured');
  }

  const model = Deno.env.get('OPENROUTER_IMAGE_MODEL')?.trim() || DEFAULT_OPENROUTER_IMAGE_MODEL;
  if (!canUseOpenRouterImageModel(model)) {
    throw new ImageProviderError(
      'openrouter',
      402,
      'Paid OpenRouter image models are disabled',
      'Set OPENROUTER_IMAGE_MODEL to a free model or set OPENROUTER_ALLOW_PAID_IMAGE_MODELS=true.'
    );
  }

  const outputFormat = body.outputFormat || 'jpeg';
  const payload: Record<string, unknown> = {
    model,
    prompt: body.prompt,
    n: 1,
    output_format: outputFormat,
  };
  if (body.size) payload.size = body.size;
  if (body.resolution) payload.resolution = body.resolution;
  if (body.aspectRatio) payload.aspect_ratio = body.aspectRatio;
  if (typeof body.seed === 'number') payload.seed = body.seed;

  const res = await fetch(OPENROUTER_IMAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('OPENROUTER_HTTP_REFERER') || 'http://localhost:5173',
      'X-Title': Deno.env.get('OPENROUTER_APP_TITLE') || 'Miqra Kodesh',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    // Provider response is surfaced below as detail.
  }

  await recordUsageEvent({
    provider: 'openrouter',
    feature: 'text-to-image',
    status: res.status,
    units: Number(data?.usage?.total_tokens) || 1,
    organizationId: body.organizationId ?? null,
    userId: body.userId ?? null,
    metadata: {
      model,
      cost: data?.usage?.cost ?? null,
      promptTokens: data?.usage?.prompt_tokens ?? null,
      completionTokens: data?.usage?.completion_tokens ?? null,
      totalTokens: data?.usage?.total_tokens ?? null,
    },
  });

  if (!res.ok) {
    throw new ImageProviderError('openrouter', res.status, `OpenRouter image error ${res.status}`, data?.error?.message ?? responseText);
  }

  const firstImage = data?.data?.[0];
  if (!firstImage?.b64_json) {
    throw new ImageProviderError('openrouter', 502, 'OpenRouter returned no image', responseText.slice(0, 400));
  }

  return {
    image: normalizeImageDataUrl(firstImage.b64_json, outputFormat),
    model: data?.model || model,
    provider: 'openrouter',
    usage: data?.usage ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as ImageProxyRequest;
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return jsonResponse({ error: 'prompt is required' }, 400);
    }

    try {
      return jsonResponse(await generateWithCloudflare(body));
    } catch (err) {
      const cloudflareError = err instanceof ImageProviderError
        ? err
        : new ImageProviderError('cloudflare-ai', 500, (err as Error).message);

      if (!shouldTryFallback(cloudflareError)) {
        return jsonResponse({
          error: cloudflareError.message,
          detail: cloudflareError.detail,
          provider: cloudflareError.provider,
        }, cloudflareError.status);
      }

      const providerErrors = [
        {
          provider: cloudflareError.provider,
          status: cloudflareError.status,
          error: cloudflareError.message,
          detail: cloudflareError.detail,
        },
      ];

      try {
        const fallbackResult = await generateWithGemini(body);
        return jsonResponse({
          ...fallbackResult,
          fallbackFrom: {
            provider: cloudflareError.provider,
            status: cloudflareError.status,
            error: cloudflareError.message,
            detail: cloudflareError.detail,
          },
        });
      } catch (geminiErr) {
        const geminiError = geminiErr instanceof ImageProviderError
          ? geminiErr
          : new ImageProviderError('gemini', 500, (geminiErr as Error).message);
        providerErrors.push({
          provider: geminiError.provider,
          status: geminiError.status,
          error: geminiError.message,
          detail: geminiError.detail,
        });

        try {
          const fallbackResult = await generateWithOpenRouter(body);
          return jsonResponse({
            ...fallbackResult,
            fallbackFrom: {
              provider: cloudflareError.provider,
              status: cloudflareError.status,
              error: cloudflareError.message,
              detail: cloudflareError.detail,
            },
          });
        } catch (fallbackErr) {
          const openRouterError = fallbackErr instanceof ImageProviderError
            ? fallbackErr
            : new ImageProviderError('openrouter', 500, (fallbackErr as Error).message);
          providerErrors.push({
            provider: openRouterError.provider,
            status: openRouterError.status,
            error: openRouterError.message,
            detail: openRouterError.detail,
          });

          const hasPaymentGuard = providerErrors.some((providerError) => providerError.status === 402);
          return jsonResponse({
            error: 'All image providers failed',
            detail: openRouterError.detail || geminiError.detail || cloudflareError.detail,
            providerErrors,
          }, hasPaymentGuard ? 402 : 502);
        }
      }
    }
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
