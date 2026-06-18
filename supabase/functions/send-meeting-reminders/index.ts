// Daily facilitator preparation reminders.
// Queries group_meetings where meeting_date is approaching (within the next 3 days)
// and reminder_sent is false. Finds the facilitator profile to get their email,
// sends a preparation reminder, and flags the meeting reminder as sent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // Validate the secret cron token passed in headers
  const cronToken = request.headers.get('x-cron-token');
  if (!cronToken) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Retrieve the target secret token from Vault
  const { data: secretRow, error: secretErr } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', 'reminder_cron_token')
    .maybeSingle();

  if (secretErr || !secretRow || secretRow.decrypted_secret !== cronToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Check email setting enabled status for 'facilitator_reminder'
  const { data: setting } = await supabase
    .from('app_email_settings')
    .select('enabled')
    .eq('email_type', 'facilitator_reminder')
    .single();

  if (setting && !setting.enabled) {
    return jsonResponse({ skipped: true, reason: 'email_type_disabled' });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 500);
  }

  // Determine approaching date bounds (within the next 3 days)
  const today = new Date();
  const dateLimit = new Date();
  dateLimit.setDate(today.getDate() + 3);

  const todayStr = today.toISOString().split('T')[0];
  const limitStr = dateLimit.toISOString().split('T')[0];

  // Fetch group meetings approaching that haven't been sent a reminder
  const { data: meetings, error: meetErr } = await supabase
    .from('group_meetings')
    .select(`
      id,
      meeting_date,
      facilitator,
      focus_passage,
      agenda,
      location,
      notes,
      group_id,
      attendance_groups (
        name,
        organization_id
      )
    `)
    .gte('meeting_date', todayStr)
    .lte('meeting_date', limitStr)
    .eq('reminder_sent', false);

  if (meetErr) {
    console.error('Error loading approaching meetings:', meetErr);
    return jsonResponse({ error: 'Could not load approaching meetings', details: meetErr }, 500);
  }

  const sentReminders = [];

  for (const meeting of (meetings || [])) {
    if (!meeting.facilitator) continue;

    // Look up the facilitator's email in the profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .ilike('full_name', meeting.facilitator.trim())
      .maybeSingle();

    if (!profile?.email) {
      console.log(`No email profile found for facilitator "${meeting.facilitator}"`);
      continue;
    }

    const orgId = meeting.attendance_groups?.organization_id;
    let fromName = null;
    if (orgId) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();
      if (orgData?.name) {
        fromName = orgData.name;
      }
    }

    const emailFromConfig = Deno.env.get('EMAIL_FROM') ?? 'notifications@send.miqra-kodesh.com';
    const emailMatch = emailFromConfig.match(/<([^>]+)>/);
    const emailAddress = emailMatch ? emailMatch[1] : emailFromConfig;
    const fromField = fromName
      ? `${fromName} <${emailAddress}>`
      : `Miqra Kodesh <${emailAddress}>`;

    const groupName = meeting.attendance_groups?.name || 'your group';
    const dateLabel = new Date(meeting.meeting_date + 'T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const subject = `Upcoming Facilitator Reminder: ${groupName} (${dateLabel})`;
    const html = `
      <p>Hi ${profile.full_name},</p>
      <p>This is a reminder that you are scheduled to <strong>facilitate</strong> the upcoming meeting for <strong>${groupName}</strong> on <strong>${dateLabel}</strong>.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      ${meeting.focus_passage ? `<p><strong>Focus Passage:</strong> ${meeting.focus_passage}</p>` : ''}
      ${meeting.location ? `<p><strong>Location:</strong> ${meeting.location}</p>` : ''}
      ${meeting.agenda ? `<p><strong>Agenda:</strong><br>${meeting.agenda.replace(/\n/g, '<br>')}</p>` : ''}
      ${meeting.notes ? `<p><strong>Notes:</strong><br>${meeting.notes.replace(/\n/g, '<br>')}</p>` : ''}
      <hr style="border: 0; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      <p>Please take some time to review the guide, review the passages, and come prepared.</p>
      <p>— Miqra Kodesh</p>
    `;
    const text = `Hi ${profile.full_name},\n\nThis is a reminder that you are scheduled to facilitate the upcoming meeting for ${groupName} on ${dateLabel}.\n\n${meeting.focus_passage ? 'Focus Passage: ' + meeting.focus_passage + '\n' : ''}${meeting.location ? 'Location: ' + meeting.location + '\n' : ''}${meeting.agenda ? '\nAgenda:\n' + meeting.agenda + '\n' : ''}${meeting.notes ? '\nNotes:\n' + meeting.notes + '\n' : ''}\nPlease come prepared.\n\n— Miqra Kodesh`;

    const payload = { from: fromField, to: profile.email, subject, html, text };

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

    if (ok) {
      // Mark reminder as sent in public.group_meetings
      await supabase
        .from('group_meetings')
        .update({ reminder_sent: true })
        .eq('id', meeting.id);

      sentReminders.push({ meetingId: meeting.id, facilitator: meeting.facilitator, to: profile.email });

      // Log usage metrics
      await recordUsageEvent({
        provider: 'resend',
        feature: 'facilitator_reminder',
        status: resendRes.status,
        units: 1,
        organizationId: orgId,
        metadata: {
          to: profile.email,
          subject,
          resend_id: resendBody.id || null,
          meeting_id: meeting.id,
        },
      });
    } else {
      console.error(`Failed to send reminder for meeting ${meeting.id}:`, resendRes.status, resendBody);
    }
  }

  return jsonResponse({ success: true, processed: sentReminders.length, details: sentReminders });
});
