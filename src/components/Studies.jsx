import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Studies.css';
import { BookOpen, ExternalLink, MessageSquare, FileText, Plus, ChevronDown, ChevronUp, X, Loader2, Info, PlayCircle, CalendarClock, MapPin, User, ClipboardList, Pencil, Link as LinkIcon, Trash2 } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { bookNameFromRef, SCRIPTURE_CHAIN_REGEX, normalizeReference } from '../lib/scripture';
import { isLeaderRole } from '../lib/roles';
import { nextMeetingDate, toDateKey, formatMeetingDate } from '../lib/meetings';
import StudyResources from './StudyResources';

const makeBlankMeetingLink = () => ({ label: '', url: '' });
const blankMeetingForm = { facilitator: '', focus_passage: '', agenda: '', location: '', notes: '', links: [makeBlankMeetingLink()] };

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

const CATEGORY_OPTIONS = ['Old Testament', 'Gospel Reading', 'New Testament Epistle', 'Psalm', 'Prophecy'];

const splitSummary = (summaryText) => {
  const [label, ...rest] = summaryText.split(':');
  return rest.length ? { label, body: rest.join(':').trim() } : { label: '', body: summaryText };
};


const makeBlankReading = () => ({ category: 'Gospel Reading', ref: '', badgeClass: 'badge-gospel' });

export default function Studies({ session, userRole, activeOrgId }) {
  const location = useLocation();
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);
  const canEditMeeting = isLeaderRole(userRole);

  const [portions, setPortions] = useState([]);
  const [activePortionId, setActivePortionId] = useState('');
  const [activeTab, setActiveTab] = useState('readings');
  const [myGroups, setMyGroups] = useState([]);
  const [groupsById, setGroupsById] = useState({});

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

  // Create series form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTheme, setCreateTheme] = useState('');
  const [createRef, setCreateRef] = useState('');
  const [createGroupId, setCreateGroupId] = useState('');
  const [createReadings, setCreateReadings] = useState([makeBlankReading()]);
  const [createSummary, setCreateSummary] = useState(['']);
  const [createQuestions, setCreateQuestions] = useState(['', '']);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    let mounted = true;

    async function load() {
      let myGroupIds = [];
      const myGroupMap = {};

      // Load ALL groups across all orgs — no org filter here because a user can
      // be a member of groups in a different org than the currently active one.
      // RLS (using: true for authenticated) allows reading all groups.
      // We filter client-side by linkedUserId so we only stub the user's actual groups.
      const { data: groupData } = await supabase
        .from('attendance_groups')
        .select('*');

      if (groupData?.length) {
        const visibleGroups = groupData;

        myGroupIds = visibleGroups.map((g) => g.id);
        visibleGroups.forEach((g) => { myGroupMap[g.id] = g; });
        if (mounted) {
          setMyGroups(visibleGroups.map(({ id, name, topic }) => ({ id, name, topic })));
          setGroupsById(Object.fromEntries(visibleGroups.map((g) => [g.id, g])));
        }
      }

      const { data, error } = await supabase
        .from('study_series')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!mounted || error) return;

      const relevant = (data || []).filter((s) => {
        if (!s.group_id && !s.organization_id && !s.created_by) return true;
        if (!s.group_id && s.created_by === userId) return true;
        if (!s.group_id && s.organization_id && s.organization_id === activeOrgId) return true;
        if (s.group_id && myGroupIds.includes(s.group_id)) return true;
        return false;
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

  const handleSelectPortion = (id) => {
    setActivePortionId(id);
    setActiveReadingIdx(null);
    setActiveTab('readings');
    setEditingMeeting(false);
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

  const handleCreateSeries = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateSaving(true);
    setCreateError('');

    const newRow = {
      id: `series_${Date.now()}`,
      name: createName.trim(),
      translation: createTheme.trim() || null,
      ref: createRef.trim() || null,
      readings: createReadings.filter((r) => r.ref.trim()),
      summary: createSummary.filter((s) => s.trim()),
      questions: createQuestions.filter((q) => q.trim()),
      sort_order: portions.length + 1,
      group_id: createGroupId || null,
      created_by: userId || null,
      organization_id: (!createGroupId && activeOrgId) ? activeOrgId : null,
    };

    if (isConfigured) {
      const { error } = await supabase.from('study_series').insert(newRow);
      if (error) { setCreateError(error.message); setCreateSaving(false); return; }
    }

    const groupInfo = myGroups.find((g) => g.id === createGroupId);
    setPortions((prev) => [
      ...prev,
      {
        ...newRow,
        groupId: newRow.group_id,
        groupName: groupInfo?.name ?? null,
        isPersonal: !newRow.group_id,
        createdBy: userId,
      },
    ]);
    setActivePortionId(newRow.id);
    setActiveReadingIdx(null);
    setActiveTab('readings');
    setShowCreateForm(false);
    setCreateName(''); setCreateTheme(''); setCreateRef(''); setCreateGroupId('');
    setCreateReadings([makeBlankReading()]);
    setCreateSummary(['']);
    setCreateQuestions(['', '']);
    setCreateSaving(false);
  };

  const updateCreateReading = (i, field, value) =>
    setCreateReadings((prev) => prev.map((r, j) => j === i ? { ...r, [field]: value } : r));

  const currentPortion = portions.find((p) => p.id === activePortionId) || portions[0] || null;
  const currentGroupId = currentPortion?.groupId || null;
  const currentGroup = currentGroupId ? groupsById[currentGroupId] : null;

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
      facilitator: meeting?.facilitator || currentGroup?.leader || '',
      focus_passage: meeting?.focus_passage || currentPortion?.ref || '',
      agenda: meeting?.agenda || '',
      location: meeting?.location || currentGroup?.meeting_location || '',
      notes: meeting?.notes || '',
      links: meetingLinksToRows(meeting?.links),
    });
    setMeetingError('');
    setEditingMeeting(true);
  };

  const handleSaveMeeting = async (e) => {
    e.preventDefault();
    if (!currentGroupId || !meetingDate) return;
    setMeetingSaving(true);
    setMeetingError('');

    const row = {
      group_id: currentGroupId,
      meeting_date: toDateKey(meetingDate),
      facilitator: meetingForm.facilitator.trim() || null,
      focus_passage: meetingForm.focus_passage.trim() || null,
      agenda: meetingForm.agenda.trim() || null,
      location: meetingForm.location.trim() || null,
      notes: meetingForm.notes.trim() || null,
      links: normalizeMeetingLinks(meetingForm.links),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('group_meetings')
      .upsert(row, { onConflict: 'group_id,meeting_date' })
      .select()
      .maybeSingle();

    if (error) { setMeetingError(error.message); setMeetingSaving(false); return; }

    // Fire a facilitator-assignment notification when the name changes.
    const previousFacilitator = meeting?.facilitator || '';
    const newFacilitator = row.facilitator || '';
    if (newFacilitator && newFacilitator !== previousFacilitator) {
      const match = groupMembers.find(
        (m) => m.full_name?.toLowerCase() === newFacilitator.toLowerCase()
      );
      if (match?.email) {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const groupName = currentGroup?.name || 'your group';
        const dateLabel = meetingDate
          ? meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
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
<p>Please take some time to review the material and come prepared to lead the discussion.</p>
<p>— Miqra Kodesh</p>`,
            text: `Hi ${match.full_name},\n\nYou have been assigned as facilitator for ${groupName} on ${dateLabel}.${row.focus_passage ? '\n\nFocus passage: ' + row.focus_passage : ''}${row.agenda ? '\n\nAgenda:\n' + row.agenda : ''}\n\nPlease come prepared to lead the discussion.\n\n— Miqra Kodesh`,
            metadata: { organization_id: activeOrgId },
          },
        }).catch(() => {});
      }
    }

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

  // Past meeting edit/delete handlers
  const openPastMeetingEditor = (pastMeeting) => {
    setEditingPastMeeting(pastMeeting);
    setPastMeetingForm({
      facilitator: pastMeeting.facilitator || '',
      focus_passage: pastMeeting.focus_passage || '',
      agenda: pastMeeting.agenda || '',
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
      meeting_date: editingPastMeeting.meeting_date,
      facilitator: pastMeetingForm.facilitator.trim() || null,
      focus_passage: pastMeetingForm.focus_passage.trim() || null,
      agenda: pastMeetingForm.agenda.trim() || null,
      location: pastMeetingForm.location.trim() || null,
      notes: pastMeetingForm.notes.trim() || null,
      links: normalizeMeetingLinks(pastMeetingForm.links),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
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

  // BibleProject Resources matching: book from the module's reading ref or name, topic from its name.
  const resourceBook = bookNameFromRef(currentPortion?.ref) || bookNameFromRef(currentPortion?.name);
  const resourceTopic = currentPortion?.name || null;

  return (
    <div className="studies-container">

      {/* LEFT: Series list */}
      <section className="portion-selector-card card">
        <div className="studies-sidebar-header">
          <h3>Study Series</h3>
          <button
            className="btn-primary"
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <Plus size={13} />
            {showCreateForm ? 'Cancel' : 'New'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateSeries} className="create-series-form animate-fade-in">
            <div className="create-series-field">
              <label>Series Name</label>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} required placeholder="e.g. The Sermon on the Mount" />
            </div>
            <div className="create-series-field">
              <label>Theme Subtitle</label>
              <input value={createTheme} onChange={(e) => setCreateTheme(e.target.value)} placeholder="e.g. Kingdom Living" />
            </div>
            <div className="create-series-field">
              <label>Focus Reference</label>
              <input value={createRef} onChange={(e) => setCreateRef(e.target.value)} placeholder="e.g. Matthew 5-7" />
            </div>

            {myGroups.length > 0 && (
              <div className="create-series-field">
                <label>Link to Group</label>
                <select value={createGroupId} onChange={(e) => setCreateGroupId(e.target.value)}>
                  <option value="">Personal series (just me)</option>
                  {myGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}{g.topic ? ` — ${g.topic}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="create-series-field">
              <label>Readings</label>
              {createReadings.map((r, i) => (
                <div key={i} className="create-reading-row">
                  <select value={r.category} onChange={(e) => updateCreateReading(i, 'category', e.target.value)}>
                    {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input
                    value={r.ref}
                    onChange={(e) => updateCreateReading(i, 'ref', e.target.value)}
                    placeholder="e.g. John 3:16"
                  />
                  {createReadings.length > 1 && (
                    <button type="button" className="remove-item-btn" onClick={() => setCreateReadings((prev) => prev.filter((_, j) => j !== i))}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="add-item-btn" onClick={() => setCreateReadings((prev) => [...prev, makeBlankReading()])}>
                + Add Reading
              </button>
            </div>

            <div className="create-series-field">
              <label>Lesson Summary Points</label>
              {createSummary.map((s, i) => (
                <div key={i} className="create-dynamic-row">
                  <textarea value={s} onChange={(e) => setCreateSummary((prev) => prev.map((x, j) => j === i ? e.target.value : x))} rows={2} placeholder="Title: Body text…" />
                  {createSummary.length > 1 && (
                    <button type="button" className="remove-item-btn" onClick={() => setCreateSummary((prev) => prev.filter((_, j) => j !== i))}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="add-item-btn" onClick={() => setCreateSummary((prev) => [...prev, ''])}>
                + Add Point
              </button>
            </div>

            <div className="create-series-field">
              <label>Discussion Questions</label>
              {createQuestions.map((q, i) => (
                <div key={i} className="create-dynamic-row">
                  <input value={q} onChange={(e) => setCreateQuestions((prev) => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={`Question ${i + 1}`} />
                  {createQuestions.length > 1 && (
                    <button type="button" className="remove-item-btn" onClick={() => setCreateQuestions((prev) => prev.filter((_, j) => j !== i))}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="add-item-btn" onClick={() => setCreateQuestions((prev) => [...prev, ''])}>
                + Add Question
              </button>
            </div>

            {createError && <p className="create-series-error">{createError}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={() => setShowCreateForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: '0.85rem' }} disabled={createSaving}>
                {createSaving ? 'Saving…' : 'Create Series'}
              </button>
            </div>
          </form>
        )}

        <div className="portion-list">
          {portions.length === 0 && !showCreateForm && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.75rem 0.25rem' }}>
              No series yet — click <strong>New</strong> to create one.
            </p>
          )}
          {portions.map((portion) => (
            <button
              key={portion.id}
              onClick={() => handleSelectPortion(portion.id)}
              className={`portion-btn ${portion.id === activePortionId ? 'active' : ''}`}
            >
              {portion.groupName && <span className="series-scope-badge series-scope-group">{portion.groupName}</span>}
              {!portion.groupName && portion.isPersonal && <span className="series-scope-badge series-scope-personal">Personal</span>}
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
              <p style={{ fontSize: '0.9rem' }}>Create your first series using the <strong>New</strong> button.</p>
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
              <p>Use the <strong>New</strong> button in the sidebar to build out a full series for this group — add scripture readings, a lesson summary, and discussion questions.</p>
              <button
                className="btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  setCreateName(currentPortion.name);
                  setCreateGroupId(currentPortion.groupId);
                  setShowCreateForm(true);
                }}
              >
                <Plus size={15} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
                Build Series for {currentPortion.groupName}
              </button>
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

                return (
                  <div key={`${reading.ref}-${idx}`} className={`reading-row-wrapper ${isOpen ? 'open' : ''}`}>
                    <div className="reading-row">
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

                    {isOpen && (
                      <div className="passage-reader animate-fade-in">
                        {isThisLoading ? (
                          <div className="passage-loading">
                            <Loader2 size={16} className="spin" />
                            <span>Loading passage…</span>
                          </div>
                        ) : cached ? (
                          <pre className="passage-text">{cached.content}</pre>
                        ) : (
                          <p className="passage-unavailable">
                            {isConfigured
                              ? 'Passage not available. Set API_BIBLE_KEY in your Supabase Edge Function secrets to enable inline reading.'
                              : 'Sign in to enable inline scripture reading.'}
                          </p>
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
                  <span><BookOpen size={12} /> Focus Passage</span>
                  <input
                    value={pastMeetingForm.focus_passage}
                    onChange={(e) => updatePastMeetingField('focus_passage', e.target.value)}
                    placeholder="e.g. Ephesians 4:1-16"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
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
