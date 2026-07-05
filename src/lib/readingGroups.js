// Group reading actions. Membership rows are always inserted by the acting
// user for themselves (RLS enforces this) — inviting someone else means
// sending them a join link/push, not writing a row on their behalf.
import { supabase } from './supabaseClient';

export async function createReadingGroup({ organizationId, planId, name, creatorId }) {
  const startsOn = new Date().toISOString().slice(0, 10);
  const { data: group, error } = await supabase
    .from('reading_plan_groups')
    .insert({ organization_id: organizationId, plan_id: planId, name, starts_on: startsOn, created_by: creatorId })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('reading_plan_group_members').insert({ group_id: group.id, user_id: creatorId });
  await supabase.from('reading_plan_enrollments').upsert({
    user_id: creatorId,
    plan_id: planId,
    status: 'active',
    started_at: `${startsOn}T00:00:00Z`,
    schedule_mode: 'calendar',
    group_id: group.id,
  }, { onConflict: 'user_id,plan_id' });

  return group;
}

export async function joinReadingGroup({ groupId, userId }) {
  const { data: group, error } = await supabase.from('reading_plan_groups').select('*').eq('id', groupId).single();
  if (error || !group) throw error || new Error('Group not found');

  await supabase.from('reading_plan_group_members').upsert(
    { group_id: groupId, user_id: userId },
    { onConflict: 'group_id,user_id', ignoreDuplicates: true },
  );
  await supabase.from('reading_plan_enrollments').upsert({
    user_id: userId,
    plan_id: group.plan_id,
    status: 'active',
    started_at: `${group.starts_on}T00:00:00Z`,
    schedule_mode: 'calendar',
    group_id: groupId,
  }, { onConflict: 'user_id,plan_id' });

  return group;
}

export async function inviteToGroup({ groupId, groupName, inviteeId }) {
  await supabase.functions.invoke('send-push', {
    body: {
      userIds: [inviteeId],
      title: '📖 Read together',
      body: `You've been invited to join "${groupName}"`,
      url: `/reading-plans?group=${groupId}`,
    },
  });
}

// Today-only visibility — total member count plus how many have a
// completion row for today. Bounded explicitly here (not just via RLS)
// since the "own rows" policy isn't date-restricted — without this, a
// viewer's own past completions would leak into today's count.
export async function getGroupTodayStatus({ groupId, planId }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [{ data: members }, { data: progress }] = await Promise.all([
    supabase.from('reading_plan_group_members').select('user_id').eq('group_id', groupId),
    supabase
      .from('reading_plan_progress')
      .select('user_id')
      .eq('plan_id', planId)
      .gte('completed_at', `${todayStr}T00:00:00`)
      .lt('completed_at', `${todayStr}T23:59:59.999`),
  ]);
  const readToday = new Set((progress || []).map((r) => r.user_id));
  return { total: (members || []).length, readToday: readToday.size };
}
