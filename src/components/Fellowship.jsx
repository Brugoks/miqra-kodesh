import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Fellowship.css';
import { hasSupabaseConfig } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';
import IceBreaker from './IceBreaker';
import useGroups from './fellowship/useGroups';
import GroupsSection from './fellowship/GroupsSection';
import GroupEditor from './fellowship/GroupEditor';
import PollsSection from './fellowship/PollsSection';
import PrayerWall from './fellowship/PrayerWall';
import StudyJournal from './fellowship/StudyJournal';

// Fellowship page orchestrator. Each section owns its data and realtime
// subscriptions; the shared small-groups domain (groups, profiles, join
// requests) lives in useGroups because polls and the prayer wall depend on
// group membership.
export default function Fellowship({ session, userRole, activeOrgId, orgInviteCode, onPollsChange, refreshTrigger }) {
  const location = useLocation();
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);
  const canCreateGroups = canAccessLeaderTools(userRole);
  const [editingGroupKey, setEditingGroupKey] = useState(null);

  const groupsApi = useGroups({ userId, userRole, activeOrgId, isConfigured, canCreateGroups, refreshTrigger });
  const linkedGroupId = new URLSearchParams(location.search).get('group') || '';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section');
    const sectionId = location.hash === '#polls'
      ? 'polls'
      : ({ polls: 'polls', prayers: 'prayer-wall', journal: 'study-journal' }[section] || '');
    const entityId = params.get('poll')
      ? `poll-${params.get('poll')}`
      : params.get('prayer')
        ? `prayer-${params.get('prayer')}`
        : params.get('entry')
          ? `journal-entry-${params.get('entry')}`
          : '';
    if (!sectionId && !entityId) return undefined;

    const timers = [200, 650, 1400].map((delay, index) => setTimeout(() => {
      const target = (entityId && document.getElementById(entityId))
        || (index === 2 && document.getElementById(sectionId));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [location]);

  if (editingGroupKey && groupsApi.groups[editingGroupKey]) {
    return (
      <GroupEditor
        key={editingGroupKey}
        groupKey={editingGroupKey}
        userId={userId}
        groupsApi={groupsApi}
        onClose={() => setEditingGroupKey(null)}
      />
    );
  }

  return (
    <div className="fellowship-page animate-fade-in">
      <IceBreaker session={session} userRole={userRole} activeOrgId={activeOrgId} />

      <GroupsSection
        canCreateGroups={canCreateGroups}
        userId={userId}
        groupsApi={groupsApi}
        onEditGroup={setEditingGroupKey}
        linkedGroupId={linkedGroupId}
        orgInviteCode={orgInviteCode}
      />

      <PollsSection
        session={session}
        userId={userId}
        isConfigured={isConfigured}
        activeOrgId={activeOrgId}
        groups={groupsApi.groups}
        myGroupIds={groupsApi.myGroupIds}
        canCreateGroups={canCreateGroups}
        onPollsChange={onPollsChange}
        refreshTrigger={refreshTrigger}
      />

      <div className="fellowship-grid">
        <PrayerWall
          userId={userId}
          isConfigured={isConfigured}
          activeOrgId={activeOrgId}
          canCreateGroups={canCreateGroups}
          groups={groupsApi.groups}
          profiles={groupsApi.profiles}
          currentProfile={groupsApi.currentProfile}
          avatarByProfileId={groupsApi.avatarByProfileId}
          refreshTrigger={refreshTrigger}
        />

        <StudyJournal
          session={session}
          userId={userId}
          isConfigured={isConfigured}
          activeOrgId={activeOrgId}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  );
}
