import { describe, expect, it } from 'vitest';
import { imageGenerationErrorMessage } from './imageGenerationErrors';

const quotaBody = {
  error: 'All image providers failed',
  providerErrors: [
    {
      provider: 'cloudflare-ai',
      status: 429,
      error: 'Cloudflare AI error 429',
      detail: 'you have used up your daily free allocation of 10,000 neurons',
    },
    {
      provider: 'gemini',
      status: 429,
      error: 'Gemini image error 429',
      detail: 'Quota exceeded for metric: generate_content_free_tier_requests',
    },
    {
      provider: 'openrouter',
      status: 503,
      error: 'OpenRouter image fallback is disabled',
    },
  ],
};

describe('imageGenerationErrorMessage', () => {
  it('turns provider quota failures into a user-friendly retry message', async () => {
    await expect(imageGenerationErrorMessage({ data: quotaBody })).resolves.toBe(
      'Image generation quota exceeded. Please try again tomorrow, after the daily image quota resets. Details: Cloudflare AI: daily free quota used up; Gemini: quota or rate limit exceeded; OpenRouter: fallback disabled.'
    );
  });

  it('reads the structured body from a Supabase FunctionsHttpError response', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify(quotaBody), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    };

    const message = await imageGenerationErrorMessage({ error });

    expect(message).toContain('Image generation quota exceeded');
    expect(message).toContain('Please try again tomorrow');
    expect(message).toContain('Cloudflare AI: daily free quota used up');
  });

  it('keeps non-generic provider details for other failures', async () => {
    await expect(imageGenerationErrorMessage({
      data: { error: 'prompt is required' },
    })).resolves.toBe('prompt is required');
  });
});
