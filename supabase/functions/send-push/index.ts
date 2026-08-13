// NOTE: deploy with `supabase functions deploy send-push --no-verify-jwt`.
// The function does its own auth (user JWT for client calls, PUSH_HOOK_SECRET
// for the server-side DB trigger), so the gateway must not reject non-JWT bearers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@miqrakodesh.app';
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') || '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function minutesInTimezone(date: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 24;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function isQuietNow(setting: { quiet_hours_start?: string | null; quiet_hours_end?: string | null; timezone?: string | null }): boolean {
  const start = timeToMinutes(setting.quiet_hours_start);
  const end = timeToMinutes(setting.quiet_hours_end);
  const now = minutesInTimezone(new Date(), setting.timezone || 'UTC');
  if (start === null || end === null || now === null || start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Accept either a logged-in user (client call) or a trusted server call
    // presenting the service-role key (DB trigger / cron).
    const authHeader = request.headers.get('Authorization') || '';
    const isService = (HOOK_SECRET && authHeader === `Bearer ${HOOK_SECRET}`)
      || authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
    let callerId: string | null = null;
    if (!isService) {
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authed.auth.getUser();
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
      callerId = user.id;
    }

    const { userIds, title, body, url, category: requestedCategory, tag, entityId, bypassDigest } = await request.json();
    const recipients = (Array.isArray(userIds) ? userIds : []).filter((id) => id && id !== callerId);
    if (!recipients.length) return jsonResponse({ sent: 0, recipients: 0 });

    const categories = new Set([
      'chat', 'fellowship', 'calendar', 'qa', 'reading',
      'discipleship', 'announcements', 'system',
    ]);
    const inferredCategory = typeof url === 'string'
      ? (url.startsWith('/chat') ? 'chat'
        : url.startsWith('/qa') ? 'qa'
          : url.startsWith('/fellowship') ? 'fellowship'
            : url.startsWith('/reading-plans') ? 'reading'
              : url.startsWith('/discipleship') ? 'discipleship'
                : url.startsWith('/calendar') ? 'calendar'
                  : 'system')
      : 'system';
    const category = categories.has(requestedCategory) ? requestedCategory : inferredCategory;

    // Service role bypasses RLS to read recipients' subscriptions.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const [
      { data: subs, error },
      { data: preferences, error: preferencesError },
      { data: settings, error: settingsError },
    ] = await Promise.all([
      admin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipients),
      admin
        .from('notification_preferences')
        .select('user_id,push_enabled,digest_mode')
        .in('user_id', recipients)
        .eq('category', category),
      admin
        .from('notification_settings')
        .select('user_id,quiet_hours_start,quiet_hours_end,timezone')
        .in('user_id', recipients),
    ]);
    if (error) return jsonResponse({ error: error.message }, 500);

    // Missing preference rows mean enabled. If the preferences migration has
    // not reached an environment yet, fail open so existing push delivery does
    // not regress during a rolling deployment.
    const allowDigestBypass = isService && bypassDigest === true;
    const pushDisabled = new Set<string>(
      preferencesError
        ? []
        : (preferences || [])
          .filter((preference) => !preference.push_enabled || (!allowDigestBypass && preference.digest_mode !== 'instant'))
          .map((preference) => preference.user_id),
    );
    if (!settingsError) {
      for (const setting of settings || []) {
        if (isQuietNow(setting)) pushDisabled.add(setting.user_id);
      }
    }
    const eligibleSubs = (subs || []).filter((subscription) => !pushDisabled.has(subscription.user_id));

    const payload = JSON.stringify({
      title: title || 'Miqra Kodesh',
      body: body || '',
      url: url || '/',
      tag: tag || `${category}:${entityId || 'activity'}`,
    });

    let sent = 0;
    const stale: string[] = [];
    const errors: Array<{ status?: number; message: string }> = [];
    await Promise.all(eligibleSubs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(s.endpoint);
        else errors.push({ status, message: (err as Error).message });
      }
    }));

    // Clean up expired/invalid subscriptions.
    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return jsonResponse({
      sent,
      removed: stale.length,
      found: subs?.length || 0,
      suppressed: (subs?.length || 0) - eligibleSubs.length,
      category,
      errors,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
