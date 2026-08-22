// Daily discipleship rhythms, invoked by pg_cron at 15:00 UTC.
//
//   1. Quiet-pair rescue: both sides silent for 2× cadence (min 21 days) →
//      one specific, human prompt to each side; stamped so it fires at most
//      every 14 days. Takes precedence over the regular nudge that day.
//   2. Check-in nudges: each side is due when their last check-in (or the
//      relationship start) is older than the cadence; stamped per side.
//   3. Meal nudge: established pairs get a monthly "share a meal" prompt
//      (table fellowship — Acts 2:46), skipped while a pair is quiet.
//   4. Email-invite reminders: pending invites older than 5 days get one
//      follow-up email + a push to the inviter; older than 30 days expire.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DAY_MS = 24 * 60 * 60 * 1000;

function olderThan(iso: string | null, days: number, now: number): boolean {
  if (!iso) return true;
  return now - new Date(iso).getTime() >= days * DAY_MS;
}

function sendPush(userIds: string[], title: string, body: string) {
  return fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ userIds, title, body, url: '/discipleship', category: 'discipleship' }),
  }).catch(() => {});
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const todayKey = new Date().toISOString().slice(0, 10);
    const persistNotification = async (
      userId: string,
      organizationId: string | null | undefined,
      eventType: string,
      title: string,
      body: string,
      relationshipId: string,
      priority: 'normal' | 'high' = 'normal',
    ) => {
      await admin.from('user_notifications').insert({
        recipient_id: userId,
        organization_id: organizationId || null,
        category: 'discipleship',
        event_type: eventType,
        title,
        body,
        url: '/discipleship',
        entity_type: 'discipleship_relationship',
        entity_id: relationshipId,
        priority,
        dedupe_key: `${eventType}:${relationshipId}:${userId}:${todayKey}`,
      });
    };

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

    // Name lookup for everyone involved, resolved once.
    const participantIds = [...new Set((relationships || []).flatMap((r) => [r.discipler_id, r.disciple_id]))];
    const { data: profiles } = participantIds.length
      ? await admin.from('profiles').select('id, full_name, email').in('id', participantIds)
      : { data: [] };
    const nameOf = (id: string) =>
      (profiles || []).find((p) => p.id === id)?.full_name
      || (profiles || []).find((p) => p.id === id)?.email
      || 'your discipleship partner';

    // Latest check-in per relationship (any author), for quiet detection.
    const relIds = (relationships || []).map((r) => r.id);
    const lastCheckinByRel = new Map<string, string>();
    if (relIds.length) {
      const { data: checkins } = await admin
        .from('discipleship_checkins')
        .select('relationship_id, created_at')
        .in('relationship_id', relIds)
        .order('created_at', { ascending: false });
      for (const c of checkins || []) {
        if (!lastCheckinByRel.has(c.relationship_id)) lastCheckinByRel.set(c.relationship_id, c.created_at);
      }
    }

    // ── 1. Quiet-pair rescue ────────────────────────────────────────────────
    let rescued = 0;
    const rescuedToday = new Set<string>();
    for (const rel of relationships || []) {
      const anchor = rel.accepted_at || rel.created_at;
      const quietThreshold = Math.max(21, (rel.cadence_days || 7) * 2);
      const lastActivity = lastCheckinByRel.get(rel.id) || anchor;
      if (!olderThan(lastActivity, quietThreshold, now)) continue;
      if (!olderThan(rel.quiet_nudged_at, 14, now)) continue;

      await sendPush(
        [rel.discipler_id],
        'It’s been a while 🌱',
        `Things have gone quiet with ${nameOf(rel.disciple_id)}. Send them one verse today — that’s all it takes to restart.`,
      );
      await persistNotification(
        rel.discipler_id,
        rel.organization_id,
        'quiet_pair',
        'It’s been a while',
        `Things have gone quiet with ${nameOf(rel.disciple_id)}. Send them one verse today.`,
        rel.id,
        'high',
      );
      await sendPush(
        [rel.disciple_id],
        'It’s been a while 🌱',
        `Things have gone quiet with ${nameOf(rel.discipler_id)}. Send them one verse today — that’s all it takes to restart.`,
      );
      await persistNotification(
        rel.disciple_id,
        rel.organization_id,
        'quiet_pair',
        'It’s been a while',
        `Things have gone quiet with ${nameOf(rel.discipler_id)}. Send them one verse today.`,
        rel.id,
        'high',
      );

      // Stamp both regular nudges too, so the rescue isn't doubled today.
      await admin
        .from('discipleship_relationships')
        .update({
          quiet_nudged_at: new Date().toISOString(),
          discipler_nudged_at: new Date().toISOString(),
          disciple_nudged_at: new Date().toISOString(),
        })
        .eq('id', rel.id);
      rescuedToday.add(rel.id);
      rescued += 1;
    }

    // ── 2. Regular per-side check-in nudges ─────────────────────────────────
    const nudges: Array<{ relId: string; userId: string; otherId: string; side: 'discipler' | 'disciple' }> = [];

    for (const rel of relationships || []) {
      if (rescuedToday.has(rel.id)) continue;
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

    let sent = 0;
    for (const nudge of nudges) {
      await sendPush(
        [nudge.userId],
        'Time to check in 🙏',
        `How's your week going? Share a quick check-in with ${nameOf(nudge.otherId)}.`,
      );
      const relationship = (relationships || []).find((rel) => rel.id === nudge.relId);
      await persistNotification(
        nudge.userId,
        relationship?.organization_id,
        'checkin_due',
        'Your discipleship check-in is due',
        `Share a quick check-in with ${nameOf(nudge.otherId)}.`,
        nudge.relId,
        'high',
      );
      await admin
        .from('discipleship_relationships')
        .update({
          [nudge.side === 'discipler' ? 'discipler_nudged_at' : 'disciple_nudged_at']: new Date().toISOString(),
        })
        .eq('id', nudge.relId);
      sent += 1;
    }

    // ── 3. Monthly meal nudge (table fellowship) ────────────────────────────
    let meals = 0;
    for (const rel of relationships || []) {
      if (rescuedToday.has(rel.id)) continue;
      const anchor = rel.accepted_at || rel.created_at;
      if (!olderThan(anchor, 21, now)) continue; // let new pairs settle first
      if (!olderThan(rel.meal_nudged_at, 30, now)) continue;

      await sendPush(
        [rel.discipler_id],
        'Break bread together 🍞',
        `When are you and ${nameOf(rel.disciple_id)} sharing a meal? The early church grew around the table.`,
      );
      await persistNotification(
        rel.discipler_id,
        rel.organization_id,
        'meal_nudge',
        'Break bread together',
        `Plan a meal with ${nameOf(rel.disciple_id)}.`,
        rel.id,
      );
      await sendPush(
        [rel.disciple_id],
        'Break bread together 🍞',
        `When are you and ${nameOf(rel.discipler_id)} sharing a meal? The early church grew around the table.`,
      );
      await persistNotification(
        rel.disciple_id,
        rel.organization_id,
        'meal_nudge',
        'Break bread together',
        `Plan a meal with ${nameOf(rel.discipler_id)}.`,
        rel.id,
      );
      await admin
        .from('discipleship_relationships')
        .update({ meal_nudged_at: new Date().toISOString() })
        .eq('id', rel.id);
      meals += 1;
    }

    // ── 4. Email-invite reminders + expiry ──────────────────────────────────
    const { data: pendingInvites } = await admin
      .from('discipleship_email_invites')
      .select('*')
      .eq('status', 'pending');

    let reminders = 0;
    let expired = 0;
    for (const invite of pendingInvites || []) {
      if (olderThan(invite.created_at, 30, now)) {
        await admin
          .from('discipleship_email_invites')
          .update({ status: 'expired' })
          .eq('id', invite.id);
        await sendPush(
          [invite.inviter_id],
          'Invitation expired',
          `Your discipleship invite to ${invite.invitee_email} expired after 30 days. You can send a fresh one anytime.`,
        );
        expired += 1;
        continue;
      }

      if (!olderThan(invite.created_at, 5, now) || invite.reminded_at) continue;

      const { data: org } = await admin
        .from('organizations')
        .select('name, invite_code')
        .eq('id', invite.organization_id)
        .maybeSingle();
      const { data: inviter } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', invite.inviter_id)
        .maybeSingle();
      if (!org?.invite_code) continue;

      const inviterName = inviter?.full_name || inviter?.email || 'A friend';
      const orgName = org.name || 'our community';
      const origin = invite.app_origin || 'https://miqra-kodesh.com';
      const joinUrl = `${origin}/?invite=${encodeURIComponent(org.invite_code)}`;

      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'discipleship_invite_reminder',
          to: invite.invitee_email,
          subject: `Reminder: ${inviterName} is waiting to walk with you`,
          html: `<div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.55;">
  <p>Hi,</p>
  <p>A few days ago ${inviterName} invited you to join <strong>${orgName}</strong> and walk together in discipleship. This is a friendly reminder — they'd love to have you.</p>
  <p style="text-align:center;margin:1.75rem 0;">
    <a href="${joinUrl}" style="display:inline-block;background:#2e52be;color:#ffffff;font-weight:bold;font-size:1.05rem;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;">Accept your invitation</a>
  </p>
  <p>Sign up with this email address so we can connect you automatically. If the button doesn't work, go to <a href="${origin}">${origin}</a> and use join code <strong>${org.invite_code}</strong>.</p>
  <p>— ${orgName}, via Miqra Kodesh</p>
</div>`,
          text: `Hi,\n\nA few days ago ${inviterName} invited you to join ${orgName} and walk together in discipleship. This is a friendly reminder — they'd love to have you.\n\nOpen this link to accept: ${joinUrl}\n\nSign up with this email address so we can connect you automatically. If the link doesn't work, go to ${origin} and use join code ${org.invite_code}.\n\n— ${orgName}, via Miqra Kodesh`,
          metadata: { organization_id: invite.organization_id },
        }),
      }).catch(() => {});

      await sendPush(
        [invite.inviter_id],
        'Invite still waiting',
        `${invite.invitee_email} hasn't joined yet — we sent them a reminder. A personal follow-up goes a long way too.`,
      );

      await admin
        .from('discipleship_email_invites')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', invite.id);
      reminders += 1;
    }

    return jsonResponse({
      activeRelationships: (relationships || []).length,
      nudgesSent: sent,
      quietRescues: rescued,
      mealNudges: meals,
      inviteReminders: reminders,
      invitesExpired: expired,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
