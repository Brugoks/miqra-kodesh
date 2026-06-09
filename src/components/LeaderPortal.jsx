import React, { useState, useEffect } from 'react';
import './LeaderPortal.css';
import { supabase } from '../lib/supabaseClient';
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
  Inbox, 
  BookOpenCheck, 
  UserPlus, 
  ChevronDown, 
  ChevronUp,
  RotateCcw,
  Copy,
  Clock,
  User,
  Heart
} from 'lucide-react';

export default function LeaderPortal() {
  const [userRole, setUserRole] = useState('leader'); // 'leader' or 'pastor'
  const [activeSubTab, setActiveSubTab] = useState('roster');

  const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  // --- 1. ROSTER STATE & SCHEDULER ---
  const [roster, setRoster] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleAssignee, setNewRoleAssignee] = useState('');
  const [newRoleTime, setNewRoleTime] = useState('');
  
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

  const groups = {
    boys: {
      name: "High School Boys",
      leader: "Dan K.",
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
      leader: "Sarah M.",
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
      leader: "Chris J.",
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

  // --- LIFECYCLE LOAD / SAVE ---
  useEffect(() => {
    if (isSupabaseConfigured) {
      loadRosterFromSupabase();
      loadAttendanceFromSupabase();
      loadFeedbackFromSupabase();
      loadBriefingFromSupabase();
    } else {
      loadLocalData();
    }
  }, []);

  const loadLocalData = () => {
    // 1. Roster
    const savedRoster = localStorage.getItem('miqra_roster');
    if (savedRoster) {
      try { setRoster(JSON.parse(savedRoster)); } catch (e) { setRoster(defaultRoster); }
    } else {
      setRoster(defaultRoster);
      localStorage.setItem('miqra_roster', JSON.stringify(defaultRoster));
    }

    // 2. Attendance History
    const savedAttendance = localStorage.getItem('miqra_attendance_history');
    if (savedAttendance) {
      try { setAttendanceRecords(JSON.parse(savedAttendance)); } catch (e) { setAttendanceRecords({}); }
    }

    // 3. Feedback Reports
    const savedFeedback = localStorage.getItem('miqra_feedback');
    if (savedFeedback) {
      try { setFeedbackList(JSON.parse(savedFeedback)); } catch (e) { setFeedbackList(defaultFeedback); }
    } else {
      setFeedbackList(defaultFeedback);
      localStorage.setItem('miqra_feedback', JSON.stringify(defaultFeedback));
    }

    // 4. Briefing
    const savedBriefing = localStorage.getItem('miqra_leader_briefing');
    if (savedBriefing) {
      try { setBriefingData(JSON.parse(savedBriefing)); } catch (e) { setBriefingData(defaultBriefing); }
    } else {
      setBriefingData(defaultBriefing);
      localStorage.setItem('miqra_leader_briefing', JSON.stringify(defaultBriefing));
    }
  };

  const loadRosterFromSupabase = async () => {
    const { data, error } = await supabase
      .from('roster')
      .select('*')
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
      setRoster(defaultRoster);
      for (const item of defaultRoster) {
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

  const loadAttendanceFromSupabase = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
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
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
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
      setFeedbackList(defaultFeedback);
      for (const item of defaultFeedback) {
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
    const savedBriefing = localStorage.getItem('miqra_leader_briefing');
    if (savedBriefing) {
      try { setBriefingData(JSON.parse(savedBriefing)); } catch (e) { setBriefingData(defaultBriefing); }
    } else {
      setBriefingData(defaultBriefing);
      localStorage.setItem('miqra_leader_briefing', JSON.stringify(defaultBriefing));
    }
  };

  // Sync state helpers
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
          sub_requested_by: item.subRequestedBy || ''
        });
      }
    }
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
          comments: item.comments || ''
        });
      }
    }
  };

  const saveBriefingState = (newBriefing) => {
    setBriefingData(newBriefing);
    localStorage.setItem('miqra_leader_briefing', JSON.stringify(newBriefing));
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

  const handleCancelSubRequest = (id) => {
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

  const handleCancelVolunteer = (id) => {
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

  // --- ATTENDANCE ACTIONS ---
  const handleToggleStudent = (studentId) => {
    setStudentStatus(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    const students = groups[selectedGroup].students;
    const presentList = students.filter(s => studentStatus[s.id]).map(s => s.name);
    const absentList = students.filter(s => !studentStatus[s.id]).map(s => s.name);

    const record = {
      id: 'a_' + Date.now(),
      groupKey: selectedGroup,
      groupName: groups[selectedGroup].name,
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
        absent: record.absent
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
    const initialStatus = {};
    groups[selectedGroup].students.forEach(student => {
      initialStatus[student.id] = true; // Default to present
    });
    setStudentStatus(initialStatus);
  }, [selectedGroup]);

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

  const handleSaveBriefing = () => {
    saveBriefingState(editBriefingData);
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

    const report = {
      id: 'f_' + Date.now(),
      groupKey: formGroup,
      groupName: groups[formGroup].name,
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

  return (
    <div className="animate-fade-in">
      {/* Portal Header and Switcher */}
      <div className="portal-header">
        <div>
          <span className="badge badge-gold" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
            <Shield size={12} />
            Ministry Management
          </span>
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>Youth Fellowship Portal</h1>
        </div>

        {/* Info Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {pendingSubCount > 0 && (
            <div className="badge badge-sub-alert animate-pulse-badge">
              <AlertOctagon size={12} style={{ marginRight: '0.25rem' }} />
              {pendingSubCount} Sub {pendingSubCount === 1 ? 'Request' : 'Requests'} Unfilled
            </div>
          )}

          {/* Role Mock Switcher */}
          <div className="role-switcher">
            <span className="role-label">Simulate View:</span>
            <select 
              className="role-select"
              value={userRole}
              onChange={(e) => {
                setUserRole(e.target.value);
                setPastorAttendanceView('dashboard');
                setIsEditingBriefing(false);
              }}
            >
              <option value="leader">Small Group Leader</option>
              <option value="pastor">Youth Pastor (Admin)</option>
            </select>
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
            {userRole === 'pastor' && feedbackList.filter(f => f.status === 'unread').length > 0 && (
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

              {/* Pastor Form: Add New Duty (Only visible to Pastor) */}
              {userRole === 'pastor' && (
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
                              {userRole === 'pastor' && (
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
                            {userRole === 'pastor' ? (
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

          {/* TAB 2: ATTENDANCE TRACKER */}
          {activeSubTab === 'attendance' && (
            <div className="animate-fade-in">
              
              {/* Pastor Mode Top Toggle Subtabs */}
              {userRole === 'pastor' && (
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
              {userRole === 'pastor' && pastorAttendanceView === 'dashboard' ? (
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
                      <div className="stat-desc">Active youth roll count</div>
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
                          <option value="boys">High School Boys</option>
                          <option value="girls">High School Girls</option>
                          <option value="middle">Middle School Co-ed</option>
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
                        <button
                          key={key}
                          onClick={() => setSelectedGroup(key)}
                          className={`sub-tab-btn ${selectedGroup === key ? 'active' : ''}`}
                          style={{ fontSize: '0.85rem', padding: '0.6rem 0.8rem' }}
                        >
                          {groups[key].name}
                        </button>
                      ))}
                    </div>

                    <div className="modal-section" style={{ marginTop: '1.5rem', paddingTop: '1rem' }}>
                      <h4 className="modal-section-title">Group Stats</h4>
                      <div className="group-stat-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Leader:</span>
                        <span>{groups[selectedGroup].leader}</span>
                      </div>
                      <div className="group-stat-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Total Registered:</span>
                        <span>{groups[selectedGroup].students.length} students</span>
                      </div>
                      <div className="group-stat-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Recorded Sessions:</span>
                        <span>{getStats(selectedGroup).sessions}</span>
                      </div>
                      <div className="group-stat-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Avg. Attendance:</span>
                        <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{getStats(selectedGroup).avgAttendanceText}</span>
                      </div>
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

                    <div className="students-checklist">
                      {groups[selectedGroup].students.map((student) => {
                        const isPresent = studentStatus[student.id];
                        const initials = student.name.split(' ').map(n => n[0]).join('');
                        return (
                          <div 
                            key={student.id} 
                            onClick={() => handleToggleStudent(student.id)}
                            className={`student-row ${isPresent ? 'present' : ''}`}
                          >
                            <div className="student-info">
                              <div className="student-initials">{initials}</div>
                              <span className="student-name">{student.name}</span>
                            </div>
                            <div className="attendance-toggle">
                              ✓
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                      <button onClick={handleSaveAttendance} className="btn-primary">
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
              {userRole === 'pastor' && (
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
              {userRole === 'pastor' && isEditingBriefing && editBriefingData ? (
                <div className="card card-gold animate-fade-in">
                  <h2>Leader Briefing Workspace Editor</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Publish updated verses, resources, and study guide questions. These will be immediately updated for all small group leaders.
                  </p>

                  {/* 1. Scripture Editor */}
                  <div className="modal-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-gold)' }}>1. Scripture Passages</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {editBriefingData.scriptures.map((scr, idx) => (
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
                      {editBriefingData.questions.map((q, idx) => (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
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
              {userRole === 'leader' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Submission Form */}
                  <div className="card">
                    <h2>Small Group Feedback Report</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                      Report back to the Youth Pastor on how your small group study and fellowship went this week.
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
                          >
                            <option value="boys">High School Boys (Dan K.)</option>
                            <option value="girls">High School Girls (Sarah M.)</option>
                            <option value="middle">Middle School Co-ed (Chris J.)</option>
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
                      Review submitted logs and notes back from the Youth Pastor.
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
                            <option value="boys">Boys</option>
                            <option value="girls">Girls</option>
                            <option value="middle">Middle School</option>
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
