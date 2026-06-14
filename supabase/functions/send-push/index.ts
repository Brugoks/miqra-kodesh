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

    const { userIds, title, body, url } = await request.json();
    const recipients = (Array.isArray(userIds) ? userIds : []).filter((id) => id && id !== callerId);
    if (!recipients.length) return jsonResponse({ sent: 0, recipients: 0 });

    // Service role bypasses RLS to read recipients' subscriptions.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipients);
    if (error) return jsonResponse({ error: error.message }, 500);

    const payload = JSON.stringify({
      title: title || 'Miqra Kodesh',
      body: body || '',
      url: url || '/',
      tag: 'chat-mention',
    });

    let sent = 0;
    const stale: string[] = [];
    const errors: Array<{ status?: number; message: string }> = [];
    await Promise.all((subs || []).map(async (s) => {
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

    return jsonResponse({ sent, removed: stale.length, found: subs?.length || 0, errors });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
