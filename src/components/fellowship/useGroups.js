import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useRealtimeRefresh from './useRealtimeRefresh';

export const makeMemberId = () => `m-${crypto.randomUUID()}`;

const defaultGroups = {
  boys: {
    name: "High School Boys",
    meetingDay: "Wednesday", meetingTime: "6:30 PM", frequency: "Weekly",
    topic: "Walking in Unity (Ephesians 4)", leader: "Dan K.", coLeader: "",
    meetingLocation: "Youth Room",
    joinStatus: 'closed',
    students: [
      { id: 'sb1', name: "Daniel Quiambao" }, { id: 'sb2', name: "Joshua Smith" },
      { id: 'sb3', name: "Caleb Harrison" }, { id: 'sb4', name: "Benjamin Rogers" },
      { id: 'sb5', name: "Isaac Newton" }, { id: 'sb6', name: "Nathan Wright" }
    ]
  },
  girls: {
    name: "High School Girls",
    meetingDay: "Wednesday", meetingTime: "6:30 PM", frequency: "Weekly",
    topic: "Walking in Unity (Ephesians 4)", leader: "Sarah M.", coLeader: "",
    meetingLocation: "Room 102",
    joinStatus: 'closed',
    students: [
      { id: 'sg1', name: "Elizabeth Bennet" }, { id: 'sg2', name: "Hannah Abbott" },
      { id: 'sg3', name: "Esther Prince" }, { id: 'sg4', name: "Abigail Williams" },
      { id: 'sg5', name: "Ruth Peterson" }, { id: 'sg6', name: "Lydia Bennet" }
    ]
  },
  middle: {
    name: "Middle School Co-ed",
    meetingDay: "Sunday", meetingTime: "9:30 AM", frequency: "Weekly",
    topic: "Faith Under Pressure", leader: "Chris J.", coLeader: "",
    meetingLocation: "Main Auditorium",
    joinStatus: 'closed',
    students: [
      { id: 'sm1', name: "Samuel Adams" }, { id: 'sm2', name: "David Copperfield" },
      { id: 'sm3', name: "Elijah Craig" }, { id: 'sm4', name: "Chloe Smith" },
      { id: 'sm5', name: "Grace Kelly" }, { id: 'sm6', name: "Sophia Loren" }
    ]
  }
};

const normalizePersonName = (name) => String(name || '').trim().toLowerCase();

// Owns the small-groups domain: group CRUD + persistence, member linking
// profiles, and join requests. Shared by GroupsSection, GroupEditor,
// PollsSection (group labels/targeting), and PrayerWall (shared-group
// prayer visibility).
export default function useGroups({ userId, userRole, activeOrgId, isConfigured, canCreateGroups, refreshTrigger }) {
  const [groups, setGroups] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [joinActionMessage, setJoinActionMessage] = useState('');
  const [joinActionLoading, setJoinActionLoading] = useState('');
  const [groupsError, setGroupsError] = useState('');

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === userId) || null,
    [profiles, userId],
  );

  const avatarByProfileId = useMemo(() => {
    const map = {};
    for (const p of profiles) if (p.avatar_url) map[p.id] = p.avatar_url;
    return map;
  }, [profiles]);

  const canManageJoinRequestsForGroup = (group) => {
    if (!canCreateGroups || !group) return false;
    if (['developer', 'admin'].includes(userRole)) return true;
    const myName = normalizePersonName(currentProfile?.full_name);
    if (!myName) return false;
    return [group.leader, group.coLeader].some((name) => normalizePersonName(name) === myName);
  };

  const myGroupIds = useMemo(() => (
    Object.keys(groups).filter((key) => {
      const group = groups[key];
      if (group.students?.some((s) => s.linkedUserId === userId)) return true;
      if (!canCreateGroups) return false;
      if (['developer', 'admin'].includes(userRole)) return true;
      const myName = normalizePersonName(currentProfile?.full_name);
      if (!myName) return false;
      return [group.leader, group.coLeader].some((name) => normalizePersonName(name) === myName);
    })
  ), [groups, userId, canCreateGroups, userRole, currentProfile]);

  const loadGroupsData = async () => {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('attendance_groups')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        setGroups(defaultGroups);
      } else {
        const mapped = {};
        data.forEach(item => {
          mapped[item.id] = {
            name: item.name,
            meetingDay: item.meeting_day,
            meetingTime: item.meeting_time,
            meetingEndTime: item.meeting_end_time || '',
            frequency: item.frequency,
            topic: item.topic,
            leader: item.leader,
            coLeader: item.co_leader,
            meetingLocation: item.meeting_location || '',
            bookLink: item.book_link || '',
            bookTitle: item.book_title || '',
            joinStatus: item.join_status || 'closed',
            nextMeetingDate: item.next_meeting_date || '',
            sortOrder: item.sort_order || 0,
            students: item.students || []
          };
        });
        setGroups(mapped);
      }

      if (activeOrgId) {
        const { data: profileData } = await supabase
          .rpc('org_members', { org_id: activeOrgId })
          .order('full_name', { ascending: true });
        setProfiles(profileData || []);
      }
    } else {
      const saved = localStorage.getItem('miqra_attendance_groups');
      if (saved) {
        try { setGroups(JSON.parse(saved)); } catch { setGroups(defaultGroups); }
      } else {
        setGroups(defaultGroups);
      }
    }
  };

  const loadJoinRequests = async () => {
    if (!isConfigured) {
      setJoinRequests([]);
      return;
    }

    let query = supabase
      .from('group_join_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (activeOrgId) query = query.eq('organization_id', activeOrgId);

    const { data, error } = await query;
    if (error) {
      console.error('Error loading group join requests:', error);
      setJoinRequests([]);
      return;
    }
    setJoinRequests(data || []);
  };

  const saveGroups = async (newGroups) => {
    setGroups(newGroups);
    setGroupsError('');
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));
    if (isConfigured) {
      const results = await Promise.all(
        Object.entries(newGroups).map(([id, group]) => supabase.from('attendance_groups').upsert({
          id,
          name: group.name,
          meeting_day: group.meetingDay,
          meeting_time: group.meetingTime,
          frequency: group.frequency,
          topic: group.topic,
          leader: group.leader,
          co_leader: group.coLeader,
          meeting_location: group.meetingLocation || null,
          book_link: group.bookLink || null,
          book_title: group.bookTitle || null,
          join_status: group.joinStatus || 'closed',
          next_meeting_date: group.nextMeetingDate || null,
          meeting_end_time: group.meetingEndTime || null,
          sort_order: group.sortOrder || 0,
          students: group.students,
          updated_at: new Date().toISOString()
        }))
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        console.error('Error saving groups:', failed.error);
        setGroupsError('Some group changes could not be saved. Please refresh and try again.');
      }
    }
  };

  const deleteGroup = async (groupKey) => {
    const group = groups[groupKey];
    if (!group || !window.confirm(`Are you sure you want to delete "${group.name}"? This will permanently remove the group and all its member linkages.`)) return false;

    const newGroups = { ...groups };
    delete newGroups[groupKey];
    setGroups(newGroups);
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));

    if (isConfigured) {
      const { error } = await supabase.from('attendance_groups').delete().eq('id', groupKey);
      if (error) {
        console.error('Error deleting group from Supabase:', error);
        setGroupsError('Could not delete the group. Please refresh and try again.');
      }
    }
    return true;
  };

  const joinOrRequestGroup = async (groupKey) => {
    const group = groups[groupKey];
    if (!group || !userId) return;
    setJoinActionMessage('');
    setJoinActionLoading(groupKey);

    if (!isConfigured) {
      if ((group.joinStatus || 'closed') === 'open') {
        const updated = {
          ...groups,
          [groupKey]: {
            ...group,
            students: [
              ...(group.students || []),
              { id: makeMemberId(), name: 'You', linkedUserId: userId, linkedUserName: 'You' },
            ],
          },
        };
        await saveGroups(updated);
        setJoinActionMessage(`You joined ${group.name}.`);
      } else {
        setJoinActionMessage('Sign in with Supabase enabled to request access to a closed group.');
      }
      setJoinActionLoading('');
      return;
    }

    const { data, error } = await supabase.rpc('join_or_request_attendance_group', { p_group_id: groupKey });
    if (error) {
      setJoinActionMessage(error.message || 'Could not process your request.');
      setJoinActionLoading('');
      return;
    }

    await Promise.all([loadGroupsData(), loadJoinRequests()]);
    const result = Array.isArray(data) ? data[0] : data;
    if (result === 'joined') setJoinActionMessage(`You joined ${group.name}.`);
    else if (result === 'already_member') setJoinActionMessage(`You're already in ${group.name}.`);
    else setJoinActionMessage(`Your request to join ${group.name} was sent.`);
    setJoinActionLoading('');
  };

  const approveJoinRequest = async (request) => {
    if (!request?.id) return;
    setJoinActionMessage('');
    setJoinActionLoading(request.id);

    const { error } = await supabase.rpc('approve_group_join_request', { p_request_id: request.id });
    if (error) {
      setJoinActionMessage(error.message || 'Could not approve the request.');
      setJoinActionLoading('');
      return;
    }

    await Promise.all([loadGroupsData(), loadJoinRequests()]);
    setJoinActionMessage(`${request.requester_name} was added to ${request.group_name}.`);
    setJoinActionLoading('');
  };

  const declineJoinRequest = async (request) => {
    if (!request?.id) return;
    setJoinActionMessage('');
    setJoinActionLoading(request.id);

    const { error } = await supabase.rpc('decline_group_join_request', { p_request_id: request.id });
    if (error) {
      setJoinActionMessage(error.message || 'Could not decline the request.');
      setJoinActionLoading('');
      return;
    }

    await loadJoinRequests();
    setJoinActionMessage(`${request.requester_name}'s request to join ${request.group_name} was declined.`);
    setJoinActionLoading('');
  };

  useEffect(() => {
    // Hydrates group state from local/Supabase storage when the session context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGroupsData();
    loadJoinRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId, activeOrgId, refreshTrigger]);

  useRealtimeRefresh(
    `fellowship-groups-${activeOrgId || 'local'}`,
    ['attendance_groups', 'group_join_requests'],
    () => { loadGroupsData(); loadJoinRequests(); },
    isConfigured,
  );

  return {
    groups,
    profiles,
    currentProfile,
    avatarByProfileId,
    joinRequests,
    joinActionMessage,
    joinActionLoading,
    groupsError,
    myGroupIds,
    canManageJoinRequestsForGroup,
    saveGroups,
    deleteGroup,
    joinOrRequestGroup,
    approveJoinRequest,
    declineJoinRequest,
  };
}
