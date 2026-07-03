// Daily discipleship check-in nudges. For every active relationship, each
// side is due when their last check-in (or the relationship start) is older
// than the cadence. Nudges are stamped per side so nobody gets nagged more
// than once per cadence window. Invoked by pg_cron daily at 15:00 UTC.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DAY_MS = 24 * 60 * 60 * 1000;

function olderThan(iso: string | null, days: number, now: number): boolean {
  if (!iso) return true;
  return now - new Date(iso).getTime() >= days * DAY_MS;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Auth: env token (mirrored from vault at deploy time) or the vault row.
    const cronToken = request.headers.get('x-cron-token');
    const expected = Deno.env.get('DISCIPLESHIP_NUDGE_TOKEN');
    let authorized = false;
    if (cronToken) {
      if (expected) {
        authorized = cronToken === expected;
      } else {
        const { data: secretRow } = await admin
          .schema('vault')
          .from('decrypted_secrets')
          .select('decrypted_secret')
          .eq('name', 'discipleship_nudge_token')
          .maybeSingle();
        authorized = !!secretRow && secretRow.decrypted_secret === cronToken;
      }
    }
    if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: relationships, error } = await admin
      .from('discipleship_relationships')
      .select('*')
      .eq('status', 'active');
    if (error) return jsonResponse({ error: error.message }, 500);

    const now = Date.now();
    const nudges: Array<{ relId: string; userId: string; otherId: string; side: 'discipler' | 'disciple' }> = [];

    for (const rel of relationships || []) {
      const anchor = rel.accepted_at || rel.created_at;
      // Give a fresh relationship one full cadence before the first nudge.
      if (!olderThan(anchor, rel.cadence_days, now)) continue;

      for (const side of ['discipler', 'disciple'] as const) {
        const userId = side === 'discipler' ? rel.discipler_id : rel.disciple_id;
        const otherId = side === 'discipler' ? rel.disciple_id : rel.discipler_id;
        const nudgedAt = side === 'discipler' ? rel.discipler_nudged_at : rel.disciple_nudged_at;
        if (!olderThan(nudgedAt, rel.cadence_days, now)) continue;

        const { data: lastCheckin } = await admin
          .from('discipleship_checkins')
          .select('created_at')
          .eq('relationship_id', rel.id)
          .eq('author_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!olderThan(lastCheckin?.created_at || anchor, rel.cadence_days, now)) continue;

        nudges.push({ relId: rel.id, userId, otherId, side });
      }
    }

    // Resolve names once for the message bodies.
    const otherIds = [...new Set(nudges.map((n) => n.otherId))];
    const { data: profiles } = otherIds.length
      ? await admin.from('profiles').select('id, full_name, email').in('id', otherIds)
      : { data: [] };
    const nameOf = new Map((profiles || []).map((p) => [p.id, p.full_name || p.email || 'your discipleship partner']));

    let sent = 0;
    for (const nudge of nudges) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userIds: [nudge.userId],
          title: 'Time to check in 🙏',
          body: `How's your week going? Share a quick check-in with ${nameOf.get(nudge.otherId)}.`,
          url: '/discipleship',
        }),
      }).catch(() => {});

      await admin
        .from('discipleship_relationships')
        .update({
          [nudge.side === 'discipler' ? 'discipler_nudged_at' : 'disciple_nudged_at']: new Date().toISOString(),
        })
        .eq('id', nudge.relId);
      sent += 1;
    }

    return jsonResponse({
      activeRelationships: (relationships || []).length,
      nudgesSent: sent,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
