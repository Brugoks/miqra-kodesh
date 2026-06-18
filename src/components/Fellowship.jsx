import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import './Fellowship.css';
import { Heart, Plus, BookOpen, Trash2, Calendar, Send, Sparkles, Pencil, Users, ChevronDown, ChevronUp, Clock, BarChart2, X, Check, ImagePlus, UserPlus, Lock, Unlock, GripVertical, Loader2, RefreshCw, MessageCircle, CornerDownRight } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';
import { compressImage } from '../lib/imageCompression';
import Avatar from './ui/Avatar';
import IceBreaker from './IceBreaker';
import { nextMeetingDate, toDateKey } from '../lib/meetings';

const makeVoteId = () => `vote_${Date.now()}`;
const makeMemberId = () => `m-${Date.now()}`;

const extractTitleFromUrl = (urlString) => {
  if (!urlString) return '';
  try {
    let targetUrl = urlString.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    let rawTitle = '';

    // 1. Amazon pattern
    if (host.includes('amazon.')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        if (parts[0] !== 'dp' && !(parts[0] === 'gp' && parts[1] === 'product')) {
          rawTitle = parts[0];
        }
      }
    }

    // 2. Generic path segment search
    if (!rawTitle) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          const isNumeric = /^\d+$/.test(part);
          const isCode = part.length < 4 || (part.length < 10 && /[0-9]/.test(part));
          if (!isNumeric && !isCode) {
            rawTitle = part;
            break;
          }
        }
        if (!rawTitle) {
          rawTitle = parts[parts.length - 1] || parts[0] || '';
        }
      }
    }

    if (!rawTitle) {
      let domain = host.replace(/^www\./i, '');
      const dotIndex = domain.indexOf('.');
      if (dotIndex > 0) {
        domain = domain.substring(0, dotIndex);
      }
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }

    // Clean and split
    let clean = decodeURIComponent(rawTitle)
      .replace(/[-_]+/g, ' ')
      .trim();

    // Remove Amazon query/tracking or trailing code-like words
    clean = clean.replace(/\b(dp|product|gp|ref|ref=.*)\b.*$/i, '').trim();

    const acronyms = ['esv', 'niv', 'nasb', 'kjv', 'nlt', 'nkjv', 'hcsb', 'csb', 'amp', 'msg', 'net'];
    const lowercaseWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'about'];

    const words = clean.split(/\s+/).filter(Boolean);
    const titleCased = words.map((word, index) => {
      const lowerWord = word.toLowerCase();
      // Handle acronyms
      if (acronyms.includes(lowerWord)) {
        return word.toUpperCase();
      }
      // Handle lowercase articles/prepositions (except first word)
      if (index > 0 && lowercaseWords.includes(lowerWord)) {
        return lowerWord;
      }
      // Standard capitalization
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    return titleCased;
  } catch {
    return '';
  }
};

export default function Fellowship({ session, userRole, activeOrgId, onPollsChange, refreshTrigger }) {
  const location = useLocation();
  const canCreateGroups = canAccessLeaderTools(userRole);
  // --- PRAYER WALL STATE ---
  const [prayers, setPrayers] = useState([]);
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerText, setPrayerText] = useState('');
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);
  const [prayerError, setPrayerError] = useState('');
  const [prayerImageFiles, setPrayerImageFiles] = useState([]);
  const [prayerImagePreviews, setPrayerImagePreviews] = useState([]);
  const [activeImageUrl, setActiveImageUrl] = useState(null);
  const [expandedPrayers, setExpandedPrayers] = useState({});
  const [expandedJournal, setExpandedJournal] = useState({});
  const [journalSummary, setJournalSummary] = useState('');
  const [journalImageUrl, setJournalImageUrl] = useState('');
  const [journalImageBlob, setJournalImageBlob] = useState(null);
  const [journalAiLoading, setJournalAiLoading] = useState(false);
  const [journalVisibility, setJournalVisibility] = useState('private');

  // --- JOURNAL COMMENTS STATE ---
  const [journalComments, setJournalComments] = useState({}); // { [journalId]: [comment, ...] }
  const [expandedComments, setExpandedComments] = useState({});
  const [commentReplyText, setCommentReplyText] = useState({});
  const [commentNewText, setCommentNewText] = useState({});
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState(null);

  const toggleExpandComments = (journalId) => {
    setExpandedComments((prev) => ({ ...prev, [journalId]: !prev[journalId] }));
  };

  const handlePostComment = async (journalId) => {
    const text = (commentNewText[journalId] || '').trim();
    if (!text || !session?.user?.id) return;
    setCommentSubmitting(true);
    try {
      const { data, error } = await supabase.from('journal_comments').insert({
        journal_id: journalId,
        user_id: session.user.id,
        body: text,
        organization_id: activeOrgId || null,
      }).select('*, profiles:user_id(full_name)');
      if (error) throw error;
      if (data?.[0]) {
        setJournalComments((prev) => ({
          ...prev,
          [journalId]: [...(prev[journalId] || []), data[0]],
        }));
      }
      setCommentNewText((prev) => ({ ...prev, [journalId]: '' }));
    } catch (err) {
      console.error('Error posting comment:', err.message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleReplyComment = async (journalId, parentId) => {
    const text = (commentReplyText[parentId] || '').trim();
    if (!text || !session?.user?.id) return;
    setCommentSubmitting(true);
    try {
      const { data, error } = await supabase.from('journal_comments').insert({
        journal_id: journalId,
        user_id: session.user.id,
        parent_id: parentId,
        body: text,
        organization_id: activeOrgId || null,
      }).select('*, profiles:user_id(full_name)');
      if (error) throw error;
      if (data?.[0]) {
        setJournalComments((prev) => ({
          ...prev,
          [journalId]: [...(prev[journalId] || []), data[0]],
        }));
      }
      setCommentReplyText((prev) => ({ ...prev, [parentId]: '' }));
      setReplyingToComment(null);
    } catch (err) {
      console.error('Error posting reply:', err.message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (journalId, commentId) => {
    try {
      const { error } = await supabase.from('journal_comments').delete().eq('id', commentId);
      if (error) throw error;
      setJournalComments((prev) => ({
        ...prev,
        [journalId]: (prev[journalId] || []).filter((c) => c.id !== commentId),
      }));
    } catch (err) {
      console.error('Error deleting comment:', err.message);
    }
  };

  const toggleExpandPrayer = (id) => {
    setExpandedPrayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandJournal = (id) => {
    setExpandedJournal((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (!activeImageUrl) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveImageUrl(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImageUrl]);

  // --- JOURNAL STATE ---
  const [journalEntries, setJournalEntries] = useState([]);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalTitle, setJournalTitle] = useState('');
  const [journalScripture, setJournalScripture] = useState('');
  const [journalBody, setJournalBody] = useState('');
  const [editingJournalId, setEditingJournalId] = useState(null);


  const defaultJournal = [
    {
      id: 'j1',
      title: "Meditation on Loving God & Others",
      scripture: "Mark 12:30-31",
      body: "Today I meditated on Jesus' call to love God with all our heart, soul, mind, and strength, and our neighbors as ourselves. It's a reminder that Christianity isn't just about rules; it's a deep relationship with our Creator that overflows into how we treat others in our daily life. I feel challenged to show real grace to my school peers this week.",
      date: "June 6, 2026"
    }
  ];

  // --- POLLS STATE ---
  const [polls, setPolls] = useState([]);
  const [userVotes, setUserVotes] = useState({}); // { pollId: optionId }
  const [pollStatusFilter, setPollStatusFilter] = useState('active');
  const [showCreatePollForm, setShowCreatePollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollGroupKey, setPollGroupKey] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollExpiresAt, setPollExpiresAt] = useState('');

  const [editingPollId, setEditingPollId] = useState(null);
  const [editPollQuestion, setEditPollQuestion] = useState('');
  const [editPollGroupKey, setEditPollGroupKey] = useState('');
  const [editPollOptions, setEditPollOptions] = useState([]);
  const [editPollExpiresAt, setEditPollExpiresAt] = useState('');
  const [editPollIsClosed, setEditPollIsClosed] = useState(false);
  const [writeInTexts, setWriteInTexts] = useState({}); // { [pollId]: '' }

  // --- GROUPS STATE ---
  const [groups, setGroups] = useState({});
  const [groupFilter, setGroupFilter] = useState(canCreateGroups ? 'all' : 'mine');
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDay, setNewGroupDay] = useState('');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [newGroupFrequency, setNewGroupFrequency] = useState('Weekly');
  const [newGroupTopic, setNewGroupTopic] = useState('');
  const [newGroupLeader, setNewGroupLeader] = useState('');
  const [newGroupCoLeader, setNewGroupCoLeader] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newGroupBookLink, setNewGroupBookLink] = useState('');
  const [newGroupBookTitle, setNewGroupBookTitle] = useState('');
  const [newGroupJoinStatus, setNewGroupJoinStatus] = useState('closed');

  // --- EDIT GROUP STATE ---
  const [editingGroupKey, setEditingGroupKey] = useState(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDay, setEditGroupDay] = useState('');
  const [editGroupTime, setEditGroupTime] = useState('');
  const [editGroupFrequency, setEditGroupFrequency] = useState('Weekly');
  const [editGroupTopic, setEditGroupTopic] = useState('');
  const [editGroupLeader, setEditGroupLeader] = useState('');
  const [editGroupCoLeader, setEditGroupCoLeader] = useState('');
  const [editGroupLocation, setEditGroupLocation] = useState('');
  const [editGroupBookLink, setEditGroupBookLink] = useState('');
  const [editGroupBookTitle, setEditGroupBookTitle] = useState('');
  const [editGroupJoinStatus, setEditGroupJoinStatus] = useState('closed');
  const [newGroupNextMeetingDate, setNewGroupNextMeetingDate] = useState('');
  const [editGroupNextMeetingDate, setEditGroupNextMeetingDate] = useState('');
  const [newGroupEndTime, setNewGroupEndTime] = useState('');
  const [editGroupEndTime, setEditGroupEndTime] = useState('');

  const [prevCanCreate, setPrevCanCreate] = useState(canCreateGroups);
  if (canCreateGroups !== prevCanCreate) {
    setPrevCanCreate(canCreateGroups);
    if (canCreateGroups) setGroupFilter('all');
  }

  const [prevDayFreq, setPrevDayFreq] = useState(`${newGroupDay}|${newGroupFrequency}`);
  const dayFreqKey = `${newGroupDay}|${newGroupFrequency}`;
  if (dayFreqKey !== prevDayFreq) {
    setPrevDayFreq(dayFreqKey);
    if (newGroupDay) {
      const calc = nextMeetingDate({ meetingDay: newGroupDay, frequency: newGroupFrequency });
      setNewGroupNextMeetingDate(calc ? toDateKey(calc) : '');
    } else {
      setNewGroupNextMeetingDate('');
    }
  }
  const [joinRequests, setJoinRequests] = useState([]);
  const [joinActionMessage, setJoinActionMessage] = useState('');
  const [joinActionLoading, setJoinActionLoading] = useState('');

  // --- ADD MEMBER STATE ---
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberLinkMessage, setMemberLinkMessage] = useState('');
  const [profiles, setProfiles] = useState([]);
  const avatarByProfileId = useMemo(() => {
    const map = {};
    for (const p of profiles) if (p.avatar_url) map[p.id] = p.avatar_url;
    return map;
  }, [profiles]);
  const [addMemberMode, setAddMemberMode] = useState('manual'); // 'manual' | 'search'
  const [addMemberSearch, setAddMemberSearch] = useState('');
  // { [studentId]: { open: bool, search: string } }
  const [linkPickerState, setLinkPickerState] = useState({});

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

  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);
  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === userId) || null,
    [profiles, userId],
  );
  const normalizePersonName = (name) => String(name || '').trim().toLowerCase();
  const canManageJoinRequestsForGroup = (group) => {
    if (!canCreateGroups || !group) return false;
    if (['developer', 'admin'].includes(userRole)) return true;
    const myName = normalizePersonName(currentProfile?.full_name);
    if (!myName) return false;
    return [group.leader, group.coLeader].some((name) => normalizePersonName(name) === myName);
  };

  const formatDate = (dateValue) => {
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const buildGroupId = (name) => {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `group-${Date.now()}`;
    let id = base;
    let suffix = 2;
    while (groups[id]) { id = `${base}-${suffix}`; suffix += 1; }
    return id;
  };

  const saveGroupsState = async (newGroups) => {
    setGroups(newGroups);
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));
    if (isConfigured) {
      for (const [id, group] of Object.entries(newGroups)) {
        await supabase.from('attendance_groups').upsert({
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
        });
      }
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const id = buildGroupId(newGroupName);
    const newGroups = {
      ...groups,
      [id]: {
        name: newGroupName.trim(),
        meetingDay: newGroupDay,
        meetingTime: newGroupTime.trim(),
        meetingEndTime: newGroupEndTime.trim(),
        frequency: newGroupFrequency,
        topic: newGroupTopic.trim(),
        leader: newGroupLeader.trim() || 'Unassigned',
        coLeader: newGroupCoLeader.trim(),
        meetingLocation: newGroupLocation.trim(),
        bookLink: newGroupBookLink.trim(),
        bookTitle: newGroupBookTitle.trim(),
        joinStatus: newGroupJoinStatus,
        nextMeetingDate: newGroupNextMeetingDate || '',
        sortOrder: Object.keys(groups).length,
        students: []
      }
    };
    await saveGroupsState(newGroups);
    setNewGroupName('');
    setNewGroupDay('');
    setNewGroupTime('');
    setNewGroupEndTime('');
    setNewGroupFrequency('Weekly');
    setNewGroupTopic('');
    setNewGroupLeader('');
    setNewGroupCoLeader('');
    setNewGroupLocation('');
    setNewGroupBookLink('');
    setNewGroupBookTitle('');
    setNewGroupJoinStatus('closed');
    setNewGroupNextMeetingDate('');
    setShowNewGroupForm(false);
  };

  const handleOpenEditGroup = (key, group) => {
    setEditingGroupKey(key);
    setEditGroupName(group.name);
    setEditGroupDay(group.meetingDay || '');
    setEditGroupTime(group.meetingTime || '');
    setEditGroupEndTime(group.meetingEndTime || '');
    setEditGroupFrequency(group.frequency || 'Weekly');
    setEditGroupTopic(group.topic || '');
    setEditGroupLeader(group.leader || '');
    setEditGroupCoLeader(group.coLeader || '');
    setEditGroupLocation(group.meetingLocation || '');
    setEditGroupBookLink(group.bookLink || '');
    setEditGroupBookTitle(group.bookTitle || '');
    setEditGroupJoinStatus(group.joinStatus || 'closed');
    const calc = nextMeetingDate(group);
    setEditGroupNextMeetingDate(group.nextMeetingDate || (calc ? toDateKey(calc) : ''));
  };

  const handleSaveEditGroup = async (e) => {
    e.preventDefault();
    if (!editingGroupKey) return;
    const existing = groups[editingGroupKey];
    const updated = {
      ...groups,
      [editingGroupKey]: {
        ...existing,
        name: editGroupName.trim() || existing.name,
        meetingDay: editGroupDay,
        meetingTime: editGroupTime.trim(),
        meetingEndTime: editGroupEndTime.trim(),
        frequency: editGroupFrequency,
        topic: editGroupTopic.trim(),
        leader: editGroupLeader.trim() || 'Unassigned',
        coLeader: editGroupCoLeader.trim(),
        meetingLocation: editGroupLocation.trim(),
        bookLink: editGroupBookLink.trim(),
        bookTitle: editGroupBookTitle.trim(),
        joinStatus: editGroupJoinStatus,
        nextMeetingDate: editGroupNextMeetingDate || '',
        sortOrder: existing.sortOrder || 0,
      }
    };
    await saveGroupsState(updated);
    setEditingGroupKey(null);
  };

  const handleAddMember = async (groupKey) => {
    const name = newMemberName.trim();
    if (!name) return;
    const normalizedEmail = newMemberEmail.trim().toLowerCase();
    const matchingProfile = normalizedEmail
      ? profiles.find(p => p.email?.toLowerCase() === normalizedEmail)
      : null;
    const existing = groups[groupKey];
    const newStudent = {
      id: makeMemberId(),
      name,
      email: normalizedEmail || '',
      linkedUserId: matchingProfile?.id || null,
      linkedUserName: matchingProfile?.full_name || '',
    };
    const updated = {
      ...groups,
      [groupKey]: { ...existing, students: [...(existing.students || []), newStudent] }
    };
    await saveGroupsState(updated);
    setMemberLinkMessage(matchingProfile ? `${name} was linked to their app account.` : '');
    setNewMemberName('');
    setNewMemberEmail('');
  };

  const handleAddFromProfile = async (groupKey, profile) => {
    const existing = groups[groupKey];
    // Prevent duplicates
    if (existing.students?.some(s => s.linkedUserId === profile.id)) {
      setMemberLinkMessage(`${profile.full_name || profile.email} is already in this group.`);
      return;
    }
    const newStudent = {
      id: makeMemberId(),
      name: profile.full_name || profile.email,
      email: profile.email || '',
      linkedUserId: profile.id,
      linkedUserName: profile.full_name || '',
    };
    const updated = {
      ...groups,
      [groupKey]: { ...existing, students: [...(existing.students || []), newStudent] }
    };
    await saveGroupsState(updated);
    setMemberLinkMessage(`${newStudent.name} added and linked.`);
    setAddMemberSearch('');
  };

  const handleLinkToProfile = async (groupKey, studentId, profile) => {
    const group = groups[groupKey];
    const updated = {
      ...groups,
      [groupKey]: {
        ...group,
        students: group.students.map(s =>
          s.id === studentId
            ? { ...s, linkedUserId: profile.id, linkedUserName: profile.full_name || '' }
            : s
        )
      }
    };
    await saveGroupsState(updated);
    setLinkPickerState(prev => ({ ...prev, [studentId]: { open: false, search: '' } }));
  };

  const handleUnlinkMember = async (groupKey, studentId) => {
    const group = groups[groupKey];
    const updated = {
      ...groups,
      [groupKey]: {
        ...group,
        students: group.students.map(s =>
          s.id === studentId
            ? { ...s, linkedUserId: null, linkedUserName: '' }
            : s
        )
      }
    };
    await saveGroupsState(updated);
  };

  const handleRemoveMember = async (groupKey, studentId) => {
    const existing = groups[groupKey];
    const student = existing.students?.find(s => s.id === studentId);
    if (!student || !window.confirm(`Remove ${student.name} from ${existing.name}?`)) return;
    const updated = {
      ...groups,
      [groupKey]: { ...existing, students: existing.students.filter(s => s.id !== studentId) }
    };
    await saveGroupsState(updated);
  };

  const handleDeleteGroup = async (groupKey) => {
    const group = groups[groupKey];
    if (!group || !window.confirm(`Are you sure you want to delete "${group.name}"? This will permanently remove the group and all its member linkages.`)) return;

    const newGroups = { ...groups };
    delete newGroups[groupKey];
    setGroups(newGroups);
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));

    if (isConfigured) {
      const { error } = await supabase.from('attendance_groups').delete().eq('id', groupKey);
      if (error) {
        console.error('Error deleting group from Supabase:', error);
      }
    }

    setEditingGroupKey(null);
    setExpandedGroupId(null);
  };

  const loadGroupsData = async () => {
    if (isConfigured) {
      let query = supabase
        .from('attendance_groups')
        .select('*')
        .order('created_at', { ascending: true });

      const { data, error } = await query;

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

      // Load profiles for account linking
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

  const handleJoinOrRequestGroup = async (groupKey) => {
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
        await saveGroupsState(updated);
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

  const handleApproveJoinRequest = async (request) => {
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

  const loadPollsData = async () => {
    if (isConfigured) {
      let pollQuery = supabase.from('polls').select('*').order('created_at', { ascending: false });
      let voteQuery = supabase.from('poll_votes').select('*');

      if (activeOrgId) {
        pollQuery = pollQuery.eq('organization_id', activeOrgId);
        voteQuery = voteQuery.eq('organization_id', activeOrgId);
      }

      const [{ data: pollRows }, { data: voteRows }] = await Promise.all([
        pollQuery,
        voteQuery,
      ]);

      const voteCountMap = {};
      const userVoteMap = {};
      (voteRows || []).forEach(v => {
        const key = `${v.poll_id}_${v.option_id}`;
        voteCountMap[key] = (voteCountMap[key] || 0) + 1;
        if (v.user_id === userId) userVoteMap[v.poll_id] = v.option_id;
      });

      setUserVotes(userVoteMap);
      setPolls((pollRows || []).map(p => ({
        id: p.id,
        groupKey: p.group_key,
        groupName: p.group_name,
        question: p.question,
        options: (p.options || []).map(opt => ({
          ...opt,
          votes: voteCountMap[`${p.id}_${opt.id}`] || 0,
        })),
        createdByName: p.created_by_name,
        createdAt: p.created_at,
        expiresAt: p.expires_at,
        isClosed: p.is_closed,
      })));
    } else {
      const saved = localStorage.getItem('miqra_polls');
      const savedVotes = localStorage.getItem('miqra_poll_votes');
      const allVotes = saved ? (JSON.parse(savedVotes || '[]')) : [];
      const voteCountMap = {};
      const userVoteMap = {};
      allVotes.forEach(v => {
        const key = `${v.pollId}_${v.optionId}`;
        voteCountMap[key] = (voteCountMap[key] || 0) + 1;
        if (v.userId === userId) userVoteMap[v.pollId] = v.optionId;
      });
      setUserVotes(userVoteMap);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPolls(parsed.map(p => ({
          ...p,
          options: (p.options || []).map(opt => ({
            ...opt,
            votes: voteCountMap[`${p.id}_${opt.id}`] || 0,
          })),
        })));
      }
    }
    if (onPollsChange) {
      onPollsChange();
    }
  };

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

  const loadLocalData = () => {
    setPrayers([]);

    const savedJournal = localStorage.getItem('miqra_journal');
    if (savedJournal) {
      try {
        setJournalEntries(JSON.parse(savedJournal));
      } catch {
        setJournalEntries(defaultJournal);
      }
    } else {
      setJournalEntries(defaultJournal);
      localStorage.setItem('miqra_journal', JSON.stringify(defaultJournal));
    }
  };

  const loadSupabaseData = async () => {
    let prayerQuery = supabase.from('prayers').select('*').order('created_at', { ascending: false });
    let amenQuery = supabase.from('prayer_amens').select('prayer_id, user_id');
    let journalQuery = supabase.from('journal_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (activeOrgId) {
      prayerQuery = prayerQuery.eq('organization_id', activeOrgId);
      amenQuery = amenQuery.eq('organization_id', activeOrgId);
      journalQuery = journalQuery.eq('organization_id', activeOrgId);
    }

    const [{ data: prayerRows, error: prayerError }, { data: amenRows }, { data: journalRows, error: journalError }] = await Promise.all([
      prayerQuery,
      amenQuery,
      journalQuery,
    ]);

    if (prayerError) {
      console.error('Error loading prayers from Supabase:', prayerError);
      setPrayers([]);
      return;
    }

    const amenCounts = {};
    const activeAmens = new Set();
    (amenRows || []).forEach((amen) => {
      amenCounts[amen.prayer_id] = (amenCounts[amen.prayer_id] || 0) + 1;
      if (amen.user_id === userId) activeAmens.add(amen.prayer_id);
    });

    setPrayers((prayerRows || []).map((prayer) => ({
      id: prayer.id,
      userId: prayer.user_id,
      name: prayer.name,
      category: prayer.category,
      text: prayer.body,
      summary: prayer.summary,
      date: formatDate(prayer.created_at),
      amenCount: amenCounts[prayer.id] || 0,
      amenActive: activeAmens.has(prayer.id),
      imagePaths: prayer.image_paths || [],
    })));

    if (journalError) {
      console.error('Error loading journal from Supabase:', journalError);
      setJournalEntries([]);
    } else {
      setJournalEntries((journalRows || []).map((entry) => ({
        id: entry.id,
        title: entry.title,
        scripture: entry.scripture || 'General Reflections',
        body: entry.body,
        summary: entry.summary,
        imagePath: entry.image_path,
        visibility: entry.visibility || 'private',
        date: formatDate(entry.created_at),
      })));

      // Load comments for the user's journal entries
      const journalIds = (journalRows || []).map((e) => e.id);
      if (journalIds.length > 0) {
        const { data: commentRows, error: commentError } = await supabase
          .from('journal_comments')
          .select('*, profiles:user_id(full_name)')
          .in('journal_id', journalIds)
          .order('created_at', { ascending: true });

        if (commentError) {
          console.error('Error loading journal comments:', commentError);
        } else {
          const grouped = {};
          (commentRows || []).forEach((c) => {
            if (!grouped[c.journal_id]) grouped[c.journal_id] = [];
            grouped[c.journal_id].push(c);
          });
          setJournalComments(grouped);
        }
      }
    }
  };

  // Load Data
  useEffect(() => {
    // The fellowship page intentionally hydrates local/Supabase state when the session becomes available.
    if (isConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSupabaseData();
    } else {
      loadLocalData();
    }
    loadGroupsData();
    loadJoinRequests();
    loadPollsData();
  }, [isConfigured, userId, activeOrgId, refreshTrigger]);

  // Save Prayers Helper
  const savePrayers = (updatedPrayers) => {
    setPrayers(updatedPrayers);
    localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
  };

  // Save Journal Helper
  const saveJournal = (updatedJournal) => {
    setJournalEntries(updatedJournal);
    localStorage.setItem('miqra_journal', JSON.stringify(updatedJournal));
  };

  const resetJournalForm = () => {
    setJournalTitle('');
    setJournalScripture('');
    setJournalBody('');
    setEditingJournalId(null);
    setJournalSummary('');
    setJournalImageUrl('');
    setJournalImageBlob(null);
    setJournalVisibility('private');
  };

  // --- PRAYER ACTIONS ---
  const handlePrayerImageChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    setPrayerImageFiles(files);
    setPrayerImagePreviews(files.map(f => URL.createObjectURL(f)));
  };

  const removePrayerImage = (idx) => {
    URL.revokeObjectURL(prayerImagePreviews[idx]);
    setPrayerImageFiles(prev => prev.filter((_, i) => i !== idx));
    setPrayerImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePrayerPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const newFiles = [];
    const newPreviews = [];
    for (const item of imageItems) {
      if (prayerImageFiles.length + newFiles.length >= 3) break;
      const file = item.getAsFile();
      if (file) {
        newFiles.push(file);
        newPreviews.push(URL.createObjectURL(file));
      }
    }
    if (newFiles.length > 0) {
      setPrayerImageFiles(prev => [...prev, ...newFiles].slice(0, 3));
      setPrayerImagePreviews(prev => [...prev, ...newPreviews].slice(0, 3));
    }
  };

  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerText.trim()) return;

    setPrayerSubmitting(true);
    setPrayerError('');

    const prayerId = 'p_' + Date.now();
    let imagePaths = [];

    if (isConfigured && prayerImageFiles.length > 0) {
      const uploads = await Promise.all(
        prayerImageFiles.map(async (file) => {
          const compressed = await compressImage(file);
          const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          const path = `${userId}/${prayerId}/${Date.now()}.${ext}`;
          const { error } = await supabase.storage
            .from('prayer-images')
            .upload(path, compressed, { contentType: compressed.type });
          return error ? null : path;
        })
      );
      imagePaths = uploads.filter(Boolean);
    }

    let summary = null;
    if (isConfigured && prayerText.trim().length > 250) {
      try {
        const { data, error: sumErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `Summarize this prayer request in a single short sentence (under 12 words) that captures all key requests. Do not include any introductory text, prefix, or signature. Just output the summary sentence. Prayer: "${prayerText.trim()}"`,
            max_new_tokens: 60
          }
        });
        if (!sumErr && data?.text) {
          summary = data.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (err) {
        console.error('Failed to generate prayer summary:', err);
      }
    }

    const newPrayer = {
      id: prayerId,
      userId,
      name: prayerName.trim() || 'Anonymous',
      category: null,
      text: prayerText.trim(),
      summary,
      date: formatDate(new Date()),
      amenCount: 1,
      amenActive: true,
      imagePaths,
    };

    if (isConfigured) {
      const { error } = await supabase.from('prayers').insert({
        id: newPrayer.id,
        user_id: userId,
        name: newPrayer.name,
        category: newPrayer.category,
        body: newPrayer.text,
        summary: newPrayer.summary,
        image_paths: imagePaths,
      });

      if (error) {
        console.error('Prayer insert error:', error);
        setPrayerError(error.message || 'Could not save your prayer. Please try again.');
        setPrayerSubmitting(false);
        return;
      }

      await supabase.from('prayer_amens').insert({
        prayer_id: newPrayer.id,
        user_id: userId,
      });
      setPrayers([newPrayer, ...prayers]);
    } else {
      savePrayers([newPrayer, ...prayers]);
    }

    setPrayerName('');
    setPrayerText('');
    setPrayerImageFiles([]);
    prayerImagePreviews.forEach(url => URL.revokeObjectURL(url));
    setPrayerImagePreviews([]);
    setPrayerSubmitting(false);
    setShowPrayerForm(false);
  };

  const handleAmen = async (id) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    const updated = prayers.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          amenCount: p.amenActive ? p.amenCount - 1 : p.amenCount + 1,
          amenActive: !p.amenActive
        };
      }
      return p;
    });
    setPrayers(updated);

    if (isConfigured && currentPrayer) {
      if (currentPrayer.amenActive) {
        await supabase.from('prayer_amens').delete().eq('prayer_id', id).eq('user_id', userId);
      } else {
        await supabase.from('prayer_amens').insert({ prayer_id: id, user_id: userId });
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  const handleDeletePrayer = async (id) => {
    setPrayers(prev => prev.filter(p => p.id !== id));
    if (isConfigured) {
      await supabase.from('prayer_amens').delete().eq('prayer_id', id);
      await supabase.from('prayers').delete().eq('id', id).eq('user_id', userId);
    } else {
      const updated = prayers.filter(p => p.id !== id);
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  const handleGenerateJournalAi = async () => {
    if (!journalBody.trim()) return;
    setJournalAiLoading(true);

    try {
      // 1. Generate summary via hf-proxy
      let generatedSummary = '';
      try {
        const { data: sumData, error: sumErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `Summarize this journal reflection in a single short sentence (under 12 words) that captures all key thoughts. Do not include any introductory text, prefix, or signature. Just output the summary. Reflection: "${journalBody.trim()}"`,
            max_new_tokens: 60
          }
        });
        if (!sumErr && sumData?.text) {
          generatedSummary = sumData.text.replace(/^["']|["']$/g, '').trim();
          setJournalSummary(generatedSummary);
        }
      } catch (err) {
        console.error('Failed to generate journal summary:', err);
      }

      // 2. Generate visual prompt via hf-proxy
      let artPrompt = `A serene cinematic biblical painting capturing the inner peace and reflection of: ${journalBody.trim().slice(0, 150)}`;
      try {
        const { data: artData, error: artErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `You are an art director creating a single text-to-image prompt that captures the visual themes of this journal reflection: "${journalBody.trim()}". Write ONE concrete, cinematic scene under 50 words, with no readable text, words, or letters. Respond with ONLY the image description.`,
            max_new_tokens: 120
          }
        });
        if (!artErr && artData?.text) {
          artPrompt = artData.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (err) {
        console.error('Failed to generate journal art prompt:', err);
      }

      // 3. Generate image via image-proxy
      const finalPrompt = `${artPrompt}, oil painting style, fine art, reverent atmosphere, warm soft light, no text, no words, no watermark`;
      const seed = Math.floor(Math.random() * 1000000);
      const { data: imgData, error: imgErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 }
      });

      if (imgErr || !imgData?.image) {
        throw new Error(imgErr?.message || 'No image returned');
      }

      // 4. Load the image and convert it to a blob for storage upload
      const response = await fetch(imgData.image);
      const blob = await response.blob();
      setJournalImageBlob(blob);
      setJournalImageUrl(imgData.image);
    } catch (err) {
      console.error('Failed to generate journal AI content:', err);
      alert('Could not generate AI artwork. Please check your connection and try again.');
    } finally {
      setJournalAiLoading(false);
    }
  };

  const handleRegenerateJournalImage = async () => {
    if (!journalBody.trim()) return;
    setJournalAiLoading(true);

    try {
      // 1. Generate visual prompt via hf-proxy
      let artPrompt = `A serene cinematic biblical painting capturing the inner peace and reflection of: ${journalBody.trim().slice(0, 150)}`;
      try {
        const { data: artData, error: artErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `You are an art director creating a single text-to-image prompt that captures the visual themes of this journal reflection: "${journalBody.trim()}". Write ONE concrete, cinematic scene under 50 words, with no readable text, words, or letters. Respond with ONLY the image description.`,
            max_new_tokens: 120
          }
        });
        if (!artErr && artData?.text) {
          artPrompt = artData.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (err) {
        console.error('Failed to generate journal art prompt:', err);
      }

      // 2. Generate image via image-proxy
      const finalPrompt = `${artPrompt}, oil painting style, fine art, reverent atmosphere, warm soft light, no text, no words, no watermark`;
      const seed = Math.floor(Math.random() * 1000000);
      const { data: imgData, error: imgErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 }
      });

      if (imgErr || !imgData?.image) {
        throw new Error(imgErr?.message || 'No image returned');
      }

      // 3. Load the image and convert it to a blob for storage upload
      const response = await fetch(imgData.image);
      const blob = await response.blob();
      setJournalImageBlob(blob);
      setJournalImageUrl(imgData.image);
    } catch (err) {
      console.error('Failed to regenerate journal AI image:', err);
      alert('Could not regenerate AI artwork. Please check your connection and try again.');
    } finally {
      setJournalAiLoading(false);
    }
  };

  // --- JOURNAL ACTIONS ---
  const handleJournalSubmit = async (e) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalBody.trim()) return;

    let imagePath = null;
    if (editingJournalId) {
      const existing = journalEntries.find(j => j.id === editingJournalId);
      imagePath = existing?.imagePath || null;
    }

    const entryId = editingJournalId || 'j_' + Date.now();

    if (isConfigured && journalImageBlob) {
      const path = `${userId}/journal-${entryId}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('prayer-images')
        .upload(path, journalImageBlob, { contentType: 'image/jpeg' });
      if (!uploadErr) {
        imagePath = path;
      } else {
        console.error('Journal image upload error:', uploadErr);
      }
    }

    const entrySummary = journalSummary.trim() || null;

    if (editingJournalId) {
      const updatedEntry = {
        title: journalTitle.trim(),
        scripture: journalScripture.trim() || 'General Reflections',
        body: journalBody.trim(),
        summary: entrySummary,
        image_path: imagePath,
        visibility: journalVisibility,
      };
      const updatedJournal = journalEntries.map((entry) => (
        entry.id === editingJournalId ? { 
          ...entry, 
          title: updatedEntry.title,
          scripture: updatedEntry.scripture,
          body: updatedEntry.body,
          summary: updatedEntry.summary,
          imagePath: updatedEntry.image_path,
          visibility: updatedEntry.visibility,
        } : entry
      ));

      if (isConfigured) {
        const { error } = await supabase
          .from('journal_entries')
          .update(updatedEntry)
          .eq('id', editingJournalId)
          .eq('user_id', userId);

        if (error) {
          console.error('Journal update error:', error);
          return;
        }

        setJournalEntries(updatedJournal);
      } else {
        saveJournal(updatedJournal);
      }

      resetJournalForm();
      setShowJournalForm(false);
      return;
    }

    const newEntry = {
      id: entryId,
      title: journalTitle.trim(),
      scripture: journalScripture.trim() || 'General Reflections',
      body: journalBody.trim(),
      summary: entrySummary,
      imagePath,
      visibility: journalVisibility,
      date: formatDate(new Date())
    };

    if (isConfigured) {
      const { error } = await supabase.from('journal_entries').insert({
        id: newEntry.id,
        user_id: userId,
        title: newEntry.title,
        scripture: newEntry.scripture,
        body: newEntry.body,
        summary: newEntry.summary,
        image_path: newEntry.imagePath,
        visibility: newEntry.visibility,
      });

      if (!error) setJournalEntries([newEntry, ...journalEntries]);
    } else {
      const updated = [newEntry, ...journalEntries];
      saveJournal(updated);
    }

    // Reset Form
    resetJournalForm();
    setShowJournalForm(false);
  };

  const startEditingJournalEntry = (entry) => {
    setEditingJournalId(entry.id);
    setJournalTitle(entry.title);
    setJournalScripture(entry.scripture === 'General Reflections' ? '' : entry.scripture);
    setJournalBody(entry.body);
    setJournalSummary(entry.summary || '');
    setJournalVisibility(entry.visibility || 'private');
    if (entry.imagePath) {
      const { data } = supabase.storage.from('prayer-images').getPublicUrl(entry.imagePath);
      setJournalImageUrl(data?.publicUrl || '');
    } else {
      setJournalImageUrl('');
    }
    setJournalImageBlob(null);
    setShowJournalForm(true);
  };

  const cancelJournalForm = () => {
    resetJournalForm();
    setShowJournalForm(false);
  };

  const toggleJournalForm = () => {
    if (showJournalForm) {
      cancelJournalForm();
      return;
    }

    resetJournalForm();
    setShowJournalForm(true);
  };

  const deleteJournalEntry = async (id) => {
    if (window.confirm("Are you sure you want to delete this journal entry?")) {
      const updated = journalEntries.filter(j => j.id !== id);
      setJournalEntries(updated);

      if (isConfigured) {
        await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', userId);
      } else {
        localStorage.setItem('miqra_journal', JSON.stringify(updated));
      }
    }
  };

  // --- POLL ACTIONS ---
  const isActivePoll = (poll) =>
    !poll.isClosed && (!poll.expiresAt || new Date(poll.expiresAt) > new Date());

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2 || !pollGroupKey) return;
    const group = groups[pollGroupKey];
    const newPoll = {
      id: `poll_${Date.now()}`,
      groupKey: pollGroupKey,
      groupName: group?.name || pollGroupKey,
      question: pollQuestion.trim(),
      options: validOptions.map((text, i) => ({ id: `opt_${Date.now()}_${i}`, text: text.trim(), votes: 0 })),
      createdByName: session?.user?.user_metadata?.full_name || '',
      createdAt: new Date().toISOString(),
      expiresAt: pollExpiresAt ? new Date(pollExpiresAt).toISOString() : null,
      isClosed: false,
    };
    setPolls(prev => [newPoll, ...prev]);
    if (isConfigured) {
      await supabase.from('polls').insert({
        id: newPoll.id,
        group_key: newPoll.groupKey,
        group_name: newPoll.groupName,
        question: newPoll.question,
        options: newPoll.options.map(({ id, text }) => ({ id, text })),
        created_by_name: newPoll.createdByName,
        expires_at: newPoll.expiresAt,
        is_closed: false,
      });
    } else {
      const existing = JSON.parse(localStorage.getItem('miqra_polls') || '[]');
      localStorage.setItem('miqra_polls', JSON.stringify([newPoll, ...existing]));
    }
    setPollQuestion('');
    setPollGroupKey('');
    setPollOptions(['', '']);
    setPollExpiresAt('');
    setShowCreatePollForm(false);
    if (onPollsChange) onPollsChange();
  };

  const handleVote = async (pollId, optionId) => {
    if (userVotes[pollId] || !userId) return;
    setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
    setPolls(prev => prev.map(p => p.id !== pollId ? p : {
      ...p,
      options: p.options.map(opt => ({ ...opt, votes: opt.id === optionId ? opt.votes + 1 : opt.votes }))
    }));
    if (isConfigured) {
      await supabase.from('poll_votes').insert({ id: makeVoteId(), poll_id: pollId, user_id: userId, option_id: optionId });
    } else {
      const existing = JSON.parse(localStorage.getItem('miqra_poll_votes') || '[]');
      localStorage.setItem('miqra_poll_votes', JSON.stringify([...existing, { pollId, userId, optionId }]));
    }
    if (onPollsChange) onPollsChange();
  };

  const handleClosePoll = async (pollId) => {
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isClosed: true } : p));
    if (isConfigured) {
      await supabase.from('polls').update({ is_closed: true }).eq('id', pollId);
    } else {
      const updated = polls.map(p => p.id === pollId ? { ...p, isClosed: true } : p);
      localStorage.setItem('miqra_polls', JSON.stringify(updated));
    }
    if (onPollsChange) onPollsChange();
  };

  const handleDeletePoll = async (pollId) => {
    setPolls(prev => prev.filter(p => p.id !== pollId));
    if (isConfigured) {
      await supabase.from('polls').delete().eq('id', pollId);
    } else {
      localStorage.setItem('miqra_polls', JSON.stringify(polls.filter(p => p.id !== pollId)));
    }
    if (onPollsChange) onPollsChange();
  };

  const startEditingPoll = (poll) => {
    setEditingPollId(poll.id);
    setEditPollQuestion(poll.question);
    setEditPollGroupKey(poll.groupKey);
    setEditPollOptions(poll.options.map(opt => ({ id: opt.id, text: opt.text })));
    setEditPollExpiresAt(poll.expiresAt ? new Date(poll.expiresAt).toISOString().split('T')[0] : '');
    setEditPollIsClosed(poll.isClosed || false);
  };

  const handleSavePollEdit = async (e) => {
    e.preventDefault();
    if (!editingPollId) return;
    const validOptions = editPollOptions.filter(o => o.text.trim());
    if (!editPollQuestion.trim() || validOptions.length < 2 || !editPollGroupKey) return;
    const group = groups[editPollGroupKey];
    const originalPoll = polls.find(p => p.id === editingPollId);
    const updatedOptions = validOptions.map((opt, i) => {
      if (opt.id) {
        const originalOpt = originalPoll?.options.find(o => o.id === opt.id);
        return {
          id: opt.id,
          text: opt.text.trim(),
          votes: originalOpt ? originalOpt.votes : 0
        };
      } else {
        return {
          id: `opt_${Date.now()}_edit_${i}`,
          text: opt.text.trim(),
          votes: 0
        };
      }
    });
    const updatedPolls = polls.map(p => {
      if (p.id === editingPollId) {
        return {
          ...p,
          groupKey: editPollGroupKey,
          groupName: group?.name || editPollGroupKey,
          question: editPollQuestion.trim(),
          options: updatedOptions,
          expiresAt: editPollExpiresAt ? new Date(editPollExpiresAt).toISOString() : null,
          isClosed: editPollIsClosed,
        };
      }
      return p;
    });
    const originalOptionIds = originalPoll?.options.map(o => o.id) || [];
    const remainingOptionIds = updatedOptions.map(o => o.id);
    const deletedOptionIds = originalOptionIds.filter(id => !remainingOptionIds.includes(id));
    setPolls(updatedPolls);
    setEditingPollId(null);
    if (isConfigured) {
      await supabase.from('polls').update({
        group_key: editPollGroupKey,
        group_name: group?.name || editPollGroupKey,
        question: editPollQuestion.trim(),
        options: updatedOptions.map(({ id, text }) => ({ id, text })),
        expires_at: editPollExpiresAt ? new Date(editPollExpiresAt).toISOString() : null,
        is_closed: editPollIsClosed,
      }).eq('id', editingPollId);
      if (deletedOptionIds.length > 0) {
        await supabase.from('poll_votes')
          .delete()
          .eq('poll_id', editingPollId)
          .in('option_id', deletedOptionIds);
      }
    } else {
      localStorage.setItem('miqra_polls', JSON.stringify(updatedPolls));
      if (deletedOptionIds.length > 0) {
        const savedVotes = localStorage.getItem('miqra_poll_votes');
        if (savedVotes) {
          const allVotes = JSON.parse(savedVotes);
          const remainingVotes = allVotes.filter(v => 
            !(v.pollId === editingPollId && deletedOptionIds.includes(v.optionId))
          );
          localStorage.setItem('miqra_poll_votes', JSON.stringify(remainingVotes));
        }
      }
    }
    const myCurrentVote = userVotes[editingPollId];
    if (myCurrentVote && deletedOptionIds.includes(myCurrentVote)) {
      setUserVotes(prev => {
        const copy = { ...prev };
        delete copy[editingPollId];
        return copy;
      });
    }
    if (onPollsChange) onPollsChange();
  };

  const handleAddWriteIn = async (pollId) => {
    const text = writeInTexts[pollId] || '';
    if (!text.trim() || !userId) return;

    const optionId = `opt_${Date.now()}_writein`;
    const cleanText = text.trim();

    if (isConfigured) {
      try {
        const { error } = await supabase.rpc('add_write_in_option', {
          p_poll_id: pollId,
          p_option_id: optionId,
          p_option_text: cleanText,
          p_user_id: userId
        });

        if (error) {
          console.error("Error adding write-in option:", error);
          alert(error.message || "Failed to add write-in option");
          return;
        }

        setPolls(prev => prev.map(p => {
          if (p.id !== pollId) return p;
          return {
            ...p,
            options: [...p.options, { id: optionId, text: cleanText, votes: 1 }]
          };
        }));
        setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
      } catch (err) {
        console.error("Failed to add write-in option:", err);
      }
    } else {
      const savedPolls = localStorage.getItem('miqra_polls');
      const allPolls = savedPolls ? JSON.parse(savedPolls) : [];

      const updatedPolls = allPolls.map(p => {
        if (p.id !== pollId) return p;
        return {
          ...p,
          options: [...(p.options || []), { id: optionId, text: cleanText, votes: 1 }]
        };
      });

      localStorage.setItem('miqra_polls', JSON.stringify(updatedPolls));

      const savedVotes = localStorage.getItem('miqra_poll_votes');
      const allVotes = savedVotes ? JSON.parse(savedVotes) : [];
      localStorage.setItem('miqra_poll_votes', JSON.stringify([...allVotes, { pollId, userId, optionId }]));

      setPolls(prev => prev.map(p => {
        if (p.id !== pollId) return p;
        return {
          ...p,
          options: [...p.options, { id: optionId, text: cleanText, votes: 1 }]
        };
      }));
      setUserVotes(prev => ({ ...prev, [pollId]: optionId }));
    }

    setWriteInTexts(prev => ({ ...prev, [pollId]: '' }));

    if (onPollsChange) {
      onPollsChange();
    }
  };


  const filteredPolls = polls.filter(p =>
    pollStatusFilter === 'active' ? isActivePoll(p) : !isActivePoll(p)
  );

  // Collect every linkedUserId across all groups the current user belongs to.
  // Leaders/admins can see all prayers; regular members only see prayers from
  // people in their shared groups (plus their own).
  const visiblePrayers = useMemo(() => {
    if (canCreateGroups) return prayers; // leaders see everything
    // Gather all user IDs who share at least one group with the current user
    const sharedUserIds = new Set();
    sharedUserIds.add(userId); // always include own prayers
    const myGroupKeys = Object.keys(groups).filter(key =>
      groups[key].students?.some(s => s.linkedUserId === userId)
    );
    myGroupKeys.forEach(key => {
      (groups[key].students || []).forEach(s => {
        if (s.linkedUserId) sharedUserIds.add(s.linkedUserId);
      });
    });
    return prayers.filter(p => sharedUserIds.has(p.userId));
  }, [prayers, groups, userId, canCreateGroups]);

  const myGroupIds = Object.keys(groups).filter(key => {
    const group = groups[key];
    return group.students?.some(s => s.linkedUserId === userId) || canManageJoinRequestsForGroup(group);
  });
  const displayedGroups = groupFilter === 'mine'
    ? Object.fromEntries(myGroupIds.map(k => [k, groups[k]]))
    : groups;

  const [draggedGroupKey, setDraggedGroupKey] = useState(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState(null);
  const canSortGroups = canCreateGroups && groupFilter === 'all';

  const displayedGroupEntries = useMemo(() => {
    return Object.entries(displayedGroups).sort(
      (a, b) => (a[1].sortOrder ?? 0) - (b[1].sortOrder ?? 0)
    );
  }, [displayedGroups]);

  const handleDragStart = (e, key) => {
    setDraggedGroupKey(key);
    setDragOverGroupKey(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e, targetKey) => {
    e.preventDefault();
    if (!draggedGroupKey || draggedGroupKey === targetKey) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupKey(targetKey);
  };

  const handleDropGroup = async (e, targetKey) => {
    e.preventDefault();
    const sourceKey = draggedGroupKey || e.dataTransfer.getData('text/plain');
    setDraggedGroupKey(null);
    setDragOverGroupKey(null);
    if (!sourceKey || sourceKey === targetKey) return;

    const entries = [...displayedGroupEntries];
    const draggedIdx = entries.findIndex(([k]) => k === sourceKey);
    const targetIdx = entries.findIndex(([k]) => k === targetKey);
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [removed] = entries.splice(draggedIdx, 1);
      entries.splice(targetIdx, 0, removed);

      const updatedGroups = { ...groups };
      entries.forEach(([k], index) => {
        updatedGroups[k] = { ...updatedGroups[k], sortOrder: index };
      });
      await saveGroupsState(updatedGroups);
    }
  };

  const handleDragEnd = () => {
    setDraggedGroupKey(null);
    setDragOverGroupKey(null);
  };
  const pendingRequestsByGroup = useMemo(() => {
    const grouped = {};
    joinRequests.forEach((request) => {
      if (!grouped[request.group_id]) grouped[request.group_id] = [];
      grouped[request.group_id].push(request);
    });
    return grouped;
  }, [joinRequests]);

  if (editingGroupKey) {
    const editingGroup = groups[editingGroupKey];
    return (
      <div className="edit-group-page-container animate-fade-in">
        <div style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setEditingGroupKey(null)}
          >
            ← Back to Fellowship
          </button>
        </div>

        <div className="edit-group-page-card">
          <form onSubmit={handleSaveEditGroup}>
            {/* Header */}
            <div className="edit-group-page-header">
              <div>
                <h2 className="edit-group-page-title">Group Settings</h2>
                <p className="edit-group-page-subtitle">{editingGroup?.name}</p>
              </div>
              <button
                type="button"
                className="btn-danger"
                style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                onClick={() => handleDeleteGroup(editingGroupKey)}
              >
                <Trash2 size={14} /> Delete Group
              </button>
            </div>

            {/* Body */}
            <div className="edit-group-page-body">
              {/* Section: Identity */}
              <div className="edit-group-section">
                <span className="edit-group-section-label">Group Identity</span>
                <div className="edit-group-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Group Name</label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={e => setEditGroupName(e.target.value)}
                      required
                      placeholder="e.g. High School Boys"
                    />
                  </div>
                  <div className="form-group">
                    <label>Leader</label>
                    <input type="text" value={editGroupLeader} onChange={e => setEditGroupLeader(e.target.value)} placeholder="e.g. Dan K." />
                  </div>
                  <div className="form-group">
                    <label>Co-Leader <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
                    <input type="text" value={editGroupCoLeader} onChange={e => setEditGroupCoLeader(e.target.value)} placeholder="e.g. Sarah M." />
                  </div>
                  <div className="form-group">
                    <label>Join Setting</label>
                    <select value={editGroupJoinStatus} onChange={e => setEditGroupJoinStatus(e.target.value)}>
                      <option value="open">Open - students can join immediately</option>
                      <option value="closed">Closed - approval required</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Topic / Study Focus</label>
                    <input type="text" value={editGroupTopic} onChange={e => setEditGroupTopic(e.target.value)} placeholder="e.g. Walking in Unity (Ephesians 4)" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Meeting Location</label>
                    <input type="text" value={editGroupLocation} onChange={e => setEditGroupLocation(e.target.value)} placeholder="e.g. Youth Room, Room 102" />
                  </div>
                </div>
              </div>

              {/* Section: Schedule */}
              <div className="edit-group-section">
                <span className="edit-group-section-label">Schedule</span>
                <div className="edit-group-grid">
                  <div className="form-group">
                    <label>Meeting Day</label>
                    <select value={editGroupDay} onChange={e => setEditGroupDay(e.target.value)}>
                      <option value="">Select day…</option>
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Meeting Time</label>
                    <input type="text" value={editGroupTime} onChange={e => setEditGroupTime(e.target.value)} placeholder="e.g. 6:30 PM" />
                  </div>
                  <div className="form-group">
                    <label>Meeting End Time</label>
                    <input type="text" value={editGroupEndTime} onChange={e => setEditGroupEndTime(e.target.value)} placeholder="e.g. 8:00 PM" />
                  </div>
                  <div className="form-group">
                    <label>Frequency</label>
                    <select value={editGroupFrequency} onChange={e => setEditGroupFrequency(e.target.value)}>
                      <option value="Weekly">Weekly</option>
                      <option value="Every Other Week">Every Other Week</option>
                      <option value="Once a Month">Once a Month</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Next Meeting Date</label>
                    <input type="date" value={editGroupNextMeetingDate} onChange={e => setEditGroupNextMeetingDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Section: Study Resource */}
              <div className="edit-group-section">
                <span className="edit-group-section-label">📖 Study Resource</span>
                <div className="edit-group-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Resource URL</label>
                    <input 
                      type="url" 
                      value={editGroupBookLink} 
                      onChange={e => {
                        const val = e.target.value;
                        setEditGroupBookLink(val);
                        if (!editGroupBookTitle.trim() && val) {
                          const extracted = extractTitleFromUrl(val);
                          if (extracted) {
                            setEditGroupBookTitle(extracted);
                          }
                        }
                      }} 
                      placeholder="https://amazon.com/book or any URL" 
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Link Label <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></span>
                      {editGroupBookLink && (
                        <button
                          type="button"
                          onClick={() => {
                            const extracted = extractTitleFromUrl(editGroupBookLink);
                            if (extracted) setEditGroupBookTitle(extracted);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-gold)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          Autofill from URL
                        </button>
                      )}
                    </label>
                    <input type="text" value={editGroupBookTitle} onChange={e => setEditGroupBookTitle(e.target.value)} placeholder="e.g. The Gospel of Mark — ESV Study Bible" />
                  </div>
                </div>
              </div>

              {/* Section: Members */}
              <div className="edit-group-section">
                <span className="edit-group-section-label">👥 Members ({editingGroup?.students?.length ?? 0})</span>

                {/* Add member tabbed panel */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                    {[{ id: 'manual', label: 'Manual Entry' }, { id: 'search', label: 'Search Registered' }].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => { setAddMemberMode(tab.id); setMemberLinkMessage(''); }}
                        style={{
                          flex: 1, padding: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
                          background: addMemberMode === tab.id ? 'var(--accent-gold-light)' : 'none',
                          border: 'none', borderBottom: addMemberMode === tab.id ? '2px solid var(--accent-gold)' : '2px solid transparent',
                          color: addMemberMode === tab.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: '0.75rem' }}>
                    {addMemberMode === 'manual' ? (
                      <>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="Full name"
                            value={newMemberName}
                            onChange={e => setNewMemberName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMember(editingGroupKey); } }}
                            style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
                            autoFocus
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="email"
                            placeholder="Email for account linking (optional)"
                            value={newMemberEmail}
                            onChange={e => setNewMemberEmail(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMember(editingGroupKey); } }}
                            style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
                          />
                          <button type="button" className="btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }} onClick={() => handleAddMember(editingGroupKey)}>
                            Add
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Search by name or email…"
                          value={addMemberSearch}
                          onChange={e => setAddMemberSearch(e.target.value)}
                          autoFocus
                          style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '0.5rem' }}
                        />
                        <div style={{ maxHeight: '180px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', overflowX: 'hidden' }}>
                          {(() => {
                            const alreadyIn = new Set((editingGroup?.students || []).map(s => s.linkedUserId).filter(Boolean));
                            const filtered = profiles.filter(p => {
                              if (alreadyIn.has(p.id)) return false;
                              if (!addMemberSearch) return true;
                              return p.full_name?.toLowerCase().includes(addMemberSearch.toLowerCase()) || p.email?.toLowerCase().includes(addMemberSearch.toLowerCase());
                            });
                            if (filtered.length === 0) return <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.75rem', margin: 0 }}>{profiles.length === 0 ? 'No registered users found.' : 'No matching users.'}</p>;
                            return filtered.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleAddFromProfile(editingGroupKey, p)}
                                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              >
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{p.full_name || '(No name)'}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.email}</div>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 700, marginLeft: '0.5rem', flexShrink: 0 }}>+ Add</span>
                              </button>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                    {memberLinkMessage && <p style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', margin: '0.5rem 0 0', fontWeight: 500 }}>{memberLinkMessage}</p>}
                  </div>
                </div>

                {/* Member list */}
                {(editingGroup?.students?.length ?? 0) === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No members yet. Add one above.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {editingGroup?.students?.map(s => {
                      const isLinked = Boolean(s.linkedUserId);
                      const pickerOpen = linkPickerState[s.id]?.open;
                      const pickerSearch = linkPickerState[s.id]?.search || '';
                      const filteredProfiles = profiles.filter(p =>
                        !pickerSearch ||
                        p.full_name?.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                        p.email?.toLowerCase().includes(pickerSearch.toLowerCase())
                      );
                      return (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: '0.25rem',
                            padding: '0.6rem 0.85rem',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '9px',
                            position: 'relative',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {s.name}{s.linkedUserId === userId ? ' (You)' : ''}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                onClick={() => { setMemberLinkMessage(''); setLinkPickerState(prev => ({ ...prev, [s.id]: { open: !pickerOpen, search: '' } })); }}
                                style={{
                                  border: `1px solid ${isLinked ? 'var(--border-color)' : 'var(--accent-gold)'}`,
                                  borderRadius: '6px', background: 'none', cursor: 'pointer',
                                  padding: '0.2rem 0.55rem', fontSize: '0.72rem',
                                  color: isLinked ? 'var(--text-muted)' : 'var(--accent-gold)', fontWeight: 600,
                                }}
                              >
                                {isLinked ? 'Swap' : 'Link Account'}
                              </button>
                              {isLinked && (
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkMember(editingGroupKey, s.id)}
                                  style={{ border: '1px solid var(--border-color)', borderRadius: '6px', background: 'none', cursor: 'pointer', padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}
                                >
                                  Unlink
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(editingGroupKey, s.id)}
                                style={{ border: '1px solid var(--error-red, #ef4444)', borderRadius: '6px', background: 'none', cursor: 'pointer', padding: '0.2rem 0.45rem', fontSize: '0.72rem', color: 'var(--error-red, #ef4444)', display: 'flex', alignItems: 'center' }}
                                title="Remove member"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: isLinked ? '#22c55e' : 'var(--text-muted)' }}>
                            {isLinked ? `✓ Linked${s.email ? ': ' + s.email : ''}` : s.email ? `Unlinked · ${s.email}` : 'No account email'}
                          </span>

                          {/* Inline account picker */}
                          {pickerOpen && (
                            <div style={{ marginTop: '0.4rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                              <input
                                type="text"
                                placeholder="Search by name or email…"
                                value={pickerSearch}
                                onChange={e => setLinkPickerState(prev => ({ ...prev, [s.id]: { open: true, search: e.target.value } }))}
                                autoFocus
                                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '0', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem', boxSizing: 'border-box' }}
                              />
                              <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                {filteredProfiles.length === 0
                                  ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', margin: 0 }}>No matching accounts.</p>
                                  : filteredProfiles.map(p => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => handleLinkToProfile(editingGroupKey, s.id, p)}
                                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', padding: '0.45rem 0.75rem' }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.full_name || '(No name)'}</div>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.email}</div>
                                    </button>
                                  ))
                                }
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkPickerState(prev => ({ ...prev, [s.id]: { open: false, search: '' } }))}
                                style={{ width: '100%', padding: '0.35rem', fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="edit-group-page-footer">
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.6rem 1.4rem' }}
                onClick={() => setEditingGroupKey(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '0.6rem 1.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 700 }}
              >
                <Check size={15} /> Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fellowship-page animate-fade-in">

      {/* Ice Breaker */}
      <IceBreaker session={session} userRole={userRole} activeOrgId={activeOrgId} />

      {/* Groups Section */}
      <section className="groups-section card">
        <div className="groups-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Users size={18} style={{ color: 'var(--accent-gold)' }} />
            <h2 style={{ margin: 0 }}>Small Groups</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="groups-filter-pills">
              <button
                className={`group-filter-pill ${groupFilter === 'mine' ? 'active' : ''}`}
                onClick={() => setGroupFilter('mine')}
              >
                My Groups
              </button>
              <button
                className={`group-filter-pill ${groupFilter === 'all' ? 'active' : ''}`}
                onClick={() => setGroupFilter('all')}
              >
                All
              </button>
            </div>
            {canCreateGroups && (
              <button
                className="btn-primary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => setShowNewGroupForm(v => !v)}
              >
                <Plus size={15} />
                <span>{showNewGroupForm ? 'Close' : 'New Group'}</span>
              </button>
            )}
          </div>
        </div>

        {canCreateGroups && showNewGroupForm && (
          <form onSubmit={handleAddGroup} className="new-group-form animate-fade-in">
            <div className="new-group-form-grid">
              <div className="form-group">
                <label>Group Name</label>
                <input type="text" placeholder="e.g. High School Boys" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Meeting Day</label>
                <select value={newGroupDay} onChange={e => setNewGroupDay(e.target.value)} required>
                  <option value="">Select day</option>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Meeting Time</label>
                <input type="text" placeholder="e.g. 6:30 PM" value={newGroupTime} onChange={e => setNewGroupTime(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Meeting End Time</label>
                <input type="text" placeholder="e.g. 8:00 PM" value={newGroupEndTime} onChange={e => setNewGroupEndTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={newGroupFrequency} onChange={e => setNewGroupFrequency(e.target.value)}>
                  <option value="Weekly">Weekly</option>
                  <option value="Every Other Week">Every Other Week</option>
                  <option value="Once a Month">Once a Month</option>
                </select>
              </div>
              <div className="form-group">
                <label>Next Meeting Date <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
                <input type="date" value={newGroupNextMeetingDate} onChange={e => setNewGroupNextMeetingDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Topic / Book</label>
                <input type="text" placeholder="e.g. Ephesians 4" value={newGroupTopic} onChange={e => setNewGroupTopic(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Leader</label>
                <input type="text" placeholder="e.g. Dan K." value={newGroupLeader} onChange={e => setNewGroupLeader(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Co-Leader</label>
                <input type="text" placeholder="Optional" value={newGroupCoLeader} onChange={e => setNewGroupCoLeader(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Join Setting</label>
                <select value={newGroupJoinStatus} onChange={e => setNewGroupJoinStatus(e.target.value)}>
                  <option value="open">Open - students can join immediately</option>
                  <option value="closed">Closed - approval required</option>
                </select>
              </div>
              <div className="form-group">
                <label>Meeting Location</label>
                <input type="text" placeholder="Optional (e.g. Youth Room)" value={newGroupLocation} onChange={e => setNewGroupLocation(e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>📖 Study Book / Resource Link</label>
                <input 
                  type="url" 
                  placeholder="https://amazon.com/book or any URL" 
                  value={newGroupBookLink} 
                  onChange={e => {
                    const val = e.target.value;
                    setNewGroupBookLink(val);
                    if (!newGroupBookTitle.trim() && val) {
                      const extracted = extractTitleFromUrl(val);
                      if (extracted) {
                        setNewGroupBookTitle(extracted);
                      }
                    }
                  }} 
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Link Label <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></span>
                  {newGroupBookLink && (
                    <button
                      type="button"
                      onClick={() => {
                        const extracted = extractTitleFromUrl(newGroupBookLink);
                        if (extracted) setNewGroupBookTitle(extracted);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-gold)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      Autofill from URL
                    </button>
                  )}
                </label>
                <input type="text" placeholder="e.g. The Gospel of Mark — ESV Study Bible" value={newGroupBookTitle} onChange={e => setNewGroupBookTitle(e.target.value)} />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowNewGroupForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Plus size={14} />
                Create Group
              </button>
            </div>
          </form>
        )}

        {joinActionMessage && (
          <p className="group-join-message">{joinActionMessage}</p>
        )}

        {displayedGroupEntries.length === 0 ? (
          <div className="groups-empty">
            {groupFilter === 'mine' ? (
              <>
                <p>You're not linked to any groups yet.</p>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem', marginTop: '0.5rem' }}
                  onClick={() => setGroupFilter('all')}
                >
                  View All Groups
                </button>
              </>
            ) : (
              <p>No groups have been created yet.</p>
            )}
          </div>
        ) : (
          <div className="groups-card-grid">
            {displayedGroupEntries.map(([key, group]) => {
              const isExpanded = expandedGroupId === key;
              const isEditingThis = editingGroupKey === key;
              const isMember = group.students?.some(s => s.linkedUserId === userId);
              const groupJoinStatus = group.joinStatus || 'closed';
              const myPendingRequest = joinRequests.find(request => request.group_id === key && request.requester_id === userId);
              const pendingRequests = pendingRequestsByGroup[key] || [];
              const canApproveThisGroup = canManageJoinRequestsForGroup(group);
              return (
                <div
                  key={key}
                  onDragOver={canSortGroups ? (e) => handleDragOver(e, key) : undefined}
                  onDrop={canSortGroups ? (e) => handleDropGroup(e, key) : undefined}
                  className={`group-card ${isExpanded ? 'expanded' : ''} ${draggedGroupKey === key ? 'dragging' : ''} ${dragOverGroupKey === key ? 'drop-target' : ''}`}
                  onClick={() => {
                    if (draggedGroupKey) return;
                    if (!isEditingThis) setExpandedGroupId(isExpanded ? null : key);
                  }}
                >
                  <div className="group-card-top">
                    {canSortGroups && (
                      <button
                        type="button"
                        className="group-drag-handle"
                        draggable
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => handleDragStart(e, key)}
                        onDragEnd={handleDragEnd}
                        title="Drag to reorder group"
                        aria-label={`Reorder ${group.name}`}
                      >
                        <GripVertical size={16} />
                      </button>
                    )}
                    <div className="group-card-main">
                      <h3 className="group-card-name">{group.name}</h3>
                      <div className="group-card-meta">
                        <span className="group-meta-item">
                          <Clock size={12} />
                          {[group.meetingDay, group.meetingTime].filter(Boolean).join(' · ') || 'TBD'}
                        </span>
                        <span className="group-meta-item">
                          <Users size={12} />
                          {group.students?.length ?? 0} members
                        </span>
                      </div>
                      {group.topic && (
                        <span className="badge badge-gold" style={{ fontSize: '0.65rem', marginTop: '0.4rem', display: 'inline-block' }}>
                          {group.topic}
                        </span>
                      )}
                      <span className={`group-join-status ${groupJoinStatus === 'open' ? 'open' : 'closed'}`}>
                        {groupJoinStatus === 'open' ? <Unlock size={11} /> : <Lock size={11} />}
                        {groupJoinStatus === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {!isExpanded && !isMember && groupJoinStatus === 'open' && (
                        <button
                          type="button"
                          className="group-join-btn"
                          disabled={joinActionLoading === key}
                          onClick={e => {
                            e.stopPropagation();
                            handleJoinOrRequestGroup(key);
                          }}
                          style={{
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.78rem',
                            borderRadius: '6px',
                            marginRight: '0.5rem'
                          }}
                        >
                          <UserPlus size={12} />
                          {joinActionLoading === key ? 'Working...' : 'Join Group'}
                        </button>
                      )}
                      {canCreateGroups && isExpanded && (
                        <>
                          <button
                            className="btn-icon"
                            title="Edit group"
                            onClick={e => { e.stopPropagation(); handleOpenEditGroup(key, group); }}
                            style={{ padding: '0.3rem', borderRadius: '6px' }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn-icon text-red"
                            title="Delete group"
                            onClick={e => { e.stopPropagation(); handleDeleteGroup(key); }}
                            style={{ padding: '0.3rem', borderRadius: '6px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      <div className="group-card-chevron">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && !isEditingThis && (
                    <div className="group-card-detail" onClick={e => e.stopPropagation()}>
                      <div className="group-detail-meta-row">
                        <div className="group-detail-field">
                          <span className="group-detail-label">Leader</span>
                          <span className="group-detail-value">{group.leader || '—'}</span>
                        </div>
                        {group.coLeader && (
                          <div className="group-detail-field">
                            <span className="group-detail-label">Co-Leader</span>
                            <span className="group-detail-value">{group.coLeader}</span>
                          </div>
                        )}
                        <div className="group-detail-field">
                          <span className="group-detail-label">Frequency</span>
                          <span className="group-detail-value">{group.frequency || '—'}</span>
                        </div>
                        {group.meetingLocation && (
                          <div className="group-detail-field">
                            <span className="group-detail-label">Location</span>
                            <span className="group-detail-value">{group.meetingLocation}</span>
                          </div>
                        )}
                      </div>
                      {!isMember && (
                        <div className="group-join-action-row">
                          <button
                            type="button"
                            className="group-join-btn"
                            disabled={Boolean(myPendingRequest) || joinActionLoading === key}
                            onClick={e => { e.stopPropagation(); handleJoinOrRequestGroup(key); }}
                          >
                            <UserPlus size={14} />
                            {joinActionLoading === key
                              ? 'Working...'
                              : myPendingRequest
                                ? 'Request Pending'
                                : groupJoinStatus === 'open'
                                  ? 'Join Group'
                                  : 'Request to Join'}
                          </button>
                          {groupJoinStatus === 'closed' && !myPendingRequest && (
                            <span className="group-join-help">Leader approval required.</span>
                          )}
                        </div>
                      )}
                      {isMember && (
                        <p className="group-member-note">You are a member of this group.</p>
                      )}
                      {canApproveThisGroup && pendingRequests.length > 0 && (
                        <div className="group-join-requests">
                          <span className="group-detail-label">Pending Join Requests</span>
                          {pendingRequests.map((request) => (
                            <div key={request.id} className="group-join-request-row">
                              <div>
                                <strong>{request.requester_name}</strong>
                                {request.requester_email && <span>{request.requester_email}</span>}
                              </div>
                              <button
                                type="button"
                                className="group-accept-btn"
                                disabled={joinActionLoading === request.id}
                                onClick={e => { e.stopPropagation(); handleApproveJoinRequest(request); }}
                              >
                                <Check size={13} />
                                {joinActionLoading === request.id ? 'Accepting...' : 'Accept'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {group.bookLink && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <a
                            href={group.bookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                              padding: '0.45rem 0.9rem', background: 'var(--accent-gold-light)',
                              border: '1px solid var(--accent-gold)', borderRadius: '8px',
                              color: 'var(--accent-gold)', fontWeight: 600, fontSize: '0.82rem',
                              textDecoration: 'none', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-gold-glow)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                          >
                            📖 {group.bookTitle || 'Study Resource'} →
                          </a>
                        </div>
                      )}

                      {/* Members — read-only summary */}
                      <div className="group-members-list">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span className="group-detail-label">Members</span>
                          {canCreateGroups && (
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                              onClick={e => { e.stopPropagation(); handleOpenEditGroup(key, group); }}
                            >
                              <Pencil size={10} /> Manage
                            </button>
                          )}
                        </div>
                        {group.students?.length > 0 ? (
                          <div className="group-member-tags">
                            {group.students.map(s => (
                              <span
                                key={s.id}
                                className={`group-member-tag ${s.linkedUserId === userId ? 'you' : ''}`}
                              >
                                {s.name}{s.linkedUserId === userId ? ' (You)' : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No members yet.</p>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Polls Section */}
      <section id="polls" className="polls-section card">
        <div className="polls-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BarChart2 size={18} style={{ color: 'var(--accent-gold)' }} />
            <h2 style={{ margin: 0 }}>Polls</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="groups-filter-pills">
              <button
                className={`group-filter-pill ${pollStatusFilter === 'active' ? 'active' : ''}`}
                onClick={() => setPollStatusFilter('active')}
              >
                Active
              </button>
              <button
                className={`group-filter-pill ${pollStatusFilter === 'expired' ? 'active' : ''}`}
                onClick={() => setPollStatusFilter('expired')}
              >
                Expired
              </button>
            </div>
            {canCreateGroups && (
              <button
                className="btn-primary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => setShowCreatePollForm(v => !v)}
              >
                <Plus size={15} />
                <span>{showCreatePollForm ? 'Close' : 'New Poll'}</span>
              </button>
            )}
          </div>
        </div>

        {canCreateGroups && showCreatePollForm && (
          <form onSubmit={handleCreatePoll} className="new-group-form animate-fade-in">
            <div className="new-group-form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Question</label>
                <input
                  type="text"
                  placeholder="e.g. What snacks should we get?"
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Group</label>
                <select value={pollGroupKey} onChange={e => setPollGroupKey(e.target.value)} required>
                  <option value="">Select group</option>
                  {Object.entries(groups).map(([key, g]) => (
                    <option key={key} value={key}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Expires (optional)</label>
                <input type="date" value={pollExpiresAt} onChange={e => setPollExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="poll-options-builder">
              <label className="form-group" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Options
              </label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="poll-option-input-row">
                  <input
                    type="text"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" className="btn-icon text-red" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setPollOptions(prev => [...prev, ''])}>
                  <Plus size={13} /> Add Option
                </button>
              )}
            </div>
            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowCreatePollForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BarChart2 size={14} /> Create Poll
              </button>
            </div>
          </form>
        )}

        {filteredPolls.length === 0 ? (
          <div className="groups-empty">
            <p>{pollStatusFilter === 'active' ? 'No active polls right now.' : 'No expired polls yet.'}</p>
          </div>
        ) : (
          <div className="polls-card-grid">
            {filteredPolls.map(poll => {
              if (editingPollId === poll.id) {
                return (
                  <form key={poll.id} onSubmit={handleSavePollEdit} className="poll-card poll-edit-form animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <span className="badge badge-gold" style={{ fontSize: '0.65rem', alignSelf: 'flex-start' }}>Editing Poll</span>
                      
                      <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Question</label>
                        <input
                          type="text"
                          value={editPollQuestion}
                          onChange={e => setEditPollQuestion(e.target.value)}
                          required
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Group</label>
                        <select 
                          value={editPollGroupKey} 
                          onChange={e => setEditPollGroupKey(e.target.value)} 
                          required
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                        >
                          <option value="">Select group</option>
                          {Object.entries(groups).map(([key, g]) => (
                            <option key={key} value={key}>{g.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expires (optional)</label>
                        <input 
                          type="date" 
                          value={editPollExpiresAt} 
                          onChange={e => setEditPollExpiresAt(e.target.value)} 
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div className="poll-options-builder" style={{ marginTop: '0.4rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                          Options
                        </label>
                        {editPollOptions.map((opt, i) => (
                          <div key={i} className="poll-option-input-row" style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder={`Option ${i + 1}`}
                              value={opt.text}
                              onChange={e => setEditPollOptions(prev => prev.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                              required
                              style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                            />
                            {editPollOptions.length > 2 && (
                              <button 
                                type="button" 
                                className="btn-icon text-red" 
                                onClick={() => setEditPollOptions(prev => prev.filter((_, j) => j !== i))}
                                style={{ padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {editPollOptions.length < 6 && (
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }} 
                            onClick={() => setEditPollOptions(prev => [...prev, { id: null, text: '' }])}
                          >
                            <Plus size={12} /> Add Option
                          </button>
                        )}
                      </div>
                      
                      <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                        <input 
                          type="checkbox" 
                          id="editPollIsClosed"
                          checked={editPollIsClosed} 
                          onChange={e => setEditPollIsClosed(e.target.checked)} 
                          style={{ width: 'auto' }}
                        />
                        <label htmlFor="editPollIsClosed" style={{ fontSize: '0.8rem', textTransform: 'none', letterSpacing: 'normal', cursor: 'pointer', margin: 0 }}>Close Poll / Keep Closed</label>
                      </div>
                    </div>


                    <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} 
                        onClick={() => setEditingPollId(null)}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="btn-primary" 
                        style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                );
              }

              const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
              const myVote = userVotes[poll.id];
              const hasVoted = Boolean(myVote);
              const active = isActivePoll(poll);
              return (
                <div key={poll.id} className={`poll-card ${!active ? 'poll-expired' : ''}`}>
                  <div className="poll-card-header">
                    <div>
                      <span className="badge badge-gold" style={{ fontSize: '0.65rem', marginBottom: '0.4rem', display: 'inline-block' }}>{poll.groupName}</span>
                      <h3 className="poll-question">{poll.question}</h3>
                    </div>
                    {canCreateGroups && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        <button className="btn-icon" title="Edit poll" onClick={() => startEditingPoll(poll)}>
                          <Pencil size={14} />
                        </button>
                        {active && (
                          <button className="btn-icon" title="Close poll" onClick={() => handleClosePoll(poll.id)}>
                            <Check size={14} />
                          </button>
                        )}
                        <button className="btn-icon text-red" title="Delete poll" onClick={() => handleDeletePoll(poll.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>


                  <div className="poll-options-list">
                    {poll.options.map(opt => {
                      const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                      const isMyVote = myVote === opt.id;
                      return (
                        <div key={opt.id} className="poll-option-row">
                          {!hasVoted && active ? (
                            <button className="poll-vote-btn" onClick={() => handleVote(poll.id, opt.id)}>
                              {opt.text}
                            </button>
                          ) : (
                            <div className={`poll-result-row ${isMyVote ? 'my-vote' : ''}`}>
                              <div className="poll-result-label">
                                {isMyVote && <Check size={12} style={{ flexShrink: 0 }} />}
                                <span>{opt.text}</span>
                              </div>
                              <div className="poll-bar-track">
                                <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="poll-pct">{pct}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({opt.votes})</span></span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!hasVoted && active && (
                      <div className="poll-write-in-row" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <input
                          type="text"
                          placeholder="+ Suggest an option..."
                          value={writeInTexts[poll.id] || ''}
                          onChange={e => setWriteInTexts(prev => ({ ...prev, [poll.id]: e.target.value }))}
                          style={{
                            flex: 1,
                            padding: '0.45rem 0.75rem',
                            fontSize: '0.85rem',
                            borderRadius: '8px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)'
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleAddWriteIn(poll.id)}
                          style={{
                            padding: '0.45rem 0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                          title="Submit suggestion and vote"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                  </div>


                  <div className="poll-card-footer">
                    <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
                    <span>
                      {!active ? (
                        <span className="poll-status-badge expired">Closed</span>
                      ) : poll.expiresAt ? (
                        <span className="poll-status-badge active">Closes {new Date(poll.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      ) : (
                        <span className="poll-status-badge active">Open</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="fellowship-grid">

      {/* 1. Prayer Wall Column */}
      <section className="card">
        <div className="wall-header">
          <h2>Prayer Wall</h2>
          <button 
            onClick={() => setShowPrayerForm(!showPrayerForm)}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} />
            <span>{showPrayerForm ? 'Close Form' : 'Request Prayer'}</span>
          </button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent-gold)', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.4 }}>
          ℹ️ Showing prayer requests shared by members within your associated small groups.
        </div>

        {/* New Prayer Form */}
        {showPrayerForm && (
          <form onSubmit={handlePrayerSubmit} className="prayer-form animate-fade-in">
            <div className="form-group">
              <label htmlFor="prayer-name">Your Name / Initials</label>
              <input 
                id="prayer-name"
                type="text" 
                placeholder="e.g. John S. (leave blank for Anonymous)"
                value={prayerName}
                onChange={(e) => setPrayerName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="prayer-req">Prayer Request</label>
              <textarea
                id="prayer-req"
                rows={4}
                placeholder="What would you like the fellowship to pray for? You can also paste an image directly here."
                value={prayerText}
                onChange={(e) => setPrayerText(e.target.value)}
                onPaste={handlePrayerPaste}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', marginBottom: 0 }}>
                💡 Paste an image directly into the text box to attach it.
              </p>
            </div>

            <div className="form-group">
              <label>Photo <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional · up to 3)</span></label>
              {prayerImagePreviews.length > 0 && (
                <div className="prayer-image-previews">
                  {prayerImagePreviews.map((src, i) => (
                    <div key={i} className="prayer-image-preview">
                      <img src={src} alt="" />
                      <button type="button" className="prayer-image-remove" onClick={() => removePrayerImage(i)} aria-label="Remove photo">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {prayerImagePreviews.length < 3 && (
                <label className="prayer-image-upload-btn">
                  <ImagePlus size={15} />
                  <span>Add photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handlePrayerImageChange}
                  />
                </label>
              )}
            </div>

            {prayerError && (
              <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0, padding: '0.5rem 0.75rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                {prayerError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => { setShowPrayerForm(false); setPrayerError(''); }}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={prayerSubmitting}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Send size={14} />
                <span>{prayerSubmitting ? 'Submitting…' : 'Submit Request'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Prayers Cards List */}
        <div className="prayer-card-list">
          {visiblePrayers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              No prayer requests currently active. Feel free to submit the first!
            </p>
          ) : (
            visiblePrayers.map((prayer) => (
              <div key={prayer.id} className="prayer-request-card">
                <div className="prayer-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {prayer.name && prayer.name.toLowerCase() !== 'anonymous' && (
                      <Avatar src={avatarByProfileId[prayer.userId]} name={prayer.name} size={32} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <span className="prayer-user">{prayer.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{prayer.date}</span>
                    </div>
                  </div>
                </div>
                
                {prayer.summary ? (
                  <>
                    <p className="prayer-text">
                      "{expandedPrayers[prayer.id] ? prayer.text : prayer.summary}"
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleExpandPrayer(prayer.id)}
                      className="prayer-expand-btn"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color, #3b82f6)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.85rem',
                        marginTop: '-0.5rem',
                        marginBottom: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontWeight: '500',
                      }}
                    >
                      {expandedPrayers[prayer.id] ? 'Show less ▲' : 'Read full request ▼'}
                    </button>
                  </>
                ) : (
                  <p className="prayer-text">"{prayer.text}"</p>
                )}

                {prayer.imagePaths?.length > 0 && (
                  <div className="prayer-card-images">
                    {prayer.imagePaths.map((path, i) => {
                      const { data } = supabase.storage.from('prayer-images').getPublicUrl(path);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActiveImageUrl(data.publicUrl)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'block',
                          }}
                          aria-label="View large image"
                        >
                          <img src={data.publicUrl} alt="" className="prayer-card-img" />
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="prayer-card-footer">
                  <span>Joined by {prayer.amenCount} brethren in prayer</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {prayer.userId === userId && (
                      <button
                        onClick={() => handleDeletePrayer(prayer.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                        title="Delete prayer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleAmen(prayer.id)}
                      className={`amen-btn ${prayer.amenActive ? 'active' : ''}`}
                    >
                      <Heart size={14} fill={prayer.amenActive ? "var(--accent-gold)" : "none"} />
                      <span>Amen</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 2. Personal Journal Column */}
      <section className="card">
        <div className="journal-header">
          <h2>Study Journal</h2>
          <button 
            onClick={toggleJournalForm}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} />
            <span>{showJournalForm ? 'Close Form' : 'New Entry'}</span>
          </button>
        </div>

        {/* New Journal Form */}
        {showJournalForm && (
          <form onSubmit={handleJournalSubmit} className="journal-form animate-fade-in">
            <div className="form-group">
              <label htmlFor="journal-title">Entry Title</label>
              <input 
                id="journal-title"
                type="text" 
                placeholder="e.g. Insights from Sunday small group"
                value={journalTitle}
                onChange={(e) => setJournalTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="journal-scripture">Scripture Focus</label>
              <input 
                id="journal-scripture"
                type="text" 
                placeholder="e.g. Numbers 8:4"
                value={journalScripture}
                onChange={(e) => setJournalScripture(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="journal-reflections">Reflections</label>
              <textarea 
                id="journal-reflections"
                rows={4} 
                placeholder="Write down what you learned, notes, or prayer thoughts..."
                value={journalBody}
                onChange={(e) => setJournalBody(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="journal-visibility">Visibility</label>
              <select
                id="journal-visibility"
                value={journalVisibility}
                onChange={(e) => setJournalVisibility(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #ccc)',
                  background: 'var(--bg-card, #fff)',
                  color: 'var(--text-primary, #000)',
                }}
              >
                <option value="private">Private</option>
                <option value="groups">Share with groups only</option>
                <option value="public">Public</option>
              </select>
            </div>

            {isConfigured && journalBody.trim() && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={handleGenerateJournalAi}
                  disabled={journalAiLoading}
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    width: '100%',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-highlight, #f3f4f6)',
                    fontWeight: '500',
                  }}
                >
                  {journalAiLoading ? (
                    <>
                      <Loader2 className="spin" size={14} />
                      <span>Generating AI Art & Summary...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} style={{ color: 'var(--accent-gold, #d97706)' }} />
                      <span>AI Generate Artwork & Summary</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Preview Generated AI Content */}
            {(journalSummary || journalImageUrl) && (
              <div className="form-group ai-preview-box" style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px dashed var(--accent-gold, #d97706)',
                backgroundColor: 'var(--gold-light-bg, #fffbeb)',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-gold, #d97706)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Draft Preview</span>
                {journalImageUrl && (
                  <div style={{ marginTop: '0.5rem', position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden' }}>
                    <img src={journalImageUrl} alt="Generated reflection art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={handleRegenerateJournalImage}
                      disabled={journalAiLoading}
                      className="btn-secondary"
                      style={{
                        position: 'absolute',
                        bottom: '0.5rem',
                        right: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        zIndex: 10
                      }}
                    >
                      {journalAiLoading ? <Loader2 className="spin" size={12} /> : <RefreshCw size={12} />}
                      <span>Regenerate Image</span>
                    </button>
                  </div>
                )}
                {journalSummary && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label htmlFor="journal-summary-edit" style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>AI Summary</label>
                    <input
                      id="journal-summary-edit"
                      type="text"
                      value={journalSummary}
                      onChange={(e) => setJournalSummary(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem',
                        fontSize: '0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #ccc)',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button 
                type="button" 
                onClick={cancelJournalForm}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Sparkles size={14} />
                <span>{editingJournalId ? 'Save Changes' : 'Save Entry'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Journal Entries List */}
        <div className="journal-list">
          {journalEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              Your study journal is empty. Click "New Entry" above to start documenting your studies!
            </p>
          ) : (
            journalEntries.map((entry) => (
              <div key={entry.id} className="journal-card">
                <div className="journal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 className="journal-title" style={{ margin: 0 }}>{entry.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                      <span className="journal-date" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Calendar size={12} />
                        {entry.date}
                      </span>
                      <span className="journal-visibility" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {entry.visibility === 'public' && <Unlock size={12} style={{ color: 'var(--success-color, #10b981)' }} />}
                        {entry.visibility === 'groups' && <Users size={12} style={{ color: 'var(--accent-blue, #3b82f6)' }} />}
                        {(entry.visibility === 'private' || !entry.visibility) && <Lock size={12} style={{ color: 'var(--accent-gold, #d97706)' }} />}
                        <span style={{ textTransform: 'capitalize' }}>
                          {entry.visibility === 'groups' ? 'Groups Only' : entry.visibility || 'Private'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="journal-scripture-focus" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <BookOpen size={12} />
                  <span>{entry.scripture}</span>
                </div>
                
                {/* Split/Regular Layout for Image & Summary */}
                {entry.imagePath || entry.summary ? (
                  <div className="journal-split-content" style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'flex-start' }}>
                    {entry.imagePath && (() => {
                      const { data: imgData } = supabase.storage.from('prayer-images').getPublicUrl(entry.imagePath);
                      return (
                        <div 
                          className="journal-card-image-container" 
                          style={{ 
                            flexShrink: 0, 
                            width: '100px', 
                            height: '100px', 
                            borderRadius: '8px', 
                            overflow: 'hidden', 
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                            cursor: 'pointer'
                          }}
                          onClick={() => setActiveImageUrl(imgData?.publicUrl)}
                        >
                          <img 
                            src={imgData?.publicUrl} 
                            alt="AI reflection artwork" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        </div>
                      );
                    })()}
                    <div className="journal-card-text" style={{ flexGrow: 1 }}>
                      {entry.summary && (
                        <div style={{ fontStyle: 'italic', color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '500' }}>
                          "{entry.summary}"
                        </div>
                      )}
                      
                      {expandedJournal[entry.id] ? (
                        <p className="journal-body" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{entry.body}</p>
                      ) : (
                        <p className="journal-body-preview" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {entry.body.length > 150 ? `${entry.body.substring(0, 150)}...` : entry.body}
                        </p>
                      )}

                      {entry.body.length > 150 && (
                        <button
                          onClick={() => toggleExpandJournal(entry.id)}
                          className="btn-link"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--accent-gold, #d97706)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            marginTop: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          {expandedJournal[entry.id] ? (
                            <>
                              <ChevronUp size={12} />
                              <span>Show less</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown size={12} />
                              <span>Read full reflection</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  // Normal layout when there's no summary and no image
                  <div style={{ marginTop: '1rem' }}>
                    {expandedJournal[entry.id] ? (
                      <p className="journal-body" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{entry.body}</p>
                    ) : (
                      <p className="journal-body-preview" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {entry.body.length > 200 ? `${entry.body.substring(0, 200)}...` : entry.body}
                      </p>
                    )}

                    {entry.body.length > 200 && (
                      <button
                        onClick={() => toggleExpandJournal(entry.id)}
                        className="btn-link"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--accent-gold, #d97706)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        {expandedJournal[entry.id] ? (
                          <>
                            <ChevronUp size={12} />
                            <span>Show less</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} />
                            <span>Read full reflection</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
                
                <div className="journal-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => startEditingJournalEntry(entry)}
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                  <button 
                    onClick={() => deleteJournalEntry(entry.id)}
                    className="btn-danger"
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                </div>

                {/* Comments Section */}
                {(() => {
                  const comments = journalComments[entry.id] || [];
                  const topLevel = comments.filter((c) => !c.parent_id);
                  const replies = comments.filter((c) => c.parent_id);
                  const commentCount = comments.length;
                  return (
                    <div className="journal-comments-section">
                      <button
                        type="button"
                        className="journal-comments-toggle"
                        onClick={() => toggleExpandComments(entry.id)}
                      >
                        <MessageCircle size={13} />
                        <span>Comments{commentCount > 0 ? ` (${commentCount})` : ''}</span>
                        {expandedComments[entry.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {expandedComments[entry.id] && (
                        <div className="journal-comments-list">
                          {topLevel.length === 0 && (
                            <p className="journal-comments-empty">No comments yet. Share this entry to get feedback!</p>
                          )}

                          {topLevel.map((comment) => {
                            const commenterName = comment.profiles?.full_name || 'Anonymous';
                            const isOwn = comment.user_id === session?.user?.id;
                            const commentReplies = replies.filter((r) => r.parent_id === comment.id);

                            return (
                              <div key={comment.id} className="journal-comment-item">
                                <div className="journal-comment-header">
                                  <span className="journal-comment-author">{commenterName}</span>
                                  <span className="journal-comment-date">
                                    {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                                <p className="journal-comment-body">{comment.body}</p>
                                <div className="journal-comment-actions">
                                  <button
                                    type="button"
                                    className="journal-comment-reply-btn"
                                    onClick={() => setReplyingToComment(replyingToComment === comment.id ? null : comment.id)}
                                  >
                                    <CornerDownRight size={11} /> Reply
                                  </button>
                                  {isOwn && (
                                    <button
                                      type="button"
                                      className="journal-comment-delete-btn"
                                      onClick={() => handleDeleteComment(entry.id, comment.id)}
                                    >
                                      <Trash2 size={11} /> Delete
                                    </button>
                                  )}
                                </div>

                                {/* Reply Input */}
                                {replyingToComment === comment.id && (
                                  <div className="journal-comment-reply-form">
                                    <input
                                      type="text"
                                      className="journal-comment-reply-input"
                                      placeholder={`Reply to ${commenterName}…`}
                                      value={commentReplyText[comment.id] || ''}
                                      onChange={(e) => setCommentReplyText((prev) => ({ ...prev, [comment.id]: e.target.value }))}
                                      disabled={commentSubmitting}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleReplyComment(entry.id, comment.id);
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                      onClick={() => handleReplyComment(entry.id, comment.id)}
                                      disabled={commentSubmitting || !(commentReplyText[comment.id] || '').trim()}
                                    >
                                      {commentSubmitting ? <Loader2 size={10} className="spin" /> : <Send size={10} />}
                                      Send
                                    </button>
                                  </div>
                                )}

                                {/* Nested Replies */}
                                {commentReplies.map((reply) => {
                                  const replyName = reply.profiles?.full_name || 'Anonymous';
                                  const isOwnReply = reply.user_id === session?.user?.id;
                                  return (
                                    <div key={reply.id} className="journal-comment-reply">
                                      <CornerDownRight size={11} className="reply-indent-icon" />
                                      <div className="journal-comment-reply-content">
                                        <div className="journal-comment-header">
                                          <span className="journal-comment-author">{replyName}</span>
                                          <span className="journal-comment-date">
                                            {new Date(reply.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        </div>
                                        <p className="journal-comment-body">{reply.body}</p>
                                        {isOwnReply && (
                                          <button
                                            type="button"
                                            className="journal-comment-delete-btn"
                                            onClick={() => handleDeleteComment(entry.id, reply.id)}
                                          >
                                            <Trash2 size={11} /> Delete
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}

                          {/* New Comment Form */}
                          <div className="journal-comment-new-form">
                            <input
                              type="text"
                              className="journal-comment-new-input"
                              placeholder="Write a comment…"
                              value={commentNewText[entry.id] || ''}
                              onChange={(e) => setCommentNewText((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                              disabled={commentSubmitting}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handlePostComment(entry.id);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                              onClick={() => handlePostComment(entry.id)}
                              disabled={commentSubmitting || !(commentNewText[entry.id] || '').trim()}
                            >
                              {commentSubmitting ? <Loader2 size={11} className="spin" /> : <Send size={11} />}
                              Post
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Image Modal for Prayer Wall Pictures */}
      {activeImageUrl && createPortal(
        <div 
          className="image-modal-backdrop" 
          onClick={() => setActiveImageUrl(null)}
          role="presentation"
        >
          <div 
            className="image-modal-content" 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              className="image-modal-close" 
              onClick={() => setActiveImageUrl(null)}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img 
              src={activeImageUrl} 
              alt="Prayer wall attachment" 
              className="image-modal-img" 
            />
          </div>
        </div>,
        document.body
      )}

      </div>{/* end fellowship-grid */}
    </div>
  );
}
