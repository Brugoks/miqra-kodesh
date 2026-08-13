// Delivers daily and weekly notification digests at 9 AM in each user's
// timezone. The durable in-app rows remain the source of truth; this function
// only summarizes unread items into an optional push channel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')) % 24,
    weekday: value('weekday'),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cronToken = request.headers.get('x-cron-token');
  const expected = Deno.env.get('NOTIFICATION_DIGEST_TOKEN');
  let authorized = Boolean(cronToken && expected && cronToken === expected);
  if (!authorized && cronToken) {
    const { data: secretRow } = await admin
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', 'notification_digest_token')
      .maybeSingle();
    authorized = secretRow?.decrypted_secret === cronToken;
  }
  if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: preferences, error } = await admin
    .from('notification_preferences')
    .select('user_id,category,digest_mode,last_digest_at')
    .eq('push_enabled', true)
    .in('digest_mode', ['daily', 'weekly']);
  if (error) return jsonResponse({ error: error.message }, 500);

  const userIds = [...new Set((preferences || []).map((preference) => preference.user_id))];
  const { data: settings } = userIds.length
    ? await admin.from('notification_settings').select('user_id,timezone').in('user_id', userIds)
    : { data: [] };
  const timezoneByUser = new Map((settings || []).map((setting) => [setting.user_id, setting.timezone || 'UTC']));

  const now = new Date();
  let sent = 0;
  for (const preference of preferences || []) {
    const timezone = timezoneByUser.get(preference.user_id) || 'UTC';
    let local;
    try {
      local = localParts(now, timezone);
    } catch {
      local = localParts(now, 'UTC');
    }
    if (local.hour !== 9) continue;
    if (preference.digest_mode === 'weekly' && local.weekday !== 'Mon') continue;

    if (preference.last_digest_at) {
      const last = localParts(new Date(preference.last_digest_at), timezone);
      if (last.date === local.date) continue;
      if (preference.digest_mode === 'weekly'
        && now.getTime() - new Date(preference.last_digest_at).getTime() < 6 * 24 * 60 * 60 * 1000) continue;
    }

    const since = new Date(now.getTime() - (preference.digest_mode === 'daily' ? 24 : 7 * 24) * 60 * 60 * 1000).toISOString();
    const { data: items, count } = await admin
      .from('user_notifications')
      .select('title', { count: 'exact' })
      .eq('recipient_id', preference.user_id)
      .eq('category', preference.category)
      .is('read_at', null)
      .is('archived_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(3);

    if (!count) continue;
    const preview = (items || []).map((item) => item.title).join(' · ');
    const label = preference.digest_mode === 'daily' ? 'daily' : 'weekly';
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        userIds: [preference.user_id],
        title: `${count} ${label} ${preference.category} update${count === 1 ? '' : 's'}`,
        body: preview,
        url: '/?notifications=open',
        category: preference.category,
        tag: `digest:${preference.category}:${local.date}`,
        bypassDigest: true,
      }),
    }).catch(() => {});

    await admin
      .from('notification_preferences')
      .update({ last_digest_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('user_id', preference.user_id)
      .eq('category', preference.category);
    sent += 1;
  }

  return jsonResponse({ checked: preferences?.length || 0, sent });
});
