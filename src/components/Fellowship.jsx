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
export default function Fellowship({ session, userRole, activeOrgId, onPollsChange, refreshTrigger }) {
  const location = useLocation();
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);
  const canCreateGroups = canAccessLeaderTools(userRole);
  const [editingGroupKey, setEditingGroupKey] = useState(null);

  const groupsApi = useGroups({ userId, userRole, activeOrgId, isConfigured, canCreateGroups, refreshTrigger });
  const linkedGroupId = new URLSearchParams(location.search).get('group') || '';

  useEffect(() => {
    if (location.hash === '#polls') {
      const timer = setTimeout(() => {
        const el = document.getElementById('polls');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
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
