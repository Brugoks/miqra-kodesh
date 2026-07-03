// Weekly Q&R digest for leaders. Finds unanswered questions older than three
// days per org and sends one push to that org's leaders.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LEADER_ROLES = ['developer', 'admin', 'leader', 'student_leader', 'parent_leader'];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let status = 200;

  try {
    const cronToken = request.headers.get('x-cron-token');
    const expected = Deno.env.get('QA_DIGEST_CRON_TOKEN');
    let authorized = false;
    if (cronToken) {
      if (expected) {
        authorized = cronToken === expected;
      } else {
        const { data: secretRow } = await admin
          .schema('vault')
          .from('decrypted_secrets')
          .select('decrypted_secret')
          .eq('name', 'qa_digest_cron_token')
          .maybeSingle();
        authorized = !!secretRow && secretRow.decrypted_secret === cronToken;
      }
    }

    if (!authorized) {
      status = 401;
      await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, request });
      return jsonResponse({ error: 'Unauthorized' }, status);
    }

    const cutoff = new Date(Date.now() - THREE_DAYS_MS).toISOString();
    const { data: questions, error: questionError } = await admin
      .from('qa_questions')
      .select('id, organization_id, title, created_at, qa_answers(id)')
      .lt('created_at', cutoff);

    if (questionError) {
      status = 500;
      await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, request });
      return jsonResponse({ error: questionError.message }, status);
    }

    const unanswered = (questions || []).filter((q) => (q.qa_answers || []).length === 0);
    const byOrg = new Map<string, typeof unanswered>();
    for (const question of unanswered) {
      const list = byOrg.get(question.organization_id) || [];
      list.push(question);
      byOrg.set(question.organization_id, list);
    }

    const orgIds = [...byOrg.keys()];
    if (orgIds.length === 0) {
      await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, units: 0, request });
      return jsonResponse({ orgsChecked: 0, pushesSent: 0, unansweredQuestions: 0 });
    }

    const { data: memberships, error: memberError } = await admin
      .from('profile_organizations')
      .select('profile_id, organization_id')
      .in('organization_id', orgIds);

    if (memberError) {
      status = 500;
      await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, request });
      return jsonResponse({ error: memberError.message }, status);
    }

    const memberIds = [...new Set((memberships || []).map((m) => m.profile_id))];
    const { data: leaders, error: leaderError } = memberIds.length
      ? await admin
        .from('profiles')
        .select('id, role')
        .in('id', memberIds)
        .in('role', LEADER_ROLES)
      : { data: [], error: null };

    if (leaderError) {
      status = 500;
      await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, request });
      return jsonResponse({ error: leaderError.message }, status);
    }

    const leaderIds = new Set((leaders || []).map((leader) => leader.id));
    let pushesSent = 0;
    let recipients = 0;

    for (const [organizationId, orgQuestions] of byOrg.entries()) {
      const userIds = (memberships || [])
        .filter((membership) => membership.organization_id === organizationId && leaderIds.has(membership.profile_id))
        .map((membership) => membership.profile_id);

      if (userIds.length === 0) continue;

      const count = orgQuestions.length;
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userIds,
          title: 'Q&R questions need responses',
          body: `${count} question${count === 1 ? ' is' : 's are'} waiting for a response.`,
          url: '/qa',
        }),
      }).catch(() => {});

      pushesSent += 1;
      recipients += userIds.length;
    }

    await recordUsageEvent({
      provider: 'supabase',
      feature: 'qa-leader-digest',
      status,
      units: pushesSent,
      request,
      metadata: { orgs: orgIds.length, unanswered: unanswered.length, recipients },
    });

    return jsonResponse({
      orgsChecked: orgIds.length,
      pushesSent,
      recipients,
      unansweredQuestions: unanswered.length,
    });
  } catch (err) {
    status = 500;
    await recordUsageEvent({ provider: 'supabase', feature: 'qa-leader-digest', status, request });
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
