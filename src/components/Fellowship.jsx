import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Fellowship.css';
import { Heart, Plus, BookOpen, Trash2, Calendar, Send, Sparkles, Pencil, Users, ChevronDown, ChevronUp, Clock, BarChart2, X, Check } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';

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

export default function Fellowship({ session, userRole, activeOrgId, onPollsChange }) {
  const location = useLocation();
  const canCreateGroups = canAccessLeaderTools(userRole);
  // --- PRAYER WALL STATE ---
  const [prayers, setPrayers] = useState([]);
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerCategory, setPrayerCategory] = useState('Healing');
  const [prayerText, setPrayerText] = useState('');
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);
  const [prayerError, setPrayerError] = useState('');

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
  const [groupFilter, setGroupFilter] = useState('mine');
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

  // --- ADD MEMBER STATE ---
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberLinkMessage, setMemberLinkMessage] = useState('');
  const [profiles, setProfiles] = useState([]);
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
      students: [
        { id: 'sm1', name: "Samuel Adams" }, { id: 'sm2', name: "David Copperfield" },
        { id: 'sm3', name: "Elijah Craig" }, { id: 'sm4', name: "Chloe Smith" },
        { id: 'sm5', name: "Grace Kelly" }, { id: 'sm6', name: "Sophia Loren" }
      ]
    }
  };

  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);

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
        frequency: newGroupFrequency,
        topic: newGroupTopic.trim(),
        leader: newGroupLeader.trim() || 'Unassigned',
        coLeader: newGroupCoLeader.trim(),
        meetingLocation: newGroupLocation.trim(),
        bookLink: newGroupBookLink.trim(),
        bookTitle: newGroupBookTitle.trim(),
        students: []
      }
    };
    await saveGroupsState(newGroups);
    setNewGroupName('');
    setNewGroupDay('');
    setNewGroupTime('');
    setNewGroupFrequency('Weekly');
    setNewGroupTopic('');
    setNewGroupLeader('');
    setNewGroupCoLeader('');
    setNewGroupLocation('');
    setNewGroupBookLink('');
    setNewGroupBookTitle('');
    setShowNewGroupForm(false);
  };

  const handleOpenEditGroup = (key, group) => {
    setEditingGroupKey(key);
    setEditGroupName(group.name);
    setEditGroupDay(group.meetingDay || '');
    setEditGroupTime(group.meetingTime || '');
    setEditGroupFrequency(group.frequency || 'Weekly');
    setEditGroupTopic(group.topic || '');
    setEditGroupLeader(group.leader || '');
    setEditGroupCoLeader(group.coLeader || '');
    setEditGroupLocation(group.meetingLocation || '');
    setEditGroupBookLink(group.bookLink || '');
    setEditGroupBookTitle(group.bookTitle || '');
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
        frequency: editGroupFrequency,
        topic: editGroupTopic.trim(),
        leader: editGroupLeader.trim() || 'Unassigned',
        coLeader: editGroupCoLeader.trim(),
        meetingLocation: editGroupLocation.trim(),
        bookLink: editGroupBookLink.trim(),
        bookTitle: editGroupBookTitle.trim(),
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

      if (activeOrgId) {
        query = query.eq('organization_id', activeOrgId);
      }

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
            frequency: item.frequency,
            topic: item.topic,
            leader: item.leader,
            coLeader: item.co_leader,
            meetingLocation: item.meeting_location || '',
            bookLink: item.book_link || '',
            bookTitle: item.book_title || '',
            students: item.students || []
          };
        });
        setGroups(mapped);
      }

      // Load profiles for account linking
      if (activeOrgId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, email, full_name, profile_organizations!inner(organization_id)')
          .eq('profile_organizations.organization_id', activeOrgId)
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
      date: formatDate(prayer.created_at),
      amenCount: amenCounts[prayer.id] || 0,
      amenActive: activeAmens.has(prayer.id),
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
        date: formatDate(entry.created_at),
      })));
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
    loadPollsData();
  }, [isConfigured, userId, activeOrgId]);

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
  };

  // --- PRAYER ACTIONS ---
  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerText.trim()) return;

    setPrayerSubmitting(true);
    setPrayerError('');

    const newPrayer = {
      id: 'p_' + Date.now(),
      userId,
      name: prayerName.trim() || 'Anonymous',
      category: prayerCategory,
      text: prayerText.trim(),
      date: formatDate(new Date()),
      amenCount: 1,
      amenActive: true,
    };

    if (isConfigured) {
      const { error } = await supabase.from('prayers').insert({
        id: newPrayer.id,
        user_id: userId,
        name: newPrayer.name,
        category: newPrayer.category,
        body: newPrayer.text,
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
    setPrayerCategory('Healing');
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

  // --- JOURNAL ACTIONS ---
  const handleJournalSubmit = async (e) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalBody.trim()) return;

    if (editingJournalId) {
      const updatedEntry = {
        title: journalTitle.trim(),
        scripture: journalScripture.trim() || 'General Reflections',
        body: journalBody.trim(),
      };
      const updatedJournal = journalEntries.map((entry) => (
        entry.id === editingJournalId ? { ...entry, ...updatedEntry } : entry
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
      id: 'j_' + Date.now(),
      title: journalTitle.trim(),
      scripture: journalScripture.trim() || 'General Reflections',
      body: journalBody.trim(),
      date: formatDate(new Date())
    };

    if (isConfigured) {
      const { error } = await supabase.from('journal_entries').insert({
        id: newEntry.id,
        user_id: userId,
        title: newEntry.title,
        scripture: newEntry.scripture,
        body: newEntry.body,
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

  const myGroupIds = Object.keys(groups).filter(key =>
    groups[key].students?.some(s => s.linkedUserId === userId)
  );
  const displayedGroups = groupFilter === 'mine'
    ? Object.fromEntries(myGroupIds.map(k => [k, groups[k]]))
    : groups;
  const displayedGroupEntries = Object.entries(displayedGroups);

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
                    <label>Frequency</label>
                    <select value={editGroupFrequency} onChange={e => setEditGroupFrequency(e.target.value)}>
                      <option value="Weekly">Weekly</option>
                      <option value="Every Other Week">Every Other Week</option>
                      <option value="Once a Month">Once a Month</option>
                    </select>
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
                        <div style={{ maxHeight: '180px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
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
                <label>Frequency</label>
                <select value={newGroupFrequency} onChange={e => setNewGroupFrequency(e.target.value)}>
                  <option value="Weekly">Weekly</option>
                  <option value="Every Other Week">Every Other Week</option>
                  <option value="Once a Month">Once a Month</option>
                </select>
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
              return (
                <div
                  key={key}
                  className={`group-card ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => {
                    if (!isEditingThis) setExpandedGroupId(isExpanded ? null : key);
                  }}
                >
                  <div className="group-card-top">
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
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
              <label htmlFor="prayer-cat">Category</label>
              <select 
                id="prayer-cat"
                value={prayerCategory}
                onChange={(e) => setPrayerCategory(e.target.value)}
              >
                <option value="Healing">Healing</option>
                <option value="Guidance">Guidance</option>
                <option value="Provision">Provision</option>
                <option value="Faith">Faith & Strength</option>
                <option value="Thanksgiving">Thanksgiving</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="prayer-req">Prayer Request</label>
              <textarea 
                id="prayer-req"
                rows={3} 
                placeholder="What would you like the fellowship to pray for?"
                value={prayerText}
                onChange={(e) => setPrayerText(e.target.value)}
                required
              />
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
          {prayers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              No prayer requests currently active. Feel free to submit the first!
            </p>
          ) : (
            prayers.map((prayer) => (
              <div key={prayer.id} className="prayer-request-card">
                <div className="prayer-card-header">
                  <div>
                    <span className="prayer-user">{prayer.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{prayer.date}</span>
                  </div>
                  <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>{prayer.category}</span>
                </div>
                
                <p className="prayer-text">"{prayer.text}"</p>
                
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
                <div className="journal-card-header">
                  <h3 className="journal-title">{entry.title}</h3>
                  <span className="journal-date" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={12} />
                    {entry.date}
                  </span>
                </div>
                
                <div className="journal-scripture-focus">
                  <BookOpen size={12} />
                  <span>{entry.scripture}</span>
                </div>
                
                <p className="journal-body">{entry.body}</p>
                
                <div className="journal-actions">
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
              </div>
            ))
          )}
        </div>
      </section>

      </div>{/* end fellowship-grid */}
    </div>
  );
}
