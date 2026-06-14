// Drains public.storage_gc_queue: removes orphaned Storage objects (e.g. images
// whose chat message was deleted) using the service role, then clears the rows.
// Invoked on a schedule by pg_cron (see migration 20260613180000_storage_gc.sql),
// authenticated by a shared token rather than a user JWT — deploy with
// `--no-verify-jwt`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const BATCH = 100;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expected = Deno.env.get('STORAGE_GC_TOKEN');
  if (!expected || request.headers.get('x-gc-token') !== expected) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supabase
    .from('storage_gc_queue')
    .select('id, bucket_id, object_path')
    .order('queued_at', { ascending: true })
    .limit(BATCH);

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!rows?.length) return jsonResponse({ removed: 0, remaining: 0 });

  // Group paths per bucket so we can remove in one call each.
  const byBucket: Record<string, { ids: number[]; paths: string[] }> = {};
  for (const r of rows) {
    (byBucket[r.bucket_id] ??= { ids: [], paths: [] });
    byBucket[r.bucket_id].ids.push(r.id);
    byBucket[r.bucket_id].paths.push(r.object_path);
  }

  let removed = 0;
  const drainedIds: number[] = [];
  for (const [bucket, { ids, paths }] of Object.entries(byBucket)) {
    // remove() ignores already-missing files; it only errors on a hard failure,
    // in which case we leave those rows queued for the next run to retry.
    const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
    if (rmErr) {
      console.error(`storage-gc: remove failed for ${bucket}: ${rmErr.message}`);
      continue;
    }
    removed += paths.length;
    drainedIds.push(...ids);
  }

  if (drainedIds.length) {
    await supabase.from('storage_gc_queue').delete().in('id', drainedIds);
  }

  return jsonResponse({ removed, processed: rows.length });
});
