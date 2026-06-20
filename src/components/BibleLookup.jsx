import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, X, Search, Loader2, Copy, Check, Languages, ChevronDown, ChevronUp, Sparkles, Volume2, ScrollText, ShieldCheck, MessageSquare } from 'lucide-react';
import './BibleLookup.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { refToPassageIds, getTestament } from '../lib/scripture';
import SemanticSearch from './SemanticSearch';
import ScriptureImage from './ScriptureImage';


const TRANSLATIONS = [
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB', style: 'formal',  styleLabel: 'Word-for-Word' },
  { id: 'a556c5305ee15c3f-01', label: 'CSB',  style: 'optimal', styleLabel: 'Balanced' },
  { id: 'd6e14a625393b4da-01', label: 'NLT',  style: 'dynamic', styleLabel: 'Thought-for-Thought' },
];

async function getFunctionErrorMessage(error, fallback) {
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (body?.error) {
        const retryMessage = body.retryAfterSeconds
          ? ` Try again in about ${body.retryAfterSeconds} seconds.`
          : '';
        return `${body.error}${retryMessage}`;
      }
    } catch {
      // Fall back to the Supabase client error below.
    }
  }
  return error?.message || fallback;
}

// NT Greek fallback concordance (used when live OT Strongs data not available)
const NT_STRONGS = {
  love:         [{ id:'G26',  script:'ἀγάπη',   xlit:'agápē',    def:'Unconditional, self-giving love — God\'s own love poured out, celebrated in 1 Corinthians 13.' }],
  grace:        [{ id:'G5485',script:'χάρις',   xlit:'cháris',   def:'Grace, unmerited favor — God\'s free gift and goodwill toward sinners; the foundation of salvation.' }],
  mercy:        [{ id:'G1656',script:'ἔλεος',   xlit:'éleos',    def:'Mercy, compassion — God\'s active pity shown to the undeserving.' }],
  faith:        [{ id:'G4102',script:'πίστις',  xlit:'pístis',   def:'Faith, trust — complete reliance on God and his promises; saving faith in Christ.' }],
  hope:         [{ id:'G1680',script:'ἐλπίς',   xlit:'elpís',    def:'Hope — not wishful thinking but certain assurance in what God has promised.' }],
  peace:        [{ id:'G1515',script:'εἰρήνη',  xlit:'eirḗnē',  def:'Peace — tranquility that comes from being reconciled to God (Romans 5:1).' }],
  holy:         [{ id:'G40',  script:'ἅγιος',   xlit:'hágios',   def:'Holy, set apart — belonging to God; the Spirit is the Holy Spirit (hagios pneuma).' }],
  righteousness:[{ id:'G1343',script:'δικαιοσύνη',xlit:'dikaiosýnē',def:'Righteousness — right standing before God given through faith in Christ.' }],
  glory:        [{ id:'G1391',script:'δόξα',    xlit:'dóxa',     def:'Glory — radiant divine majesty; to glorify is to display God\'s true worth.' }],
  salvation:    [{ id:'G4991',script:'σωτηρία', xlit:'sōtēría',  def:'Salvation — God rescuing humanity from sin, death, and judgment.' }],
  sin:          [{ id:'G266', script:'ἁμαρτία', xlit:'hamartía', def:'Sin — "missing the mark"; falling short of God\'s standard.' }],
  repent:       [{ id:'G3340',script:'μετανοέω',xlit:'metanoéō', def:'To repent — genuine transformation of thinking and direction; reorientation toward God.' }],
  forgiveness:  [{ id:'G859', script:'ἄφεσις',  xlit:'áphesis',  def:'Forgiveness — release from guilt and its penalty; freedom from the debt of sin.' }],
  spirit:       [{ id:'G4151',script:'πνεῦμα',  xlit:'pneûma',   def:'Spirit — the Holy Spirit (pneuma hagion); the animating principle of life.' }],
  truth:        [{ id:'G225, ',script:'ἀλήθεια',xlit:'alḗtheia', def:'Truth — what is real and genuine; "I am the way, the truth, and the life" (John 14:6).' }],
  wisdom:       [{ id:'G4678',script:'σοφία',   xlit:'sophía',   def:'Wisdom — divinely given understanding; Christ is the wisdom of God (1 Cor 1:24).' }],
  word:         [{ id:'G3056',script:'λόγος',   xlit:'lógos',    def:'Word — the eternal Logos of John 1:1; not just speech but the mind of God expressed and incarnate.' }],
  prayer:       [{ id:'G4335',script:'προσευχή',xlit:'proseuchḗ',def:'Prayer — the most common NT word; always directed to God.' }],
  heart:        [{ id:'G2588',script:'καρδία',  xlit:'kardía',   def:'Heart — the whole inner person: mind, will, emotions.' }],
  soul:         [{ id:'G5590',script:'ψυχή',    xlit:'psychḗ',   def:'Soul — the inner life of a person; Jesus gave his psyche as ransom for many.' }],
  life:         [{ id:'G2222',script:'ζωή',     xlit:'zōḗ',      def:'Life — divine, eternal life; John uses this word to describe the life Jesus gives (John 10:10).' }],
  light:        [{ id:'G5457',script:'φῶς',     xlit:'phôs',     def:'Light — Christ is the phos of the world (John 8:12).' }],
  lord:         [{ id:'G2962',script:'κύριος',  xlit:'kýrios',   def:'Lord — the Greek equivalent of YHWH; applied to Jesus as a declaration of divine lordship.' }],
  god:          [{ id:'G2316',script:'θεός',    xlit:'theós',    def:'God — the divine being; used for the Father and applied to Jesus (John 1:1, 20:28).' }],
  gospel:       [{ id:'G2098',script:'εὐαγγέλιον',xlit:'euangelíon',def:'Gospel, good news — the announcement that Christ has conquered sin and death.' }],
  church:       [{ id:'G1577',script:'ἐκκλησία',xlit:'ekklēsía', def:'Church — "the called-out ones"; community of those gathered by God.' }],
  resurrection: [{ id:'G386, ',script:'ἀνάστασις',xlit:'anástasis',def:'Resurrection — bodily rising from death; the cornerstone of Christian faith (1 Cor 15:14).' }],
  eternal:      [{ id:'G166, ',script:'αἰώνιος',xlit:'aiṓnios',  def:'Eternal — the life of the coming age; "eternal life" is the great promise of the NT.' }],
  kingdom:      [{ id:'G932, ',script:'βασιλεία',xlit:'basileía', def:'Kingdom — God\'s sovereign rule breaking into history; the central message of Jesus.' }],
  redemption:   [{ id:'G629, ',script:'ἀπολύτρωσις',xlit:'apolytrōsis',def:'Redemption — the payment that frees from bondage; Christ\'s blood as ransom.' }],
  atonement:    [{ id:'G2435',script:'ἱλαστήριον',xlit:'hilastḗrion',def:'Propitiation, mercy seat — Paul applies this word to Jesus in Romans 3:25.' }],
  covenant:     [{ id:'G1242',script:'διαθήκη', xlit:'diathḗkē', def:'Covenant — the New Covenant sealed in Christ\'s blood (Luke 22:20).' }],
  joy:          [{ id:'G5479',script:'χαρά',    xlit:'chará',    def:'Joy — deeper than circumstances; "the joy of the LORD is your strength."' }],
  power:        [{ id:'G1411',script:'δύναμις', xlit:'dýnamis',  def:'Power, miracle — supernatural ability of God; root of "dynamite"; Romans 1:16.' }],
  anointed:     [{ id:'G5547',script:'Χριστός', xlit:'Christós', def:'Christ, Anointed One — the Greek translation of Messiah.' }],
  blessed:      [{ id:'G3107',script:'μακάριος',xlit:'makários', def:'Blessed, happy — the Beatitudes word (Matthew 5); contentment of those rightly related to God.' }],
};
// Words to skip when building the live reverse map
const MAP_SKIP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','is','was','are','were',
  'be','been','being','has','have','had','do','does','did','shall','will','would','could',
  'should','may','might','not','no','by','from','with','that','this','these','those',
  'which','who','whom','whose','what','where','when','how','if','so','as','then','than',
  'yet','both','him','his','her','she','he','they','them','their','we','our','us','you',
  'your','it','its','me','my','let','say','said','come','came','made','went','got','put',
  'set','one','two','all','any','out','can','here','there','only','also','into',
]);

function buildWordMap(strongsWords) {
  const map = new Map();
  for (const entry of strongsWords) {
    const text = (entry.kjvDef || '') + ' ' + (entry.def || '');
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    for (const word of words) {
      if (MAP_SKIP.has(word)) continue;
      if (!map.has(word)) map.set(word, []);
      const list = map.get(word);
      if (!list.some((e) => e.id === entry.id)) list.push(entry);
    }
  }
  return map;
}

function tokenizePassage(text) {
  if (!text) return [];
  const re = /(\[\d+(?::\d+)?])|([\n\r]+)|([a-zA-Z][a-zA-Z'']*)|([^a-zA-Z[\]\n\r]+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) tokens.push({ type: 'verse', text: m[1] });
    else if (m[2]) tokens.push({ type: 'break' });
    else if (m[3]) tokens.push({ type: 'word', text: m[3] });
    else tokens.push({ type: 'punct', text: m[4] });
  }
  return tokens;
}

// Look up a word in the live OT word map (handles common English inflections)
function liveMapLookup(wordMap, word) {
  const lower = word.toLowerCase();
  const variants = [lower];
  if (lower.endsWith('ing')) { variants.push(lower.slice(0, -3), lower.slice(0, -3) + 'e'); }
  if (lower.endsWith('ed'))  { variants.push(lower.slice(0, -2), lower.slice(0, -1)); }
  if (lower.endsWith('es') && lower.length > 4) { variants.push(lower.slice(0, -2)); }
  if (lower.endsWith('s')  && lower.length > 4 && !lower.endsWith('ss')) { variants.push(lower.slice(0, -1)); }
  if (lower.endsWith('ness')) { variants.push(lower.slice(0, -4)); }
  if (lower.endsWith('ful'))  { variants.push(lower.slice(0, -3)); }
  if (lower.endsWith('ly'))   { variants.push(lower.slice(0, -2)); }
  for (const v of variants) {
    if (wordMap.has(v)) return wordMap.get(v);
  }
  return null;
}

// Look up a word in the NT_STRONGS concordance
function concordanceLookup(word) {
  const lower = word.toLowerCase().replace(/['']/g, "'").replace(/[^a-z']/g, '');
  const stems = [
    lower,
    lower.endsWith('s')    ? lower.slice(0, -1) : null,
    lower.endsWith('es')   ? lower.slice(0, -2) : null,
    lower.endsWith('ed')   ? lower.slice(0, -2) : null,
    lower.endsWith('ing')  ? lower.slice(0, -3) : null,
    lower.endsWith('ness') ? lower.slice(0, -4) : null,
    lower.endsWith('ful')  ? lower.slice(0, -3) : null,
    lower.endsWith('ly')   ? lower.slice(0, -2) : null,
    lower.endsWith('tion') ? lower.slice(0, -4) : null,
    lower.endsWith('ment') ? lower.slice(0, -4) : null,
  ];
  for (const stem of stems) {
    if (stem && NT_STRONGS[stem]) return NT_STRONGS[stem];
  }
  return null;
}

function getEnglishGloss(entry, contextualWord = '') {
  if (contextualWord?.trim()) return contextualWord.trim();
  const glosses = (entry?.kjvDef || entry?.kjv_def || '')
    .replace(/^:--/, '')
    .replace(/[×+]/g, '')
    .split(',')
    .map((gloss) => gloss.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
  return glosses[0] || 'English gloss';
}

function getPhoneticPronunciation(entry) {
  return (entry?.pron || entry?.xlit || '').trim();
}

function phoneticToSpeechText(phonetic) {
  return phonetic
    .replace(/([a-z])[''`](?=-|$)/gi, '$1')
    .replace(/[ʼ]/g, '')
    .replace(/[-·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]?$/, '.');
}

function getBlbLexiconUrl(strongsId) {
  const normalized = strongsId?.trim().toLowerCase();
  if (!/^[hg]\d{1,5}$/.test(normalized || '')) return '';
  const source = normalized.startsWith('h') ? 'wlc' : 'tr';
  return `https://www.blueletterbible.org/lexicon/${normalized}/kjv/${source}/`;
}

// Resolve a verse token like "[16]" or "[3:16]" to a full ref like "John 3:16"
function resolveVerseRef(baseRef, verseToken) {
  const inner = verseToken.slice(1, -1);
  if (inner.includes(':')) {
    const bookMatch = baseRef.match(/^(.+?)\s+\d/);
    const book = bookMatch ? bookMatch[1].trim() : baseRef;
    return `${book} ${inner}`;
  }
  const parts = baseRef.match(/^(.+?)\s+(\d+)/);
  if (parts) return `${parts[1]} ${parts[2]}:${inner}`;
  return `${baseRef}:${inner}`;
}

// Parse "Book chapter:verse" → { book, chapter, verse }
function parseVerseRef(ref) {
  const m = ref.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!m) return null;
  return { book: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
}

// First chapter referenced by a lookup string ("John 3:16" → 3, "Psalm 23" → 23)
function firstChapterOf(ref) {
  const m = (ref || '').match(/\s(\d{1,3}):/) || (ref || '').match(/\s(\d{1,3})\s*$/);
  return m ? Number(m[1]) : null;
}

// Pull the verses of a single chapter out of already-fetched passage content.
// Content uses inline markers like "[16]" (chapter implied by the lookup) or
// "[3:16]" (chapter explicit). Returns [{ verse, text }] for the target chapter.
function extractChapterVerses(content, lookupFirstChapter, targetChapter) {
  if (!content) return [];
  const re = /\[(\d+)(?::(\d+))?]/g;
  const markers = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    markers.push({
      end: re.lastIndex,
      index: m.index,
      chapter: m[2] ? Number(m[1]) : lookupFirstChapter,
      verse: m[2] ? Number(m[2]) : Number(m[1]),
    });
  }
  const verses = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const textEnd = i + 1 < markers.length ? markers[i + 1].index : content.length;
    if (marker.chapter !== targetChapter) continue;
    verses.push({ verse: marker.verse, text: content.slice(marker.end, textEnd).replace(/\s+/g, ' ').trim() });
  }
  return verses;
}

// Compute the live commentary view (included verses, display ref, passage text,
// available bounds) purely from the loaded chapter verses — no API call.
function computeCommentaryView(modal) {
  const parsed = parseVerseRef(modal.baseVerseRef);
  const verses = modal.chapterVerses || [];
  if (!parsed) {
    return { passageText: modal.verseText || '', displayRef: modal.baseVerseRef, focus: null, availMin: null, availMax: null };
  }
  const focus = parsed.verse;
  const start = focus - modal.versesBefore;
  const end = focus + modal.versesAfter;
  const included = verses.filter((v) => v.verse >= start && v.verse <= end);
  const passageText = included.length
    ? included.map((v) => `[${v.verse}] ${v.text}`).join(' ')
    : (modal.verseText || '');
  const minIncluded = included.length ? included[0].verse : focus;
  const maxIncluded = included.length ? included[included.length - 1].verse : focus;
  const displayRef = minIncluded === maxIncluded
    ? `${parsed.book} ${parsed.chapter}:${focus}`
    : `${parsed.book} ${parsed.chapter}:${minIncluded}-${maxIncluded}`;
  const availMin = verses.length ? Math.min(...verses.map((v) => v.verse)) : focus;
  const availMax = verses.length ? Math.max(...verses.map((v) => v.verse)) : focus;
  return { passageText, displayRef, focus, availMin, availMax };
}

function PassageText({ content, wordMap, testament, selectedWord, onWordClick, onVerseClick, baseRef }) {
  const tokens = tokenizePassage(content);
  return (
    <div className="bl-col-text">
      {tokens.map((tok, i) => {
        if (tok.type === 'verse') {
          if (onVerseClick && baseRef) {
            const handleVerseClick = () => {
              let text = '';
              for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'verse') break;
                if (tokens[j].type === 'word' || tokens[j].type === 'punct') text += tokens[j].text;
                else if (tokens[j].type === 'break') text += ' ';
              }
              onVerseClick(resolveVerseRef(baseRef, tok.text), text.trim());
            };
            return (
              <button
                key={i}
                className="bl-verse-num bl-verse-btn"
                onClick={handleVerseClick}
                title="AI commentary on this verse"
              >
                {tok.text}
              </button>
            );
          }
          return <span key={i} className="bl-verse-num">{tok.text}</span>;
        }
        if (tok.type === 'break') return <br key={i} />;
        if (tok.type === 'word') {
          const entries = wordMap
            ? liveMapLookup(wordMap, tok.text)
            : (testament === 'NT' ? concordanceLookup(tok.text) : null);
          const isActive = selectedWord?.toLowerCase() === tok.text.toLowerCase();
          if (entries?.length) {
            return (
              <button
                key={i}
                className={`bl-word-btn ${isActive ? 'active' : ''}`}
                onClick={() => onWordClick(tok.text, entries)}
              >
                {tok.text}
              </button>
            );
          }
          return <span key={i}>{tok.text}</span>;
        }
        return <span key={i}>{tok.text}</span>;
      })}
    </div>
  );
}

export default function BibleLookup({ session }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('read'); // 'read' | 'search' | 'insights'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [wordMap, setWordMap] = useState(null);

  // Word Study
  const [wordStudy, setWordStudy] = useState(null);
  const [showStrongsInput, setShowStrongsInput] = useState(false);
  const [strongsQuery, setStrongsQuery] = useState('');
  const [strongsResult, setStrongsResult] = useState(null);
  const [strongsLoading, setStrongsLoading] = useState(false);
  const [strongsError, setStrongsError] = useState('');

  // Gemini Insights
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  // Discussion Questions
  const [questions, setQuestions] = useState(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState('');

  const [speakingId, setSpeakingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  const [pronunciationError, setPronunciationError] = useState('');
  const [blbReferenceEntry, setBlbReferenceEntry] = useState(null);
  const activeAudioRef = useRef(null);
  const playbackRunRef = useRef(0);

  // Commentary modal
  const [commentaryModal, setCommentaryModal] = useState(null);
  const commentaryReqRef = useRef(0);

  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const wordStudyRef = useRef(null);

  const isConfigured = hasSupabaseConfig && Boolean(session?.user?.id);
  const testament = results ? getTestament(results.ref) : 'both';

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'read') {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (commentaryModal) setCommentaryModal(null);
      else if (blbReferenceEntry) setBlbReferenceEntry(null);
      else setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blbReferenceEntry, commentaryModal, isOpen]);

  useEffect(() => {
    const onToggle = () => setIsOpen(v => !v);
    window.addEventListener('scripture:toggle', onToggle);
    return () => window.removeEventListener('scripture:toggle', onToggle);
  }, []);

  const fetchPassageStrongs = async (passageId) => {
    if (!isConfigured) return;
    try {
      const { data } = await supabase.functions.invoke('word-strongs-proxy', { body: { passageId } });
      if (data?.words?.length) {
        setWordMap(buildWordMap(data.words));
      }
    } catch { /* silent — NT or error, concordance fallback handles it */ }
  };

  const lookupReference = async (refStr) => {
    if (!refStr.trim()) return;
    setParseError('');
    const passageIds = refToPassageIds(refStr.trim());
    if (!passageIds.length) {
      setParseError('Could not parse reference. Try "John 3:16", "Romans 8:28-30", or "Revelation 3:5;13:8".');
      return;
    }
    setLoading(true);
    setResults(null);
    setWordStudy(null);
    setWordMap(null);
    setInsights(null);
    setInsightsError('');
    setQuestions(null);
    setQuestionsError('');

    const fetched = await Promise.all(
      TRANSLATIONS.map(async (t) => {
        try {
          const passages = await Promise.all(passageIds.map(async (passageId) => {
            const { data, error } = await supabase.functions.invoke('bible-proxy', {
              body: { bibleId: t.id, passageId },
            });
            if (error || !data?.data?.content) throw new Error(error?.message || 'No content');
            return data.data.content;
          }));
          return { ...t, content: passages.join('\n\n') };
        } catch {
          return { ...t, content: null, error: true };
        }
      })
    );

    setResults({ ref: refStr.trim(), translations: fetched });
    setLoading(false);

    // Background: fetch live Hebrew Strongs for OT passages
    if (passageIds.length === 1) fetchPassageStrongs(passageIds[0]);
  };

  // Open + look up a reference when an auto-linked scripture reference is clicked anywhere.
  useEffect(() => {
    const onOpenRef = (e) => {
      const ref = e.detail?.ref;
      if (!ref) return;
      setIsOpen(true);
      setActiveTab('read');
      setQuery(ref);
      lookupReference(ref);
    };
    window.addEventListener('scripture:open', onOpenRef);
    return () => window.removeEventListener('scripture:open', onOpenRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookup = async (e) => {
    e.preventDefault();
    lookupReference(query);
  };

  const fetchInsights = async () => {
    if (!results || insightsLoading) return;
    setInsightsLoading(true);
    setInsightsError('');
    setInsights(null);
    const nasb = results.translations.find((t) => t.label === 'NASB');
    const passageText = nasb?.content || results.translations.find((t) => t.content)?.content || '';
    try {
      const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: {
          reference: results.ref,
          passageText,
          userId: session?.user?.id ?? null,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to load insights.'));
      if (!data?.insights) throw new Error('No insights returned');
      setInsights(data.insights);
    } catch (err) {
      setInsightsError(err.message || 'Failed to load insights.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const openInsights = () => {
    setActiveTab('insights');
    if (results && !insights && !insightsLoading && !insightsError) {
      fetchInsights();
    }
  };

  const fetchQuestions = async () => {
    if (!results || questionsLoading) return;
    setQuestionsLoading(true);
    setQuestionsError('');
    setQuestions(null);
    const nasb = results.translations.find((t) => t.label === 'NASB');
    const passageText = nasb?.content || results.translations.find((t) => t.content)?.content || '';
    try {
      const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: {
          reference: results.ref,
          passageText,
          userId: session?.user?.id ?? null,
          task: 'questions',
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to load discussion questions.'));
      if (!data?.questions) throw new Error('No questions returned');
      setQuestions(data.questions);
    } catch (err) {
      setQuestionsError(err.message || 'Failed to load discussion questions.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleCopy = (t) => {
    const text = `${results.ref} (${t.label})\n\n${t.content}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const stopSpeaking = () => {
    playbackRunRef.current += 1;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    setTtsLoadingId(null);
  };

  const playClientSpeech = (text, speechId, language = 'en-US') => {
    if (!('speechSynthesis' in window)) {
      setTtsLoadingId(null);
      return;
    }
    setTtsLoadingId(null);
    setSpeakingId(speechId);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;

    utterance.onend = () => {
      setSpeakingId(null);
    };
    utterance.onerror = () => {
      setSpeakingId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const playAudioClips = async (clips, speechId) => {
    const playableClips = clips.filter((clip) => clip?.audio);
    if (!playableClips.length) throw new Error('No playable audio clips');

    const runId = playbackRunRef.current;

    for (let index = 0; index < playableClips.length; index += 1) {
      if (playbackRunRef.current !== runId) return;
      const clip = playableClips[index];
      const audio = new Audio(`data:${clip.audioFormat || 'audio/mpeg'};base64,${clip.audio}`);
      activeAudioRef.current = audio;

      await new Promise((resolve, reject) => {
        audio.onplay = () => {
          if (index === 0) {
            setTtsLoadingId(null);
            setSpeakingId(speechId);
          }
        };
        audio.onended = resolve;
        audio.onpause = resolve;
        audio.onerror = () => reject(new Error('The generated audio format could not be played'));
        audio.play().catch(reject);
      });
    }

    if (playbackRunRef.current === runId) {
      activeAudioRef.current = null;
      setSpeakingId(null);
    }
  };

  const openStrongsReference = (entry, englishWord = '') => {
    if (!entry?.id || !getBlbLexiconUrl(entry.id)) return;
    stopSpeaking();
    setPronunciationError('');
    setBlbReferenceEntry({
      ...entry,
      englishWord: getEnglishGloss(entry, englishWord),
      blbUrl: getBlbLexiconUrl(entry.id),
    });
  };

  const playHfPhoneticAudio = async (entry) => {
    if (!entry?.id) return;
    const cleanId = entry.id.trim().toUpperCase();
    const speechId = `strongs-hf-${cleanId}`;

    if (speakingId === speechId || ttsLoadingId === speechId) {
      stopSpeaking();
      return;
    }

    const phonetic = phoneticToSpeechText(getPhoneticPronunciation(entry));
    if (!phonetic) {
      setPronunciationError(`No phonetic pronunciation is available for ${cleanId}.`);
      return;
    }

    stopSpeaking();
    const requestRunId = playbackRunRef.current;
    setTtsLoadingId(speechId);
    setPronunciationError('');

    try {
      const { data, error } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: phonetic,
          task: 'tts',
          provider: 'huggingface',
          model: 'hexgrad/Kokoro-82M',
          language: 'en',
          allow_fallback: false,
        },
      });
      if (playbackRunRef.current !== requestRunId) return;
      if (error || data?.error || !data?.audio) {
        throw new Error(data?.error || error?.message || 'No Hugging Face audio returned');
      }

      await playAudioClips(data.clips || [{
        audio: data.audio,
        audioFormat: data.audioFormat,
      }], speechId);
    } catch (error) {
      if (playbackRunRef.current !== requestRunId) return;
      setTtsLoadingId(null);
      const creditIssue = /credits?/i.test(error?.message || '');
      setPronunciationError(creditIssue
        ? 'Hugging Face pronunciation credits are currently exhausted.'
        : 'Hugging Face pronunciation is currently unavailable.');
    }
  };

  const handleSpeakTranslation = async (t) => {
    if (speakingId === t.id || ttsLoadingId === t.id) {
      stopSpeaking();
      return;
    }

    stopSpeaking();
    const requestRunId = playbackRunRef.current;
    setTtsLoadingId(t.id);

    // Clean text: strip out verse numbers like [1] or [3:16]
    const cleanText = (t.content || '')
      .replace(/\[\d+(?::\d+)?]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      setTtsLoadingId(null);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: cleanText,
          task: 'tts',
          provider: 'huggingface',
          model: 'hexgrad/Kokoro-82M',
        },
      });

      if (playbackRunRef.current !== requestRunId) return;
      if (error || !data?.audio) {
        throw new Error(error?.message || 'No audio data');
      }

      await playAudioClips(data.clips || [{
        audio: data.audio,
        audioFormat: data.audioFormat,
      }], t.id);
    } catch (err) {
      if (playbackRunRef.current !== requestRunId) return;
      console.warn("TTS failed, falling back to browser SpeechSynthesis:", err);
      playClientSpeech(cleanText, t.id);
    }
  };

  // Stop speaking when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopSpeaking();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleWordClick = (word, entries) => {
    setPronunciationError('');
    setWordStudy({ word, entries });
    setStrongsResult(null);
    setTimeout(() => wordStudyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const handleStrongsLookup = async (e) => {
    e.preventDefault();
    const id = strongsQuery.trim().toUpperCase();
    if (!id) return;
    if (!/^[HG]\d{1,5}$/.test(id)) {
      setStrongsError('Use format H1234 (Hebrew) or G1234 (Greek).');
      return;
    }
    setStrongsError('');
    setPronunciationError('');
    setStrongsResult(null);
    setWordStudy(null);
    setStrongsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('strongs-proxy', {
        body: { strongsId: id },
      });
      if (error || !data?.data) throw new Error(error?.message || 'No result');
      setStrongsResult({ id, ...data.data });
    } catch {
      setStrongsError('Could not find that Strongs number. Check the format and try again.');
    } finally {
      setStrongsLoading(false);
    }
  };

  // ── Commentary ────────────────────────────────────────────────

  const runCommentary = async (ctx) => {
    const reqId = ++commentaryReqRef.current;

    // Passage text comes from the verses already loaded by the original lookup —
    // no extra scripture fetch. The only request is the Gemini commentary call.
    const view = computeCommentaryView(ctx);

    try {
      const { data, error } = await supabase.functions.invoke('commentary-proxy', {
        body: {
          verseRef: view.displayRef,
          passageText: view.passageText,
          focusVerse: ctx.baseVerseRef,
          translation: ctx.translationLabel,
          userId: session?.user?.id ?? null,
        },
      });
      if (commentaryReqRef.current !== reqId) return;
      if (error) {
        throw new Error(await getFunctionErrorMessage(error, 'Failed to generate commentary. Please try again.'));
      }
      if (!data?.commentary) throw new Error('No commentary was returned. Please try again.');
      setCommentaryModal(prev => prev ? { ...prev, commentary: data.commentary, loading: false } : null);
    } catch (err) {
      if (commentaryReqRef.current !== reqId) return;
      setCommentaryModal(prev => prev ? { ...prev, loading: false, error: err?.message || 'Failed to generate commentary. Please try again.' } : null);
    }
  };

  const openCommentary = (verseRef, verseText, translationId, translationLabel) => {
    // Open the modal but wait for the user to confirm the range and press
    // "Generate" — avoids firing an API call on open and on every +/- click.
    // Pre-slice the clicked translation's already-loaded text into chapter
    // verses so before/after preview is instant and needs no extra fetch.
    const parsed = parseVerseRef(verseRef);
    const translation = results?.translations.find((t) => t.id === translationId);
    const lookupFirstChapter = results ? firstChapterOf(results.ref) : null;
    const chapterVerses = (translation?.content && parsed)
      ? extractChapterVerses(translation.content, lookupFirstChapter ?? parsed.chapter, parsed.chapter)
      : [];
    setCommentaryModal({
      baseVerseRef: verseRef,
      verseText,
      translationId,
      translationLabel,
      chapterVerses,
      versesBefore: 0,
      versesAfter: 0,
      commentary: null,
      loading: false,
      error: null,
    });
  };

  const handleCommentaryContext = (deltaB, deltaA) => {
    // Only adjust the range, clamped to verses already loaded from the lookup.
    // Changing it invalidates any prior commentary, so clear it.
    setCommentaryModal((prev) => {
      if (!prev || prev.loading) return prev;
      const view = computeCommentaryView(prev);
      const maxBefore = view.focus != null ? Math.min(5, Math.max(0, view.focus - view.availMin)) : 0;
      const maxAfter = view.focus != null ? Math.min(5, Math.max(0, view.availMax - view.focus)) : 0;
      return {
        ...prev,
        versesBefore: Math.max(0, Math.min(maxBefore, prev.versesBefore + deltaB)),
        versesAfter: Math.max(0, Math.min(maxAfter, prev.versesAfter + deltaA)),
        commentary: null,
        error: null,
      };
    });
  };

  const generateCommentary = () => {
    if (!commentaryModal || commentaryModal.loading) return;
    const ctx = { ...commentaryModal, loading: true, error: null, commentary: null };
    setCommentaryModal(ctx);
    runCommentary(ctx);
  };

  const commentaryView = commentaryModal ? computeCommentaryView(commentaryModal) : null;
  const commentaryDisplayRef = commentaryView?.displayRef ?? null;
  const commentaryPassageText = commentaryView
    ? commentaryView.passageText.replace(/\[[\d:]+\]/g, '').replace(/\s+/g, ' ').trim()
    : '';
  const commentaryMaxBefore = commentaryView?.focus != null
    ? Math.min(5, Math.max(0, commentaryView.focus - commentaryView.availMin)) : 0;
  const commentaryMaxAfter = commentaryView?.focus != null
    ? Math.min(5, Math.max(0, commentaryView.availMax - commentaryView.focus)) : 0;
  const commentaryCanExpand = commentaryMaxBefore > 0 || commentaryMaxAfter > 0;

  return (
    <>
      <button
        className={`bible-lookup-fab ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Bible Lookup"
        title="Open Scripture Lookup"
      >
        <BookOpen size={22} />
      </button>

      {isOpen && <div className="bible-lookup-backdrop" onClick={() => setIsOpen(false)} />}

      <div className={`bible-lookup-panel ${isOpen ? 'open' : ''}`} ref={panelRef}>
        <div className="bible-lookup-header">
          <div className="bible-lookup-title">
            <BookOpen size={18} />
            <span>Scripture Lookup</span>
          </div>
          <button className="bible-lookup-close" onClick={() => setIsOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="bible-lookup-tabs">
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'read' ? 'active' : ''}`}
            onClick={() => setActiveTab('read')}
          >
            Read
          </button>
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
        </div>

        <div
          className="bible-lookup-tab-content"
          style={{ display: activeTab === 'search' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <SemanticSearch
            onNavigateToVerse={(ref) => {
              setActiveTab('read');
              setQuery(ref);
              lookupReference(ref);
            }}
          />
        </div>

        {/* ── Insights Tab ── */}
        <div
          className="bible-lookup-tab-content bl-insights-panel"
          style={{ display: activeTab === 'insights' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div className="bl-insights-body">
            {!results && (
              <p className="bible-lookup-hint">
                Look up a passage in the Read tab, then generate grounded historical context, literary context, interpretation, and cross-references.
              </p>
            )}
            {results && !insights && !insightsLoading && !insightsError && (
              <div className="bl-insights-prompt">
                <ScrollText size={28} className="bl-insights-icon" />
                <p className="bl-insights-prompt-ref">{results.ref}</p>
                <p className="bl-insights-prompt-desc">Generate source-labeled study context with confidence levels and local validation.</p>
                <button
                  type="button"
                  className="bl-insights-fetch-btn"
                  onClick={fetchInsights}
                  disabled={!isConfigured}
                >
                  <Sparkles size={15} />
                  Generate Insights
                </button>
                <Link
                  to="/insights-guide"
                  className="bl-insights-doc-link"
                  onClick={() => setIsOpen(false)}
                >
                  <ShieldCheck size={13} />
                  How this is produced
                </Link>
                {!isConfigured && (
                  <p className="bible-lookup-notice" style={{ marginTop: '0.5rem' }}>Sign in to enable AI insights.</p>
                )}
              </div>
            )}
            {insightsLoading && (
              <div className="bible-lookup-loading">
                <Loader2 size={20} className="bl-spin" />
                <span>Generating insights with Gemini…</span>
              </div>
            )}
            {insightsError && (
              <div className="bl-insights-error">
                <p className="bible-lookup-parse-error">{insightsError}</p>
                <button type="button" className="bl-insights-fetch-btn" onClick={fetchInsights}>
                  Try Again
                </button>
              </div>
            )}
            {insights && (
              <div className="bl-insights-result animate-fade-in">
                <div className="bl-insights-ref-bar">
                  <ShieldCheck size={14} />
                  <span>{results.ref} · grounded and validated</span>
                  <button
                    type="button"
                    className="bl-insights-refresh"
                    onClick={fetchInsights}
                    disabled={insightsLoading}
                    title="Regenerate insights"
                  >
                    <Sparkles size={13} />
                  </button>
                </div>

                <section className="bl-insights-section">
                  <h4 className="bl-insights-heading">Historical Context</h4>
                  <p className="bl-insights-text">{insights.historicalContext?.text || insights.historicalContext}</p>
                  {insights.historicalContext?.confidence && (
                    <p className="bl-insights-support">
                      {insights.historicalContext.confidence} confidence · {insights.historicalContext.sourceIds?.join(', ')}
                    </p>
                  )}
                </section>

                {insights.literaryContext && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Literary Context</h4>
                    <p className="bl-insights-text">{insights.literaryContext.text}</p>
                    <p className="bl-insights-support">
                      {insights.literaryContext.confidence} confidence · {insights.literaryContext.sourceIds?.join(', ')}
                    </p>
                  </section>
                )}

                {insights.warnings?.length > 0 && (
                  <div className="bl-insights-warnings">
                    {insights.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
                  </div>
                )}

                {insights.keyThemes?.length > 0 && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Key Themes</h4>
                    <ul className="bl-insights-themes">
                      {insights.keyThemes.map((theme, i) => (
                        <li key={i} className="bl-insights-theme-item">
                          {typeof theme === 'string' ? theme : theme.theme}
                          {theme?.confidence && <span className="bl-insights-confidence">{theme.confidence}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="bl-insights-section">
                  <h4 className="bl-insights-heading">Interpretation</h4>
                  <p className="bl-insights-text">{insights.interpretation?.text || insights.commentary}</p>
                  {insights.interpretation?.confidence && (
                    <p className="bl-insights-support">
                      {insights.interpretation.confidence} confidence
                      {insights.interpretation.disputed ? ' · interpretive views may differ' : ''}
                    </p>
                  )}
                </section>

                {insights.application && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Reflection</h4>
                    <p className="bl-insights-text">{insights.application}</p>
                  </section>
                )}

                {insights.crossReferences?.length > 0 && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Cross-References</h4>
                    <ul className="bl-insights-xrefs">
                      {insights.crossReferences.map((xref, i) => (
                        <li key={i} className="bl-insights-xref-item">
                          <button
                            type="button"
                            className="bl-insights-xref-ref"
                            onClick={() => {
                              setActiveTab('read');
                              setQuery(xref.reference);
                              lookupReference(xref.reference);
                            }}
                          >
                            {xref.reference}
                          </button>
                          <span className="bl-insights-xref-desc">{xref.connection}</span>
                          {xref.confidence && (
                            <span className="bl-insights-support">{xref.confidence} confidence</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="bl-insights-section bl-insights-questions-section">
                  <h4 className="bl-insights-heading">Discussion Questions</h4>

                  {!questions && !questionsLoading && !questionsError && (
                    <div className="bl-insights-questions-prompt">
                      <p className="bl-insights-prompt-desc" style={{ maxWidth: 'none', margin: '0 0 0.5rem' }}>
                        Generate study and reflection questions for this passage.
                      </p>
                      <button
                        type="button"
                        className="bl-insights-fetch-btn"
                        onClick={fetchQuestions}
                        disabled={!isConfigured}
                      >
                        <Sparkles size={15} />
                        Generate Questions
                      </button>
                    </div>
                  )}

                  {questionsLoading && (
                    <div className="bible-lookup-loading" style={{ padding: '1rem 0' }}>
                      <Loader2 size={20} className="bl-spin" />
                      <span>Generating questions with Gemini…</span>
                    </div>
                  )}

                  {questionsError && (
                    <p className="bible-lookup-parse-error" style={{ margin: '0.5rem 0' }}>{questionsError}</p>
                  )}

                  {questions && (
                    <div className="bl-insights-questions-list-wrapper animate-fade-in">
                      <ul className="bl-insights-questions-list">
                        {questions.map((q, i) => (
                          <li key={i} className="bl-insights-question-item">
                            <span className={`bl-insights-question-badge bl-insights-question-badge-${q.type}`}>
                              {q.type}
                            </span>
                            <span className="bl-insights-question-text">{q.question}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="bl-insights-questions-actions">
                        <button
                          type="button"
                          className="bl-insights-questions-refresh"
                          onClick={fetchQuestions}
                          disabled={questionsLoading}
                          title="Regenerate discussion questions"
                        >
                          <Sparkles size={13} />
                          <span>Regenerate Questions</span>
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {insights.sources?.length > 0 && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Sources and provenance</h4>
                    <ul className="bl-insights-sources">
                      {insights.sources.map((source) => (
                        <li key={source.id}>
                          <code>{source.id}</code>
                          <span>{source.label}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <Link
                  to="/insights-guide"
                  className="bl-insights-doc-link"
                  onClick={() => setIsOpen(false)}
                >
                  <ShieldCheck size={13} />
                  How Scripture Insights are produced
                </Link>
              </div>
            )}
          </div>
        </div>

        <div
          className="bible-lookup-tab-content"
          style={{ display: activeTab === 'read' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <form className="bible-lookup-search" onSubmit={handleLookup}>
            <input
              ref={inputRef}
              className="bible-lookup-input"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setParseError(''); }}
              placeholder="e.g. John 3:16  ·  Romans 8:28-30  ·  Psalm 23:1-6"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="bible-lookup-search-btn" disabled={loading || !query.trim()}>
              {loading ? <Loader2 size={16} className="bl-spin" /> : <Search size={16} />}
            </button>
          </form>

          {parseError && <p className="bible-lookup-parse-error">{parseError}</p>}
          {!isConfigured && <p className="bible-lookup-notice">Sign in to enable inline scripture reading.</p>}
          {loading && (
            <div className="bible-lookup-loading">
              <Loader2 size={20} className="bl-spin" />
              <span>Fetching passage in 3 translations…</span>
            </div>
          )}

          {results && !loading && (
            <div className="bible-lookup-results animate-fade-in">
              <div className="bl-results-meta">
                <p className="bible-lookup-ref-label">{results.ref}</p>
                <p className="bl-word-hint">
                  Tap a verse number for AI commentary · tap an underlined word for Hebrew/Greek meaning.
                </p>
              </div>
              <div className="bible-lookup-columns">
                {results.translations.map((t) => (
                  <div key={t.id} className={`bible-lookup-col bl-style-${t.style}`}>
                    <div className="bl-col-header">
                      <span className="bl-col-label">{t.label}</span>
                      <span className="bl-col-style">{t.styleLabel}</span>
                      {!t.error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            type="button"
                            className={`bl-speak-btn ${speakingId === t.id ? 'speaking' : ''}`}
                            onClick={() => handleSpeakTranslation(t)}
                            title={speakingId === t.id ? (ttsLoadingId === t.id ? 'Loading AI voice...' : 'Stop playing') : `Read aloud (${t.label})`}
                            disabled={ttsLoadingId === t.id && ttsLoadingId !== t.id}
                          >
                            {ttsLoadingId === t.id ? (
                              <Loader2 size={13} className="bl-spin" />
                            ) : (
                              <Volume2 size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            className={`bl-copy-btn ${copiedId === t.id ? 'copied' : ''}`}
                            onClick={() => handleCopy(t)}
                            title={copiedId === t.id ? 'Copied!' : `Copy ${t.label}`}
                          >
                            {copiedId === t.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      )}
                    </div>
                    {t.error ? (
                      <p className="bl-col-unavailable">Passage unavailable in this translation.</p>
                    ) : (
                      <PassageText
                        content={t.content}
                        wordMap={wordMap}
                        testament={testament}
                        selectedWord={wordStudy?.word}
                        onWordClick={handleWordClick}
                        onVerseClick={isConfigured ? (verseRef, verseText) => openCommentary(verseRef, verseText, t.id, t.label) : null}
                        baseRef={results.ref}
                      />
                    )}
                  </div>
                ))}
              </div>

              {(() => {
                const usable = results.translations.find((t) => !t.error && t.content);
                return usable ? (
                  <div className="bl-passage-actions">
                    <button
                      type="button"
                      className="bl-inline-insights-btn"
                      onClick={openInsights}
                      disabled={!isConfigured || insightsLoading}
                    >
                      {insightsLoading ? <Loader2 size={14} className="bl-spin" /> : <Sparkles size={14} />}
                      {insights ? 'View Insights' : 'Gain Insights'}
                    </button>
                    <ScriptureImage
                      key={results.ref}
                      reference={results.ref}
                      content={usable.content}
                      translation={usable.label}
                      insights={insights}
                    />
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {!results && !loading && !parseError && (
            <div className="bible-lookup-hint-block">
              <p className="bible-lookup-hint">
                Compare any passage across three translation styles — formal (NASB), balanced (CSB), and thought-for-thought (NLT). Tap any underlined word to see its Hebrew or Greek meaning.
              </p>
              <Link to="/translation-guide" className="bible-lookup-guide-btn" onClick={() => setIsOpen(false)}>
                <BookOpen size={13} />
                Why does translation style matter?
              </Link>
            </div>
          )}

          {results && !loading && (
            <p className="bible-lookup-guide-footer">
              <Link to="/translation-guide" className="bible-lookup-guide-link" onClick={() => setIsOpen(false)}>
                About these translation styles →
              </Link>
            </p>
          )}

          {/* ── Word Study ── */}
          <div className="bl-word-study" ref={wordStudyRef}>
            <div className="bl-word-study-header">
              <Languages size={14} />
              <span>Hebrew &amp; Greek Word Study</span>
              {(wordStudy || strongsResult) && (
                <button
                  type="button"
                  className="bl-word-study-close"
                  onClick={() => { setWordStudy(null); setStrongsResult(null); }}
                  aria-label="Close word study"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {wordStudy && (
              <div className="bl-word-click-result animate-fade-in">
                <p className="bl-clicked-word">"{wordStudy.word}"</p>
                {wordStudy.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`bl-strongs-result ${entry.id.startsWith('H') ? 'bl-result-hebrew' : 'bl-result-greek'}`}
                  >
                    <div className="bl-strongs-top">
                      <div className="bl-strongs-meta">
                        <div className="bl-strongs-heading">
                          <span className="bl-strongs-id">{entry.id}</span>
                          <span className="bl-strongs-english">{getEnglishGloss(entry, wordStudy.word)}</span>
                        </div>
                        <span className="bl-strongs-phonetic">{getPhoneticPronunciation(entry) || entry.xlit}</span>
                        <div className="bl-pronunciation-actions">
                          <button
                            type="button"
                            className="bl-pronounce-btn"
                            onClick={() => openStrongsReference(entry, wordStudy.word)}
                            title={`Open ${entry.id} reference from Blue Letter Bible`}
                          >
                            <BookOpen size={14} />
                            <span>Strong's Reference</span>
                          </button>
                          <button
                            type="button"
                            className={`bl-pronounce-btn hf ${speakingId === `strongs-hf-${entry.id}` ? 'speaking' : ''}`}
                            onClick={() => playHfPhoneticAudio(entry)}
                            title="Generate the displayed phonetic pronunciation with Hugging Face"
                          >
                            {ttsLoadingId === `strongs-hf-${entry.id}`
                              ? <Loader2 size={14} className="bl-spin" />
                              : <Sparkles size={14} />}
                            <span>HF Phonetic</span>
                          </button>
                        </div>
                        <span className="bl-strongs-lang">
                          {entry.id.startsWith('H') ? 'Hebrew' : 'Greek'}
                        </span>
                      </div>
                      <span className={entry.id.startsWith('H') ? 'bl-strongs-script bl-hebrew' : 'bl-strongs-script bl-greek'}>
                        {entry.script}
                      </span>
                    </div>
                    {entry.xlit && <p className="bl-strongs-translit">Transliteration: {entry.xlit}</p>}
                    {entry.def && <p className="bl-strongs-def">{entry.def}</p>}
                    {entry.kjvDef && (
                      <p className="bl-strongs-kjv">
                        <span className="bl-strongs-kjv-label">KJV renders as: </span>
                        {entry.kjvDef}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!wordStudy && !strongsResult && (
              <p className="bible-lookup-hint bl-strongs-hint">
                {results
                  ? 'Tap any underlined word in the passage above to explore its original Hebrew or Greek meaning.'
                  : 'Look up a passage above, then tap any underlined word to see its original language meaning.'}
              </p>
            )}

            {/* Strongs direct lookup (advanced / collapsible) */}
            {isConfigured && (
              <div className="bl-strongs-advanced">
                <button
                  type="button"
                  className="bl-strongs-advanced-toggle"
                  onClick={() => setShowStrongsInput((v) => !v)}
                >
                  <span>Enter Strongs number directly</span>
                  {showStrongsInput ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showStrongsInput && (
                  <div className="bl-strongs-advanced-body animate-fade-in">
                    <form className="bl-strongs-form" onSubmit={handleStrongsLookup}>
                      <input
                        className="bible-lookup-input bl-strongs-input"
                        value={strongsQuery}
                        onChange={(e) => { setStrongsQuery(e.target.value); setStrongsError(''); }}
                        placeholder="H1697  or  G3056"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="submit" className="bible-lookup-search-btn" disabled={strongsLoading || !strongsQuery.trim()}>
                        {strongsLoading ? <Loader2 size={16} className="bl-spin" /> : <Search size={16} />}
                      </button>
                    </form>
                    {strongsError && <p className="bible-lookup-parse-error">{strongsError}</p>}
                    {strongsResult && !strongsLoading && (
                      <div className={`bl-strongs-result animate-fade-in ${strongsResult.id?.startsWith('H') ? 'bl-result-hebrew' : 'bl-result-greek'}`}>
                        <div className="bl-strongs-top">
                          <div className="bl-strongs-meta">
                            <div className="bl-strongs-heading">
                              <span className="bl-strongs-id">{strongsResult.id}</span>
                              <span className="bl-strongs-english">{getEnglishGloss(strongsResult)}</span>
                            </div>
                            <span className="bl-strongs-phonetic">
                              {getPhoneticPronunciation(strongsResult) || strongsResult.xlit}
                            </span>
                            <div className="bl-pronunciation-actions">
                              <button
                                type="button"
                                className="bl-pronounce-btn"
                                onClick={() => openStrongsReference(strongsResult)}
                                title={`Open ${strongsResult.id} reference from Blue Letter Bible`}
                              >
                                <BookOpen size={14} />
                                <span>Strong's Reference</span>
                              </button>
                              <button
                                type="button"
                                className={`bl-pronounce-btn hf ${speakingId === `strongs-hf-${strongsResult.id}` ? 'speaking' : ''}`}
                                onClick={() => playHfPhoneticAudio(strongsResult)}
                                title="Generate the displayed phonetic pronunciation with Hugging Face"
                              >
                                {ttsLoadingId === `strongs-hf-${strongsResult.id}`
                                  ? <Loader2 size={14} className="bl-spin" />
                                  : <Sparkles size={14} />}
                                <span>HF Phonetic</span>
                              </button>
                            </div>
                            <span className="bl-strongs-lang">
                              {strongsResult.id?.startsWith('H') ? 'Hebrew' : 'Greek'}
                              {strongsResult.pos ? ` · ${strongsResult.pos}` : ''}
                            </span>
                          </div>
                          <span className={`bl-strongs-script ${strongsResult.id?.startsWith('H') ? 'bl-hebrew' : 'bl-greek'}`}>
                            {strongsResult.script || '—'}
                          </span>
                        </div>
                        {strongsResult.xlit && (
                          <p className="bl-strongs-translit">
                            Transliteration: {strongsResult.xlit}
                          </p>
                        )}
                        {strongsResult.def && <p className="bl-strongs-def">{strongsResult.def}</p>}
                        {strongsResult.kjv_def && (
                          <p className="bl-strongs-kjv">
                            <span className="bl-strongs-kjv-label">KJV renders as: </span>
                            {strongsResult.kjv_def}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {pronunciationError && (
              <p className="bl-pronunciation-error" role="status">{pronunciationError}</p>
            )}
          </div>
        </div>
      </div>

      {blbReferenceEntry && (
        <div
          className="bl-pronunciation-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBlbReferenceEntry(null);
          }}
        >
          <section
            className="bl-pronunciation-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Strong's reference for ${blbReferenceEntry.id}`}
          >
            <header className="bl-pronunciation-modal-header">
              <div>
                <span className="bl-pronunciation-modal-eyebrow">Strong's reference · Blue Letter Bible</span>
                <h2>{blbReferenceEntry.id} · {blbReferenceEntry.englishWord}</h2>
                <p>{getPhoneticPronunciation(blbReferenceEntry)}</p>
              </div>
              <button
                type="button"
                className="bl-pronunciation-modal-close"
                onClick={() => setBlbReferenceEntry(null)}
                aria-label="Close Strong's reference"
              >
                <X size={20} />
              </button>
            </header>
            <iframe
              className="bl-pronunciation-frame"
              src={blbReferenceEntry.blbUrl}
              title={`Blue Letter Bible ${blbReferenceEntry.id} Strong's reference`}
              allow="autoplay"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </section>
        </div>
      )}

      {/* ── Commentary Modal ──────────────────────────────────── */}
      {commentaryModal && (
        <>
          <div className="bl-commentary-overlay" onClick={() => setCommentaryModal(null)} />
          <div className="bl-commentary-modal" role="dialog" aria-modal="true" aria-label="AI Commentary">
            <div className="bl-commentary-modal-header">
              <div className="bl-commentary-modal-title">
                <MessageSquare size={15} />
                <span>{commentaryDisplayRef}</span>
                {commentaryDisplayRef !== commentaryModal.baseVerseRef && (
                  <span className="bl-commentary-focus-note">focus: {commentaryModal.baseVerseRef}</span>
                )}
                <span className="bl-commentary-translation">· {commentaryModal.translationLabel}</span>
              </div>
              <button
                className="bible-lookup-close"
                onClick={() => setCommentaryModal(null)}
                aria-label="Close commentary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bl-commentary-verse-text">
              "{commentaryPassageText}"
            </div>

            <div className="bl-commentary-context-row">
              <span className="bl-commentary-context-label">Add context:</span>
              <div className="bl-commentary-context-group">
                <span className="bl-commentary-context-desc">Verses before</span>
                <button
                  className="bl-ctx-btn"
                  onClick={() => handleCommentaryContext(-1, 0)}
                  disabled={commentaryModal.loading || commentaryModal.versesBefore <= 0}
                  aria-label="Remove verse before"
                >−</button>
                <span className="bl-ctx-count">{commentaryModal.versesBefore}</span>
                <button
                  className="bl-ctx-btn"
                  onClick={() => handleCommentaryContext(1, 0)}
                  disabled={commentaryModal.loading || commentaryModal.versesBefore >= commentaryMaxBefore}
                  aria-label="Add verse before"
                >+</button>
              </div>
              <div className="bl-commentary-context-group">
                <span className="bl-commentary-context-desc">Verses after</span>
                <button
                  className="bl-ctx-btn"
                  onClick={() => handleCommentaryContext(0, -1)}
                  disabled={commentaryModal.loading || commentaryModal.versesAfter <= 0}
                  aria-label="Remove verse after"
                >−</button>
                <span className="bl-ctx-count">{commentaryModal.versesAfter}</span>
                <button
                  className="bl-ctx-btn"
                  onClick={() => handleCommentaryContext(0, 1)}
                  disabled={commentaryModal.loading || commentaryModal.versesAfter >= commentaryMaxAfter}
                  aria-label="Add verse after"
                >+</button>
              </div>
            </div>
            {!commentaryCanExpand && (
              <p className="bl-commentary-context-note">
                Look up a wider passage (e.g. a verse range or whole chapter) to add surrounding verses here.
              </p>
            )}

            <div className="bl-commentary-body">
              {commentaryModal.loading && (
                <div className="bl-commentary-loading">
                  <Loader2 size={18} className="bl-spin" />
                  <span>Generating commentary…</span>
                </div>
              )}
              {!commentaryModal.loading && commentaryModal.commentary && (
                <div className="bl-commentary-text">
                  {commentaryModal.commentary.split('\n').filter(l => l.trim()).map((para, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  ))}
                </div>
              )}
              {!commentaryModal.loading && !commentaryModal.commentary && (
                <div className="bl-commentary-generate">
                  {commentaryModal.error && (
                    <p className="bl-commentary-error">{commentaryModal.error}</p>
                  )}
                  <button
                    type="button"
                    className="bl-commentary-generate-btn"
                    onClick={generateCommentary}
                    disabled={!isConfigured}
                  >
                    <Sparkles size={15} />
                    {commentaryModal.error ? 'Try Again' : `Generate commentary for ${commentaryDisplayRef}`}
                  </button>
                  <p className="bl-commentary-generate-hint">
                    Confirm the verse range above, then generate to help avoid overloading the AI.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
