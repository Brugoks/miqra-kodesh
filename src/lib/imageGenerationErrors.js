const GENERIC_EDGE_ERROR = 'Edge Function returned a non-2xx status code';

const PROVIDER_LABELS = {
  'cloudflare-ai': 'Cloudflare AI',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

const quotaPattern = /quota|rate.?limit|too many requests|free allocation|neurons|credit|billing|capacity|limit exceeded/i;

const providerLabel = (provider) => PROVIDER_LABELS[provider] || provider || 'Image provider';

const textForProviderError = (providerError = {}) => [
  providerError.error,
  providerError.detail,
  providerError.status ? String(providerError.status) : '',
].filter(Boolean).join(' ');

const isQuotaError = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return quotaPattern.test(value);
  if (value.status === 429) return true;
  return quotaPattern.test(textForProviderError(value));
};

const isPaidGuardError = (value) => {
  if (!value) return false;
  const text = typeof value === 'string' ? value : textForProviderError(value);
  return value.status === 402 || /paid|billing|payment/i.test(text);
};

const truncate = (value, max = 120) => {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const summarizeProviderError = (providerError = {}) => {
  const label = providerLabel(providerError.provider);
  const text = textForProviderError(providerError);

  if (providerError.provider === 'cloudflare-ai' && /free allocation|neurons/i.test(text)) {
    return `${label}: daily free quota used up`;
  }
  if (isQuotaError(providerError)) {
    return `${label}: quota or rate limit exceeded`;
  }
  if (/fallback is disabled|disabled/i.test(text)) {
    return `${label}: fallback disabled`;
  }
  if (isPaidGuardError(providerError)) {
    return `${label}: paid image model not enabled`;
  }
  if (providerError.status >= 500) {
    return `${label}: provider unavailable`;
  }

  return `${label}: ${truncate(providerError.detail || providerError.error || `HTTP ${providerError.status || 'error'}`)}`;
};

async function readFunctionErrorBody(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return null;

  try {
    const cloned = response.clone();
    const contentType = cloned.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) return await cloned.json();

    const text = await cloned.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  } catch {
    return null;
  }
}

export async function imageGenerationErrorMessage({ data, error, fallbackMessage } = {}) {
  const body = data?.error || data?.detail || data?.providerErrors
    ? data
    : await readFunctionErrorBody(error);
  const providerErrors = Array.isArray(body?.providerErrors) ? body.providerErrors : [];
  const details = providerErrors.map(summarizeProviderError).filter(Boolean);
  const detailText = details.length ? ` Details: ${[...new Set(details)].join('; ')}.` : '';
  const combinedText = [
    body?.error,
    body?.detail,
    error?.message,
    ...providerErrors.flatMap((providerError) => [providerError.error, providerError.detail]),
  ].filter(Boolean).join(' ');

  if (providerErrors.some(isQuotaError) || isQuotaError(combinedText)) {
    return `Image generation quota exceeded. Please try again tomorrow, after the daily image quota resets.${detailText}`;
  }

  if (providerErrors.some(isPaidGuardError) || isPaidGuardError(combinedText)) {
    return `Image generation needs a paid image provider to continue. Please try again tomorrow or enable a paid fallback provider.${detailText}`;
  }

  if (details.length) {
    return `Image generation failed.${detailText}`;
  }

  const message = body?.detail || body?.error || error?.message;
  if (message && message !== GENERIC_EDGE_ERROR) return truncate(message, 240);
  return fallbackMessage || 'Could not generate an image. Please try again.';
}
