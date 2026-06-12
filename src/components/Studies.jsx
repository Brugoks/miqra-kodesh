import { useEffect, useState } from 'react';
import './Studies.css';
import { BookOpen, ExternalLink, MessageSquare, FileText, Plus, ChevronDown, ChevronUp, X, Loader2, Info } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

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
  if (!match) return null;
  const [, rawBook, chapter, startV, endV] = match;
  const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
  if (!code) return null;
  const start = `${code}.${chapter}.${startV}`;
  return endV ? `${start}-${code}.${chapter}.${endV}` : start;
}

const CATEGORY_OPTIONS = ['Old Testament', 'Gospel Reading', 'New Testament Epistle', 'Psalm', 'Prophecy'];

const splitSummary = (summaryText) => {
  const [label, ...rest] = summaryText.split(':');
  return rest.length ? { label, body: rest.join(':').trim() } : { label: '', body: summaryText };
};

const fallbackPortions = [
  {
    id: 'study_love', name: 'The Call to Love', translation: 'Love God, Love People', ref: 'Mark 12:28-34',
    readings: [
      { category: 'Old Testament', ref: 'Deuteronomy 6:4-9', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'Mark 12:28-34', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Romans 13:8-10', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      'Loving God and Neighbor: In this study, a scribe asks Jesus which commandment is the most important of all. Jesus answers by quoting the Shema (Deut 6:4-5), calling us to love God with all our heart, soul, mind, and strength, and connects it to the second commandment: to love our neighbors as ourselves.',
      'Deuteronomy and Romans Connections: Paul in Romans 13 reinforces this lesson by stating that love is the fulfilling of the law. If we love our neighbors, we will naturally refrain from doing them harm, thereby satisfying all commandments regarding human relationships.',
    ],
    questions: [
      "What does it look like practically to love God with all of your 'mind' in today's digital, distraction-filled world?",
      'Why do you think Jesus connected loving God and loving others? Can you truly have a healthy relationship with God while neglecting your neighbor?',
      "In Romans 13:10, Paul says 'love does no wrong to a neighbor.' How does this check our speech, gossip, and social media habits?",
    ],
  },
  {
    id: 'study_unity', name: 'Walking in Unity', translation: 'One Body, One Spirit', ref: 'Ephesians 4:1-16',
    readings: [
      { category: 'Old Testament', ref: 'Psalms 133:1-3', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'John 17:20-23', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Ephesians 4:1-6', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      'Humility & Patience: Paul encourages the Ephesian church to walk in a manner worthy of their calling. He highlights humility, gentleness, patience, and bearing with one another in love as key traits. The ultimate goal is to maintain the unity of the Spirit in the bond of peace.',
      'One Body & One Faith: We are reminded that there is one body and one Spirit, one hope, one Lord, one faith, one baptism, and one God and Father of all. Christ provides various spiritual gifts to build up the body in love, helping us grow into spiritual maturity together.',
    ],
    questions: [
      'Paul lists humility, gentleness, and patience as requirements for unity. Which of these is most challenging for you in your daily relationships, and why?',
      "How does Jesus' prayer for unity in John 17:21 show the importance of how we treat each other?",
      'What are practical ways our small groups can support members who feel lonely or are going through difficult struggles?',
    ],
  },
  {
    id: 'study_faith', name: 'Stepping Out in Faith', translation: "Trusting God's Promises", ref: 'Hebrews 11',
    readings: [
      { category: 'Old Testament', ref: 'Numbers 13:25-33', badgeClass: 'badge-torah' },
      { category: 'Gospel Reading', ref: 'Matthew 14:22-33', badgeClass: 'badge-gospel' },
      { category: 'New Testament Epistle', ref: 'Hebrews 11:1-6', badgeClass: 'badge-haftarah' },
    ],
    summary: [
      "Faith Over Fear: Caleb and Joshua stood out from the other ten spies by focusing on God's promise rather than the giants in Canaan. Hebrews 11 defines faith as the assurance of things hoped for and the conviction of things not seen, pointing to ancient witnesses who walked in trust.",
      'Focusing on Jesus: Matthew 14 shows Peter stepping out of the boat to walk on water toward Jesus. He was successful as long as his eyes were on Christ, but began to sink the moment he focused on the wind and waves.',
    ],
    questions: [
      "Caleb and Joshua saw the same giants as the other ten spies but chose to trust God. What are the 'giants' in your life right now, and how can you shift your focus?",
      "Peter sank when he looked at the waves. What are typical 'waves' or distractions that cause you to lose your focus on Jesus?",
      "How does sharing our doubts and struggles in small groups help build up each other's confidence to step out in faith?",
    ],
  },
];

const makeBlankReading = () => ({ category: 'Gospel Reading', ref: '', badgeClass: 'badge-gospel' });

export default function Studies({ session, activeOrgId }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);

  const [portions, setPortions] = useState(fallbackPortions);
  const [activePortionId, setActivePortionId] = useState(fallbackPortions[0].id);
  const [activeTab, setActiveTab] = useState('readings');
  const [myGroups, setMyGroups] = useState([]);

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
        .select('id, name, topic, students');

      if (groupData?.length) {
        const myGroups = userId
          ? groupData.filter((g) =>
              (g.students || []).some((s) => s.linkedUserId === userId)
            )
          : [];

        // If the user isn't a linked student anywhere, show all groups (admin/leader view)
        const visibleGroups = myGroups.length > 0 ? myGroups : groupData;

        myGroupIds = visibleGroups.map((g) => g.id);
        visibleGroups.forEach((g) => { myGroupMap[g.id] = g; });
        if (mounted) setMyGroups(visibleGroups.map(({ id, name, topic }) => ({ id, name, topic })));
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
        if (mounted) { setPortions(fallbackPortions); setActivePortionId(fallbackPortions[0].id); setActiveReadingIdx(null); }
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
        setActivePortionId((prev) => mapped.some((p) => p.id === prev) ? prev : mapped[0].id);
        setActiveReadingIdx(null);
      }
    }

    load();
    return () => { mounted = false; };
  }, [userId, activeOrgId]);

  const handleSelectPortion = (id) => {
    setActivePortionId(id);
    setActiveReadingIdx(null);
    setActiveTab('readings');
  };

  const handleToggleReading = async (idx, ref) => {
    if (activeReadingIdx === idx) { setActiveReadingIdx(null); return; }
    setActiveReadingIdx(idx);

    if (!isConfigured) return;

    const cacheKey = `${bibleVersion}:${ref}`;
    if (passageCache[cacheKey]) return;

    const passageId = refToPassageId(ref);
    if (!passageId) return;

    setPassageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: bibleVersion, passageId },
      });
      if (!error && data?.data?.content) {
        setPassageCache((prev) => ({
          ...prev,
          [cacheKey]: { content: data.data.content, reference: data.data.reference || ref },
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

  const currentPortion = portions.find((p) => p.id === activePortionId) || portions[0];

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
              {portion.ref && <span className="portion-btn-ref">{portion.ref}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* RIGHT: Study content */}
      <section className="study-content-card card">
        <div className="portion-header-block">
          {currentPortion.groupName
            ? <span className="badge badge-gold" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>{currentPortion.groupName}</span>
            : currentPortion.isPersonal
              ? <span className="badge" style={{ marginBottom: '0.4rem', display: 'inline-block', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Personal Series</span>
              : <span className="badge badge-gold" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>Weekly Small Group Series</span>
          }
          <h1 style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>{currentPortion.name}</h1>
          <div className="portion-translation-subtitle">
            {currentPortion.translation ? `Theme: "${currentPortion.translation}" — Focus: ${currentPortion.ref}` : currentPortion.ref}
          </div>
        </div>

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
        </div>

        <div className="tab-pane">

          {currentPortion.isStub && (
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
                          <span className="reading-title">{reading.ref}</span>
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
      </section>
    </div>
  );
}
