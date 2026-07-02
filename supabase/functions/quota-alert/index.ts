// Nightly quota watchdog. Evaluates the same free-tier thresholds DevTools
// displays and notifies developers (push + email) when a metric crosses 75%
// ("watch") or 90% ("critical"). Deduped one alert per metric+level per day
// via the quota_alerts table.
//
// Invoked two ways:
//  - pg_cron daily via x-cron-token (vault secret 'quota_alert_cron_token')
//  - manually from DevTools by an authenticated developer ("Run check now")

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MB = 1024 * 1024;
const GB = 1024 * MB;

// Metrics with hard numeric limits — mirror of the DevTools LIMITS table.
type Check = { metric: string; label: string; used: number; limit: number };

function buildChecks(snapshot: Record<string, unknown>): Check[] {
  const supa = (snapshot?.supabase || {}) as Record<string, number>;
  const api = (snapshot?.apiUsage || {}) as Record<string, Record<string, number>>;
  const month = (key: string) => Number(api[key]?.monthCalls || 0);
  const today = (key: string) => Number(api[key]?.todayCalls || 0);

  return [
    { metric: 'supabase-db', label: 'Supabase database size', used: Number(supa.databaseBytes || 0), limit: 500 * MB },
    { metric: 'supabase-storage', label: 'Supabase storage', used: Number(supa.storageBytes || 0), limit: 1 * GB },
    { metric: 'supabase-egress', label: 'Supabase egress (est.)', used: Number(supa.egressBytes || 0), limit: 5 * GB },
    { metric: 'api-bible-month', label: 'API.Bible calls this month', used: month('api-bible'), limit: 5000 },
    { metric: 'youtube-day', label: 'YouTube searches today', used: today('youtube'), limit: 100 },
    { metric: 'gemini-day', label: 'Gemini requests today', used: today('gemini'), limit: 1000 },
    { metric: 'openrouter-day', label: 'OpenRouter free requests today', used: today('openrouter'), limit: 1000 },
    { metric: 'resend-month', label: 'Resend emails this month', used: month('resend'), limit: 3000 },
    { metric: 'resend-day', label: 'Resend emails today', used: today('resend'), limit: 100 },
  ];
}

function levelFor(percent: number): 'critical' | 'watch' | null {
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'watch';
  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Auth: cron token OR an authenticated developer ──
    const cronToken = request.headers.get('x-cron-token');
    let authorized = false;
    if (cronToken) {
      // Prefer the env secret (same pattern as storage-gc); fall back to the
      // vault row in case the secret was never mirrored to function config.
      const expected = Deno.env.get('QUOTA_ALERT_CRON_TOKEN');
      if (expected) {
        authorized = cronToken === expected;
      } else {
        const { data: secretRow } = await admin
          .schema('vault')
          .from('decrypted_secrets')
          .select('decrypted_secret')
          .eq('name', 'quota_alert_cron_token')
          .maybeSingle();
        authorized = !!secretRow && secretRow.decrypted_secret === cronToken;
      }
    } else {
      const authHeader = request.headers.get('Authorization') || '';
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authed.auth.getUser();
      if (user) {
        const { data: profile } = await admin
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        authorized = profile?.role === 'developer';
      }
    }
    if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401);

    // ── Evaluate thresholds ──
    const { data: snapshot, error: snapErr } = await admin.rpc('dev_usage_snapshot');
    if (snapErr || !snapshot) {
      return jsonResponse({ error: snapErr?.message || 'Snapshot unavailable' }, 500);
    }

    const triggered: Array<Check & { percent: number; level: 'watch' | 'critical' }> = [];
    for (const check of buildChecks(snapshot)) {
      const percent = Math.round((check.used / check.limit) * 1000) / 10;
      const level = levelFor(percent);
      if (level) triggered.push({ ...check, percent, level });
    }

    // ── Dedupe: keep only alerts not yet sent today ──
    const fresh: typeof triggered = [];
    for (const alert of triggered) {
      const { error: insertErr } = await admin.from('quota_alerts').insert({
        metric: alert.metric,
        level: alert.level,
        percent: alert.percent,
        detail: `${alert.label}: ${alert.percent}% of limit`,
      });
      if (!insertErr) fresh.push(alert); // unique-violation → already alerted today
    }

    let notified = 0;
    if (fresh.length) {
      const lines = fresh.map((a) =>
        `${a.level === 'critical' ? '🔴' : '🟠'} ${a.label} at ${a.percent}%`
      );
      const title = fresh.some((a) => a.level === 'critical')
        ? 'Quota alert: critical usage'
        : 'Quota alert: usage approaching limits';
      const body = lines.join('\n');

      const { data: developers } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'developer');
      const devIds = (developers || []).map((d) => d.id);

      // Push (best-effort)
      if (devIds.length) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ userIds: devIds, title, body, url: '/devtools' }),
        }).catch(() => {});
      }

      // Email (best-effort; respects the 'quota_alert' toggle inside send-email)
      for (const dev of developers || []) {
        if (!dev.email) continue;
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            type: 'quota_alert',
            to: dev.email,
            subject: title,
            text: `${body}\n\nOpen DevTools for details.`,
            html: `<p>${lines.join('<br/>')}</p><p>Open DevTools for details.</p>`,
            metadata: { feature: 'quota_alert' },
          }),
        }).catch(() => {});
      }
      notified = devIds.length;
    }

    return jsonResponse({
      checked: buildChecks(snapshot).length,
      triggered: triggered.map(({ metric, percent, level }) => ({ metric, percent, level })),
      newAlerts: fresh.length,
      developersNotified: notified,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
