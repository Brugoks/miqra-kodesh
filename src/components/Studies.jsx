import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Studies.css';
import { BookOpen, ExternalLink, MessageSquare, FileText, Plus, ChevronDown, ChevronUp, X, Loader2, Info, PlayCircle, CalendarClock, MapPin, User, ClipboardList, Pencil, Link as LinkIcon, Trash2, Maximize2, CheckCircle2, Archive, StickyNote } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { bookNameFromRef, SCRIPTURE_CHAIN_REGEX, normalizeReference } from '../lib/scripture';
import { isLeaderRole } from '../lib/roles';
import { nextMeetingDate, nextNMeetings, toDateKey, formatMeetingDate } from '../lib/meetings';
import StudyResources from './StudyResources';

const makeBlankMeetingLink = () => ({ label: '', url: '' });
const blankMeetingForm = { meeting_date: '', facilitator: '', focus_passage: '', agenda: '', discussion_questions: '', location: '', notes: '', links: [makeBlankMeetingLink()] };

const BIBLE_VERSIONS = [
  { id: 'a556c5305ee15c3f-01', label: 'CSB' },
  { id: 'd6e14a625393b4da-01', label: 'NLT' },
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB' },
  { id: 'de4e12af7f28f599-01', label: 'KJV' },
  { id: '06125adad2d5898a-01', label: 'ASV' },
  { id: '9879dbb7cfe39e4d-01', label: 'WEB' },
];

// Maps common book names / abbreviations → api.bible USFM codes
const BOOK_ABBR = {
  'genesis': 'GEN', 'gen': 'GEN', 'exodus': 'EXO', 'ex': 'EXO', 'exo': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV', 'numbers': 'NUM', 'num': 'NUM',
  'deuteronomy': 'DEU', 'deut': 'DEU', 'deu': 'DEU',
  'joshua': 'JOS', 'jos': 'JOS', 'judges': 'JDG', 'jdg': 'JDG',
  'ruth': 'RUT', 'rut': 'RUT',
  '1 samuel': '1SA', '1sa': '1SA', '2 samuel': '2SA', '2sa': '2SA',
  '1 kings': '1KI', '1ki': '1KI', '2 kings': '2KI', '2ki': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH',
  'ezra': 'EZR', 'nehemiah': 'NEH', 'esther': 'EST', 'job': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'ecclesiastes': 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA', 'jeremiah': 'JER', 'jer': 'JER',
  'lamentations': 'LAM', 'ezekiel': 'EZK', 'ezek': 'EZK', 'daniel': 'DAN', 'dan': 'DAN',
  'hosea': 'HOS', 'joel': 'JOL', 'amos': 'AMO', 'obadiah': 'OBA',
  'jonah': 'JON', 'micah': 'MIC', 'nahum': 'NAM', 'habakkuk': 'HAB',
  'zephaniah': 'ZEP', 'haggai': 'HAG', 'zechariah': 'ZEC', 'malachi': 'MAL',
  'matthew': 'MAT', 'mat': 'MAT', 'mark': 'MRK', 'mrk': 'MRK', 'mk': 'MRK',
  'luke': 'LUK', 'luk': 'LUK', 'lk': 'LUK', 'john': 'JHN', 'jhn': 'JHN', 'jn': 'JHN',
  'acts': 'ACT', 'act': 'ACT',
  'romans': 'ROM', 'rom': 'ROM',
  '1 corinthians': '1CO', '1co': '1CO', '2 corinthians': '2CO', '2co': '2CO',
  'galatians': 'GAL', 'gal': 'GAL', 'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'colossians': 'COL', 'col': 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', 'titus': 'TIT', 'philemon': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB', 'james': 'JAS', 'jas': 'JAS',
  '1 peter': '1PE', '2 peter': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN',
  'jude': 'JUD', 'revelation': 'REV', 'rev': 'REV',
};

// Converts "Mark 12:28-34" → "MRK.12.28-MRK.12.34" for api.bible
function refToPassageId(ref) {
  const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[–-](\d+))?$/);
  if (match) {
    const [, rawBook, chapter, startV, endV] = match;
    const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
    if (!code) return null;
    const start = `${code}.${chapter}.${startV}`;
    return endV ? `${start}-${code}.${chapter}.${endV}` : start;
  }

  const chapterMatch = ref.trim().match(/^(.+?)\s+(\d{1,3})$/);
  if (chapterMatch) {
    const [, rawBook, chapter] = chapterMatch;
    const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
    if (!code) return null;
    return `${code}.${chapter}`;
  }
  return null;
}

function refToPassageIds(ref) {
  const normalized = ref.replace(/\.(?=\s)/g, '').replace(/\s+/g, ' ').trim();
  const first = normalized.match(/^(.+?)\s+(\d{1,3}):(\d{1,3}(?:[\u2013-]\d{1,3})?)(.*)$/);
  if (!first) {
    const chapterMatch = normalized.match(/^(.+?)\s+(\d{1,3})$/);
    if (chapterMatch) {
      const [, rawBook, chapter] = chapterMatch;
      const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
      if (!code) return [];
      return [`${code}.${chapter}`];
    }
    return [];
  }

  const [, rawBook, firstChapter, firstVerse, tail] = first;
  const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
  if (!code) return [];

  let currentChapter = firstChapter;
  const parts = [firstVerse, ...tail.split(/[;,]/).map((part) => part.trim()).filter(Boolean)];

  return parts.map((part) => {
    const chapterVerse = part.match(/^(\d{1,3}):(\d{1,3}(?:[\u2013-]\d{1,3})?)$/);
    if (chapterVerse) {
      currentChapter = chapterVerse[1];
      return refToPassageId(`${rawBook} ${currentChapter}:${chapterVerse[2]}`);
    }
    return refToPassageId(`${rawBook} ${currentChapter}:${part}`);
  }).filter(Boolean);
}

function splitScriptureReferenceLines(ref) {
  if (!ref) return [];
  const normalizedText = ref.replace(/\.(?=\s)/g, '').replace(/\s+/g, ' ').trim();
  SCRIPTURE_CHAIN_REGEX.lastIndex = 0;
  const matches = [...normalizedText.matchAll(SCRIPTURE_CHAIN_REGEX)].map((match) => normalizeReference(match[0]));
  if (matches.length > 1) {
    return matches.flatMap((match) => splitScriptureReferenceLines(match));
  }

  const normalized = matches[0] || normalizedText;
  const first = normalized.match(/^(.+?)\s+(\d{1,3}):(\d{1,3}(?:[\u2013-]\d{1,3})?)(.*)$/);
  if (!first) return [normalizedText];

  const [, rawBook, firstChapter, firstVerse, tail] = first;
  let currentChapter = firstChapter;
  const lines = [`${rawBook} ${currentChapter}:${firstVerse}`];

  tail.split(/[;,]/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const chapterVerse = part.match(/^(\d{1,3}):(.+)$/);
    if (chapterVerse) {
      currentChapter = chapterVerse[1];
      lines.push(`${rawBook} ${currentChapter}:${chapterVerse[2]}`);
    } else {
      lines.push(`${rawBook} ${currentChapter}:${part}`);
    }
  });

  return lines;
}

function normalizeMeetingLinks(links) {
  return (Array.isArray(links) ? links : [])
    .map((link) => {
      const rawUrl = String(link.url || '').trim();
      if (!rawUrl) return null;
      const url = rawUrl.replace(/[),.;]+$/, '');
      const label = String(link.label || '').trim();
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return {
          url: parsed.toString(),
          label: label || parsed.hostname.replace(/^www\./, ''),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function meetingLinksToRows(links) {
  const rows = (Array.isArray(links) ? links : [])
    .map((link) => ({
      label: String(link.label || '').trim(),
      url: String(link.url || '').trim(),
    }))
    .filter((link) => link.label || link.url);
  return rows.length ? rows : [makeBlankMeetingLink()];
}

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

const splitSummary = (summaryText) => {
  const [label, ...rest] = summaryText.split(':');
  return rest.length ? { label, body: rest.join(':').trim() } : { label: '', body: summaryText };
};


export default function Studies({ session, userRole, activeOrgId }) {
  const location = useLocation();
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);
  const canEditMeeting = isLeaderRole(userRole);

  const [portions, setPortions] = useState([]);
  const [activePortionId, setActivePortionId] = useState('');
  const [activeTab, setActiveTab] = useState('readings');
  const [groupsById, setGroupsById] = useState({});

  // Reading progress tracking
  const [completedReadings, setCompletedReadings] = useState(new Set());

  // Personal study notes
  const [studyNotes, setStudyNotes] = useState({}); // key: `seriesId:ref` → note text
  const [notesSaving, setNotesSaving] = useState({});
  const noteSaveTimers = useRef({});

  // Series archiving
  const [showArchived, setShowArchived] = useState(false);

  // Facilitator autocomplete
  const [groupMembers, setGroupMembers] = useState([]); // { id, full_name, email }
  const [facilitatorDropdownOpen, setFacilitatorDropdownOpen] = useState(false);

  // Next-meeting board
  const [meeting, setMeeting] = useState(null);          // group_meetings row for the next date
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [meetingForm, setMeetingForm] = useState(blankMeetingForm);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingError, setMeetingError] = useState('');

  // Derived after meetingForm is initialized to avoid TDZ
  const facilitatorSuggestions = useMemo(() =>
    groupMembers.filter((m) =>
      m.full_name && meetingForm.facilitator
        ? m.full_name.toLowerCase().includes(meetingForm.facilitator.toLowerCase())
        : true
    ),
  [groupMembers, meetingForm.facilitator]);

  const [meetingHistory, setMeetingHistory] = useState([]);
  const [meetingHistoryLoading, setMeetingHistoryLoading] = useState(false);

  // Past meeting edit/delete state
  const [editingPastMeeting, setEditingPastMeeting] = useState(null);
  const [pastMeetingForm, setPastMeetingForm] = useState(blankMeetingForm);
  const [pastMeetingSaving, setPastMeetingSaving] = useState(false);
  const [pastMeetingError, setPastMeetingError] = useState('');
  const [deletingPastMeetingId, setDeletingPastMeetingId] = useState(null);
  const [pastMeetingDeleting, setPastMeetingDeleting] = useState(false);
  const [pastFacilitatorDropdownOpen, setPastFacilitatorDropdownOpen] = useState(false);

  const pastFacilitatorSuggestions = useMemo(() =>
    groupMembers.filter((m) =>
      m.full_name && pastMeetingForm.facilitator
        ? m.full_name.toLowerCase().includes(pastMeetingForm.facilitator.toLowerCase())
        : true
    ),
  [groupMembers, pastMeetingForm.facilitator]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({});

  // Upcoming meetings (beyond the next one) — editable inline so leaders can plan
  // ahead without opening the Calendar and deep-linking back here.
  const [upcomingMeetings, setUpcomingMeetings] = useState({}); // dateKey -> group_meetings row
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [expandedUpcomingKeys, setExpandedUpcomingKeys] = useState({});
  const [editingUpcomingKey, setEditingUpcomingKey] = useState(null);
  const [upcomingForm, setUpcomingForm] = useState(blankMeetingForm);
  const [upcomingSaving, setUpcomingSaving] = useState(false);
  const [upcomingError, setUpcomingError] = useState('');
  const [upcomingFacilitatorDropdownOpen, setUpcomingFacilitatorDropdownOpen] = useState(false);

  const [editingDiscussionTarget, setEditingDiscussionTarget] = useState(null);
  const [discussionQuestionsForm, setDiscussionQuestionsForm] = useState('');
  const [discussionQuestionsSaving, setDiscussionQuestionsSaving] = useState(false);
  const [discussionQuestionsError, setDiscussionQuestionsError] = useState('');

  const upcomingFacilitatorSuggestions = useMemo(() =>
    groupMembers.filter((m) =>
      m.full_name && upcomingForm.facilitator
        ? m.full_name.toLowerCase().includes(upcomingForm.facilitator.toLowerCase())
        : true
    ),
  [groupMembers, upcomingForm.facilitator]);

  const meetingLinkParams = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      groupId: params.get('group') || '',
      dateKey: params.get('date') || '',
    };
  }, [location.search]);

  // Inline scripture reader
  const [bibleVersion, setBibleVersion] = useState('a556c5305ee15c3f-01'); // CSB
  const [passageCache, setPassageCache] = useState({});
  const [activeReadingIdx, setActiveReadingIdx] = useState(null);
  const [passageLoading, setPassageLoading] = useState(false);
  const [showTranslationGuide, setShowTranslationGuide] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    let mounted = true;

    async function load() {
      let myGroupIds = [];
      const myGroupMap = {};

      // RLS scopes this to the active organization only, so groups never cross
      // orgs even when a user belongs to multiple. We further filter client-side
      // by linkedUserId so we only stub the groups this user is actually in.
      const { data: groupData } = await supabase
        .from('attendance_groups')
        .select('*');

      if (groupData?.length) {
        const visibleGroups = groupData.filter((g) =>
          (g.students || []).some((s) => s.linkedUserId === userId)
        );

        myGroupIds = visibleGroups.map((g) => g.id);
        visibleGroups.forEach((g) => { myGroupMap[g.id] = g; });
        if (mounted) {
          setGroupsById(Object.fromEntries(visibleGroups.map((g) => [g.id, g])));
        }
      }

      const { data, error } = await supabase
        .from('study_series')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!mounted || error) return;

      const relevant = (data || []).filter((s) => {
        return s.group_id && myGroupIds.includes(s.group_id);
      });

      // Build stubs for every group the user belongs to that has a topic.
      // Do this BEFORE the early-return check so stubs are available even when
      // there are no org-wide or group-linked series rows yet.
      const allGroupStubs = Object.values(myGroupMap)
        .filter((g) => g.topic)
        .map((group) => ({
          id: `stub_${group.id}`,
          name: group.topic,
          translation: null,
          ref: null,
          readings: [],
          summary: [],
          questions: [],
          groupId: group.id,
          groupName: group.name,
          isPersonal: false,
          createdBy: null,
          isStub: true,
          archived: false,
        }));

      if (!relevant.length && !allGroupStubs.length) {
        if (mounted) { setPortions([]); setActivePortionId(''); setActiveReadingIdx(null); }
        return;
      }

      const mapped = relevant.map((item) => ({
        id: item.id,
        name: item.name,
        translation: item.translation,
        ref: item.ref,
        readings: item.readings || [],
        summary: item.summary || [],
        questions: item.questions || [],
        groupId: item.group_id || null,
        groupName: item.group_id ? (myGroupMap[item.group_id]?.name ?? null) : null,
        isPersonal: Boolean(item.created_by && !item.group_id),
        createdBy: item.created_by || null,
        isStub: false,
        archived: Boolean(item.archived),
      }));

      // Only append stubs for groups not already represented by a real series row.
      const groupsWithSeries = new Set(mapped.map((s) => s.groupId).filter(Boolean));
      allGroupStubs.forEach((stub) => {
        if (!groupsWithSeries.has(stub.groupId)) mapped.push(stub);
      });

      if (mounted) {
        setPortions(mapped);
        setActivePortionId((prev) => {
          const linked = meetingLinkParams.groupId
            ? mapped.find((p) => p.groupId === meetingLinkParams.groupId)
            : null;
          if (linked) return linked.id;
          return mapped.some((p) => p.id === prev) ? prev : mapped[0].id;
        });
        setActiveReadingIdx(null);
      }
    }

    load();
    return () => { mounted = false; };
  }, [userId, activeOrgId, meetingLinkParams.groupId]);

  // Load group members for facilitator autocomplete whenever the selected group changes.
  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return;
    supabase
      .rpc('org_members', { org_id: activeOrgId })
      .order('full_name', { ascending: true })
      .then(({ data }) => setGroupMembers(data || []))
      .catch(() => {});
  }, [activeOrgId]);

  // Load progress & notes on mount or user change
  useEffect(() => {
    if (!isConfigured) return;
    let mounted = true;

    async function loadProgressAndNotes() {
      // 1. Load progress
      const { data: progressData } = await supabase
        .from('study_reading_progress')
        .select('series_id, reading_ref')
        .eq('user_id', userId);

      if (mounted && progressData) {
        const progressSet = new Set(progressData.map(p => `${p.series_id}|${p.reading_ref}`));
        setCompletedReadings(progressSet);
      }

      // 2. Load notes
      const { data: notesData } = await supabase
        .from('study_notes')
        .select('series_id, reading_ref, note_text')
        .eq('user_id', userId);

      if (mounted && notesData) {
        const notesMap = {};
        notesData.forEach(n => {
          notesMap[`${n.series_id}|${n.reading_ref}`] = n.note_text;
        });
        setStudyNotes(notesMap);
      }
    }

    loadProgressAndNotes();
    return () => { mounted = false; };
  }, [userId, isConfigured]);

  useEffect(() => {
    const timers = noteSaveTimers.current;
    return () => {
      // Clean up all pending save timers on unmount
      if (timers) {
        Object.values(timers).forEach(clearTimeout);
      }
    };
  }, []);

  const toggleReadingCompleted = async (seriesId, readingRef) => {
    if (!isConfigured) return;
    const key = `${seriesId}|${readingRef}`;
    const nextSet = new Set(completedReadings);
    const isCompleted = nextSet.has(key);

    if (isCompleted) {
      nextSet.delete(key);
    } else {
      nextSet.add(key);
    }
    setCompletedReadings(nextSet);

    try {
      if (isCompleted) {
        await supabase
          .from('study_reading_progress')
          .delete()
          .eq('user_id', userId)
          .eq('series_id', seriesId)
          .eq('reading_ref', readingRef);
      } else {
        await supabase
          .from('study_reading_progress')
          .upsert({
            user_id: userId,
            series_id: seriesId,
            reading_ref: readingRef,
            completed_at: new Date().toISOString()
          }, { onConflict: 'user_id,series_id,reading_ref' });
      }
    } catch (err) {
      console.error("Failed to update reading progress:", err);
    }
  };

  const saveStudyNote = async (seriesId, readingRef, text) => {
    if (!isConfigured) return;
    const key = `${seriesId}|${readingRef}`;
    
    setNotesSaving(prev => ({ ...prev, [key]: true }));
    try {
      if (!text.trim()) {
        await supabase
          .from('study_notes')
          .delete()
          .eq('user_id', userId)
          .eq('series_id', seriesId)
          .eq('reading_ref', readingRef);
      } else {
        await supabase
          .from('study_notes')
          .upsert({
            user_id: userId,
            series_id: seriesId,
            reading_ref: readingRef,
            note_text: text,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,series_id,reading_ref' });
      }
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setNotesSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleNoteChange = (seriesId, readingRef, text) => {
    const key = `${seriesId}|${readingRef}`;
    setStudyNotes(prev => ({ ...prev, [key]: text }));

    // Debounce auto-save
    if (noteSaveTimers.current[key]) {
      clearTimeout(noteSaveTimers.current[key]);
    }

    noteSaveTimers.current[key] = setTimeout(() => {
      saveStudyNote(seriesId, readingRef, text);
    }, 1500);
  };

  const handleSelectPortion = (id) => {
    setActivePortionId(id);
    setActiveReadingIdx(null);
    setActiveTab('readings');
    setEditingMeeting(false);
    setEditingDiscussionTarget(null);
    setMeetingError('');
  };

  const handleToggleReading = async (idx, ref) => {
    if (activeReadingIdx === idx) { setActiveReadingIdx(null); return; }
    setActiveReadingIdx(idx);

    if (!isConfigured) return;

    const cacheKey = `${bibleVersion}:${ref}`;
    if (passageCache[cacheKey]) return;

    const passageIds = refToPassageIds(ref);
    if (!passageIds.length) return;

    setPassageLoading(true);
    try {
      const passages = await Promise.all(passageIds.map(async (passageId) => {
        const { data, error } = await supabase.functions.invoke('bible-proxy', {
          body: { bibleId: bibleVersion, passageId },
        });
        if (error || !data?.data?.content) return null;
        return data.data.content;
      }));
      const content = passages.filter(Boolean).join('\n\n');
      if (content) {
        setPassageCache((prev) => ({
          ...prev,
          [cacheKey]: { content, reference: ref },
        }));
      }
    } finally {
      setPassageLoading(false);
    }
  };

  const currentPortion = portions.find((p) => p.id === activePortionId) || portions[0] || null;
  const currentGroupId = currentPortion?.groupId || null;
  const currentGroup = currentGroupId ? groupsById[currentGroupId] : null;
  const canEditDiscussionQuestions = Boolean(currentGroupId && isConfigured);
  const canInlineEditDiscussionQuestions = canEditDiscussionQuestions && !canEditMeeting;

  // Derived (not state) so it stays stable across renders and can key the fetch.
  const linkedMeetingDate = useMemo(() => {
    if (!meetingLinkParams.dateKey || meetingLinkParams.groupId !== currentGroupId) return null;
    return dateFromKey(meetingLinkParams.dateKey);
  }, [currentGroupId, meetingLinkParams.dateKey, meetingLinkParams.groupId]);
  const meetingDate = useMemo(
    () => linkedMeetingDate || nextMeetingDate(currentGroup),
    [currentGroup, linkedMeetingDate],
  );
  const meetingDateKey = meetingDate ? toDateKey(meetingDate) : null;

  // Load the next meeting's editable details whenever the selected group/date changes.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentGroupId || !isConfigured || !meetingDateKey) {
        if (active) setMeeting(null);
        return;
      }
      setMeetingLoading(true);
      const { data } = await supabase
        .from('group_meetings')
        .select('*')
        .eq('group_id', currentGroupId)
        .eq('meeting_date', meetingDateKey)
        .maybeSingle();
      if (active) { setMeeting(data || null); setMeetingLoading(false); }
    })();
    return () => { active = false; };
  }, [currentGroupId, meetingDateKey, isConfigured]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentGroupId || !isConfigured) {
        if (active) {
          setMeetingHistory([]);
          setMeetingHistoryLoading(false);
        }
        return;
      }

      setMeetingHistoryLoading(true);
      const cutoffDate = meetingDateKey || toDateKey(new Date());
      const { data } = await supabase
        .from('group_meetings')
        .select('*')
        .eq('group_id', currentGroupId)
        .lt('meeting_date', cutoffDate)
        .order('meeting_date', { ascending: false })
        .limit(12);

      if (active) {
        setMeetingHistory(data || []);
        setMeetingHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentGroupId, meetingDateKey, isConfigured]);

  const openMeetingEditor = () => {
    setMeetingForm({
      meeting_date: meetingDate ? toDateKey(meetingDate) : '',
      facilitator: meeting?.facilitator || currentGroup?.leader || '',
      focus_passage: meeting?.focus_passage || currentPortion?.ref || '',
      agenda: meeting?.agenda || '',
      discussion_questions: meeting?.discussion_questions || '',
      location: meeting?.location || currentGroup?.meeting_location || '',
      notes: meeting?.notes || '',
      links: meetingLinksToRows(meeting?.links),
    });
    setMeetingError('');
    setEditingMeeting(true);
  };

  // Email the assigned facilitator when their name is newly set/changed on a meeting.
  const notifyFacilitatorChange = async ({ previousFacilitator, row, dateObj }) => {
    const newFacilitator = row.facilitator || '';
    if (!newFacilitator || newFacilitator === previousFacilitator) return;
    const match = groupMembers.find(
      (m) => m.full_name?.toLowerCase() === newFacilitator.toLowerCase()
    );
    if (!match?.email) return;
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const groupName = currentGroup?.name || 'your group';
    const dateLabel = dateObj
      ? dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'the next meeting';
    supabase.functions.invoke('send-email', {
      headers: { Authorization: `Bearer ${authSession?.access_token}` },
      body: {
        type: 'facilitator_assigned',
        to: match.email,
        subject: `You've been assigned as facilitator for ${groupName}`,
        html: `<p>Hi ${match.full_name},</p>
<p>You have been assigned as the <strong>facilitator</strong> for <strong>${groupName}</strong> on <strong>${dateLabel}</strong>.</p>
${row.focus_passage ? `<p><strong>Focus passage:</strong> ${row.focus_passage}</p>` : ''}
${row.agenda ? `<p><strong>Agenda:</strong><br>${row.agenda.replace(/\n/g, '<br>')}</p>` : ''}
${row.discussion_questions ? `<p><strong>Discussion questions:</strong><br>${row.discussion_questions.replace(/\n/g, '<br>')}</p>` : ''}
<p>Please take some time to review the material and come prepared to lead the discussion.</p>
<p>— Miqra Kodesh</p>`,
        text: `Hi ${match.full_name},\n\nYou have been assigned as facilitator for ${groupName} on ${dateLabel}.${row.focus_passage ? '\n\nFocus passage: ' + row.focus_passage : ''}${row.agenda ? '\n\nAgenda:\n' + row.agenda : ''}${row.discussion_questions ? '\n\nDiscussion questions:\n' + row.discussion_questions : ''}\n\nPlease come prepared to lead the discussion.\n\n— Miqra Kodesh`,
        metadata: { organization_id: activeOrgId },
      },
    }).catch(() => {});
  };

  const handleSaveMeeting = async (e) => {
    e.preventDefault();
    if (!currentGroupId || !meetingDate) return;
    setMeetingSaving(true);
    setMeetingError('');

    const oldDateKey = toDateKey(meetingDate);
    const newDateKey = meetingForm.meeting_date || oldDateKey;
    const dateChanged = newDateKey !== oldDateKey;

    const row = {
      group_id: currentGroupId,
      meeting_date: newDateKey,
      facilitator: meetingForm.facilitator.trim() || null,
      focus_passage: meetingForm.focus_passage.trim() || null,
      agenda: meetingForm.agenda.trim() || null,
      discussion_questions: meetingForm.discussion_questions.trim() || null,
      location: meetingForm.location.trim() || null,
      notes: meetingForm.notes.trim() || null,
      links: normalizeMeetingLinks(meetingForm.links),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
      reminder_sent: false,
    };

    let data, error;
    if (meeting?.id) {
      // UPDATE by PK so we can safely change meeting_date without leaving an orphan
      ({ data, error } = await supabase
        .from('group_meetings')
        .update(row)
        .eq('id', meeting.id)
        .select()
        .maybeSingle());
    } else {
      ({ data, error } = await supabase
        .from('group_meetings')
        .upsert(row, { onConflict: 'group_id,meeting_date' })
        .select()
        .maybeSingle());
    }

    if (error) { setMeetingError(error.message); setMeetingSaving(false); return; }

    if (dateChanged) {
      await supabase
        .from('attendance_groups')
        .update({ next_meeting_date: newDateKey })
        .eq('id', currentGroupId);
      setGroupsById((prev) => ({
        ...prev,
        [currentGroupId]: { ...prev[currentGroupId], next_meeting_date: newDateKey },
      }));
    }

    await notifyFacilitatorChange({ previousFacilitator: meeting?.facilitator || '', row, dateObj: meetingDate });

    setMeeting(data);
    setEditingMeeting(false);
    setMeetingSaving(false);
  };

  const updateMeetingField = (field, value) =>
    setMeetingForm((prev) => ({ ...prev, [field]: value }));

  const updateMeetingLink = (index, field, value) =>
    setMeetingForm((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    }));

  const addMeetingLink = () =>
    setMeetingForm((prev) => ({ ...prev, links: [...prev.links, makeBlankMeetingLink()] }));

  const removeMeetingLink = (index) =>
    setMeetingForm((prev) => {
      const links = prev.links.filter((_, i) => i !== index);
      return { ...prev, links: links.length ? links : [makeBlankMeetingLink()] };
    });

  // Upcoming meetings beyond the next one — surface the next few scheduled
  // occurrences (excluding the one already shown in the Next Meeting card).
  const upcomingDates = useMemo(() => {
    if (!currentGroup) return [];
    return nextNMeetings(currentGroup, 6)
      .filter((d) => toDateKey(d) !== meetingDateKey)
      .slice(0, 4);
  }, [currentGroup, meetingDateKey]);
  const upcomingDateKeys = useMemo(() => upcomingDates.map(toDateKey), [upcomingDates]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentGroupId || !isConfigured || upcomingDateKeys.length === 0) {
        if (active) { setUpcomingMeetings({}); setUpcomingLoading(false); }
        return;
      }
      setUpcomingLoading(true);
      const { data } = await supabase
        .from('group_meetings')
        .select('*')
        .eq('group_id', currentGroupId)
        .in('meeting_date', upcomingDateKeys);
      if (active) {
        const map = {};
        (data || []).forEach((m) => { map[m.meeting_date] = m; });
        setUpcomingMeetings(map);
        setUpcomingLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentGroupId, isConfigured, upcomingDateKeys]);

  const openUpcomingEditor = (dateKey) => {
    const existing = upcomingMeetings[dateKey];
    setUpcomingForm({
      meeting_date: dateKey,
      facilitator: existing?.facilitator || currentGroup?.leader || '',
      focus_passage: existing?.focus_passage || currentPortion?.ref || '',
      agenda: existing?.agenda || '',
      discussion_questions: existing?.discussion_questions || '',
      location: existing?.location || currentGroup?.meeting_location || '',
      notes: existing?.notes || '',
      links: meetingLinksToRows(existing?.links),
    });
    setUpcomingError('');
    setUpcomingFacilitatorDropdownOpen(false);
    setEditingUpcomingKey(dateKey);
    setExpandedUpcomingKeys((prev) => ({ ...prev, [dateKey]: true }));
  };

  const handleSaveUpcomingMeeting = async (e) => {
    e.preventDefault();
    if (!currentGroupId || !editingUpcomingKey) return;
    setUpcomingSaving(true);
    setUpcomingError('');

    const dateKey = editingUpcomingKey;
    const existing = upcomingMeetings[dateKey];
    const row = {
      group_id: currentGroupId,
      meeting_date: dateKey,
      facilitator: upcomingForm.facilitator.trim() || null,
      focus_passage: upcomingForm.focus_passage.trim() || null,
      agenda: upcomingForm.agenda.trim() || null,
      discussion_questions: upcomingForm.discussion_questions.trim() || null,
      location: upcomingForm.location.trim() || null,
      notes: upcomingForm.notes.trim() || null,
      links: normalizeMeetingLinks(upcomingForm.links),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
      reminder_sent: false,
    };

    let data, error;
    if (existing?.id) {
      ({ data, error } = await supabase
        .from('group_meetings')
        .update(row)
        .eq('id', existing.id)
        .select()
        .maybeSingle());
    } else {
      ({ data, error } = await supabase
        .from('group_meetings')
        .upsert(row, { onConflict: 'group_id,meeting_date' })
        .select()
        .maybeSingle());
    }

    if (error) { setUpcomingError(error.message); setUpcomingSaving(false); return; }

    await notifyFacilitatorChange({
      previousFacilitator: existing?.facilitator || '',
      row,
      dateObj: dateFromKey(dateKey),
    });

    setUpcomingMeetings((prev) => ({ ...prev, [dateKey]: data }));
    setEditingUpcomingKey(null);
    setUpcomingSaving(false);
  };

  const updateUpcomingField = (field, value) =>
    setUpcomingForm((prev) => ({ ...prev, [field]: value }));

  const updateUpcomingLink = (index, field, value) =>
    setUpcomingForm((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    }));

  const addUpcomingLink = () =>
    setUpcomingForm((prev) => ({ ...prev, links: [...prev.links, makeBlankMeetingLink()] }));

  const removeUpcomingLink = (index) =>
    setUpcomingForm((prev) => {
      const links = prev.links.filter((_, i) => i !== index);
      return { ...prev, links: links.length ? links : [makeBlankMeetingLink()] };
    });

  // Past meeting edit/delete handlers
  const openPastMeetingEditor = (pastMeeting) => {
    setEditingPastMeeting(pastMeeting);
    setPastMeetingForm({
      meeting_date: pastMeeting.meeting_date || '',
      facilitator: pastMeeting.facilitator || '',
      focus_passage: pastMeeting.focus_passage || '',
      agenda: pastMeeting.agenda || '',
      discussion_questions: pastMeeting.discussion_questions || '',
      location: pastMeeting.location || '',
      notes: pastMeeting.notes || '',
      links: meetingLinksToRows(pastMeeting.links),
    });
    setPastMeetingError('');
  };

  const handleSavePastMeeting = async (e) => {
    e.preventDefault();
    if (!editingPastMeeting) return;
    setPastMeetingSaving(true);
    setPastMeetingError('');

    const row = {
      id: editingPastMeeting.id,
      group_id: editingPastMeeting.group_id,
      meeting_date: pastMeetingForm.meeting_date || editingPastMeeting.meeting_date,
      facilitator: pastMeetingForm.facilitator.trim() || null,
      focus_passage: pastMeetingForm.focus_passage.trim() || null,
      agenda: pastMeetingForm.agenda.trim() || null,
      discussion_questions: pastMeetingForm.discussion_questions.trim() || null,
      location: pastMeetingForm.location.trim() || null,
      notes: pastMeetingForm.notes.trim() || null,
      links: normalizeMeetingLinks(pastMeetingForm.links),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
      reminder_sent: true,
    };

    const { data, error } = await supabase
      .from('group_meetings')
      .upsert(row)
      .select()
      .maybeSingle();

    if (error) {
      setPastMeetingError(error.message);
      setPastMeetingSaving(false);
      return;
    }

    setMeetingHistory((prev) =>
      prev.map((m) => (m.id === editingPastMeeting.id ? data : m))
    );
    setEditingPastMeeting(null);
    setPastMeetingSaving(false);
  };

  const handleDeletePastMeeting = async (meetingId) => {
    if (!meetingId) return;
    setPastMeetingDeleting(true);
    const { error } = await supabase
      .from('group_meetings')
      .delete()
      .eq('id', meetingId);

    if (!error) {
      setMeetingHistory((prev) => prev.filter((m) => m.id !== meetingId));
      setDeletingPastMeetingId(null);
    } else {
      alert(`Error deleting meeting: ${error.message}`);
    }
    setPastMeetingDeleting(false);
  };

  const updatePastMeetingField = (field, value) =>
    setPastMeetingForm((prev) => ({ ...prev, [field]: value }));

  const updatePastMeetingLink = (index, field, value) =>
    setPastMeetingForm((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    }));

  const addPastMeetingLink = () =>
    setPastMeetingForm((prev) => ({ ...prev, links: [...prev.links, makeBlankMeetingLink()] }));

  const removePastMeetingLink = (index) =>
    setPastMeetingForm((prev) => {
      const links = prev.links.filter((_, i) => i !== index);
      return { ...prev, links: links.length ? links : [makeBlankMeetingLink()] };
    });

  const openDiscussionQuestionsEditor = (scope, dateKey, value = '') => {
    if (!dateKey) return;
    setEditingDiscussionTarget({ scope, dateKey });
    setDiscussionQuestionsForm(value || '');
    setDiscussionQuestionsError('');
  };

  const isEditingDiscussionQuestions = (scope, dateKey) =>
    editingDiscussionTarget?.scope === scope && editingDiscussionTarget?.dateKey === dateKey;

  const closeDiscussionQuestionsEditor = () => {
    setEditingDiscussionTarget(null);
    setDiscussionQuestionsForm('');
    setDiscussionQuestionsError('');
  };

  const handleSaveDiscussionQuestions = async (e) => {
    e.preventDefault();
    if (!currentGroupId || !editingDiscussionTarget?.dateKey) return;

    setDiscussionQuestionsSaving(true);
    setDiscussionQuestionsError('');

    const { data, error } = await supabase.rpc('upsert_group_meeting_discussion_questions', {
      target_group_id: currentGroupId,
      target_meeting_date: editingDiscussionTarget.dateKey,
      target_discussion_questions: discussionQuestionsForm,
    });

    if (error) {
      setDiscussionQuestionsError(error.message);
      setDiscussionQuestionsSaving(false);
      return;
    }

    const savedMeeting = Array.isArray(data) ? data[0] : data;
    if (savedMeeting) {
      if (editingDiscussionTarget.scope === 'next') {
        setMeeting(savedMeeting);
      } else if (editingDiscussionTarget.scope === 'upcoming') {
        setUpcomingMeetings((prev) => ({
          ...prev,
          [editingDiscussionTarget.dateKey]: savedMeeting,
        }));
      } else if (editingDiscussionTarget.scope === 'past') {
        setMeetingHistory((prev) =>
          prev.map((m) => (m.id === savedMeeting.id ? savedMeeting : m))
        );
      }
    }

    setDiscussionQuestionsSaving(false);
    closeDiscussionQuestionsEditor();
  };

  const renderDiscussionQuestionsEditor = () => (
    <form className="meeting-discussion-editor" onSubmit={handleSaveDiscussionQuestions}>
      <textarea
        rows={4}
        value={discussionQuestionsForm}
        onChange={(e) => setDiscussionQuestionsForm(e.target.value)}
        placeholder="Add questions for everyone to review before the meeting."
      />
      {discussionQuestionsError && <p className="create-series-error">{discussionQuestionsError}</p>}
      <div className="meeting-discussion-editor-actions">
        <button type="button" className="btn-secondary" onClick={closeDiscussionQuestionsEditor} disabled={discussionQuestionsSaving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={discussionQuestionsSaving}>
          {discussionQuestionsSaving ? 'Saving...' : 'Save Questions'}
        </button>
      </div>
    </form>
  );

  // Filter portions by archived status
  const visiblePortions = useMemo(() => {
    return portions.filter((p) => showArchived || !p.archived);
  }, [portions, showArchived]);

  // Calculate reading progress for current portion
  const progressStats = useMemo(() => {
    if (!currentPortion || !currentPortion.readings || !currentPortion.readings.length) {
      return { total: 0, completed: 0, percentage: 0 };
    }
    const total = currentPortion.readings.length;
    let completed = 0;
    currentPortion.readings.forEach((r) => {
      if (completedReadings.has(`${currentPortion.id}|${r.ref}`)) {
        completed++;
      }
    });
    const percentage = Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [currentPortion, completedReadings]);

  // BibleProject Resources matching: book from the module's reading ref or name, topic from its name.
  const resourceBook = bookNameFromRef(currentPortion?.ref) || bookNameFromRef(currentPortion?.name);
  const resourceTopic = currentPortion?.name || null;

  return (
    <div className="studies-container">

      {/* LEFT: Series list */}
      <section className="portion-selector-card card">
        <div className="studies-sidebar-header">
          <h3>Study Series</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {portions.some((p) => p.archived) && (
              <button
                className={`btn-secondary ${showArchived ? 'active' : ''}`}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                onClick={() => setShowArchived(!showArchived)}
                title="Show archived series"
              >
                <Archive size={12} />
                <span>{showArchived ? 'Hide' : 'Show'} Archived</span>
              </button>
            )}
          </div>
        </div>

        <div className="portion-list">
          {visiblePortions.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.75rem 0.25rem' }}>
              No study series yet. Study series are created from Small Groups.
            </p>
          )}
          {visiblePortions.map((portion) => (
            <div
              key={portion.id}
              className={`portion-btn-wrapper ${portion.id === activePortionId ? 'active' : ''}`}
            >
              <button
                onClick={() => handleSelectPortion(portion.id)}
                className="portion-btn"
              >
                {portion.groupName && <span className="series-scope-badge series-scope-group">{portion.groupName}</span>}
                {!portion.groupName && portion.isPersonal && <span className="series-scope-badge series-scope-personal">Personal</span>}
                {portion.archived && <span className="series-scope-badge series-scope-archived">Archived</span>}
                <span className="portion-btn-name">{portion.name}</span>
                {portion.translation && <span className="portion-btn-translation">"{portion.translation}"</span>}
                {portion.ref && (
                  <span className="portion-btn-ref scripture-ref-lines">
                    {splitScriptureReferenceLines(portion.ref).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* RIGHT: Study content */}
      <section className="study-content-card card">
        {!currentPortion ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 2rem' }}>
            <BookOpen size={48} strokeWidth={1.2} style={{ opacity: 0.35 }} />
            <div>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>No study series yet</p>
              <p style={{ fontSize: '0.9rem' }}>Study series are created and linked from Small Groups.</p>
            </div>
          </div>
        ) : (
        <>
        <div className="portion-header-block">
          {currentPortion.groupName
            ? <span className="badge badge-gold" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>{currentPortion.groupName}</span>
            : currentPortion.isPersonal
              ? <span className="badge" style={{ marginBottom: '0.4rem', display: 'inline-block', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Personal Series</span>
              : <span className="badge badge-gold" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>Weekly Small Group Series</span>
          }
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>{currentPortion.name}</h1>
          <div className="portion-translation-subtitle">
            {currentPortion.translation && <span>Theme: "{currentPortion.translation}"</span>}
            {currentPortion.ref && (
              <span className="scripture-ref-lines">
                {currentPortion.translation && <span>Focus:</span>}
                {splitScriptureReferenceLines(currentPortion.ref).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            )}
          </div>
          {!currentPortion.isStub && progressStats.total > 0 && (
            <div className="portion-progress-bar-container">
              <div className="portion-progress-bar-label">
                <span>Reading Progress</span>
                <span>{progressStats.completed} of {progressStats.total} ({progressStats.percentage}%)</span>
              </div>
              <div className="portion-progress-track">
                <div 
                  className="portion-progress-fill" 
                  style={{ width: `${progressStats.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {currentGroupId && (
          <div className="next-meeting-card animate-fade-in">
            <div className="next-meeting-head">
              <div className="next-meeting-title">
                <CalendarClock size={18} />
                <div>
                  <span className="next-meeting-label">{linkedMeetingDate ? 'Selected Meeting' : 'Next Meeting'}</span>
                  <span className="next-meeting-date">
                    {meetingDate
                      ? formatMeetingDate(meetingDate)
                      : 'Meeting day not set for this group'}
                    {meetingDate && currentGroup?.meeting_time
                      ? ` · ${currentGroup.meeting_time}${currentGroup.meeting_end_time ? ' - ' + currentGroup.meeting_end_time : ''}`
                      : ''}
                    {currentGroup?.frequency ? ` · ${currentGroup.frequency}` : ''}
                  </span>
                </div>
              </div>
              {canEditMeeting && !editingMeeting && meetingDate && (
                <button className="next-meeting-edit-btn" onClick={openMeetingEditor}>
                  <Pencil size={13} />
                  {meeting ? 'Edit' : 'Add details'}
                </button>
              )}
            </div>

            {meetingLoading ? (
              <div className="next-meeting-loading">
                <Loader2 size={15} className="spin" />
                <span>Loading meeting details…</span>
              </div>
            ) : editingMeeting ? (
              <form className="next-meeting-form" onSubmit={handleSaveMeeting}>
                <div className="next-meeting-form-grid">
                  <label>
                    <span><CalendarClock size={12} /> Meeting Date</span>
                    <input
                      type="date"
                      value={meetingForm.meeting_date}
                      onChange={(e) => updateMeetingField('meeting_date', e.target.value)}
                      required
                    />
                  </label>
                  <label style={{ position: 'relative' }}>
                    <span><User size={12} /> Facilitator</span>
                    <input
                      value={meetingForm.facilitator}
                      onChange={(e) => {
                        updateMeetingField('facilitator', e.target.value);
                        setFacilitatorDropdownOpen(true);
                      }}
                      onFocus={() => setFacilitatorDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setFacilitatorDropdownOpen(false), 150)}
                      placeholder={currentGroup?.leader || 'Who is leading?'}
                      autoComplete="off"
                    />
                    {facilitatorDropdownOpen && facilitatorSuggestions.length > 0 && (
                      <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: '8px', margin: '2px 0 0', padding: '4px 0',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.3)', listStyle: 'none', maxHeight: '180px', overflowY: 'auto'
                      }}>
                        {facilitatorSuggestions.map((m) => (
                          <li
                            key={m.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateMeetingField('facilitator', m.full_name);
                              setFacilitatorDropdownOpen(false);
                            }}
                            style={{
                              padding: '0.45rem 0.75rem', cursor: 'pointer',
                              fontSize: '0.875rem', color: 'var(--text-primary)',
                              display: 'flex', flexDirection: 'column', gap: '1px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                          >
                            <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                            {m.email && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.email}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </label>
                  <label>
                    <span><BookOpen size={12} /> Focus Passage</span>
                    <input
                      value={meetingForm.focus_passage}
                      onChange={(e) => updateMeetingField('focus_passage', e.target.value)}
                      placeholder="e.g. Ephesians 4:1-16"
                    />
                  </label>
                  <label>
                    <span><MapPin size={12} /> Location</span>
                    <input
                      value={meetingForm.location}
                      onChange={(e) => updateMeetingField('location', e.target.value)}
                      placeholder={currentGroup?.meeting_location || 'Where are you meeting?'}
                    />
                  </label>
                </div>
                <label className="next-meeting-textarea">
                  <span><ClipboardList size={12} /> Agenda</span>
                  <textarea
                    rows={3}
                    value={meetingForm.agenda}
                    onChange={(e) => updateMeetingField('agenda', e.target.value)}
                    placeholder="Outline what the group will cover — opening, discussion focus, prayer, etc."
                  />
                </label>
                <label className="next-meeting-textarea">
                  <span><MessageSquare size={12} /> Discussion Questions</span>
                  <textarea
                    rows={4}
                    value={meetingForm.discussion_questions}
                    onChange={(e) => updateMeetingField('discussion_questions', e.target.value)}
                    placeholder="Add questions for everyone to review before the meeting."
                  />
                </label>
                <label className="next-meeting-textarea">
                  <span><Info size={12} /> Notes for Members</span>
                  <textarea
                    rows={2}
                    value={meetingForm.notes}
                    onChange={(e) => updateMeetingField('notes', e.target.value)}
                    placeholder="Anything members should bring or prepare beforehand."
                  />
                </label>
                <div className="next-meeting-resource-editor">
                  <div className="resource-editor-head">
                    <span><LinkIcon size={12} /> Resource Links</span>
                    <button type="button" className="resource-add-btn" onClick={addMeetingLink}>
                      <Plus size={13} />
                      Add Link
                    </button>
                  </div>
                  <div className="resource-link-editor-list">
                    {meetingForm.links.map((link, idx) => (
                      <div key={idx} className="resource-link-editor-row">
                        <label>
                          <span>Display Text</span>
                          <input
                            value={link.label}
                            onChange={(e) => updateMeetingLink(idx, 'label', e.target.value)}
                            placeholder="e.g. Discussion Guide"
                          />
                        </label>
                        <label>
                          <span>URL</span>
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => updateMeetingLink(idx, 'url', e.target.value)}
                            placeholder="https://drive.google.com/..."
                          />
                        </label>
                        <button
                          type="button"
                          className="resource-remove-btn"
                          onClick={() => removeMeetingLink(idx)}
                          title="Remove resource link"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {meetingError && <p className="create-series-error">{meetingError}</p>}
                <div className="next-meeting-form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setEditingMeeting(false)} disabled={meetingSaving}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={meetingSaving}>
                    {meetingSaving ? 'Saving…' : 'Save Details'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="next-meeting-details">
                <div className="next-meeting-fields">
                  <div className="next-meeting-field">
                    <span className="nm-field-label"><User size={13} /> Facilitator</span>
                    <span className="nm-field-value">{meeting?.facilitator || currentGroup?.leader || 'To be assigned'}</span>
                  </div>
                  <div className="next-meeting-field">
                    <span className="nm-field-label"><BookOpen size={13} /> Focus Passage</span>
                    <span className="nm-field-value scripture-ref-lines">
                      {(meeting?.focus_passage || currentPortion.ref)
                        ? splitScriptureReferenceLines(meeting?.focus_passage || currentPortion.ref).map((line) => (
                            <span key={line}>{line}</span>
                          ))
                        : '—'}
                    </span>
                  </div>
                  <div className="next-meeting-field">
                    <span className="nm-field-label"><MapPin size={13} /> Location</span>
                    <span className="nm-field-value">{meeting?.location || currentGroup?.meeting_location || '—'}</span>
                  </div>
                </div>
                <div className="next-meeting-field nm-block">
                  <span className="nm-field-label"><ClipboardList size={13} /> Agenda</span>
                  {meeting?.agenda
                    ? <p className="nm-field-text">{meeting.agenda}</p>
                    : <p className="nm-field-text nm-empty">{canEditMeeting ? 'No agenda yet — add details so members can prepare.' : 'The facilitator hasn’t posted an agenda yet.'}</p>}
                </div>
                <div className="next-meeting-field nm-block">
                  <div className="nm-field-label-row">
                    <span className="nm-field-label"><MessageSquare size={13} /> Discussion Questions</span>
                    {canInlineEditDiscussionQuestions && meetingDateKey && !isEditingDiscussionQuestions('next', meetingDateKey) && (
                      <button
                        type="button"
                        className="meeting-discussion-edit-btn"
                        onClick={() => openDiscussionQuestionsEditor('next', meetingDateKey, meeting?.discussion_questions)}
                      >
                        {meeting?.discussion_questions ? 'Edit questions' : 'Add questions'}
                      </button>
                    )}
                  </div>
                  {isEditingDiscussionQuestions('next', meetingDateKey) ? renderDiscussionQuestionsEditor() : (
                    meeting?.discussion_questions
                      ? <p className="nm-field-text">{meeting.discussion_questions}</p>
                      : <p className="nm-field-text nm-empty">{canInlineEditDiscussionQuestions ? 'No discussion questions yet - add questions for the group.' : canEditMeeting ? 'No discussion questions yet — add questions for the group.' : 'The facilitator hasn’t posted discussion questions yet.'}</p>
                  )}
                </div>
                {meeting?.notes && (
                  <div className="next-meeting-field nm-block">
                    <span className="nm-field-label"><Info size={13} /> Notes for Members</span>
                    <p className="nm-field-text">{meeting.notes}</p>
                  </div>
                )}
                {Array.isArray(meeting?.links) && meeting.links.length > 0 && (
                  <div className="next-meeting-field nm-block">
                    <span className="nm-field-label"><LinkIcon size={13} /> Resource Links</span>
                    <div className="meeting-link-list">
                      {meeting.links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                          <span>{link.label || link.url}</span>
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentGroupId && upcomingDates.length > 0 && (
          <section className="meeting-history-card animate-fade-in">
            <div className="meeting-history-head">
              <div>
                <span className="meeting-history-label">Upcoming Meetings</span>
                <h2>Plan the Next Few Meetings</h2>
              </div>
            </div>

            {upcomingLoading ? (
              <div className="next-meeting-loading">
                <Loader2 size={15} className="spin" />
                <span>Loading upcoming meetings…</span>
              </div>
            ) : (
              <div className="meeting-history-list">
                {upcomingDates.map((date) => {
                  const dateKey = toDateKey(date);
                  const saved = upcomingMeetings[dateKey];
                  const isExpanded = !!expandedUpcomingKeys[dateKey];
                  const isEditing = editingUpcomingKey === dateKey;
                  return (
                    <article key={dateKey} className="meeting-history-item">
                      <div
                        className="meeting-history-date"
                        onClick={() => setExpandedUpcomingKeys((prev) => ({ ...prev, [dateKey]: !isExpanded }))}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CalendarClock size={15} />
                          <span>{formatMeetingDate(date)}</span>
                          {saved?.facilitator && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>· {saved.facilitator}</span>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>

                      {isExpanded && !isEditing && (
                        <div className="meeting-history-body" style={{ marginTop: '0.75rem' }}>
                          <div className="meeting-history-fields">
                            <span><User size={12} /> {saved?.facilitator || currentGroup?.leader || 'To be assigned'}</span>
                            {(saved?.location || currentGroup?.meeting_location) && (
                              <span><MapPin size={12} /> {saved?.location || currentGroup?.meeting_location}</span>
                            )}
                          </div>
                          {(saved?.focus_passage || currentPortion?.ref) && (
                            <div className="meeting-history-focus">
                              <BookOpen size={13} />
                              <span className="scripture-ref-lines">
                                {splitScriptureReferenceLines(saved?.focus_passage || currentPortion.ref).map((line) => (
                                  <span key={line}>{line}</span>
                                ))}
                              </span>
                            </div>
                          )}
                          {saved?.agenda && <p className="meeting-history-text">{saved.agenda}</p>}
                          {(saved?.discussion_questions || canInlineEditDiscussionQuestions) && (
                            <div className="meeting-history-discussion">
                              <div className="meeting-discussion-head">
                                <span><MessageSquare size={12} /> Discussion Questions</span>
                                {canInlineEditDiscussionQuestions && !isEditingDiscussionQuestions('upcoming', dateKey) && (
                                  <button
                                    type="button"
                                    className="meeting-discussion-edit-btn"
                                    onClick={() => openDiscussionQuestionsEditor('upcoming', dateKey, saved?.discussion_questions)}
                                  >
                                    {saved?.discussion_questions ? 'Edit questions' : 'Add questions'}
                                  </button>
                                )}
                              </div>
                              {isEditingDiscussionQuestions('upcoming', dateKey) ? renderDiscussionQuestionsEditor() : (
                                saved?.discussion_questions
                                  ? <p className="meeting-history-text">{saved.discussion_questions}</p>
                                  : <p className="meeting-history-text meeting-history-empty">No discussion questions yet.</p>
                              )}
                            </div>
                          )}
                          {saved?.notes && <p className="meeting-history-text meeting-history-note">{saved.notes}</p>}
                          {Array.isArray(saved?.links) && saved.links.length > 0 && (
                            <div className="meeting-link-list">
                              {saved.links.map((link) => (
                                <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                                  <span>{link.label || link.url}</span>
                                  <ExternalLink size={13} />
                                </a>
                              ))}
                            </div>
                          )}
                          {!saved && (
                            <p className="nm-field-text nm-empty">
                              {canEditMeeting ? 'No details yet — add them so members can prepare.' : 'The facilitator hasn’t posted details yet.'}
                            </p>
                          )}
                          {canEditMeeting && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => openUpcomingEditor(dateKey)}
                                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <Pencil size={12} />
                                <span>{saved ? 'Edit' : 'Add details'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {isExpanded && isEditing && (
                        <form className="next-meeting-form" onSubmit={handleSaveUpcomingMeeting} style={{ marginTop: '0.75rem' }}>
                          <div className="next-meeting-form-grid">
                            <label style={{ position: 'relative' }}>
                              <span><User size={12} /> Facilitator</span>
                              <input
                                value={upcomingForm.facilitator}
                                onChange={(e) => { updateUpcomingField('facilitator', e.target.value); setUpcomingFacilitatorDropdownOpen(true); }}
                                onFocus={() => setUpcomingFacilitatorDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setUpcomingFacilitatorDropdownOpen(false), 150)}
                                placeholder={currentGroup?.leader || 'Who is leading?'}
                                autoComplete="off"
                              />
                              {upcomingFacilitatorDropdownOpen && upcomingFacilitatorSuggestions.length > 0 && (
                                <ul style={{
                                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                  borderRadius: '8px', margin: '2px 0 0', padding: '4px 0',
                                  boxShadow: '0 6px 20px rgba(0,0,0,0.3)', listStyle: 'none', maxHeight: '180px', overflowY: 'auto'
                                }}>
                                  {upcomingFacilitatorSuggestions.map((m) => (
                                    <li
                                      key={m.id}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateUpcomingField('facilitator', m.full_name);
                                        setUpcomingFacilitatorDropdownOpen(false);
                                      }}
                                      style={{
                                        padding: '0.45rem 0.75rem', cursor: 'pointer',
                                        fontSize: '0.875rem', color: 'var(--text-primary)',
                                        display: 'flex', flexDirection: 'column', gap: '1px'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                    >
                                      <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                                      {m.email && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.email}</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </label>
                            <label>
                              <span><BookOpen size={12} /> Focus Passage</span>
                              <input
                                value={upcomingForm.focus_passage}
                                onChange={(e) => updateUpcomingField('focus_passage', e.target.value)}
                                placeholder="e.g. Ephesians 4:1-16"
                              />
                            </label>
                            <label>
                              <span><MapPin size={12} /> Location</span>
                              <input
                                value={upcomingForm.location}
                                onChange={(e) => updateUpcomingField('location', e.target.value)}
                                placeholder={currentGroup?.meeting_location || 'Where are you meeting?'}
                              />
                            </label>
                          </div>
                          <label className="next-meeting-textarea">
                            <span><ClipboardList size={12} /> Agenda</span>
                            <textarea
                              rows={3}
                              value={upcomingForm.agenda}
                              onChange={(e) => updateUpcomingField('agenda', e.target.value)}
                              placeholder="Outline what the group will cover — opening, discussion focus, prayer, etc."
                            />
                          </label>
                          <label className="next-meeting-textarea">
                            <span><MessageSquare size={12} /> Discussion Questions</span>
                            <textarea
                              rows={4}
                              value={upcomingForm.discussion_questions}
                              onChange={(e) => updateUpcomingField('discussion_questions', e.target.value)}
                              placeholder="Add questions for everyone to review before the meeting."
                            />
                          </label>
                          <label className="next-meeting-textarea">
                            <span><Info size={12} /> Notes for Members</span>
                            <textarea
                              rows={2}
                              value={upcomingForm.notes}
                              onChange={(e) => updateUpcomingField('notes', e.target.value)}
                              placeholder="Anything members should bring or prepare beforehand."
                            />
                          </label>
                          <div className="next-meeting-resource-editor">
                            <div className="resource-editor-head">
                              <span><LinkIcon size={12} /> Resource Links</span>
                              <button type="button" className="resource-add-btn" onClick={addUpcomingLink}>
                                <Plus size={13} />
                                Add Link
                              </button>
                            </div>
                            <div className="resource-link-editor-list">
                              {upcomingForm.links.map((link, idx) => (
                                <div key={idx} className="resource-link-editor-row">
                                  <label>
                                    <span>Display Text</span>
                                    <input
                                      value={link.label}
                                      onChange={(e) => updateUpcomingLink(idx, 'label', e.target.value)}
                                      placeholder="e.g. Discussion Guide"
                                    />
                                  </label>
                                  <label>
                                    <span>URL</span>
                                    <input
                                      type="url"
                                      value={link.url}
                                      onChange={(e) => updateUpcomingLink(idx, 'url', e.target.value)}
                                      placeholder="https://drive.google.com/..."
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="resource-remove-btn"
                                    onClick={() => removeUpcomingLink(idx)}
                                    title="Remove resource link"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          {upcomingError && <p className="create-series-error">{upcomingError}</p>}
                          <div className="next-meeting-form-actions">
                            <button type="button" className="btn-secondary" onClick={() => setEditingUpcomingKey(null)} disabled={upcomingSaving}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={upcomingSaving}>
                              {upcomingSaving ? 'Saving…' : 'Save Details'}
                            </button>
                          </div>
                        </form>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {currentGroupId && (
          <section className="meeting-history-card animate-fade-in">
            <div className="meeting-history-head">
              <div>
                <span className="meeting-history-label">Meeting History</span>
                <h2>Previous Bible Study Meetings</h2>
              </div>
              {meetingHistory.length > 0 && (
                <span className="meeting-history-count">{meetingHistory.length} saved</span>
              )}
            </div>

            {meetingHistoryLoading ? (
              <div className="next-meeting-loading">
                <Loader2 size={15} className="spin" />
                <span>Loading meeting history...</span>
              </div>
            ) : meetingHistory.length > 0 ? (
              <div className="meeting-history-list">
                {meetingHistory.map((pastMeeting) => {
                  const pastDate = dateFromKey(pastMeeting.meeting_date);
                  const isExpanded = !!expandedHistoryIds[pastMeeting.id];
                  return (
                    <article key={pastMeeting.id} className="meeting-history-item">
                      <div
                        className="meeting-history-date"
                        onClick={() => setExpandedHistoryIds(prev => ({ ...prev, [pastMeeting.id]: !isExpanded }))}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CalendarClock size={15} />
                          <span>{pastDate ? formatMeetingDate(pastDate) : pastMeeting.meeting_date}</span>
                        </div>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>
                      {isExpanded && (
                        <div className="meeting-history-body" style={{ marginTop: '0.75rem' }}>
                          <div className="meeting-history-fields">
                            <span><User size={12} /> {pastMeeting.facilitator || 'Facilitator not recorded'}</span>
                            {pastMeeting.location && <span><MapPin size={12} /> {pastMeeting.location}</span>}
                          </div>
                          {pastMeeting.focus_passage && (
                            <div className="meeting-history-focus">
                              <BookOpen size={13} />
                              <span className="scripture-ref-lines">
                                {splitScriptureReferenceLines(pastMeeting.focus_passage).map((line) => (
                                  <span key={line}>{line}</span>
                                ))}
                              </span>
                            </div>
                          )}
                          {pastMeeting.agenda && <p className="meeting-history-text">{pastMeeting.agenda}</p>}
                          {(pastMeeting.discussion_questions || canInlineEditDiscussionQuestions) && (
                            <div className="meeting-history-discussion">
                              <div className="meeting-discussion-head">
                                <span><MessageSquare size={12} /> Discussion Questions</span>
                                {canInlineEditDiscussionQuestions && !isEditingDiscussionQuestions('past', pastMeeting.meeting_date) && (
                                  <button
                                    type="button"
                                    className="meeting-discussion-edit-btn"
                                    onClick={() => openDiscussionQuestionsEditor('past', pastMeeting.meeting_date, pastMeeting.discussion_questions)}
                                  >
                                    {pastMeeting.discussion_questions ? 'Edit questions' : 'Add questions'}
                                  </button>
                                )}
                              </div>
                              {isEditingDiscussionQuestions('past', pastMeeting.meeting_date) ? renderDiscussionQuestionsEditor() : (
                                pastMeeting.discussion_questions
                                  ? <p className="meeting-history-text">{pastMeeting.discussion_questions}</p>
                                  : <p className="meeting-history-text meeting-history-empty">No discussion questions yet.</p>
                              )}
                            </div>
                          )}
                          {pastMeeting.notes && <p className="meeting-history-text meeting-history-note">{pastMeeting.notes}</p>}
                          {Array.isArray(pastMeeting.links) && pastMeeting.links.length > 0 && (
                            <div className="meeting-link-list">
                              {pastMeeting.links.map((link) => (
                                <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                                  <span>{link.label || link.url}</span>
                                  <ExternalLink size={13} />
                                </a>
                              ))}
                            </div>
                          )}
                          {canEditMeeting && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => openPastMeetingEditor(pastMeeting)}
                                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => setDeletingPastMeetingId(pastMeeting.id)}
                                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="meeting-history-empty">No previous meeting details have been saved for this group yet.</p>
            )}
          </section>
        )}

        <div className="study-tabs">
          <button onClick={() => setActiveTab('readings')} className={`study-tab-btn ${activeTab === 'readings' ? 'active' : ''}`}>
            <BookOpen size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Scripture Readings
          </button>
          <button onClick={() => setActiveTab('summary')} className={`study-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}>
            <FileText size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Lesson Summary
          </button>
          <button onClick={() => setActiveTab('discussion')} className={`study-tab-btn ${activeTab === 'discussion' ? 'active' : ''}`}>
            <MessageSquare size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Discussion Guide
          </button>
          <button onClick={() => setActiveTab('resources')} className={`study-tab-btn ${activeTab === 'resources' ? 'active' : ''}`}>
            <PlayCircle size={16} style={{ display: "inline", marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            Resources
          </button>
        </div>

        <div className="tab-pane">

          {activeTab === 'resources' && (
            <div className="animate-fade-in">
              <StudyResources book={resourceBook} topic={resourceTopic} />
            </div>
          )}

          {currentPortion.isStub && activeTab !== 'resources' && (
            <div className="stub-empty-state animate-fade-in">
              <BookOpen size={32} style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }} />
              <h3>No study content yet for this group</h3>
              <p>
                <strong>{currentPortion.groupName}</strong> is currently studying{' '}
                <strong>"{currentPortion.name}"</strong> but no readings, summary, or discussion guide have been added yet.
              </p>
              <p>Add the study content from Small Groups to build out scripture readings, a lesson summary, and discussion questions for this group.</p>
            </div>
          )}

          {!currentPortion.isStub && activeTab === 'readings' && (
            <div className="animate-fade-in">
              <div className="readings-toolbar">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  Click a passage to read inline, or open in Bible Gateway.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isConfigured && (
                    <div className="bible-version-selector">
                      {BIBLE_VERSIONS.map((v) => (
                        <button key={v.id} className={`version-pill ${bibleVersion === v.id ? 'active' : ''}`} onClick={() => { setBibleVersion(v.id); setActiveReadingIdx(null); }}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className={`translation-guide-toggle ${showTranslationGuide ? 'active' : ''}`}
                    onClick={() => setShowTranslationGuide((v) => !v)}
                    title="Understanding Bible Translation Styles"
                  >
                    <Info size={15} />
                    <span>Translations</span>
                  </button>
                </div>
              </div>

              {showTranslationGuide && (
                <div className="translation-guide animate-fade-in">
                  <div className="translation-guide-header">
                    <h4>Understanding Bible Translation Styles</h4>
                    <button className="remove-item-btn" onClick={() => setShowTranslationGuide(false)}><X size={14} /></button>
                  </div>
                  <p className="translation-guide-intro">
                    No English Bible translation is perfect in every situation. Each translation makes choices about how closely to follow the original wording versus how clearly to communicate the original meaning. Comparing multiple translations can help you gain a fuller understanding of Scripture.
                  </p>
                  <div className="translation-guide-grid">
                    <div className="translation-style-card">
                      <span className="translation-style-label style-formal">Word-for-Word</span>
                      <h5>Formal Equivalence</h5>
                      <p className="translation-style-example">NASB</p>
                      <p>Prioritizes preserving the structure and wording of the original Hebrew, Aramaic, and Greek as closely as possible. Excellent for detailed study, tracing specific words, and examining the text with greater precision. Some passages may feel less natural in modern English.</p>
                    </div>
                    <div className="translation-style-card">
                      <span className="translation-style-label style-optimal">Balanced</span>
                      <h5>Optimal Equivalence</h5>
                      <p className="translation-style-example">CSB</p>
                      <p>Balances faithfulness to the original wording with clarity in contemporary English. Preserves important details from the original languages while presenting them naturally. Ideal for both study and everyday reading.</p>
                    </div>
                    <div className="translation-style-card">
                      <span className="translation-style-label style-dynamic">Thought-for-Thought</span>
                      <h5>Dynamic Equivalence</h5>
                      <p className="translation-style-example">NLT</p>
                      <p>Focuses on communicating the meaning and intent of the original text in clear, modern language. Makes difficult passages easier to understand and helps readers grasp the flow. Translators sometimes interpret phrases rather than translate them more literally.</p>
                    </div>
                  </div>
                  <div className="translation-guide-method">
                    <h5>A Helpful Study Method</h5>
                    <p>When studying a passage, consider reading it first in the <strong>CSB</strong> for balance, comparing it with the <strong>NASB</strong> to see the original wording more closely, then consulting the <strong>NLT</strong> to clarify the meaning in contemporary language. Where translations differ, take extra notice — those differences often highlight places where the original text contains important nuances worth exploring further.</p>
                  </div>
                  <blockquote className="translation-guide-verse">
                    "All Scripture is breathed out by God and profitable for teaching, for reproof, for correction, and for training in righteousness." — 2 Timothy 3:16 (ESV)
                  </blockquote>
                </div>
              )}

              {currentPortion.readings.map((reading, idx) => {
                const cacheKey = `${bibleVersion}:${reading.ref}`;
                const cached = passageCache[cacheKey];
                const isOpen = activeReadingIdx === idx;
                const isThisLoading = passageLoading && isOpen && !cached;
                const isCompleted = completedReadings.has(`${currentPortion.id}|${reading.ref}`);
                const noteKey = `${currentPortion.id}|${reading.ref}`;
                const noteText = studyNotes[noteKey] || '';
                const isNoteSaving = !!notesSaving[noteKey];

                return (
                  <div key={`${reading.ref}-${idx}`} className={`reading-row-wrapper ${isOpen ? 'open' : ''} ${isCompleted ? 'completed' : ''}`}>
                    <div className="reading-row">
                      {isConfigured && (
                        <button
                          type="button"
                          className={`reading-completion-checkbox ${isCompleted ? 'completed' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReadingCompleted(currentPortion.id, reading.ref);
                          }}
                          title={isCompleted ? "Mark as unread" : "Mark as completed"}
                        >
                          {isCompleted ? <CheckCircle2 size={18} /> : <div className="checkbox-empty" />}
                        </button>
                      )}
                      <div className="reading-label">
                        <span className={`reading-category-badge ${reading.badgeClass || 'badge-torah'}`}>
                          {reading.category}
                        </span>
                        <button className="reading-title-btn" onClick={() => handleToggleReading(idx, reading.ref)}>
                          <span className="reading-title scripture-ref-lines">
                            {splitScriptureReferenceLines(reading.ref).map((line) => (
                              <span key={line}>{line}</span>
                            ))}
                          </span>
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    <div className="reading-row-actions">
                      {noteText.trim() && (
                        <span className="reading-note-indicator" title="Has study notes">
                          <StickyNote size={14} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="bible-lookup-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: reading.ref } }));
                        }}
                        title="Open in Bible Lookup with AI commentary, word study & maps"
                      >
                        <Maximize2 size={14} />
                        <span>Bible Lookup</span>
                      </button>
                      <a
                        href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(reading.ref)}&version=ESV`}
                        target="_blank"
                        rel="noreferrer"
                        className="bible-gateway-btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>Bible Gateway</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>
                    </div>

                    {isOpen && (
                      <div className="passage-reader animate-fade-in">
                        {isThisLoading ? (
                          <div className="passage-loading">
                            <Loader2 size={16} className="spin" />
                            <span>Loading passage…</span>
                          </div>
                        ) : cached ? (
                          <div
                            className="passage-html"
                            dangerouslySetInnerHTML={{ __html: cached.content }}
                          />
                        ) : (
                          <p className="passage-unavailable">
                            {isConfigured
                              ? 'Passage not available. Set API_BIBLE_KEY in your Supabase Edge Function secrets to enable inline reading.'
                              : 'Sign in to enable inline scripture reading.'}
                          </p>
                        )}

                        {/* Personal Notes Section */}
                        {isConfigured && (
                          <div className="reading-notes-section">
                            <div className="notes-header">
                              <span className="notes-header-title">
                                <StickyNote size={14} />
                                <span>My Study Notes</span>
                              </span>
                              {isNoteSaving && (
                                <span className="notes-save-status">
                                  <Loader2 size={12} className="spin" />
                                  <span>Saving...</span>
                                </span>
                              )}
                              {!isNoteSaving && noteText && (
                                <span className="notes-save-status saved">Saved</span>
                              )}
                            </div>
                            <textarea
                              className="notes-textarea"
                              placeholder="Write down your personal study notes, observations, reflections, or prayers about this passage..."
                              value={noteText}
                              onChange={(e) => handleNoteChange(currentPortion.id, reading.ref, e.target.value)}
                              rows={3}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!currentPortion.isStub && activeTab === 'summary' && (
            <div className="summary-section animate-fade-in">
              {currentPortion.summary.map((section, idx) => {
                const { label, body } = splitSummary(section);
                return (
                  <p key={`${label}-${idx}`}>
                    {label && <strong>{label}:</strong>} {body}
                  </p>
                );
              })}
            </div>
          )}

          {!currentPortion.isStub && activeTab === 'discussion' && (
            <div className="animate-fade-in">
              {currentPortion.questions.map((question, idx) => (
                <div key={`${question}-${idx}`} className="discussion-question-box">
                  <div className="question-num">Question {idx + 1}</div>
                  <div className="question-text">{question}</div>
                </div>
              ))}
            </div>
          )}

        </div>
        </>
        )}
      </section>
      {/* Edit Past Meeting Modal */}
      {editingPastMeeting && (
        <div className="delete-confirm-overlay" role="presentation" onClick={() => !pastMeetingSaving && setEditingPastMeeting(null)}>
          <div className="delete-confirm-dialog" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--accent-gold)' }}>Edit Past Meeting</h2>
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setEditingPastMeeting(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePastMeeting} style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <span><CalendarClock size={12} /> Meeting Date</span>
                  <input
                    type="date"
                    value={pastMeetingForm.meeting_date}
                    onChange={(e) => updatePastMeetingField('meeting_date', e.target.value)}
                    required
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <span><BookOpen size={12} /> Focus Passage</span>
                  <input
                    value={pastMeetingForm.focus_passage}
                    onChange={(e) => updatePastMeetingField('focus_passage', e.target.value)}
                    placeholder="e.g. Ephesians 4:1-16"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ position: 'relative', display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <span><User size={12} /> Facilitator</span>
                  <input
                    value={pastMeetingForm.facilitator}
                    onChange={(e) => updatePastMeetingField('facilitator', e.target.value)}
                    onFocus={() => setPastFacilitatorDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setPastFacilitatorDropdownOpen(false), 150)}
                    placeholder={currentGroup?.leader || 'Who is leading?'}
                    autoComplete="off"
                  />
                  {pastFacilitatorDropdownOpen && pastFacilitatorSuggestions.length > 0 && (
                    <ul style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1050,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', margin: '2px 0 0', padding: '4px 0',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.3)', listStyle: 'none', maxHeight: '180px', overflowY: 'auto'
                    }}>
                      {pastFacilitatorSuggestions.map((m) => (
                        <li
                          key={m.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updatePastMeetingField('facilitator', m.full_name);
                            setPastFacilitatorDropdownOpen(false);
                          }}
                          style={{
                            padding: '0.45rem 0.75rem', cursor: 'pointer',
                            fontSize: '0.875rem', color: 'var(--text-primary)',
                            display: 'flex', flexDirection: 'column', gap: '1px',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-gold-light)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                          <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                          {m.email && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.email}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <span><MapPin size={12} /> Location</span>
                  <input
                    value={pastMeetingForm.location}
                    onChange={(e) => updatePastMeetingField('location', e.target.value)}
                    placeholder={currentGroup?.meeting_location || 'Where did you meet?'}
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                <span><ClipboardList size={12} /> Agenda</span>
                <textarea
                  rows={3}
                  value={pastMeetingForm.agenda}
                  onChange={(e) => updatePastMeetingField('agenda', e.target.value)}
                  placeholder="Outline what the group covered."
                  style={{ fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                <span><MessageSquare size={12} /> Discussion Questions</span>
                <textarea
                  rows={4}
                  value={pastMeetingForm.discussion_questions}
                  onChange={(e) => updatePastMeetingField('discussion_questions', e.target.value)}
                  placeholder="Questions the group used or should review from this meeting."
                  style={{ fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                <span><Info size={12} /> Notes for Members</span>
                <textarea
                  rows={2}
                  value={pastMeetingForm.notes}
                  onChange={(e) => updatePastMeetingField('notes', e.target.value)}
                  placeholder="Notes or takeaways from this meeting."
                  style={{ fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>

              <div className="next-meeting-resource-editor" style={{ display: 'grid', gap: '0.5rem' }}>
                <div className="resource-editor-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}><LinkIcon size={12} /> Resource Links</span>
                  <button type="button" className="resource-add-btn" onClick={addPastMeetingLink}>
                    <Plus size={13} /> Add Link
                  </button>
                </div>
                <div className="resource-link-editor-list" style={{ display: 'grid', gap: '0.5rem' }}>
                  {pastMeetingForm.links.map((link, idx) => (
                    <div key={idx} className="resource-link-editor-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <label style={{ flex: 1, display: 'grid', gap: '0.25rem', fontSize: '0.78rem' }}>
                        <span>Display Text</span>
                        <input
                          value={link.label}
                          onChange={(e) => updatePastMeetingLink(idx, 'label', e.target.value)}
                          placeholder="e.g. Video Summary"
                        />
                      </label>
                      <label style={{ flex: 2, display: 'grid', gap: '0.25rem', fontSize: '0.78rem' }}>
                        <span>URL</span>
                        <input
                          value={link.url}
                          onChange={(e) => updatePastMeetingLink(idx, 'url', e.target.value)}
                          placeholder="e.g. https://youtube.com/..."
                        />
                      </label>
                      {pastMeetingForm.links.length > 1 && (
                        <button
                          type="button"
                          className="resource-remove-btn"
                          onClick={() => removePastMeetingLink(idx)}
                          title="Remove link"
                          style={{ marginBottom: '4px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {pastMeetingError && <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: 0 }}>{pastMeetingError}</p>}
              
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingPastMeeting(null)} disabled={pastMeetingSaving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={pastMeetingSaving}>
                  {pastMeetingSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Past Meeting Confirmation Modal */}
      {deletingPastMeetingId && (
        <div className="delete-confirm-overlay" role="presentation" onClick={() => !pastMeetingDeleting && setDeletingPastMeetingId(null)}>
          <div className="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-past-meeting-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-past-meeting-title">Delete Meeting Record?</h2>
            <p>
              This will permanently delete this past meeting record. This action cannot be undone.
            </p>
            <div className="delete-confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeletingPastMeetingId(null)} disabled={pastMeetingDeleting}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={() => handleDeletePastMeeting(deletingPastMeetingId)} disabled={pastMeetingDeleting}>
                {pastMeetingDeleting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
