// Read-through cache for deterministic AI responses, backed by the
// ai_response_cache table. Cache keys should embed the model and prompt
// version so upgrades invalidate old entries; a weekly cron prunes rows
// older than 90 days. Failures are swallowed — a broken cache must never
// break the feature, it just costs one extra provider call.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function getCachedAiResponse<T>(cacheKey: string): Promise<T | null> {
  try {
    const { data } = await adminClient()
      .from('ai_response_cache')
      .select('payload')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    return (data?.payload as T) ?? null;
  } catch {
    return null;
  }
}

export async function putCachedAiResponse(cacheKey: string, payload: unknown): Promise<void> {
  try {
    await adminClient().from('ai_response_cache').upsert({
      cache_key: cacheKey,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort; the response was already produced.
  }
}
