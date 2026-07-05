// Daily reading-plan reminders, invoked hourly by pg_cron. Each enrollment
// carries its own reminder_time + timezone, so this single hourly tick
// matches whichever rows are "at their hour" right now rather than needing
// one cron job per user. Never sends twice in the same local day, and
// never sends if the user has already read today.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function localDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function localHour(date: Date, tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(date);
  return parseInt(formatted, 10) % 24;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const cronToken = request.headers.get('x-cron-token');
  if (!cronToken) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: secretRow } = await admin
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', 'reading_plan_reminder_token')
    .maybeSingle();

  if (!secretRow || secretRow.decrypted_secret !== cronToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: enrollments, error } = await admin
    .from('reading_plan_enrollments')
    .select('user_id, plan_id, timezone, reminder_time, last_reminded_on')
    .eq('status', 'active')
    .not('reminder_time', 'is', null);

  if (error) return jsonResponse({ error: error.message }, 500);

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const enrollment of (enrollments || [])) {
    const tz = enrollment.timezone || 'UTC';
    const reminderHour = parseInt(String(enrollment.reminder_time).split(':')[0], 10);
    if (localHour(now, tz) !== reminderHour) continue;

    const today = localDateStr(now, tz);
    if (enrollment.last_reminded_on === today) continue;

    const { data: recentProgress } = await admin
      .from('reading_plan_progress')
      .select('completed_at')
      .eq('user_id', enrollment.user_id)
      .eq('plan_id', enrollment.plan_id)
      .order('completed_at', { ascending: false })
      .limit(5);

    const alreadyReadToday = (recentProgress || []).some(
      (row) => localDateStr(new Date(row.completed_at), tz) === today,
    );

    await admin
      .from('reading_plan_enrollments')
      .update({ last_reminded_on: today })
      .eq('user_id', enrollment.user_id)
      .eq('plan_id', enrollment.plan_id);

    if (alreadyReadToday) {
      skipped += 1;
      continue;
    }

    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        userIds: [enrollment.user_id],
        title: '📖 Reading Plan',
        body: "Today's reading is waiting for you.",
        url: `/dashboard?plan=${enrollment.plan_id}`,
      }),
    }).catch(() => {});
    sent += 1;
  }

  return jsonResponse({ checked: (enrollments || []).length, sent, skipped });
});
