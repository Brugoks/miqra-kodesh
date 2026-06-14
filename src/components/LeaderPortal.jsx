import { useState, useEffect, useMemo } from 'react';
import './LeaderPortal.css';
import { supabase } from '../lib/supabaseClient';
import { ROLES, isAdminRole } from '../lib/roles';
import { ROSTER_PREFERENCE_ROLES } from '../lib/roleOptions';
import Avatar from './ui/Avatar';
import {
  Shield, PlusCircle,
  ClipboardList,
  BookOpen,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Star,
  Sparkles,
  UserCheck,
  AlertOctagon,
  ExternalLink,
  Plus,
  Trash2,
  Edit,
  Save,
  Filter,
  Check,
  UserPlus,
  Copy,
  Clock,
  Send,
  X
} from 'lucide-react';


const defaultRosterPreferences = [
  { id: 'pref-reid-scott', personName: 'Reid Scott', gender: 'male', preferences: ['Tech and Media', 'Life Group Leader', 'Band', 'Teaching', 'Welcoming', 'Event Coordinating'] },
  { id: 'pref-noah-crowe', personName: 'Noah Crowe', gender: 'male', preferences: ['Life Group Leader', 'Tech and Media', 'Welcoming', 'Teaching', 'Event Coordinating', 'Band'] },
  { id: 'pref-brayden-burn', personName: 'Brayden Burn', gender: 'male', preferences: ['Band', 'Tech and Media', 'Event Coordinating', 'Welcoming', 'Life Group Leader', 'Teaching'] },
  { id: 'pref-andrew-ethredge', personName: 'Andrew Ethredge', gender: 'male', preferences: [null, 'Tech and Media', 'Welcoming', 'Event Coordinating', null, null] },
  { id: 'pref-sloan-pursell', personName: 'Sloan Pursell', gender: 'male', preferences: ['Life Group Leader', 'Teaching', 'Welcoming', 'Band', 'Tech and Media', 'Event Coordinating'] },
  { id: 'pref-finn-pollett', personName: 'Finn Pollett', gender: 'male', preferences: ['Event Coordinating', 'Teaching', 'Welcoming', 'Life Group Leader', 'Tech and Media', 'Band'] },
  { id: 'pref-sullivan-davis', personName: 'Sullivan Davis', gender: 'male', preferences: ['Life Group Leader', 'Welcoming', 'Band', 'Tech and Media', 'Event Coordinating', 'Teaching'] },
  { id: 'pref-eli-giordano', personName: 'Eli Giordano', gender: 'male', preferences: ['Band', 'Welcoming', 'Teaching', 'Life Group Leader', 'Event Coordinating', 'Tech and Media'] },
  { id: 'pref-addie-shaffer', personName: 'Addie Shaffer', gender: 'female', preferences: ['Band', 'Life Group Leader', 'Welcoming', 'Event Coordinating', 'Tech and Media', 'Teaching'] },
  { id: 'pref-ap-watford', personName: 'AP Watford', gender: 'female', preferences: ['Band', 'Life Group Leader', 'Teaching', 'Welcoming', 'Event Coordinating', 'Tech and Media'] },
  { id: 'pref-eliza-giordano', personName: 'Eliza Giordano', gender: 'female', preferences: ['Life Group Leader', 'Event Coordinating', 'Band', 'Welcoming', 'Tech and Media', 'Teaching'] },
  { id: 'pref-kalashia-stoudenmire', personName: "Ka'lashia Stoudenmire", gender: 'female', preferences: ['Welcoming', 'Life Group Leader', 'Event Coordinating', 'Band', 'Teaching', 'Tech and Media'] },
  { id: 'pref-chloe-jackson', personName: 'Chloe Jackson', gender: 'female', preferences: ['Life Group Leader', 'Welcoming', 'Event Coordinating', 'Teaching', 'Tech and Media', 'Band'] },
  { id: 'pref-elizabeth-whatford', personName: 'Elizabeth Whatford', gender: 'female', preferences: ['Life Group Leader', 'Teaching', 'Welcoming', 'Band', 'Event Coordinating', 'Tech and Media'] },
  { id: 'pref-claire-ethredge', personName: 'Claire Ethredge', gender: 'female', preferences: ['Life Group Leader', 'Welcoming', 'Teaching', 'Event Coordinating', 'Band', 'Tech and Media'] },
  { id: 'pref-grace-sronce', personName: 'Grace Sronce', gender: 'female', preferences: ['Life Group Leader', 'Band', 'Event Coordinating', 'Welcoming', 'Teaching', 'Tech and Media'] },
];

const defaultRoleAssignments = [
  { id: 'assignment-high-school-leader-1', roleName: 'High School Leader 1', femaleAssignees: [], maleAssignees: [], adultLeaders: [], position: 10 },
  { id: 'assignment-high-school-leader-2', roleName: 'High School Leader 2', femaleAssignees: ['Anna Pearl Watford'], maleAssignees: ['Noah Crowe'], adultLeaders: [], position: 20 },
  { id: 'assignment-middle-school-leader-1', roleName: 'Middle School Leader 1', femaleAssignees: ['Addie Shaffer', 'Chloe Jackson'], maleAssignees: ['Reid Scott', 'Sloan Pursell'], adultLeaders: [], position: 30 },
  { id: 'assignment-middle-school-leader-2', roleName: 'Middle School Leader 2', femaleAssignees: ['Eliza Giordano', 'Zippie'], maleAssignees: ['Brayden Burn', 'Sullivan Davis'], adultLeaders: [], position: 40 },
  { id: 'assignment-music-leaders', roleName: 'Music Leaders', femaleAssignees: ['Addie Shaffer'], maleAssignees: ['Brayden Burn'], adultLeaders: [], position: 50 },
  { id: 'assignment-welcoming', roleName: 'Welcoming', femaleAssignees: ["Ka'lashia Stoudenmire"], maleAssignees: ['Eli Giordano'], adultLeaders: [], position: 60 },
  { id: 'assignment-media', roleName: 'Media', femaleAssignees: ['Addie Shaffer'], maleAssignees: ['??'], adultLeaders: [], position: 70 },
  { id: 'assignment-sound', roleName: 'Sound', femaleAssignees: ['Noah Crowe'], maleAssignees: ['Noah Turner'], adultLeaders: [], position: 80 },
  { id: 'assignment-slides', roleName: 'Slides', femaleAssignees: ['Reid Scott'], maleAssignees: ['Brayden Burn'], adultLeaders: [], position: 90 },
  { id: 'assignment-event-coordinating', roleName: 'Event Coordinating', femaleAssignees: ['Eliza Giordano'], maleAssignees: ['Finn Pollett'], adultLeaders: [], position: 100 },
  { id: 'assignment-teaching', roleName: 'Teaching', femaleAssignees: ['Zippie Watford'], maleAssignees: ['Sloan Pursell', 'Finn Pollett'], adultLeaders: [], position: 110 },
];

const assigneeLabel = (names) => (names || []).filter(Boolean).join(' & ');
const isUnknownAssignee = (name) => name?.trim() === '??';
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const makeClientId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
);
const emptyPreferenceDraft = () => Array(6).fill('');
const splitAssignees = (value) => (
  (value || '')
    .replace(/\s+\band\b\s+/gi, ',')
    .split(/[,\n/&]+/)
    .map(item => item.trim())
    .filter(Boolean)
);
const roleToPreferenceRole = (roleName = '') => {
  const lower = roleName.toLowerCase();
  if (lower.includes('teach')) return 'Teaching';
  if (lower.includes('welcome')) return 'Welcoming';
  if (lower.includes('event')) return 'Event Coordinating';
  if (lower.includes('music') || lower.includes('band')) return 'Band';
  if (lower.includes('media') || lower.includes('sound') || lower.includes('slide') || lower.includes('tech')) return 'Tech and Media';
  if (lower.includes('leader')) return 'Life Group Leader';
  return '';
};
const assignmentBuckets = ['femaleAssignees', 'maleAssignees', 'adultLeaders'];
const removeAssigneeFromAssignment = (assignment, personName) => {
  const normalizedName = personName.toLowerCase();
  return assignmentBuckets.reduce((next, bucket) => ({
    ...next,
    [bucket]: (next[bucket] || []).filter(name => name.toLowerCase() !== normalizedName)
  }), { ...assignment });
};
const addAssigneeToBucket = (assignment, bucket, personName) => {
  const current = assignment[bucket] || [];
  const normalizedName = personName.toLowerCase();
  if (current.some(name => name.toLowerCase() === normalizedName)) return assignment;

  return {
    ...assignment,
    [bucket]: [
      ...current.filter(name => !isUnknownAssignee(name)),
      personName
    ]
  };
};

export default function LeaderPortal({ userRole, activeOrgId }) {
  const portalView = isAdminRole(userRole) ? 'pastor' : 'leader';
  const [activeSubTab, setActiveSubTab] = useState('roster');

  const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  // --- 1. ROSTER STATE & SCHEDULER ---
  const [roster, setRoster] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleAssignee, setNewRoleAssignee] = useState('');
  const [newRoleTime, setNewRoleTime] = useState('');
  const [roleAssignments, setRoleAssignments] = useState([]);
  const [rosterPreferences, setRosterPreferences] = useState([]);
  // Resolve a person's gender by name (for validating which bucket they may fill).
  const genderByName = useMemo(() => {
    const map = {};
    for (const p of rosterPreferences) if (p.personName) map[p.personName.trim().toLowerCase()] = p.gender;
    return map;
  }, [rosterPreferences]);
  const bucketGender = (bucket) =>
    bucket === 'femaleAssignees' ? 'female' : bucket === 'maleAssignees' ? 'male' : null;

  // Intake forms sent to students
  const [intakeForms, setIntakeForms] = useState([]);
  const [intakeRecipientIds, setIntakeRecipientIds] = useState([]);
  const [intakeSendMessage, setIntakeSendMessage] = useState('');
  const submittedIntakeCount = useMemo(
    () => intakeForms.filter((f) => f.status === 'submitted').length,
    [intakeForms],
  );
  const [preferenceRoleFilter, setPreferenceRoleFilter] = useState('all');
  const [preferenceGenderFilter, setPreferenceGenderFilter] = useState('all');
  const [intakeName, setIntakeName] = useState('');
  const [intakeGender, setIntakeGender] = useState('female');
  const [intakePreferences, setIntakePreferences] = useState(emptyPreferenceDraft);
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeMessage, setIntakeMessage] = useState('');
  const [roleNeedName, setRoleNeedName] = useState('');
  const [roleNeedFemale, setRoleNeedFemale] = useState('');
  const [roleNeedMale, setRoleNeedMale] = useState('');
  const [roleNeedAdults, setRoleNeedAdults] = useState('');
  const [roleNeedNotes, setRoleNeedNotes] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [assignmentDrag, setAssignmentDrag] = useState(null);
  const [assignmentDropTarget, setAssignmentDropTarget] = useState('');
  
  // Sub Request Forms
  const [subReasonText, setSubReasonText] = useState({});
  const [activeSubRequestFieldId, setActiveSubRequestFieldId] = useState(null);
  
  // Volunteer Forms
  const [volunteerNameText, setVolunteerNameText] = useState({});
  const [activeVolunteerFieldId, setActiveVolunteerFieldId] = useState(null);
  
  // Inline edit state for Pastor
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleAssignee, setEditRoleAssignee] = useState('');
  const [editRoleTime, setEditRoleTime] = useState('');

  const defaultRoster = [
    { id: 'r1', roleName: "Welcome Greeter Lead", assignee: "Sarah Miller", status: "active", time: "9:00 AM - 9:30 AM", subReason: "", subRequestedBy: "" },
    { id: 'r2', roleName: "Worship Leader", assignee: "David Chen", status: "active", time: "9:30 AM - 10:00 AM", subReason: "", subRequestedBy: "" },
    { id: 'r3', roleName: "Opening Game Coordinator", assignee: "Sam Johnson", status: "needs-sub", time: "10:00 AM - 10:15 AM", subReason: "Out of town for family event", subRequestedBy: "Sam Johnson" },
    { id: 'r4', roleName: "Small Group Discussion Host", assignee: "Jane Wilson", status: "active", time: "10:15 AM - 11:00 AM", subReason: "", subRequestedBy: "" },
    { id: 'r5', roleName: "Snack Coordinator", assignee: "Mark Davis", status: "active", time: "11:00 AM - 11:30 AM", subReason: "", subRequestedBy: "" }
  ];

  // --- 2. ATTENDANCE STATE ---
  const [selectedGroup, setSelectedGroup] = useState('boys');
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [studentStatus, setStudentStatus] = useState({}); // { studentId: true/false }
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pastorAttendanceView, setPastorAttendanceView] = useState('dashboard'); // 'dashboard' or 'record'
  const [attendanceFilterGroup, setAttendanceFilterGroup] = useState('all');
  const [groups, setGroups] = useState({});
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDay, setNewGroupDay] = useState('');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [newGroupFrequency, setNewGroupFrequency] = useState('Weekly');
  const [newGroupTopic, setNewGroupTopic] = useState('');
  const [newGroupLeader, setNewGroupLeader] = useState('');
  const [newGroupCoLeader, setNewGroupCoLeader] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [profiles, setProfiles] = useState([]);
  const avatarByProfileId = useMemo(() => {
    const map = {};
    for (const p of profiles) if (p.avatar_url) map[p.id] = p.avatar_url;
    return map;
  }, [profiles]);
  const [studentLinkMessage, setStudentLinkMessage] = useState('');

  const defaultGroups = {
    boys: {
      name: "High School Boys",
      meetingDay: "Wednesday",
      meetingTime: "6:30 PM",
      frequency: "Weekly",
      topic: "Walking in Unity (Ephesians 4)",
      leader: "Dan K.",
      coLeader: "",
      students: [
        { id: 'sb1', name: "Daniel Quiambao" },
        { id: 'sb2', name: "Joshua Smith" },
        { id: 'sb3', name: "Caleb Harrison" },
        { id: 'sb4', name: "Benjamin Rogers" },
        { id: 'sb5', name: "Isaac Newton" },
        { id: 'sb6', name: "Nathan Wright" }
      ]
    },
    girls: {
      name: "High School Girls",
      meetingDay: "Wednesday",
      meetingTime: "6:30 PM",
      frequency: "Weekly",
      topic: "Walking in Unity (Ephesians 4)",
      leader: "Sarah M.",
      coLeader: "",
      students: [
        { id: 'sg1', name: "Elizabeth Bennet" },
        { id: 'sg2', name: "Hannah Abbott" },
        { id: 'sg3', name: "Esther Prince" },
        { id: 'sg4', name: "Abigail Williams" },
        { id: 'sg5', name: "Ruth Peterson" },
        { id: 'sg6', name: "Lydia Bennet" }
      ]
    },
    middle: {
      name: "Middle School Co-ed",
      meetingDay: "Sunday",
      meetingTime: "9:30 AM",
      frequency: "Weekly",
      topic: "Faith Under Pressure",
      leader: "Chris J.",
      coLeader: "",
      students: [
        { id: 'sm1', name: "Samuel Adams" },
        { id: 'sm2', name: "David Copperfield" },
        { id: 'sm3', name: "Elijah Craig" },
        { id: 'sm4', name: "Chloe Smith" },
        { id: 'sm5', name: "Grace Kelly" },
        { id: 'sm6', name: "Sophia Loren" }
      ]
    }
  };

  const selectedGroupData = groups[selectedGroup];

  const normalizeGroup = (group) => ({
    name: group.name || 'Unnamed Group',
    meetingDay: group.meetingDay || group.meeting_day || '',
    meetingTime: group.meetingTime || group.meeting_time || '',
    frequency: group.frequency || 'Weekly',
    topic: group.topic || '',
    leader: group.leader || 'Unassigned',
    coLeader: group.coLeader || group.co_leader || '',
    meetingLocation: group.meetingLocation || group.meeting_location || '',
    students: group.students || []
  });

  // --- 3. DISCUSSION FEEDBACK STATE ---
  const [feedbackList, setFeedbackList] = useState([]);
  const [formGroup, setFormGroup] = useState('boys');
  const [formLeader, setFormLeader] = useState('');
  const [formRating, setFormRating] = useState(5);
  const [formHighlights, setFormHighlights] = useState('');
  const [formPrayers, setFormPrayers] = useState('');
  const [formLessonTopic, setFormLessonTopic] = useState('Walking in Unity (Ephesians 4)');
  const [formAttendanceCount, setFormAttendanceCount] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Pastor feedback filters & notes
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState('all');
  const [feedbackFilterGroup, setFeedbackFilterGroup] = useState('all');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [pastorReplyInputs, setPastorReplyInputs] = useState({});
  const [activeReplyId, setActiveReplyId] = useState(null);

  const defaultFeedback = [
    {
      id: 'f1',
      groupKey: "girls",
      groupName: "High School Girls",
      leaderName: "Sarah M.",
      rating: 5,
      highlights: "We had a highly engaged discussion on Ephesians 4. The girls opened up about the challenges of maintaining patience and gentleness during busy school weeks. Two girls committed to starting a shared scripture accountability group.",
      prayers: "Pray for Lydia's upcoming finals and Hannah's grandmother who is recovering in the hospital.",
      date: "Jun 9, 2026",
      lessonTopic: "Walking in Unity (Ephesians 4)",
      attendanceCount: "5/6",
      status: "read", // 'unread', 'read', 'flagged'
      comments: "Wonderful to hear about the accountability group! I will pray for Lydia and Hannah's grandmother."
    },
    {
      id: 'f2',
      groupKey: "boys",
      groupName: "High School Boys",
      leaderName: "Dan K.",
      rating: 4,
      highlights: "Great turnout. The boys were enthusiastic during icebreakers, which made transition to study a bit noisy, but we settled down. Discussed the greatest commandment to love God and neighbors. Joshua Smith shared a good insight about peer pressure.",
      prayers: "Pray for safety as Benjamin travels with family next week.",
      date: "Jun 8, 2026",
      lessonTopic: "The Call to Love (Mark 12)",
      attendanceCount: "6/6",
      status: "flagged",
      comments: ""
    }
  ];

  // --- 4. LEADER BRIEFING STATE ---
  const [briefingData, setBriefingData] = useState(null);
  const [isEditingBriefing, setIsEditingBriefing] = useState(false);
  const [editBriefingData, setEditBriefingData] = useState(null);
  const [copySuccessId, setCopySuccessId] = useState(null);

  const defaultBriefing = {
    scriptures: [
      { id: 's1', label: "Old Testament", ref: "Deuteronomy 6:4-9", url: "https://www.biblegateway.com/passage/?search=Deuteronomy+6%3A4-9&version=ESV" },
      { id: 's2', label: "Gospel Reading", ref: "Mark 12:28-31", url: "https://www.biblegateway.com/passage/?search=Mark+12%3A28-31&version=ESV" },
      { id: 's3', label: "New Testament Epistle", ref: "Ephesians 4:1-6", url: "https://www.biblegateway.com/passage/?search=Ephesians+4%3A1-6&version=ESV" }
    ],
    questions: [
      { id: 'q1', category: "Icebreaker", text: "Share one highlight from your past week and one area where you saw God's guidance." },
      { id: 'q2', category: "Observation (Mark 12:30)", text: "What does loving God with all your heart, soul, mind, and strength look like in your daily school routines?" },
      { id: 'q3', category: "Application (Eph 4:2-3)", text: "How do humility, gentleness, and patience build up unity within our small group and prevent peer conflicts?" },
      { id: 'q4', category: "Action / Prayer Focus", text: "Pray for each other by name, focusing specifically on opportunities to show Christ's love to someone this week." }
    ]
  };

  const loadLocalData = () => {
    // 0. Attendance Groups
    const savedGroups = localStorage.getItem('miqra_attendance_groups');
    if (savedGroups) {
      try {
        const parsedGroups = JSON.parse(savedGroups);
        setGroups(Object.fromEntries(
          Object.entries(parsedGroups).map(([id, group]) => [id, normalizeGroup(group)])
        ));
      } catch { setGroups(defaultGroups); }
    } else {
      setGroups(defaultGroups);
      localStorage.setItem('miqra_attendance_groups', JSON.stringify(defaultGroups));
    }

    // 1. Roster
    const savedRoster = localStorage.getItem('miqra_roster');
    if (savedRoster) {
      try { setRoster(JSON.parse(savedRoster)); } catch { setRoster(defaultRoster); }
    } else {
      setRoster(defaultRoster);
      localStorage.setItem('miqra_roster', JSON.stringify(defaultRoster));
    }

    const savedRoleAssignments = localStorage.getItem('miqra_role_assignments');
    if (savedRoleAssignments) {
      try { setRoleAssignments(JSON.parse(savedRoleAssignments)); } catch { setRoleAssignments(defaultRoleAssignments); }
    } else {
      setRoleAssignments(defaultRoleAssignments);
      localStorage.setItem('miqra_role_assignments', JSON.stringify(defaultRoleAssignments));
    }

    const savedRosterPreferences = localStorage.getItem('miqra_roster_preferences');
    if (savedRosterPreferences) {
      try { setRosterPreferences(JSON.parse(savedRosterPreferences)); } catch { setRosterPreferences(defaultRosterPreferences); }
    } else {
      setRosterPreferences(defaultRosterPreferences);
      localStorage.setItem('miqra_roster_preferences', JSON.stringify(defaultRosterPreferences));
    }

    // 2. Attendance History
    const savedAttendance = localStorage.getItem('miqra_attendance_history');
    if (savedAttendance) {
      try { setAttendanceRecords(JSON.parse(savedAttendance)); } catch { setAttendanceRecords({}); }
    }

    // 3. Feedback Reports
    const savedFeedback = localStorage.getItem('miqra_feedback');
    if (savedFeedback) {
      try { setFeedbackList(JSON.parse(savedFeedback)); } catch { setFeedbackList(defaultFeedback); }
    } else {
      setFeedbackList(defaultFeedback);
      localStorage.setItem('miqra_feedback', JSON.stringify(defaultFeedback));
    }

    // 4. Briefing
    const savedBriefing = localStorage.getItem('miqra_leader_briefing');
    if (savedBriefing) {
      try { setBriefingData(JSON.parse(savedBriefing)); } catch { setBriefingData(defaultBriefing); }
    } else {
      setBriefingData(defaultBriefing);
      localStorage.setItem('miqra_leader_briefing', JSON.stringify(defaultBriefing));
    }
  };

  const loadGroupsFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('attendance_groups')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error loading attendance groups from Supabase:", error);
      setGroups(defaultGroups);
    } else if (data && data.length > 0) {
      const mapped = {};
      data.forEach(item => {
        mapped[item.id] = normalizeGroup({
          name: item.name,
          meetingDay: item.meeting_day,
          meetingTime: item.meeting_time,
          frequency: item.frequency,
          topic: item.topic,
          leader: item.leader,
          coLeader: item.co_leader,
          meetingLocation: item.meeting_location,
          students: item.students || []
        });
      });
      setGroups(mapped);
    } else {
      const seededGroups = {};
      for (const [id, group] of Object.entries(defaultGroups)) {
        const seededId = `${id}-${activeOrgId}`;
        seededGroups[seededId] = group;
        await supabase.from('attendance_groups').insert({
          id: seededId,
          name: group.name,
          meeting_day: group.meetingDay,
          meeting_time: group.meetingTime,
          frequency: group.frequency,
          topic: group.topic,
          leader: group.leader,
          co_leader: group.coLeader,
          students: group.students
        });
      }
      setGroups(seededGroups);
    }
  };

  const loadProfilesFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .rpc('org_members', { org_id: activeOrgId })
      .order('full_name', { ascending: true });

    if (error) {
      console.error("Error loading profiles for member linking:", error);
      setProfiles([]);
    } else {
      setProfiles(data || []);
    }
  };

  const loadRosterFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('roster')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error loading roster from Supabase:", error);
      setRoster(defaultRoster);
    } else if (data && data.length > 0) {
      const mapped = data.map(item => ({
        id: item.id,
        roleName: item.role_name,
        assignee: item.assignee,
        status: item.status,
        time: item.time_slot,
        subReason: item.sub_reason,
        subRequestedBy: item.sub_requested_by
      }));
      setRoster(mapped);
    } else {
      const seededRoster = defaultRoster.map(item => ({
        ...item,
        id: `${item.id}-${activeOrgId}`
      }));
      setRoster(seededRoster);
      for (const item of seededRoster) {
        await supabase.from('roster').insert({
          id: item.id,
          role_name: item.roleName,
          assignee: item.assignee,
          status: item.status,
          time_slot: item.time,
          sub_reason: item.subReason,
          sub_requested_by: item.subRequestedBy
        });
      }
    }
  };

  const loadRosterPreferencesFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('leader_roster_preferences')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('gender', { ascending: false })
      .order('person_name', { ascending: true });

    if (error) {
      console.error("Error loading roster preferences from Supabase:", error);
      setRosterPreferences(defaultRosterPreferences);
    } else {
      setRosterPreferences((data || []).map(item => ({
        id: item.id,
        personName: item.person_name,
        gender: item.gender,
        preferences: item.preferences || [],
        notes: item.notes || ''
      })));
    }
  };

  const loadIntakeFormsFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('intake_form_requests')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: false });
    if (!error) setIntakeForms(data || []);
  };

  const handleSendIntakeForms = async () => {
    if (!activeOrgId || intakeRecipientIds.length === 0) return;
    setIntakeSendMessage('');
    const { data: auth } = await supabase.auth.getUser();
    const senderId = auth?.user?.id || null;

    const rows = intakeRecipientIds.map((studentId) => {
      const profile = profiles.find((p) => p.id === studentId);
      return {
        organization_id: activeOrgId,
        student_id: studentId,
        student_name: profile?.full_name || profile?.email || 'Student',
        sent_by: senderId,
        status: 'pending',
      };
    });

    const { error } = await supabase.from('intake_form_requests').insert(rows);
    if (error) {
      setIntakeSendMessage('Could not send the form. Please try again.');
      return;
    }

    // Fire intake form emails — best-effort, non-blocking.
    const { data: { session } } = await supabase.auth.getSession();
    for (const row of rows) {
      const profile = profiles.find((p) => p.id === row.student_id);
      if (!profile?.email) continue;
      const recipientName = row.student_name;
      supabase.functions.invoke('send-email', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: {
          type: 'intake_form_sent',
          to: profile.email,
          subject: 'You have a volunteer intake form to fill out',
          html: `<p>Hi ${recipientName},</p>
<p>A leader has sent you a volunteer intake form. Please log in to <strong>Miqra Kodesh</strong> and check your Dashboard to fill it out.</p>
<p>The form lets you indicate your ministry preferences and availability so leaders can place you in the right role.</p>
<p>— Miqra Kodesh</p>`,
          text: `Hi ${recipientName},\n\nA leader has sent you a volunteer intake form. Log in to Miqra Kodesh and check your Dashboard to fill it out.\n\n— Miqra Kodesh`,
          metadata: { organization_id: activeOrgId },
        },
      }).catch(() => {});
    }

    setIntakeRecipientIds([]);
    setIntakeSendMessage(`Intake form sent to ${rows.length} student${rows.length === 1 ? '' : 's'}.`);
    await loadIntakeFormsFromSupabase();
  };

  const handleApproveIntake = async (form) => {
    // Upsert the submitted response into the placement roster, then mark approved.
    const { error: upErr } = await supabase
      .from('leader_roster_preferences')
      .upsert({
        organization_id: activeOrgId,
        person_name: form.student_name,
        gender: form.gender || 'female',
        preferences: form.preferences || [],
        notes: form.availability_notes || null,
      }, { onConflict: 'organization_id,person_name' });
    if (upErr) {
      setIntakeSendMessage('Could not add this student to the roster.');
      return;
    }
    const { error } = await supabase
      .from('intake_form_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', form.id);
    if (!error) {
      await Promise.all([loadIntakeFormsFromSupabase(), loadRosterPreferencesFromSupabase()]);
      setIntakeSendMessage(`${form.student_name} added to the placement roster.`);
    }
  };

  const handleDeclineIntake = async (form) => {
    const { error } = await supabase
      .from('intake_form_requests')
      .update({ status: 'declined', reviewed_at: new Date().toISOString() })
      .eq('id', form.id);
    if (!error) await loadIntakeFormsFromSupabase();
  };

  const handleRevokeIntake = async (form) => {
    const { error } = await supabase.from('intake_form_requests').delete().eq('id', form.id);
    if (!error) await loadIntakeFormsFromSupabase();
  };

  const loadRoleAssignmentsFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('leader_role_assignments')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('position', { ascending: true })
      .order('role_name', { ascending: true });

    if (error) {
      console.error("Error loading role assignments from Supabase:", error);
      setRoleAssignments(defaultRoleAssignments);
    } else {
      setRoleAssignments((data || []).map(item => ({
        id: item.id,
        roleName: item.role_name,
        femaleAssignees: item.female_assignees || [],
        maleAssignees: item.male_assignees || [],
        adultLeaders: item.adult_leaders || [],
        position: item.position || 0,
        notes: item.notes || ''
      })));
    }
  };

  const loadAttendanceFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading attendance from Supabase:", error);
      setAttendanceRecords({});
    } else if (data) {
      const dict = {};
      data.forEach(item => {
        const record = {
          id: item.id,
          groupKey: item.group_key,
          groupName: item.group_name,
          date: item.session_date,
          presentCount: item.present_count,
          totalCount: item.total_count,
          present: item.present,
          absent: item.absent
        };
        if (!dict[item.group_key]) dict[item.group_key] = [];
        dict[item.group_key].push(record);
      });
      setAttendanceRecords(dict);
    }
  };

  const loadFeedbackFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading feedback from Supabase:", error);
      setFeedbackList(defaultFeedback);
    } else if (data && data.length > 0) {
      const mapped = data.map(item => ({
        id: item.id,
        groupKey: item.group_key,
        groupName: item.group_name,
        leaderName: item.leader_name,
        rating: item.rating,
        highlights: item.highlights,
        prayers: item.prayers,
        date: item.session_date,
        lessonTopic: item.lesson_topic,
        attendanceCount: item.attendance_count,
        status: item.status,
        comments: item.comments
      }));
      setFeedbackList(mapped);
    } else {
      const seededFeedback = defaultFeedback.map(item => ({
        ...item,
        id: `${item.id}-${activeOrgId}`
      }));
      setFeedbackList(seededFeedback);
      for (const item of seededFeedback) {
        await supabase.from('feedback').insert({
          id: item.id,
          group_key: item.groupKey,
          group_name: item.groupName,
          leader_name: item.leaderName,
          rating: item.rating,
          highlights: item.highlights,
          prayers: item.prayers,
          session_date: item.date,
          lesson_topic: item.lessonTopic,
          attendance_count: item.attendanceCount,
          status: item.status,
          comments: item.comments
        });
      }
    }
  };

  const loadBriefingFromSupabase = async () => {
    if (!activeOrgId) return;
    const { data, error } = await supabase
      .from('leader_briefings')
      .select('data')
      .eq('id', activeOrgId)
      .maybeSingle();

    if (error) {
      console.error("Error loading briefing from Supabase:", error);
      setBriefingData(defaultBriefing);
    } else if (data?.data) {
      setBriefingData(data.data);
    } else {
      setBriefingData(defaultBriefing);
    }
  };

  // --- LIFECYCLE LOAD / SAVE ---
  useEffect(() => {
    const t = setTimeout(() => {
      if (isSupabaseConfigured) {
        loadProfilesFromSupabase();
        loadGroupsFromSupabase();
        loadRosterFromSupabase();
        loadRoleAssignmentsFromSupabase();
        loadRosterPreferencesFromSupabase();
        loadIntakeFormsFromSupabase();
        loadAttendanceFromSupabase();
        loadFeedbackFromSupabase();
        loadBriefingFromSupabase();
      } else {
        loadLocalData();
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Sync state helpers
  const saveGroupsState = async (newGroups) => {
    setGroups(newGroups);
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));

    if (isSupabaseConfigured) {
      for (const [id, group] of Object.entries(newGroups)) {
        const normalizedGroup = normalizeGroup(group);
        await supabase.from('attendance_groups').upsert({
          id,
          name: normalizedGroup.name,
          meeting_day: normalizedGroup.meetingDay,
          meeting_time: normalizedGroup.meetingTime,
          frequency: normalizedGroup.frequency,
          topic: normalizedGroup.topic,
          leader: normalizedGroup.leader,
          co_leader: normalizedGroup.coLeader,
          meeting_location: normalizedGroup.meetingLocation || null,
          students: normalizedGroup.students,
          organization_id: activeOrgId,
          updated_at: new Date().toISOString()
        });
      }
    }
  };

  const saveRosterState = async (newRoster) => {
    setRoster(newRoster);
    localStorage.setItem('miqra_roster', JSON.stringify(newRoster));

    if (isSupabaseConfigured) {
      for (const item of newRoster) {
        await supabase.from('roster').upsert({
          id: item.id,
          role_name: item.roleName,
          assignee: item.assignee,
          status: item.status,
          time_slot: item.time,
          sub_reason: item.subReason || '',
          sub_requested_by: item.subRequestedBy || '',
          organization_id: activeOrgId
        });
      }
    }
  };

  const mapRosterPreferenceFromDb = (item) => ({
    id: item.id,
    personName: item.person_name,
    gender: item.gender,
    preferences: item.preferences || [],
    notes: item.notes || ''
  });

  const mapRoleAssignmentFromDb = (item) => ({
    id: item.id,
    roleName: item.role_name,
    femaleAssignees: item.female_assignees || [],
    maleAssignees: item.male_assignees || [],
    adultLeaders: item.adult_leaders || [],
    position: item.position || 0,
    notes: item.notes || ''
  });

  const persistRosterPreference = async (preference) => {
    if (!isSupabaseConfigured || !activeOrgId) return preference;

    const payload = {
      organization_id: activeOrgId,
      person_name: preference.personName,
      gender: preference.gender,
      preferences: preference.preferences,
      notes: preference.notes || null
    };
    if (isUuid(preference.id)) payload.id = preference.id;

    const { data, error } = await supabase
      .from('leader_roster_preferences')
      .upsert(payload, { onConflict: 'organization_id,person_name' })
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data ? mapRosterPreferenceFromDb(data) : preference;
  };

  const persistRoleAssignment = async (assignment) => {
    if (!isSupabaseConfigured || !activeOrgId) return assignment;

    const payload = {
      organization_id: activeOrgId,
      role_name: assignment.roleName,
      female_assignees: assignment.femaleAssignees || [],
      male_assignees: assignment.maleAssignees || [],
      adult_leaders: assignment.adultLeaders || [],
      position: assignment.position || 0,
      notes: assignment.notes || null
    };
    if (isUuid(assignment.id)) payload.id = assignment.id;

    const { data, error } = await supabase
      .from('leader_role_assignments')
      .upsert(payload, { onConflict: 'organization_id,role_name' })
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data ? mapRoleAssignmentFromDb(data) : assignment;
  };

  const saveRosterPreferenceItem = async (preference) => {
    const saved = await persistRosterPreference(preference);
    const updated = [
      ...rosterPreferences.filter(item => item.personName.toLowerCase() !== saved.personName.toLowerCase()),
      saved
    ].sort((a, b) => a.gender.localeCompare(b.gender) || a.personName.localeCompare(b.personName));

    setRosterPreferences(updated);
    localStorage.setItem('miqra_roster_preferences', JSON.stringify(updated));
    return saved;
  };

  const saveRoleAssignmentItem = async (assignment) => {
    const saved = await persistRoleAssignment(assignment);
    const updated = [
      ...roleAssignments.filter(item => item.roleName.toLowerCase() !== saved.roleName.toLowerCase()),
      saved
    ].sort((a, b) => (a.position || 0) - (b.position || 0) || a.roleName.localeCompare(b.roleName));

    setRoleAssignments(updated);
    localStorage.setItem('miqra_role_assignments', JSON.stringify(updated));
    return saved;
  };

  const saveFeedbackState = async (newFeedback) => {
    setFeedbackList(newFeedback);
    localStorage.setItem('miqra_feedback', JSON.stringify(newFeedback));

    if (isSupabaseConfigured) {
      for (const item of newFeedback) {
        await supabase.from('feedback').upsert({
          id: item.id,
          group_key: item.groupKey,
          group_name: item.groupName,
          leader_name: item.leaderName,
          rating: item.rating,
          highlights: item.highlights,
          prayers: item.prayers || '',
          session_date: item.date,
          lesson_topic: item.lessonTopic,
          attendance_count: item.attendanceCount || '',
          status: item.status,
          comments: item.comments || '',
          organization_id: activeOrgId
        });
      }
    }
  };

  const saveBriefingState = async (newBriefing) => {
    setBriefingData(newBriefing);
    localStorage.setItem('miqra_leader_briefing', JSON.stringify(newBriefing));

    if (isSupabaseConfigured) {
      await supabase.from('leader_briefings').upsert({
        id: activeOrgId,
        data: newBriefing,
        organization_id: activeOrgId,
        updated_at: new Date().toISOString()
      });
    }
  };

  // --- ROSTER ACTIONS ---
  const handleAddRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim() || !newRoleTime.trim()) return;

    const newRole = {
      id: 'r_' + Date.now(),
      roleName: newRoleName.trim(),
      assignee: newRoleAssignee.trim() || 'Vacant',
      status: newRoleAssignee.trim() ? 'active' : 'needs-sub',
      time: newRoleTime.trim(),
      subReason: '',
      subRequestedBy: ''
    };

    const updated = [...roster, newRole];
    await saveRosterState(updated);
    
    setNewRoleName('');
    setNewRoleAssignee('');
    setNewRoleTime('');
  };

  const handleDeleteRole = async (id) => {
    const updated = roster.filter(item => item.id !== id);
    await saveRosterState(updated);

    if (isSupabaseConfigured) {
      await supabase.from('roster').delete().eq('id', id);
    }
  };

  const handleStartSubRequest = (id) => {
    setActiveSubRequestFieldId(id);
    setSubReasonText(prev => ({ ...prev, [id]: '' }));
  };

  const handleCancelSubRequest = () => {
    setActiveSubRequestFieldId(null);
  };

  const submitSubRequest = async (id) => {
    const reason = subReasonText[id] || 'Not specified';
    const updated = roster.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status: 'needs-sub',
          subReason: reason,
          subRequestedBy: item.assignee
        };
      }
      return item;
    });
    await saveRosterState(updated);
    setActiveSubRequestFieldId(null);
  };

  const handleStartVolunteer = (id) => {
    setActiveVolunteerFieldId(id);
    setVolunteerNameText(prev => ({ ...prev, [id]: '' }));
  };

  const handleCancelVolunteer = () => {
    setActiveVolunteerFieldId(null);
  };

  const submitVolunteer = async (id) => {
    const volunteer = volunteerNameText[id]?.trim() || 'Volunteer Substitute';
    const updated = roster.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          assignee: `${volunteer} (Sub)`,
          status: 'active',
          subReason: '',
          subRequestedBy: ''
        };
      }
      return item;
    });
    await saveRosterState(updated);
    setActiveVolunteerFieldId(null);
  };

  const handleStartEditRole = (role) => {
    setEditingRoleId(role.id);
    setEditRoleName(role.roleName);
    setEditRoleAssignee(role.assignee);
    setEditRoleTime(role.time);
  };

  const handleSaveEditRole = async (id) => {
    const updated = roster.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          roleName: editRoleName.trim(),
          assignee: editRoleAssignee.trim() || 'Vacant',
          time: editRoleTime.trim(),
          status: editRoleAssignee.trim() && editRoleAssignee.trim() !== 'Vacant' ? item.status : 'needs-sub'
        };
      }
      return item;
    });
    await saveRosterState(updated);
    setEditingRoleId(null);
  };

  const handleToggleSubStatusPastor = async (id) => {
    const updated = roster.map((item) => {
      if (item.id === id) {
        const isNeedsSub = item.status === 'needs-sub';
        return {
          ...item,
          status: isNeedsSub ? 'active' : 'needs-sub',
          subReason: isNeedsSub ? '' : 'Marked by Pastor',
          subRequestedBy: isNeedsSub ? '' : item.assignee
        };
      }
      return item;
    });
    await saveRosterState(updated);
  };

  const handleUseRoleAssignment = (assignment) => {
    const assignees = [
      ...(assignment.femaleAssignees || []),
      ...(assignment.maleAssignees || []),
      ...(assignment.adultLeaders || [])
    ].filter(name => name && !isUnknownAssignee(name));

    setNewRoleName(assignment.roleName);
    setNewRoleAssignee(assigneeLabel(assignees));
  };

  const handleAddVolunteerPreference = async (e) => {
    e.preventDefault();
    setIntakeMessage('');

    const personName = intakeName.trim().replace(/\s+/g, ' ');
    const preferences = intakePreferences.map(pref => pref || null);
    const selected = preferences.filter(Boolean);
    const unique = new Set(selected);

    if (!personName) {
      setIntakeMessage('Add the student name before saving.');
      return;
    }
    if (selected.length !== 6) {
      setIntakeMessage('Choose all six ranked preferences before saving.');
      return;
    }
    if (unique.size !== selected.length) {
      setIntakeMessage('Each ranked preference should be different.');
      return;
    }

    const existing = rosterPreferences.find(item => item.personName.toLowerCase() === personName.toLowerCase());
    const preference = {
      id: existing?.id || makeClientId(),
      personName,
      gender: intakeGender,
      preferences,
      notes: intakeNotes.trim()
    };

    try {
      await saveRosterPreferenceItem(preference);
      setIntakeName('');
      setIntakeGender('female');
      setIntakePreferences(emptyPreferenceDraft());
      setIntakeNotes('');
      setIntakeMessage(`${personName} was added to the preference roster.`);
    } catch (err) {
      console.error('Error saving volunteer preference:', err);
      setIntakeMessage('Could not save that volunteer. Please try again.');
    }
  };

  const handlePreferenceDraftChange = (index, value) => {
    setIntakePreferences(prev => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const handleCreateRoleNeed = async (e) => {
    e.preventDefault();
    setAssignmentMessage('');

    const roleName = roleNeedName.trim().replace(/\s+/g, ' ');
    if (!roleName) {
      setAssignmentMessage('Add a role name before saving.');
      return;
    }

    const existing = roleAssignments.find(item => item.roleName.toLowerCase() === roleName.toLowerCase());
    const nextPosition = roleAssignments.reduce((max, item) => Math.max(max, item.position || 0), 0) + 10;
    const assignment = {
      id: existing?.id || makeClientId(),
      roleName,
      femaleAssignees: splitAssignees(roleNeedFemale),
      maleAssignees: splitAssignees(roleNeedMale),
      adultLeaders: splitAssignees(roleNeedAdults),
      position: existing?.position || nextPosition,
      notes: roleNeedNotes.trim()
    };

    try {
      await saveRoleAssignmentItem(assignment);
      setRoleNeedName('');
      setRoleNeedFemale('');
      setRoleNeedMale('');
      setRoleNeedAdults('');
      setRoleNeedNotes('');
      setAssignmentMessage(`${roleName} was saved to the role list.`);
    } catch (err) {
      console.error('Error saving role assignment:', err);
      setAssignmentMessage('Could not save that role need. Please try again.');
    }
  };

  const handleFillRoleNeedForm = (assignment) => {
    setRoleNeedName(assignment.roleName);
    setRoleNeedFemale(assigneeLabel(assignment.femaleAssignees));
    setRoleNeedMale(assigneeLabel(assignment.maleAssignees));
    setRoleNeedAdults(assigneeLabel(assignment.adultLeaders));
    setRoleNeedNotes(assignment.notes || '');
    setAssignmentMessage(`Editing ${assignment.roleName}. Save to update the role list.`);
  };

  const handleDeleteRoleAssignment = async (assignment) => {
    if (!window.confirm(`Remove ${assignment.roleName} from the role assignment list?`)) return;

    const updated = roleAssignments.filter(item => item.id !== assignment.id);
    setRoleAssignments(updated);
    localStorage.setItem('miqra_role_assignments', JSON.stringify(updated));

    if (isSupabaseConfigured) {
      const query = supabase.from('leader_role_assignments').delete();
      if (isUuid(assignment.id)) {
        await query.eq('id', assignment.id);
      } else {
        await query.eq('organization_id', activeOrgId).eq('role_name', assignment.roleName);
      }
    }
  };

  const commitRoleAssignmentUpdates = async (updatedAssignments, changedIds, successMessage) => {
    setRoleAssignments(updatedAssignments);
    localStorage.setItem('miqra_role_assignments', JSON.stringify(updatedAssignments));

    try {
      if (isSupabaseConfigured && activeOrgId) {
        await Promise.all(
          updatedAssignments
            .filter(item => changedIds.has(item.id))
            .map(item => persistRoleAssignment(item))
        );
      }
      setAssignmentMessage(successMessage);
    } catch (err) {
      console.error('Error updating role assignment:', err);
      setAssignmentMessage('Could not update that role assignment. Please try again.');
    }
  };

  const handleAssignStudentToRole = async (assignment, person, bucketOverride) => {
    // A student can only fill the bucket matching their gender (adult leaders open to all).
    const wanted = bucketGender(bucketOverride);
    if (wanted && person.gender && wanted !== person.gender) {
      setAssignmentMessage(`${person.personName} is ${person.gender} and can't fill the ${wanted} slot for ${assignment.roleName}.`);
      return;
    }
    const bucket = bucketOverride || (person.gender === 'male' ? 'maleAssignees' : 'femaleAssignees');
    const nextAssignment = addAssigneeToBucket(
      removeAssigneeFromAssignment(assignment, person.personName),
      bucket,
      person.personName
    );
    const updated = roleAssignments.map(item => item.id === assignment.id ? nextAssignment : item);

    await commitRoleAssignmentUpdates(
      updated,
      new Set([assignment.id]),
      `${person.personName} was assigned to ${assignment.roleName}.`
    );
  };

  const handleAssignmentDragStart = (event, payload) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    setAssignmentDrag(payload);
  };

  const handleAssignmentDragEnd = () => {
    setAssignmentDrag(null);
    setAssignmentDropTarget('');
  };

  const readAssignmentDragPayload = (event) => {
    try {
      return JSON.parse(event.dataTransfer.getData('application/json') || '{}');
    } catch {
      return {};
    }
  };

  const handleDropStudentOnBucket = async (event, assignment, bucket) => {
    event.preventDefault();
    const payload = readAssignmentDragPayload(event);
    const personName = payload.personName?.trim();
    if (!personName) return;

    // Gender gate: females → female slot, males → male slot (adult bucket open to all).
    const wanted = bucketGender(bucket);
    const personGender = payload.gender || genderByName[personName.toLowerCase()];
    if (wanted && personGender && wanted !== personGender) {
      setAssignmentMessage(`${personName} is ${personGender} and can't fill the ${wanted} slot for ${assignment.roleName}.`);
      handleAssignmentDragEnd();
      return;
    }

    const changedIds = new Set([assignment.id]);
    if (payload.kind === 'assigned' && payload.assignmentId && payload.assignmentId !== assignment.id) {
      changedIds.add(payload.assignmentId);
    }

    const updated = roleAssignments.map((item) => {
      let next = item;
      if (payload.kind === 'assigned' && item.id === payload.assignmentId) {
        next = removeAssigneeFromAssignment(next, personName);
      }
      if (item.id === assignment.id) {
        next = addAssigneeToBucket(removeAssigneeFromAssignment(next, personName), bucket, personName);
      }
      return next;
    });

    await commitRoleAssignmentUpdates(
      updated,
      changedIds,
      `${personName} was assigned to ${assignment.roleName}.`
    );
    handleAssignmentDragEnd();
  };

  const handleDropBackToSuggestions = async (event) => {
    event.preventDefault();
    const payload = readAssignmentDragPayload(event);
    const personName = payload.personName?.trim();
    if (payload.kind !== 'assigned' || !personName || !payload.assignmentId) return;

    const sourceAssignment = roleAssignments.find(item => item.id === payload.assignmentId);
    const updated = roleAssignments.map(item => (
      item.id === payload.assignmentId ? removeAssigneeFromAssignment(item, personName) : item
    ));

    await commitRoleAssignmentUpdates(
      updated,
      new Set([payload.assignmentId]),
      `${personName} was moved back to Suggested Fits${sourceAssignment ? ` for ${sourceAssignment.roleName}` : ''}.`
    );
    handleAssignmentDragEnd();
  };

  // --- ATTENDANCE ACTIONS ---
  const buildGroupId = (name) => {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `group-${Date.now()}`;
    let id = base;
    let suffix = 2;
    while (groups[id]) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
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
        students: []
      }
    };

    await saveGroupsState(newGroups);
    setSelectedGroup(id);
    setFormGroup(id);
    setNewGroupName('');
    setNewGroupDay('');
    setNewGroupTime('');
    setNewGroupFrequency('Weekly');
    setNewGroupTopic('');
    setNewGroupLeader('');
    setNewGroupCoLeader('');
  };

  const handleDeleteGroup = async (groupKey) => {
    const group = groups[groupKey];
    if (!group || !window.confirm(`Remove ${group.name} from the attendance tracker? Past attendance records will stay in history.`)) return;

    const newGroups = { ...groups };
    delete newGroups[groupKey];
    await saveGroupsState(newGroups);

    if (isSupabaseConfigured) {
      await supabase.from('attendance_groups').delete().eq('id', groupKey);
    }

    const nextGroup = Object.keys(newGroups)[0] || '';
    if (selectedGroup === groupKey) setSelectedGroup(nextGroup);
    if (formGroup === groupKey) setFormGroup(nextGroup);
    if (attendanceFilterGroup === groupKey) setAttendanceFilterGroup('all');
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!selectedGroupData || !newStudentName.trim()) return;
    const normalizedEmail = newStudentEmail.trim().toLowerCase();
    const matchingProfile = normalizedEmail
      ? profiles.find(profile => profile.email?.toLowerCase() === normalizedEmail)
      : null;

    const student = {
      id: `s_${Date.now()}`,
      name: newStudentName.trim(),
      email: normalizedEmail || '',
      linkedUserId: matchingProfile?.id || null,
      linkedUserName: matchingProfile?.full_name || '',
    };
    const newGroups = {
      ...groups,
      [selectedGroup]: {
        ...selectedGroupData,
        students: [...selectedGroupData.students, student]
      }
    };

    await saveGroupsState(newGroups);
    setStudentStatus(prev => ({ ...prev, [student.id]: true }));
    setNewStudentName('');
    setNewStudentEmail('');
    setStudentLinkMessage(matchingProfile ? `${student.name} was linked to an existing account.` : '');
  };

  const handleRemoveStudent = async (studentId) => {
    if (!selectedGroupData) return;
    const student = selectedGroupData.students.find(item => item.id === studentId);
    if (!student || !window.confirm(`Remove ${student.name} from ${selectedGroupData.name}?`)) return;

    const newGroups = {
      ...groups,
      [selectedGroup]: {
        ...selectedGroupData,
        students: selectedGroupData.students.filter(item => item.id !== studentId)
      }
    };

    await saveGroupsState(newGroups);
    setStudentStatus(prev => {
      const updated = { ...prev };
      delete updated[studentId];
      return updated;
    });
  };

  const handleLinkStudentAccount = async (studentId) => {
    if (!selectedGroupData) return;
    const student = selectedGroupData.students.find(item => item.id === studentId);
    if (!student?.email) {
      setStudentLinkMessage('Add an email to this student before linking an account.');
      return;
    }

    const profile = profiles.find(item => item.email?.toLowerCase() === student.email.toLowerCase());
    if (!profile) {
      setStudentLinkMessage(`No app account found for ${student.email} yet.`);
      return;
    }

    const newGroups = {
      ...groups,
      [selectedGroup]: {
        ...selectedGroupData,
        students: selectedGroupData.students.map(item => (
          item.id === studentId
            ? {
                ...item,
                linkedUserId: profile.id,
                linkedUserName: profile.full_name || '',
                email: profile.email || item.email
              }
            : item
        ))
      }
    };

    await saveGroupsState(newGroups);
    setStudentLinkMessage(`${student.name} is linked to ${profile.email}.`);
  };

  const handleToggleStudent = (studentId) => {
    setStudentStatus(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    if (!selectedGroupData) return;
    const students = selectedGroupData.students;
    const presentList = students.filter(s => studentStatus[s.id]).map(s => s.name);
    const absentList = students.filter(s => !studentStatus[s.id]).map(s => s.name);

    const record = {
      id: 'a_' + Date.now(),
      groupKey: selectedGroup,
      groupName: selectedGroupData.name,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      presentCount: presentList.length,
      totalCount: students.length,
      present: presentList,
      absent: absentList
    };

    const updatedRecords = {
      ...attendanceRecords,
      [selectedGroup]: [record, ...(attendanceRecords[selectedGroup] || [])]
    };

    setAttendanceRecords(updatedRecords);
    localStorage.setItem('miqra_attendance_history', JSON.stringify(updatedRecords));

    if (isSupabaseConfigured) {
      await supabase.from('attendance').insert({
        id: record.id,
        group_key: record.groupKey,
        group_name: record.groupName,
        session_date: record.date,
        present_count: record.presentCount,
        total_count: record.totalCount,
        present: record.present,
        absent: record.absent,
        organization_id: activeOrgId
      });
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleDeleteAttendanceRecord = async (groupKey, recordId) => {
    const groupRecords = attendanceRecords[groupKey] || [];
    const updatedGroupRecords = groupRecords.filter(r => r.id !== recordId);
    
    const updatedRecords = {
      ...attendanceRecords,
      [groupKey]: updatedGroupRecords
    };
    
    setAttendanceRecords(updatedRecords);
    localStorage.setItem('miqra_attendance_history', JSON.stringify(updatedRecords));

    if (isSupabaseConfigured) {
      await supabase.from('attendance').delete().eq('id', recordId);
    }
  };

  // Pre-fill student attendance state when group changes
  useEffect(() => {
    if (!selectedGroupData) return undefined;
    const t = setTimeout(() => {
      const initialStatus = {};
      selectedGroupData.students.forEach(student => {
        initialStatus[student.id] = true; // Default to present
      });
      setStudentStatus(initialStatus);
    }, 0);
    return () => clearTimeout(t);
  }, [selectedGroup, selectedGroupData]);

  useEffect(() => {
    const groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) return undefined;
    const t = setTimeout(() => {
      if (!groups[selectedGroup]) setSelectedGroup(groupKeys[0]);
      if (!groups[formGroup]) setFormGroup(groupKeys[0]);
    }, 0);
    return () => clearTimeout(t);
  }, [formGroup, groups, selectedGroup]);

  // Aggregate stats helper
  const getStats = (groupKey) => {
    const history = attendanceRecords[groupKey];
    if (!history || history.length === 0) return { sessions: 0, avgAttendance: 0, avgAttendanceText: '—' };
    const totalPresent = history.reduce((sum, r) => sum + r.presentCount, 0);
    const totalStudents = history.reduce((sum, r) => sum + r.totalCount, 0);
    const avg = Math.round((totalPresent / totalStudents) * 100);
    return {
      sessions: history.length,
      avgAttendance: avg,
      avgAttendanceText: `${avg}%`
    };
  };

  // Global attendance stats
  const getGlobalStats = () => {
    let totalSessions = 0;
    let totalPresent = 0;
    let totalPossible = 0;
    
    Object.keys(groups).forEach(key => {
      const history = attendanceRecords[key] || [];
      totalSessions += history.length;
      history.forEach(record => {
        totalPresent += record.presentCount;
        totalPossible += record.totalCount;
      });
    });

    const overallAvg = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 100) : 0;

    return {
      totalSessions,
      overallAvg,
      totalStudentsCount: Object.values(groups).reduce((acc, curr) => acc + curr.students.length, 0)
    };
  };

  // Get chronological log of all groups
  const getChronologicalLogs = () => {
    let logs = [];
    Object.keys(attendanceRecords).forEach(groupKey => {
      const records = attendanceRecords[groupKey] || [];
      records.forEach(r => {
        logs.push({ ...r, groupKey });
      });
    });
    return logs.sort((a, b) => b.id.localeCompare(a.id));
  };

  // --- BRIEFING ACTIONS ---
  const handleStartBriefingEdit = () => {
    setEditBriefingData(JSON.parse(JSON.stringify(briefingData))); // deep copy
    setIsEditingBriefing(true);
  };

  const handleSaveBriefing = async () => {
    await saveBriefingState(editBriefingData);
    setIsEditingBriefing(false);
  };

  const handleCancelBriefingEdit = () => {
    setIsEditingBriefing(false);
    setEditBriefingData(null);
  };

  const handleUpdateScriptureField = (id, field, value) => {
    setEditBriefingData(prev => ({
      ...prev,
      scriptures: prev.scriptures.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const handleAddScripture = () => {
    const nextIdx = editBriefingData.scriptures.length + 1;
    setEditBriefingData(prev => ({
      ...prev,
      scriptures: [
        ...prev.scriptures,
        {
          id: 's_' + Date.now(),
          label: `Scripture ${nextIdx}`,
          ref: '',
          url: ''
        }
      ]
    }));
  };

  const handleRemoveScripture = (id) => {
    setEditBriefingData(prev => ({
      ...prev,
      scriptures: prev.scriptures.filter(s => s.id !== id)
    }));
  };

  const handleUpdateQuestionField = (id, field, value) => {
    setEditBriefingData(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, [field]: value } : q)
    }));
  };

  const handleAddQuestion = () => {
    setEditBriefingData(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: 'q_' + Date.now(),
          category: 'Discussion Prompt',
          text: ''
        }
      ]
    }));
  };

  const handleRemoveQuestion = (id) => {
    setEditBriefingData(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id)
    }));
  };

  const handleCopyQuestion = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopySuccessId(id);
    setTimeout(() => setCopySuccessId(null), 2000);
  };

  const handleCopyAllQuestions = () => {
    if (!briefingData) return;
    const questionsText = briefingData.questions
      .map((q, idx) => `${q.category || `Question ${idx+1}`}: "${q.text}"`)
      .join('\n\n');
    navigator.clipboard.writeText(questionsText);
    setCopySuccessId('all');
    setTimeout(() => setCopySuccessId(null), 2000);
  };

  // --- FEEDBACK ACTIONS ---
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!formHighlights.trim()) return;
    const feedbackGroup = groups[formGroup];
    if (!feedbackGroup) return;

    const report = {
      id: 'f_' + Date.now(),
      groupKey: formGroup,
      groupName: feedbackGroup.name,
      leaderName: formLeader.trim() || 'Anonymous Leader',
      rating: formRating,
      highlights: formHighlights.trim(),
      prayers: formPrayers.trim(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      lessonTopic: formLessonTopic.trim() || 'Sabbath Study',
      attendanceCount: formAttendanceCount.trim() || '—',
      status: 'unread',
      comments: ''
    };

    const updated = [report, ...feedbackList];
    await saveFeedbackState(updated);

    setFormHighlights('');
    setFormPrayers('');
    setFormLeader('');
    setFormRating(5);
    setFormAttendanceCount('');
    setFeedbackSubmitted(true);
    setTimeout(() => setFeedbackSubmitted(false), 3000);
  };

  const handleUpdateFeedbackStatus = async (id, newStatus) => {
    const updated = feedbackList.map(item => {
      if (item.id === id) {
        return { ...item, status: newStatus };
      }
      return item;
    });
    await saveFeedbackState(updated);
  };

  const handleDeleteFeedback = async (id) => {
    const updated = feedbackList.filter(item => item.id !== id);
    await saveFeedbackState(updated);

    if (isSupabaseConfigured) {
      await supabase.from('feedback').delete().eq('id', id);
    }
  };

  const handleSavePastorResponse = async (id) => {
    const comment = pastorReplyInputs[id] || '';
    const updated = feedbackList.map(item => {
      if (item.id === id) {
        return { 
          ...item, 
          comments: comment.trim(),
          status: 'read'
        };
      }
      return item;
    });
    await saveFeedbackState(updated);
    setActiveReplyId(null);
  };

  const handleStartReply = (report) => {
    setActiveReplyId(report.id);
    setPastorReplyInputs(prev => ({ ...prev, [report.id]: report.comments || '' }));
  };

  const handleDeletePastorResponse = async (id) => {
    const updated = feedbackList.map(item => {
      if (item.id === id) {
        return { ...item, comments: '' };
      }
      return item;
    });
    await saveFeedbackState(updated);
  };

  // Helpers for feedback analytics
  const getFeedbackStats = () => {
    if (feedbackList.length === 0) return { count: 0, avgRating: 0, flaggedCount: 0 };
    const ratingsSum = feedbackList.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = (ratingsSum / feedbackList.length).toFixed(1);
    const flaggedCount = feedbackList.filter(r => r.status === 'flagged' || r.prayers?.trim().length > 0).length;
    return {
      count: feedbackList.length,
      avgRating,
      flaggedCount
    };
  };

  const filteredFeedbackList = feedbackList.filter(item => {
    const matchesGroup = feedbackFilterGroup === 'all' || item.groupKey === feedbackFilterGroup;
    const matchesStatus = feedbackFilterStatus === 'all' || item.status === feedbackFilterStatus;
    
    const searchLower = feedbackSearch.toLowerCase();
    const matchesSearch = !feedbackSearch || 
      item.leaderName.toLowerCase().includes(searchLower) ||
      item.highlights.toLowerCase().includes(searchLower) ||
      item.prayers.toLowerCase().includes(searchLower) ||
      item.groupName.toLowerCase().includes(searchLower) ||
      item.lessonTopic.toLowerCase().includes(searchLower);

    return matchesGroup && matchesStatus && matchesSearch;
  });

  const pendingSubCount = roster.filter(item => item.status === 'needs-sub').length;
  const filteredRosterPreferences = useMemo(() => (
    rosterPreferences.filter((person) => {
      const matchesGender = preferenceGenderFilter === 'all' || person.gender === preferenceGenderFilter;
      const matchesRole = preferenceRoleFilter === 'all' || (person.preferences || []).includes(preferenceRoleFilter);
      return matchesGender && matchesRole;
    })
  ), [preferenceGenderFilter, preferenceRoleFilter, rosterPreferences]);

  const rolePreferenceSummary = useMemo(() => (
    ROSTER_PREFERENCE_ROLES.map((role) => {
      const matches = rosterPreferences
        .map(person => ({
          ...person,
          rank: (person.preferences || []).findIndex(pref => pref === role) + 1
        }))
        .filter(person => person.rank > 0)
        .sort((a, b) => a.rank - b.rank || a.personName.localeCompare(b.personName));

      return {
        role,
        firstChoiceCount: matches.filter(person => person.rank === 1).length,
        topThreeCount: matches.filter(person => person.rank <= 3).length,
        bestFits: matches.slice(0, 4)
      };
    })
  ), [rosterPreferences]);

  const roleAssignmentStats = useMemo(() => {
    const needsCoverage = roleAssignments.filter((assignment) => {
      const allAssignees = [
        ...(assignment.femaleAssignees || []),
        ...(assignment.maleAssignees || []),
        ...(assignment.adultLeaders || [])
      ];
      return allAssignees.length === 0 || allAssignees.some(isUnknownAssignee);
    }).length;

    return {
      total: roleAssignments.length,
      needsCoverage
    };
  }, [roleAssignments]);

  const roleCoverageGaps = useMemo(() => (
    roleAssignments
      .filter((assignment) => {
        const allAssignees = [
          ...(assignment.femaleAssignees || []),
          ...(assignment.maleAssignees || []),
          ...(assignment.adultLeaders || [])
        ];
        return allAssignees.length === 0 || allAssignees.some(isUnknownAssignee);
      })
      .slice(0, 5)
  ), [roleAssignments]);

  const roleAssignmentRecommendations = useMemo(() => {
    const recommendations = {};

    roleAssignments.forEach((assignment) => {
      const preferenceRole = roleToPreferenceRole(assignment.roleName);
      const assignedNames = new Set([
        ...(assignment.femaleAssignees || []),
        ...(assignment.maleAssignees || []),
        ...(assignment.adultLeaders || [])
      ].filter(name => name && !isUnknownAssignee(name)).map(name => name.toLowerCase()));

      recommendations[assignment.id] = preferenceRole
        ? rosterPreferences
          .map(person => ({
            ...person,
            preferenceRole,
            rank: (person.preferences || []).findIndex(pref => pref === preferenceRole) + 1
          }))
          .filter(person => person.rank > 0 && !assignedNames.has(person.personName.toLowerCase()))
          .sort((a, b) => a.rank - b.rank || a.gender.localeCompare(b.gender) || a.personName.localeCompare(b.personName))
          .slice(0, 5)
        : [];
    });

    return recommendations;
  }, [roleAssignments, rosterPreferences]);

  const renderAssignmentPills = (assignment, bucket) => {
    const names = assignment[bucket] || [];
    const assignees = (names || []).filter(Boolean);
    const dropKey = `${assignment.id}:${bucket}`;
    const zoneGender = bucketGender(bucket); // 'female' | 'male' | null
    const zoneClass = zoneGender ? `zone-${zoneGender}` : '';
    const pillGenderClass = zoneGender ? `gender-${zoneGender}` : '';

    return (
      <div
        className={`assignment-drop-zone ${zoneClass} ${assignmentDropTarget === dropKey ? 'drag-over' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => setAssignmentDropTarget(dropKey)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setAssignmentDropTarget('');
        }}
        onDrop={(event) => handleDropStudentOnBucket(event, assignment, bucket)}
      >
        <div className="assignment-pill-list">
          {assignees.length > 0 ? assignees.map((name) => {
            const isUnknown = isUnknownAssignee(name);
            return (
              <span
                key={name}
                className={`assignment-pill ${isUnknown ? 'tbd' : `draggable ${pillGenderClass}`}`}
                draggable={!isUnknown}
                onDragStart={(event) => {
                  if (!isUnknown) {
                    handleAssignmentDragStart(event, {
                      kind: 'assigned',
                      assignmentId: assignment.id,
                      personName: name,
                      gender: zoneGender || genderByName[name.trim().toLowerCase()],
                      bucket
                    });
                  }
                }}
                onDragEnd={handleAssignmentDragEnd}
                title={isUnknown ? 'TBD assignment' : 'Drag to move, or click × to remove'}
              >
                {name}
                {!isUnknown && (
                  <button
                    type="button"
                    className="pill-remove-btn"
                    title={`Remove ${name}`}
                    onClick={async (event) => {
                      event.stopPropagation();
                      const updated = roleAssignments.map(item =>
                        item.id === assignment.id ? removeAssigneeFromAssignment(item, name) : item
                      );
                      await commitRoleAssignmentUpdates(updated, new Set([assignment.id]), `${name} removed from ${assignment.roleName}.`);
                    }}
                  >×</button>
                )}
              </span>
            );
          }) : (
            <span className="assignment-empty">Drop here</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Portal Header and Switcher */}
      <div className="portal-header">
        <div>
          <span className="badge badge-gold" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
            <Shield size={12} />
            Ministry Management
          </span>
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>Student Fellowship Portal</h1>
        </div>

        {/* Info Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {pendingSubCount > 0 && (
            <div className="badge badge-sub-alert animate-pulse-badge">
              <AlertOctagon size={12} style={{ marginRight: '0.25rem' }} />
              {pendingSubCount} Sub {pendingSubCount === 1 ? 'Request' : 'Requests'} Unfilled
            </div>
          )}

          <div className="role-switcher">
            <span className="role-label">Signed in as:</span>
            <span className="badge badge-gold" style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}>
              {userRole === ROLES.DEVELOPER
                ? 'Developer'
                : isAdminRole(userRole)
                  ? 'Pastor / Admin'
                  : userRole === ROLES.STUDENT_LEADER
                    ? 'Student Leader'
                    : userRole === ROLES.PARENT_LEADER
                      ? 'Parent Leader'
                      : 'Leader'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Roster Subtabs Layout */}
      <div className="sub-tab-container">
        
        {/* Sidebar Nav */}
        <nav className="portal-sidebar">
          <button 
            className={`sub-tab-btn ${activeSubTab === 'roster' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('roster')}
          >
            <UserCheck size={18} />
            <span>Role Roster & Subs</span>
            {pendingSubCount > 0 && <span className="sidebar-count-badge">{pendingSubCount}</span>}
          </button>
          
          <button
            className={`sub-tab-btn ${activeSubTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('attendance')}
          >
            <ClipboardList size={18} />
            <span>Attendance Tracker</span>
          </button>

          <button
            className={`sub-tab-btn ${activeSubTab === 'intake' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('intake')}
          >
            <Send size={18} />
            <span>Intake Forms</span>
            {submittedIntakeCount > 0 && <span className="sidebar-count-badge success">{submittedIntakeCount}</span>}
          </button>

          <button 
            className={`sub-tab-btn ${activeSubTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('resources')}
          >
            <BookOpen size={18} />
            <span>Leader Briefing</span>
          </button>

          <button 
            className={`sub-tab-btn ${activeSubTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('feedback')}
          >
            <MessageSquare size={18} />
            <span>Discussion Feedback</span>
            {portalView === 'pastor' && feedbackList.filter(f => f.status === 'unread').length > 0 && (
              <span className="sidebar-count-badge success">{feedbackList.filter(f => f.status === 'unread').length}</span>
            )}
          </button>
        </nav>

        {/* Dynamic Display Area */}
        <div className="portal-display-pane">
          
          {/* TAB 1: ROSTER & SUBS */}
          {activeSubTab === 'roster' && (
            <div className="animate-fade-in">
              <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2>Sunday Service Schedule</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Assigned duties for this week's gatherings. Leaders can request substitutes and volunteer to fill vacant slots.
                  </p>
                </div>
              </div>

              <section className="card team-system-card">
                <div className="team-system-header">
                  <div>
                    <h3>
                      <ClipboardList size={18} className="text-gold" />
                      Team Assignment System
                    </h3>
                    <p>
                      Intake student volunteers, track role needs, and convert preference matches into assignments.
                    </p>
                  </div>
                  <div className="team-system-flow">
                    <span>Intake</span>
                    <span>Match</span>
                    <span>Assign</span>
                  </div>
                </div>

                <div className="team-system-grid">
                  <form className="team-system-panel intake-panel" onSubmit={handleAddVolunteerPreference}>
                    <div className="team-system-panel-head">
                      <strong>Student Volunteer Intake</strong>
                      <span>{rosterPreferences.length} on roster</span>
                    </div>
                    <div className="team-form-grid">
                      <label>
                        <span>Student Name</span>
                        <input
                          type="text"
                          value={intakeName}
                          onChange={(e) => setIntakeName(e.target.value)}
                          placeholder="Add volunteer name"
                        />
                      </label>
                      <label>
                        <span>Group</span>
                        <select value={intakeGender} onChange={(e) => setIntakeGender(e.target.value)}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </label>
                    </div>

                    <div className="preference-picker-grid">
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <label key={`intake-pref-${idx}`}>
                          <span>{idx + 1}{idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th'}</span>
                          <select
                            value={intakePreferences[idx]}
                            onChange={(e) => handlePreferenceDraftChange(idx, e.target.value)}
                          >
                            <option value="">Choose role</option>
                            {ROSTER_PREFERENCE_ROLES.map((role) => (
                              <option
                                key={role}
                                value={role}
                                disabled={intakePreferences.includes(role) && intakePreferences[idx] !== role}
                              >
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>

                    <label>
                      <span>Notes</span>
                      <textarea
                        value={intakeNotes}
                        onChange={(e) => setIntakeNotes(e.target.value)}
                        placeholder="Availability, training notes, parent context"
                        rows={2}
                      />
                    </label>
                    {intakeMessage && <p className="team-system-message">{intakeMessage}</p>}
                    <button type="submit" className="btn-primary team-system-submit">
                      <UserPlus size={16} />
                      Add Volunteer
                    </button>
                  </form>

                  <form className="team-system-panel role-need-panel" onSubmit={handleCreateRoleNeed}>
                    <div className="team-system-panel-head">
                      <strong>Role Need Builder</strong>
                      <span>{roleAssignmentStats.needsCoverage} open/TBD</span>
                    </div>
                    <label>
                      <span>Role Name</span>
                      <input
                        type="text"
                        value={roleNeedName}
                        onChange={(e) => setRoleNeedName(e.target.value)}
                        placeholder="e.g. Retreat Check-in Lead"
                      />
                    </label>
                    <div className="team-form-grid">
                      <label>
                        <span className="gender-head-female">Female Assignees</span>
                        <input
                          type="text"
                          value={roleNeedFemale}
                          onChange={(e) => setRoleNeedFemale(e.target.value)}
                          placeholder="Name, name"
                        />
                      </label>
                      <label>
                        <span className="gender-head-male">Male Assignees</span>
                        <input
                          type="text"
                          value={roleNeedMale}
                          onChange={(e) => setRoleNeedMale(e.target.value)}
                          placeholder="Name, name"
                        />
                      </label>
                    </div>
                    <label>
                      <span>Adult Leaders</span>
                      <input
                        type="text"
                        value={roleNeedAdults}
                        onChange={(e) => setRoleNeedAdults(e.target.value)}
                        placeholder="Adult coverage"
                      />
                    </label>
                    <label>
                      <span>Notes</span>
                      <textarea
                        value={roleNeedNotes}
                        onChange={(e) => setRoleNeedNotes(e.target.value)}
                        placeholder="Need, event, or follow-up detail"
                        rows={2}
                      />
                    </label>
                    {assignmentMessage && <p className="team-system-message">{assignmentMessage}</p>}
                    <button type="submit" className="btn-primary team-system-submit">
                      <Plus size={16} />
                      Save Role Need
                    </button>
                  </form>

                  <div className="team-system-panel coverage-panel">
                    <div className="team-system-panel-head">
                      <strong>Coverage Gaps</strong>
                      <span>{roleCoverageGaps.length} shown</span>
                    </div>
                    <div className="coverage-gap-list">
                      {roleCoverageGaps.length > 0 ? roleCoverageGaps.map((assignment) => {
                        const preferenceRole = roleToPreferenceRole(assignment.roleName);
                        return (
                          <button
                            key={`gap-${assignment.id}`}
                            type="button"
                            className="coverage-gap-item"
                            onClick={() => {
                              if (preferenceRole) setPreferenceRoleFilter(preferenceRole);
                              handleFillRoleNeedForm(assignment);
                            }}
                          >
                            <span>{assignment.roleName}</span>
                            <strong>{preferenceRole || 'Needs coverage'}</strong>
                          </button>
                        );
                      }) : (
                        <p className="assignment-empty-state">Every seeded role has named coverage.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="card role-assignments-card">
                <div className="role-assignments-header">
                  <div>
                    <h3>
                      <UserCheck size={18} className="text-gold" />
                      Role Assignments
                    </h3>
                    <p>
                      Seeded Charleston Baptist leadership roles, grouped by female, male, and adult leader coverage.
                    </p>
                  </div>
                  <div className="role-assignment-stats">
                    <span><strong>{roleAssignmentStats.total}</strong> roles</span>
                    <span><strong>{roleAssignmentStats.needsCoverage}</strong> open/TBD</span>
                  </div>
                </div>

                <div className="role-assignments-table-wrap">
                  <table className="role-assignments-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th className="gender-head-female">1st (Female)</th>
                        <th className="gender-head-male">1st (Male)</th>
                        <th>Adult Leaders</th>
                        <th>Suggested Fits</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleAssignments.map((assignment) => {
                        const suggestions = roleAssignmentRecommendations[assignment.id] || [];
                        return (
                          <tr key={assignment.id}>
                            <td>{assignment.roleName}</td>
                            <td>{renderAssignmentPills(assignment, 'femaleAssignees')}</td>
                            <td>{renderAssignmentPills(assignment, 'maleAssignees')}</td>
                            <td>{renderAssignmentPills(assignment, 'adultLeaders')}</td>
                            <td>
                              <div
                                className={`assignment-suggestion-list assignment-return-zone ${assignmentDropTarget === `${assignment.id}:suggestions` ? 'drag-over' : ''}`}
                                onDragOver={(event) => event.preventDefault()}
                                onDragEnter={() => setAssignmentDropTarget(`${assignment.id}:suggestions`)}
                                onDragLeave={(event) => {
                                  if (!event.currentTarget.contains(event.relatedTarget)) setAssignmentDropTarget('');
                                }}
                                onDrop={handleDropBackToSuggestions}
                              >
                                {suggestions.length > 0 ? suggestions.map((person) => (
                                  <button
                                    key={`${assignment.id}-${person.id}`}
                                    type="button"
                                    className={`assignment-suggestion-pill gender-${person.gender}`}
                                    draggable
                                    onDragStart={(event) => handleAssignmentDragStart(event, {
                                      kind: 'suggestion',
                                      assignmentId: assignment.id,
                                      personName: person.personName,
                                      gender: person.gender,
                                      rank: person.rank
                                    })}
                                    onDragEnd={handleAssignmentDragEnd}
                                    onClick={() => handleAssignStudentToRole(assignment, person)}
                                    title={`Drag ${person.personName} into a role bucket`}
                                  >
                                    <span>{person.personName}</span>
                                    <strong>#{person.rank}</strong>
                                  </button>
                                )) : (
                                  <span className="assignment-empty">No ranked match</span>
                                )}
                                {assignmentDrag?.kind === 'assigned' && (
                                  <span className="assignment-return-hint">Drop here to return</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="assignment-manage-actions">
                                {portalView === 'pastor' && (
                                  <button
                                    type="button"
                                    className="assignment-fill-btn"
                                    onClick={() => handleUseRoleAssignment(assignment)}
                                    title="Use this role in the weekly schedule form"
                                  >
                                    <Check size={14} />
                                    Use
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="assignment-fill-btn"
                                  onClick={() => handleFillRoleNeedForm(assignment)}
                                  title="Edit this role need"
                                >
                                  <Edit size={14} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="assignment-fill-btn danger"
                                  onClick={() => handleDeleteRoleAssignment(assignment)}
                                  title="Remove this role need"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {roleAssignments.length === 0 && (
                    <p className="assignment-empty-state">No role assignments have been seeded yet.</p>
                  )}
                </div>
              </section>

              <section className="card roster-preferences-card">
                <div className="roster-preferences-header">
                  <div>
                    <h3>
                      <Sparkles size={18} className="text-gold" />
                      Roster Preferences
                    </h3>
                    <p>
                      Use each student's ranked preferences when assigning ministry roles. Rankings are ordered from 1st choice to 6th choice.
                    </p>
                  </div>
                  <div className="roster-preference-filters">
                    <label>
                      <span>Role Need</span>
                      <select value={preferenceRoleFilter} onChange={(e) => setPreferenceRoleFilter(e.target.value)}>
                        <option value="all">All Roles</option>
                        {ROSTER_PREFERENCE_ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Group</span>
                      <select value={preferenceGenderFilter} onChange={(e) => setPreferenceGenderFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="male">Males</option>
                        <option value="female">Females</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="preference-role-summary">
                  {rolePreferenceSummary.map((summary) => (
                    <article key={summary.role} className={`preference-role-card ${preferenceRoleFilter === summary.role ? 'active' : ''}`}>
                      <div className="preference-role-card-head">
                        <strong>{summary.role}</strong>
                        <button type="button" onClick={() => setPreferenceRoleFilter(summary.role)}>
                          View
                        </button>
                      </div>
                      <div className="preference-role-counts">
                        <span><strong>{summary.firstChoiceCount}</strong> 1st choice</span>
                        <span><strong>{summary.topThreeCount}</strong> top 3</span>
                      </div>
                      <div className="preference-fit-list">
                        {summary.bestFits.length > 0 ? summary.bestFits.map((person) => (
                          <button
                            key={`${summary.role}-${person.id}`}
                            type="button"
                            className="preference-fit-pill"
                            onClick={() => {
                              if (portalView === 'pastor') {
                                setNewRoleName(summary.role);
                                setNewRoleAssignee(person.personName);
                              }
                            }}
                            title={portalView === 'pastor' ? 'Use this student in the new duty form' : `${person.personName}'s rank for ${summary.role}`}
                          >
                            <span>{person.personName}</span>
                            <strong>#{person.rank}</strong>
                          </button>
                        )) : (
                          <span className="preference-empty">No preferences yet</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="roster-preference-table-wrap">
                  <table className="roster-preference-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Group</th>
                        <th>1st</th>
                        <th>2nd</th>
                        <th>3rd</th>
                        <th>4th</th>
                        <th>5th</th>
                        <th>6th</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRosterPreferences.map((person) => (
                        <tr key={person.id}>
                          <td>{person.personName}</td>
                          <td>
                            <span className={`preference-gender-badge ${person.gender}`}>
                              {person.gender === 'male' ? 'Males' : 'Females'}
                            </span>
                          </td>
                          {[0, 1, 2, 3, 4, 5].map((idx) => {
                            const role = person.preferences?.[idx] || '';
                            const isMatch = preferenceRoleFilter !== 'all' && role === preferenceRoleFilter;
                            return (
                              <td key={`${person.id}-${idx}`} className={isMatch ? 'preference-match' : ''}>
                                {role || <span className="preference-empty">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredRosterPreferences.length === 0 && (
                    <p className="preference-empty-state">No preferences match the selected filters.</p>
                  )}
                </div>
              </section>

              {/* Pastor Form: Add New Duty (Only visible to Pastor) */}
              {portalView === 'pastor' && (
                <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--accent-gold)' }}>
                  <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <PlusCircle size={18} className="text-gold" />
                    Create Scheduled Role Duty
                  </h3>
                  <form onSubmit={handleAddRole} className="roster-form-grid">
                    <div className="form-group">
                      <label>Role/Duty Title</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Welcome Greeter Lead"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Leader Assigned</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Sarah Miller (Leave empty for Vacant)"
                        value={newRoleAssignee}
                        onChange={(e) => setNewRoleAssignee(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Time Slot Range</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 9:00 AM - 9:30 AM"
                        value={newRoleTime}
                        onChange={(e) => setNewRoleTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-actions" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                      <button type="submit" className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        <Plus size={16} />
                        Add New Duty
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Roster Cards Grid */}
              <div className="roster-grid">
                {roster.map((item) => {
                  const isEditing = editingRoleId === item.id;
                  
                  return (
                    <div key={item.id} className={`role-card card ${item.status === 'needs-sub' ? 'needs-sub' : ''}`}>
                      
                      {isEditing ? (
                        /* Pastor Edit Mode Inline Form */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                          <h4 style={{ color: 'var(--accent-gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>Edit Duty Role</h4>
                          <div className="form-group">
                            <label style={{ fontSize: '0.75rem' }}>Role Title</label>
                            <input 
                              type="text" 
                              value={editRoleName}
                              onChange={(e) => setEditRoleName(e.target.value)}
                              className="input-sm"
                            />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: '0.75rem' }}>Time Slot</label>
                            <input 
                              type="text" 
                              value={editRoleTime}
                              onChange={(e) => setEditRoleTime(e.target.value)}
                              className="input-sm"
                            />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: '0.75rem' }}>Assignee Name</label>
                            <input 
                              type="text" 
                              value={editRoleAssignee}
                              onChange={(e) => setEditRoleAssignee(e.target.value)}
                              className="input-sm"
                              placeholder="Vacant"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button onClick={() => handleSaveEditRole(item.id)} className="btn-primary" style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                              <Check size={12} /> Save
                            </button>
                            <button onClick={() => setEditingRoleId(null)} className="btn-secondary" style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Standard View Card */
                        <>
                          <div>
                            {/* Card Status Banner */}
                            <div className="role-status-alert" style={{ justifyContent: 'space-between' }}>
                              {item.status === 'needs-sub' ? (
                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                                  <AlertCircle size={14} />
                                  <span>SUBSTITUTE NEEDED</span>
                                </span>
                              ) : (
                                <span style={{ color: 'var(--success-green)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                                  <CheckCircle size={14} /> Covered
                                </span>
                              )}
                              
                              {/* Pastor quick actions header */}
                              {portalView === 'pastor' && (
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <button onClick={() => handleStartEditRole(item)} className="btn-icon" title="Edit Role">
                                    <Edit size={12} />
                                  </button>
                                  <button onClick={() => handleDeleteRole(item.id)} className="btn-icon text-red" title="Delete Role">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>

                            <h3 className="role-title">{item.roleName}</h3>
                            <div className="role-time-tag">
                              <Clock size={12} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'text-bottom' }} />
                              {item.time}
                            </div>
                            
                            <div className="role-assignee" style={{ marginTop: '0.5rem' }}>
                              Assigned: <span className={item.status === 'needs-sub' && (!item.assignee || item.assignee === 'Vacant') ? 'vacant' : ''}>{item.assignee || 'Vacant'}</span>
                            </div>

                            {/* Show details of substitute request if active */}
                            {item.status === 'needs-sub' && item.subReason && (
                              <div className="sub-reason-box">
                                <strong>Reason:</strong> "{item.subReason}"
                                {item.subRequestedBy && <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>Requested by: {item.subRequestedBy}</div>}
                              </div>
                            )}
                          </div>

                          {/* ACTION BUTTONS (Vary by Role) */}
                          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                            {portalView === 'pastor' ? (
                              /* Pastor Actions */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => handleToggleSubStatusPastor(item.id)}
                                  className={`btn-sm ${item.status === 'needs-sub' ? 'btn-success-outline' : 'btn-danger-outline'}`}
                                >
                                  {item.status === 'needs-sub' ? 'Resolve/Mark Covered' : 'Flag Needs Substitute'}
                                </button>
                              </div>
                            ) : (
                              /* Leader Actions */
                              <div>
                                {item.status === 'needs-sub' ? (
                                  /* Role needs sub: allow volunteering */
                                  <div>
                                    {activeVolunteerFieldId === item.id ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <input 
                                          type="text" 
                                          placeholder="Your Name (e.g. Dan K.)"
                                          value={volunteerNameText[item.id] || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setVolunteerNameText(prev => ({ ...prev, [item.id]: val }));
                                          }}
                                          required
                                          className="input-sm"
                                          style={{ fontSize: '0.8rem', padding: '0.35rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                          <button onClick={() => submitVolunteer(item.id)} className="btn-primary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', flex: 1 }}>
                                            Confirm
                                          </button>
                                          <button onClick={() => handleCancelVolunteer(item.id)} className="btn-secondary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                                            X
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button 
                                        onClick={() => handleStartVolunteer(item.id)}
                                        className="btn-primary"
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: '100%' }}
                                      >
                                        Volunteer to Cover
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  /* Role covered: allow requesting sub */
                                  <div>
                                    {activeSubRequestFieldId === item.id ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <input 
                                          type="text" 
                                          placeholder="Reason (e.g., traveling, sick)"
                                          value={subReasonText[item.id] || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setSubReasonText(prev => ({ ...prev, [item.id]: val }));
                                          }}
                                          required
                                          className="input-sm"
                                          style={{ fontSize: '0.8rem', padding: '0.35rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                          <button onClick={() => submitSubRequest(item.id)} className="btn-danger-outline" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', flex: 1, borderColor: '#ef4444', color: '#ef4444' }}>
                                            Request
                                          </button>
                                          <button onClick={() => handleCancelSubRequest(item.id)} className="btn-secondary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                                            X
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button 
                                        onClick={() => handleStartSubRequest(item.id)}
                                        className="btn-secondary"
                                        style={{ 
                                          padding: '0.4rem 0.8rem', 
                                          fontSize: '0.8rem', 
                                          width: '100%', 
                                          borderColor: 'var(--border-color)',
                                          color: '#ef4444' 
                                        }}
                                      >
                                        Request Sub
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                        </>
                      )}

                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: INTAKE FORMS */}
          {activeSubTab === 'intake' && (
            <div className="animate-fade-in">
              <div style={{ marginBottom: '1.5rem' }}>
                <h2>Volunteer Intake Forms</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Send a form for students to rank their role preferences from their own dashboard. Submissions land in the review queue below for you to approve into the placement roster.
                </p>
              </div>

              {intakeSendMessage && (
                <div className="assignment-message" style={{ marginBottom: '1rem' }}>{intakeSendMessage}</div>
              )}

              <div className="intake-forms-grid">
                {/* Send a form */}
                <section className="card intake-send-card">
                  <h3 style={{ marginTop: 0 }}><Send size={16} className="text-gold" /> Send Intake Form</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Select students to receive the form.</p>
                  <div className="intake-recipient-list">
                    {profiles.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No members found in this organization.</p>
                    ) : profiles.map((p) => {
                      const checked = intakeRecipientIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`intake-recipient-row ${checked ? 'selected' : ''}`}
                          onClick={() => setIntakeRecipientIds((cur) =>
                            cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id])}
                        >
                          <Avatar src={p.avatar_url} name={p.full_name || p.email} size={30} />
                          <span className="intake-recipient-name">{p.full_name || p.email}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
                    disabled={intakeRecipientIds.length === 0}
                    onClick={handleSendIntakeForms}
                  >
                    <Send size={15} /> Send to {intakeRecipientIds.length || ''} {intakeRecipientIds.length === 1 ? 'student' : 'students'}
                  </button>
                </section>

                {/* Review queue */}
                <section className="card intake-review-card">
                  <h3 style={{ marginTop: 0 }}>
                    <ClipboardList size={16} className="text-gold" /> Review Queue
                    {submittedIntakeCount > 0 && <span className="sidebar-count-badge success" style={{ marginLeft: '0.5rem' }}>{submittedIntakeCount}</span>}
                  </h3>

                  {intakeForms.filter((f) => f.status === 'submitted').length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No submitted forms awaiting review.</p>
                  ) : intakeForms.filter((f) => f.status === 'submitted').map((form) => (
                    <div key={form.id} className="intake-review-row">
                      <div className="intake-review-head">
                        <span className={`assignment-pill gender-${form.gender || 'female'}`} style={{ fontSize: '0.8rem' }}>{form.student_name}</span>
                        <div className="intake-review-actions">
                          <button type="button" className="assignment-fill-btn" onClick={() => handleApproveIntake(form)}>
                            <Check size={14} /> Approve
                          </button>
                          <button type="button" className="assignment-fill-btn danger" onClick={() => handleDeclineIntake(form)}>
                            <X size={14} /> Decline
                          </button>
                        </div>
                      </div>
                      <ol className="intake-pref-list">
                        {(form.preferences || []).map((role, i) => (
                          <li key={i}>{role || <em style={{ color: 'var(--text-muted)' }}>—</em>}</li>
                        ))}
                      </ol>
                      {form.availability_notes && (
                        <p className="intake-review-notes"><strong>Availability:</strong> {form.availability_notes}</p>
                      )}
                    </div>
                  ))}

                  {/* Awaiting response */}
                  {intakeForms.filter((f) => f.status === 'pending').length > 0 && (
                    <div className="intake-awaiting">
                      <h4>Awaiting Response</h4>
                      {intakeForms.filter((f) => f.status === 'pending').map((form) => (
                        <div key={form.id} className="intake-awaiting-row">
                          <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                          <span>{form.student_name}</span>
                          <button type="button" className="intake-revoke-btn" onClick={() => handleRevokeIntake(form)} title="Revoke this form">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE TRACKER */}
          {activeSubTab === 'attendance' && (
            <div className="animate-fade-in">
              
              {/* Pastor Mode Top Toggle Subtabs */}
              {portalView === 'pastor' && (
                <div className="pastor-subnav-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <button 
                    onClick={() => setPastorAttendanceView('dashboard')} 
                    className={`btn-sm ${pastorAttendanceView === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    View Master Dashboard
                  </button>
                  <button 
                    onClick={() => setPastorAttendanceView('record')} 
                    className={`btn-sm ${pastorAttendanceView === 'record' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    Record Attendance Checklists
                  </button>
                </div>
              )}

              {/* PASTOR DASHBOARD VIEW */}
              {portalView === 'pastor' && pastorAttendanceView === 'dashboard' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Master Stats Row */}
                  <div className="stats-dashboard-grid">
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Total Recorded Sessions</div>
                      <div className="stat-value">{getGlobalStats().totalSessions}</div>
                      <div className="stat-desc">Across all small groups</div>
                    </div>
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Aggregate Attendance</div>
                      <div className="stat-value text-gold">{getGlobalStats().overallAvg}%</div>
                      <div className="stat-desc">Overall student presence rate</div>
                    </div>
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Registered Students</div>
                      <div className="stat-value">{getGlobalStats().totalStudentsCount}</div>
                      <div className="stat-desc">Active student roll count</div>
                    </div>
                  </div>

                  {/* Group Statistics List */}
                  <div className="card">
                    <h2>Group-by-Group Performance</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Performance summary indicators per active small group covenant.
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {Object.keys(groups).map((key) => {
                        const grp = groups[key];
                        const grpStats = getStats(key);
                        return (
                          <div key={key} className="group-performance-row">
                            <div className="group-perf-meta">
                              <h4>{grp.name}</h4>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Leader: <strong>{grp.leader}</strong> • {grp.students.length} Students</div>
                            </div>
                            
                            {/* Visual Attendance Bar */}
                            <div className="attendance-percentage-track">
                              <span className="perf-avg-label">{grpStats.avgAttendance}% Avg</span>
                              <div className="perf-progress-bar-bg">
                                <div 
                                  className="perf-progress-bar-fill" 
                                  style={{ 
                                    width: `${grpStats.avgAttendance}%`,
                                    backgroundColor: grpStats.avgAttendance > 80 ? 'var(--success-green)' : grpStats.avgAttendance > 60 ? 'var(--accent-gold)' : '#ef4444'
                                  }}
                                ></div>
                              </div>
                              <span className="perf-sessions-count">{grpStats.sessions} {grpStats.sessions === 1 ? 'session' : 'sessions'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Master Historical Logs */}
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                      <h2>All Attendance Session Records</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
                        <select 
                          className="input-sm select-xs" 
                          value={attendanceFilterGroup}
                          onChange={(e) => setAttendanceFilterGroup(e.target.value)}
                          style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                        >
                          <option value="all">All Small Groups</option>
                          {Object.keys(groups).map((key) => (
                            <option key={key} value={key}>{groups[key].name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="chronological-attendance-log">
                      {getChronologicalLogs().filter(r => attendanceFilterGroup === 'all' || r.groupKey === attendanceFilterGroup).length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No attendance sessions matching filter have been logged yet.</p>
                      ) : (
                        getChronologicalLogs()
                          .filter(r => attendanceFilterGroup === 'all' || r.groupKey === attendanceFilterGroup)
                          .map((record) => (
                            <div key={record.id} className="attendance-session-card">
                              <div className="attendance-session-header">
                                <div>
                                  <span className="badge badge-gold" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', marginRight: '0.5rem' }}>{record.groupName}</span>
                                  <strong>{record.date}</strong>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                                    {record.presentCount} / {record.totalCount} Present
                                  </span>
                                  <button 
                                    onClick={() => handleDeleteAttendanceRecord(record.groupKey, record.id)}
                                    className="btn-icon text-red"
                                    title="Delete Record"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              
                              <div className="attendance-session-details">
                                <div className="student-tag-list">
                                  {record.present.map((name, i) => (
                                    <span key={i} className="student-tag present">✓ {name}</span>
                                  ))}
                                  {record.absent.map((name, i) => (
                                    <span key={i} className="student-tag absent">✗ {name}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                /* LEADER ATTENDANCE VIEW */
                <div className="attendance-layout animate-fade-in">
                  
                  {/* Group Info Sidebar */}
                  <div className="group-info-card card">
                    <h3>Small Groups</h3>
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {Object.keys(groups).map((key) => (
                        <div key={key} className="attendance-group-item">
                          <button
                            onClick={() => setSelectedGroup(key)}
                            className={`sub-tab-btn ${selectedGroup === key ? 'active' : ''}`}
                            style={{ fontSize: '0.85rem', padding: '0.6rem 0.8rem', flex: 1 }}
                          >
                            {groups[key].name}
                          </button>
                          <button
                            type="button"
                            className="btn-icon text-red"
                            onClick={() => handleDeleteGroup(key)}
                            title={`Remove ${groups[key].name}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <form className="attendance-management-form" onSubmit={handleAddGroup}>
                      <h4 className="modal-section-title">Add Group</h4>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Group name"
                        required
                      />
                      <select
                        value={newGroupDay}
                        onChange={(e) => setNewGroupDay(e.target.value)}
                        required
                      >
                        <option value="">Day of meeting</option>
                        <option value="Sunday">Sunday</option>
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                      </select>
                      <input
                        type="text"
                        value={newGroupTime}
                        onChange={(e) => setNewGroupTime(e.target.value)}
                        placeholder="Time of meeting"
                        required
                      />
                      <select
                        value={newGroupFrequency}
                        onChange={(e) => setNewGroupFrequency(e.target.value)}
                      >
                        <option value="Weekly">Weekly</option>
                        <option value="Every Other Week">Every Other Week</option>
                        <option value="Once a Month">Once a Month</option>
                      </select>
                      <input
                        type="text"
                        value={newGroupTopic}
                        onChange={(e) => setNewGroupTopic(e.target.value)}
                        placeholder="Format / Topic / Book"
                      />
                      <input
                        type="text"
                        value={newGroupLeader}
                        onChange={(e) => setNewGroupLeader(e.target.value)}
                        placeholder="Leader name"
                      />
                      <input
                        type="text"
                        value={newGroupCoLeader}
                        onChange={(e) => setNewGroupCoLeader(e.target.value)}
                        placeholder="Co-leader name"
                      />
                      <button type="submit" className="btn-secondary" style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        <Plus size={13} />
                        Add Group
                      </button>
                    </form>

                    <div className="modal-section" style={{ marginTop: '1.5rem', paddingTop: '1rem' }}>
                      <h4 className="modal-section-title">Group Stats</h4>
                      {selectedGroupData ? (
                        <>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Leader:</span>
                            <span>{selectedGroupData.leader}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Co-Leader:</span>
                            <span>{selectedGroupData.coLeader || '—'}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Meeting:</span>
                            <span>{[selectedGroupData.meetingDay, selectedGroupData.meetingTime].filter(Boolean).join(' • ') || '—'}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Frequency:</span>
                            <span>{selectedGroupData.frequency}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Format / Topic / Book:</span>
                            <span>{selectedGroupData.topic || '—'}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Total Registered:</span>
                            <span>{selectedGroupData.students.length} students</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Recorded Sessions:</span>
                            <span>{getStats(selectedGroup).sessions}</span>
                          </div>
                          <div className="group-stat-row">
                            <span style={{ color: 'var(--text-secondary)' }}>Avg. Attendance:</span>
                            <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{getStats(selectedGroup).avgAttendanceText}</span>
                          </div>
                        </>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Add a group to begin tracking attendance.</p>
                      )}
                    </div>
                  </div>

                  {/* Roster Checklist */}
                  <div className="card">
                    <h2>Roster Checklist</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Mark the students present for today's fellowship session: <strong>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
                    </p>

                    {saveSuccess && (
                      <div className="badge badge-success animate-fade-in" style={{ padding: '0.75rem', width: '100%', marginBottom: '1rem', textTransform: 'none', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={14} style={{ marginRight: '0.4rem' }} />
                        Attendance record saved successfully to local archives!
                      </div>
                    )}

                    {selectedGroupData && (
                      <form className="attendance-management-form horizontal" onSubmit={handleAddStudent}>
                        <input
                          type="text"
                          value={newStudentName}
                          onChange={(e) => setNewStudentName(e.target.value)}
                          placeholder={`Add member/student to ${selectedGroupData.name}`}
                          required
                        />
                        <input
                          type="email"
                          value={newStudentEmail}
                          onChange={(e) => setNewStudentEmail(e.target.value)}
                          placeholder="Email for account linking"
                        />
                        <button type="submit" className="btn-secondary" style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <UserPlus size={13} />
                          Add
                        </button>
                      </form>
                    )}
                    {studentLinkMessage && (
                      <p className="student-link-message">{studentLinkMessage}</p>
                    )}

                    <div className="students-checklist">
                      {!selectedGroupData ? (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No group selected.</p>
                      ) : selectedGroupData.students.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No students in this group yet.</p>
                      ) : selectedGroupData.students.map((student) => {
                        const isPresent = studentStatus[student.id];
                        const studentAvatar = student.linkedUserId ? avatarByProfileId[student.linkedUserId] : null;
                        return (
                          <div
                            key={student.id}
                            onClick={() => handleToggleStudent(student.id)}
                            className={`student-row ${isPresent ? 'present' : ''}`}
                          >
                            <div className="student-info">
                              <Avatar className="student-initials" src={studentAvatar} name={student.name} size={38} />
                              <div className="student-name-stack">
                                <span className="student-name">{student.name}</span>
                                <span className="student-link-status">
                                  {student.linkedUserId
                                    ? `Linked${student.email ? `: ${student.email}` : ''}`
                                    : student.email
                                      ? `Unlinked: ${student.email}`
                                      : 'No account email'}
                                </span>
                              </div>
                            </div>
                            <div className="attendance-toggle">
                              ✓
                            </div>
                            {!student.linkedUserId && student.email && (
                              <button
                                type="button"
                                className="student-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLinkStudentAccount(student.id);
                                }}
                                title={`Link ${student.name} to an app account`}
                              >
                                Link
                              </button>
                            )}
                            <button
                              type="button"
                              className="student-remove-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStudent(student.id);
                              }}
                              title={`Remove ${student.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                      <button onClick={handleSaveAttendance} className="btn-primary" disabled={!selectedGroupData || selectedGroupData.students.length === 0}>
                        Save Session Attendance
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LEADER BRIEFING / RESOURCES */}
          {activeSubTab === 'resources' && (
            <div className="animate-fade-in">
              {portalView === 'pastor' && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <button 
                    onClick={() => {
                      if (!isEditingBriefing) handleStartBriefingEdit();
                      else handleCancelBriefingEdit();
                    }}
                    className={`btn-sm ${isEditingBriefing ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Edit size={14} />
                    {isEditingBriefing ? 'Cancel / Discard Edits' : 'Edit Briefing Resources'}
                  </button>
                  {isEditingBriefing && (
                    <button 
                      onClick={handleSaveBriefing}
                      className="btn-sm btn-success"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--success-green)', color: 'white' }}
                    >
                      <Save size={14} />
                      Save & Publish Briefing
                    </button>
                  )}
                </div>
              )}

              {/* BRIEFING EDITOR (Pastor Mode) */}
              {portalView === 'pastor' && isEditingBriefing && editBriefingData ? (
                <div className="card card-gold animate-fade-in">
                  <h2>Leader Briefing Workspace Editor</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Publish updated verses, resources, and study guide questions. These will be immediately updated for all small group leaders.
                  </p>

                  {/* 1. Scripture Editor */}
                  <div className="modal-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-gold)' }}>1. Scripture Passages</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {editBriefingData.scriptures.map((scr) => (
                        <div key={scr.id} className="editor-scripture-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Category Label</label>
                            <input 
                              type="text" 
                              value={scr.label}
                              onChange={(e) => handleUpdateScriptureField(scr.id, 'label', e.target.value)}
                              placeholder="e.g. Old Testament"
                              className="input-sm"
                            />
                          </div>
                          
                          <div className="form-group" style={{ flex: '2 1 200px', margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Passage Reference</label>
                            <input 
                              type="text" 
                              value={scr.ref}
                              onChange={(e) => handleUpdateScriptureField(scr.id, 'ref', e.target.value)}
                              placeholder="e.g. Mark 12:28-31"
                              className="input-sm"
                            />
                          </div>

                          <div className="form-group" style={{ flex: '3 1 250px', margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Bible Gateway URL Link</label>
                            <input 
                              type="text" 
                              value={scr.url}
                              onChange={(e) => handleUpdateScriptureField(scr.id, 'url', e.target.value)}
                              placeholder="https://..."
                              className="input-sm"
                            />
                          </div>

                          <button 
                            type="button"
                            onClick={() => handleRemoveScripture(scr.id)}
                            className="btn-icon text-red"
                            style={{ alignSelf: 'flex-end', marginBottom: '4px' }}
                            title="Remove Scripture"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={handleAddScripture} 
                      className="btn-secondary btn-sm"
                      style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <Plus size={12} /> Add Scripture Row
                    </button>
                  </div>

                  {/* 2. Questions Editor */}
                  <div className="modal-section" style={{ marginTop: '2rem' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-gold)' }}>2. Discussion Guide Questions</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {editBriefingData.questions.map((q) => (
                        <div key={q.id} className="editor-question-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="form-group" style={{ margin: 0, width: '40%' }}>
                              <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Category Focus</label>
                              <input 
                                type="text" 
                                value={q.category}
                                onChange={(e) => handleUpdateQuestionField(q.id, 'category', e.target.value)}
                                placeholder="e.g. Icebreaker, Observation, Application"
                                className="input-sm"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleRemoveQuestion(q.id)}
                              className="btn-icon text-red"
                              title="Remove Question"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Question Text Content</label>
                            <textarea 
                              value={q.text}
                              onChange={(e) => handleUpdateQuestionField(q.id, 'text', e.target.value)}
                              placeholder="Type the question prompt..."
                              rows={2}
                              style={{ fontSize: '0.9rem', padding: '0.5rem' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={handleAddQuestion} 
                      className="btn-secondary btn-sm"
                      style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <Plus size={12} /> Add Question Row
                    </button>
                  </div>

                  {/* Actions footer */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    <button onClick={handleCancelBriefingEdit} className="btn-secondary">
                      Discard Changes
                    </button>
                    <button onClick={handleSaveBriefing} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Save size={16} />
                      Publish Lesson Briefing
                    </button>
                  </div>

                </div>
              ) : (
                /* BRIEFING VIEW */
                briefingData && (
                  <div className="animate-fade-in card card-gold">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                      <div>
                        <h2>Leader Briefing Center</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                          Assigned lesson notes, questions, and scripture passages to guide your small groups this week.
                        </p>
                      </div>
                      
                      <button 
                        onClick={handleCopyAllQuestions} 
                        className="btn-secondary btn-sm" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.5rem 0.80rem' }}
                      >
                        <Copy size={12} />
                        {copySuccessId === 'all' ? 'Copied Guide!' : 'Copy All Questions'}
                      </button>
                    </div>

                    {/* Scriptures Section */}
                    <div className="modal-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                      <h4 className="modal-section-title" style={{ fontSize: '1.15rem' }}>Key Scripture Passages</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {briefingData.scriptures.map((reading, idx) => (
                          <div key={reading.id || idx} className="reading-row" style={{ margin: 0 }}>
                            <div className="reading-label">
                              <span className={`reading-category-badge ${idx % 2 === 0 ? 'badge-torah' : 'badge-gospel'}`}>{reading.label}</span>
                              <span className="reading-title">{reading.ref}</span>
                            </div>
                            {reading.url && (
                              <a 
                                href={reading.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="bible-gateway-btn"
                              >
                                <span>Read Bible Gateway</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Discussion Guide Section */}
                    <div className="modal-section">
                      <h4 className="modal-section-title" style={{ fontSize: '1.15rem' }}>Discussion Guide Questions</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
                        
                        {briefingData.questions.map((q, idx) => (
                          <div key={q.id || idx} className="discussion-question-box" style={{ margin: 0, position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div className="question-num">{q.category || `Question ${idx + 1}`}</div>
                              <button 
                                onClick={() => handleCopyQuestion(q.text, q.id || idx)}
                                className="copy-single-btn"
                                title="Copy Question text"
                              >
                                <Copy size={12} />
                                {copySuccessId === (q.id || idx) && <span className="copy-tooltip">Copied!</span>}
                              </button>
                            </div>
                            <div className="question-text" style={{ paddingRight: '2rem' }}>"{q.text}"</div>
                          </div>
                        ))}

                      </div>
                    </div>
                  </div>
                )
              )}

            </div>
          )}

          {/* TAB 4: DISCUSSION FEEDBACK */}
          {activeSubTab === 'feedback' && (
            <div className="animate-fade-in">
              
              {/* LEADER VIEW */}
              {portalView === 'leader' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Submission Form */}
                  <div className="card">
                    <h2>Small Group Feedback Report</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                      Report back to the Student Pastor on how your small group study and fellowship went this week.
                    </p>

                    {feedbackSubmitted && (
                      <div className="badge badge-success animate-fade-in" style={{ padding: '0.75rem', width: '100%', marginBottom: '1.5rem', textTransform: 'none', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={14} style={{ marginRight: '0.4rem' }} />
                        Feedback successfully submitted to the Pastor's Log!
                      </div>
                    )}

                    <form onSubmit={handleFeedbackSubmit}>
                      <div className="form-row-2col">
                        <div className="form-group">
                          <label htmlFor="feed-group">Your Small Group</label>
                          <select 
                            id="feed-group"
                            value={formGroup} 
                            onChange={(e) => setFormGroup(e.target.value)}
                            required
                          >
                            {Object.keys(groups).map((key) => (
                              <option key={key} value={key}>{groups[key].name} ({groups[key].leader})</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label htmlFor="feed-leader">Leader Name</label>
                          <input 
                            id="feed-leader"
                            type="text" 
                            placeholder="Your Name (e.g. Dan K.)"
                            value={formLeader}
                            onChange={(e) => setFormLeader(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-row-2col">
                        <div className="form-group">
                          <label htmlFor="feed-topic">Lesson/Topic Discussed</label>
                          <input 
                            id="feed-topic"
                            type="text" 
                            value={formLessonTopic}
                            onChange={(e) => setFormLessonTopic(e.target.value)}
                            placeholder="e.g. Walking in Unity (Ephesians 4)"
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="feed-attendance">Attendance Check (e.g., 5/6 present)</label>
                          <input 
                            id="feed-attendance"
                            type="text" 
                            value={formAttendanceCount}
                            onChange={(e) => setFormAttendanceCount(e.target.value)}
                            placeholder="e.g. 5/6 present"
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Discussion Engagement & Response</label>
                        <div className="star-rating-row">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setFormRating(star)}
                              className={`star-btn ${star <= formRating ? 'selected' : ''}`}
                            >
                              <Star size={24} fill={star <= formRating ? "var(--accent-gold)" : "none"} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="feed-highlights">Discussion Highlights & Summary</label>
                        <textarea
                          id="feed-highlights"
                          rows={4}
                          placeholder="How was the discussion? Did the students grasp the topic? Any standout moments or testimonies?"
                          value={formHighlights}
                          onChange={(e) => setFormHighlights(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="feed-prayers">Prayer Requests or Concerns</label>
                        <textarea
                          id="feed-prayers"
                          rows={2}
                          placeholder="Any prayer needs raised by students, or follow-ups/pastoral support needed?"
                          value={formPrayers}
                          onChange={(e) => setFormPrayers(e.target.value)}
                        />
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Sparkles size={16} />
                          <span>Submit Weekly Report</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Leader's Own History of Reports */}
                  <div className="card">
                    <h2>Our Feedback History & Pastor Notes</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                      Review submitted logs and notes back from the Student Pastor.
                    </p>

                    <div className="pastor-feedback-log">
                      {feedbackList.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No feedback logs submitted yet.</p>
                      ) : (
                        feedbackList.map((report) => (
                          <div key={report.id} className="feedback-report-card">
                            <div className="feedback-report-header">
                              <div className="feedback-report-meta">
                                <h4>{report.groupName}</h4>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  Submitted: <strong>{report.leaderName}</strong> • {report.attendanceCount} • Topic: <em>{report.lessonTopic}</em>
                                </div>
                              </div>
                              <div>
                                <span className="feedback-report-date">{report.date}</span>
                                <div className="feedback-report-stars">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={13} fill={i < report.rating ? "var(--accent-gold)" : "none"} style={{ opacity: i < report.rating ? 1 : 0.25 }} />
                                  ))}
                                </div>
                              </div>
                            </div>

                            <p className="feedback-report-text">"{report.highlights}"</p>

                            {report.prayers && (
                              <div className="feedback-report-prayers">
                                <strong>Prayer Focus:</strong> "{report.prayers}"
                              </div>
                            )}

                            {report.comments ? (
                              <div className="pastor-reply-callout">
                                <div className="reply-header">
                                  <Shield size={12} className="text-gold" />
                                  <strong>Pastor Note Reply:</strong>
                                </div>
                                <div className="reply-content">"{report.comments}"</div>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Clock size={10} /> Waiting for pastor review.
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                
                /* PASTOR VIEW */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Inbox KPI stats row */}
                  <div className="stats-dashboard-grid">
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Reports Log Inbox</div>
                      <div className="stat-value">{getFeedbackStats().count}</div>
                      <div className="stat-desc">Total weekly logs received</div>
                    </div>
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Avg Discussion Rating</div>
                      <div className="stat-value text-gold" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
                        <Star size={24} fill="var(--accent-gold)" />
                        {getFeedbackStats().avgRating} / 5.0
                      </div>
                      <div className="stat-desc">Overall leader engagement score</div>
                    </div>
                    <div className="card stat-card card-gold">
                      <div className="stat-label">Action Flag / Prayers</div>
                      <div className="stat-value text-red">{getFeedbackStats().flaggedCount}</div>
                      <div className="stat-desc">Flagged items or prayer request lists</div>
                    </div>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <div className="feedback-toolbar">
                      <div className="toolbar-search">
                        <input 
                          type="text" 
                          placeholder="Search leaders, highlights, or topics..." 
                          value={feedbackSearch}
                          onChange={(e) => setFeedbackSearch(e.target.value)}
                          className="input-sm"
                          style={{ height: '38px' }}
                        />
                      </div>
                      
                      <div className="toolbar-selects">
                        <div className="filter-item">
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Group:</span>
                          <select 
                            value={feedbackFilterGroup}
                            onChange={(e) => setFeedbackFilterGroup(e.target.value)}
                            className="input-sm select-xs"
                          >
                            <option value="all">All Groups</option>
                            {Object.keys(groups).map((key) => (
                              <option key={key} value={key}>{groups[key].name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="filter-item">
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status:</span>
                          <select 
                            value={feedbackFilterStatus}
                            onChange={(e) => setFeedbackFilterStatus(e.target.value)}
                            className="input-sm select-xs"
                          >
                            <option value="all">All Statuses</option>
                            <option value="unread">Unread</option>
                            <option value="read">Read</option>
                            <option value="flagged">Flagged</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Feedback Inbox Logs */}
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                      <h2>Pastor's Discussion Inbox</h2>
                      <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>Inbox Feed</span>
                    </div>

                    <div className="pastor-feedback-log">
                      {filteredFeedbackList.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No feedback reports matching filters in your inbox.</p>
                      ) : (
                        filteredFeedbackList.map((report) => (
                          <div key={report.id} className={`feedback-report-card border-status-${report.status}`}>
                            <div className="feedback-report-header">
                              <div className="feedback-report-meta">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <h4>{report.groupName}</h4>
                                  <span className={`status-badge-dot status-${report.status}`}>{report.status.toUpperCase()}</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                  Submitted by: <strong>{report.leaderName}</strong> • {report.attendanceCount} present • Topic: <em>{report.lessonTopic}</em>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span className="feedback-report-date">{report.date}</span>
                                <div className="feedback-report-stars" style={{ justifyContent: 'flex-end' }}>
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={12} fill={i < report.rating ? "var(--accent-gold)" : "none"} style={{ opacity: i < report.rating ? 1 : 0.25 }} />
                                  ))}
                                </div>
                              </div>
                            </div>

                            <p className="feedback-report-text">"{report.highlights}"</p>

                            {report.prayers && (
                              <div className="feedback-report-prayers">
                                <strong>Prayer Focus / Needs:</strong> "{report.prayers}"
                              </div>
                            )}

                            {/* Display Saved Comments/Notes if any */}
                            {report.comments && (
                              <div className="pastor-saved-response-box" style={{ marginTop: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Shield size={12} />
                                    <strong>Your Action Note Reply:</strong>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => handleStartReply(report)} className="btn-text-only text-gold" style={{ fontSize: '0.75rem' }}>Edit</button>
                                    <button onClick={() => handleDeletePastorResponse(report.id)} className="btn-text-only text-red" style={{ fontSize: '0.75rem' }}>Delete</button>
                                  </div>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>"{report.comments}"</p>
                              </div>
                            )}

                            {/* Inline reply textarea action */}
                            {activeReplyId === report.id ? (
                              <div className="pastor-reply-form" style={{ marginTop: '1rem', borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem' }}>
                                <textarea 
                                  placeholder="Write a message/action plan to reply to this leader (visible to them)..."
                                  value={pastorReplyInputs[report.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPastorReplyInputs(prev => ({ ...prev, [report.id]: val }));
                                  }}
                                  rows={2}
                                  style={{ fontSize: '0.85rem', padding: '0.5rem', marginBottom: '0.5rem' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                  <button onClick={() => setActiveReplyId(null)} className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>Cancel</button>
                                  <button onClick={() => handleSavePastorResponse(report.id)} className="btn-primary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>Save Note Reply</button>
                                </div>
                              </div>
                            ) : (
                              !report.comments && (
                                <button 
                                  onClick={() => handleStartReply(report)}
                                  className="btn-secondary"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                  <MessageSquare size={12} />
                                  Add Pastor Response Note
                                </button>
                              )
                            )}

                            {/* Card management controls */}
                            <div className="card-status-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status actions:</span>
                                <button 
                                  onClick={() => handleUpdateFeedbackStatus(report.id, 'read')}
                                  className={`btn-tag ${report.status === 'read' ? 'active green' : ''}`}
                                  style={{ fontSize: '0.7rem' }}
                                >
                                  Mark Read
                                </button>
                                <button 
                                  onClick={() => handleUpdateFeedbackStatus(report.id, 'flagged')}
                                  className={`btn-tag ${report.status === 'flagged' ? 'active red' : ''}`}
                                  style={{ fontSize: '0.7rem' }}
                                >
                                  Flag Follow-up
                                </button>
                                <button 
                                  onClick={() => handleUpdateFeedbackStatus(report.id, 'unread')}
                                  className={`btn-tag ${report.status === 'unread' ? 'active blue' : ''}`}
                                  style={{ fontSize: '0.7rem' }}
                                >
                                  Mark Unread
                                </button>
                              </div>

                              <button 
                                onClick={() => handleDeleteFeedback(report.id)}
                                className="btn-text-only text-red"
                                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                              >
                                <Trash2 size={12} /> Delete Report
                              </button>
                            </div>

                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
