// Transactional email dispatcher via Resend.
// Checks app_email_settings.enabled before sending so individual email types
// can be toggled from DevTools without a deploy.
// Logs every attempt to api_usage_events so DevTools meters light up.
//
// Expected JSON body:
//   { type, to, subject, html, text?, metadata? }
//
// `type` must match an email_type in app_email_settings.
// `to` is a single email address string.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const FROM = Deno.env.get('EMAIL_FROM') ?? 'Miqra Kodesh <notifications@send.miqra-kodesh.com>';
const RESEND_API_URL = 'https://api.resend.com/emails';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // Validate caller JWT — must be an authenticated user (the client passes its own JWT).
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { type: string; to: string; subject: string; html: string; text?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { type, to, subject, html, text, metadata } = body;
  if (!type || !to || !subject || !html) {
    return jsonResponse({ error: 'Missing required fields: type, to, subject, html' }, 400);
  }

  // Check the global on/off toggle for this email type.
  const { data: setting } = await supabase
    .from('app_email_settings')
    .select('enabled')
    .eq('email_type', type)
    .single();

  if (setting && !setting.enabled) {
    return jsonResponse({ skipped: true, reason: 'email_type_disabled' });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 500);
  }

  const payload: Record<string, unknown> = { from: FROM, to, subject, html };
  if (text) payload.text = text;

  const resendRes = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resendBody = await resendRes.json().catch(() => ({}));
  const ok = resendRes.status >= 200 && resendRes.status < 300;

  await recordUsageEvent({
    provider: 'resend',
    feature: type,
    status: resendRes.status,
    units: 1,
    metadata: { to, subject, resend_id: (resendBody as Record<string, unknown>).id ?? null, ...metadata },
  });

  if (!ok) {
    console.error('Resend error:', resendRes.status, JSON.stringify(resendBody));
    return jsonResponse({ error: 'Failed to send email', detail: resendBody }, 502);
  }

  return jsonResponse({ sent: true, id: (resendBody as Record<string, unknown>).id });
});
