import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, X, Search, Loader2, Copy, Check, Languages, ChevronDown, ChevronUp } from 'lucide-react';
import './BibleLookup.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const TRANSLATIONS = [
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB', style: 'formal',  styleLabel: 'Word-for-Word' },
  { id: 'a556c5305ee15c3f-01', label: 'CSB',  style: 'optimal', styleLabel: 'Balanced' },
  { id: 'd6e14a625393b4da-01', label: 'NLT',  style: 'dynamic', styleLabel: 'Thought-for-Thought' },
];

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
  'acts': 'ACT', 'act': 'ACT', 'romans': 'ROM', 'rom': 'ROM',
  '1 corinthians': '1CO', '1co': '1CO', '2 corinthians': '2CO', '2co': '2CO',
  'galatians': 'GAL', 'gal': 'GAL', 'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'colossians': 'COL', 'col': 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', 'titus': 'TIT', 'philemon': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB', 'james': 'JAS', 'jas': 'JAS',
  '1 peter': '1PE', '2 peter': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN',
  'jude': 'JUD', 'revelation': 'REV', 'revelations': 'REV', 'rev': 'REV',
};

const NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
]);

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

function refToPassageId(ref) {
  const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[–\-](\d+))?$/);
  if (!match) return null;
  const [, rawBook, chapter, startV, endV] = match;
  const code = BOOK_ABBR[rawBook.toLowerCase().trim()];
  if (!code) return null;
  const start = `${code}.${chapter}.${startV}`;
  return endV ? `${start}-${code}.${chapter}.${endV}` : start;
}

function getTestament(ref) {
  const pid = refToPassageId(ref);
  if (!pid) return 'both';
  return NT_BOOKS.has(pid.split('.')[0]) ? 'NT' : 'OT';
}

function tokenizePassage(text) {
  if (!text) return [];
  const re = /(\[\d+(?::\d+)?\])|([\n\r]+)|([a-zA-Z][a-zA-Z'']*)|([^a-zA-Z\[\]\n\r]+)/g;
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

function PassageText({ content, wordMap, testament, selectedWord, onWordClick }) {
  const tokens = tokenizePassage(content);
  return (
    <div className="bl-col-text">
      {tokens.map((tok, i) => {
        if (tok.type === 'verse') return <span key={i} className="bl-verse-num">{tok.text}</span>;
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

  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const wordStudyRef = useRef(null);

  const isConfigured = hasSupabaseConfig && Boolean(session?.user?.id);
  const testament = results ? getTestament(results.ref) : 'both';

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const fetchPassageStrongs = async (passageId) => {
    if (!isConfigured) return;
    try {
      const { data } = await supabase.functions.invoke('word-strongs-proxy', { body: { passageId } });
      if (data?.words?.length) {
        setWordMap(buildWordMap(data.words));
      }
    } catch { /* silent — NT or error, concordance fallback handles it */ }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setParseError('');
    const passageId = refToPassageId(query.trim());
    if (!passageId) {
      setParseError('Could not parse reference. Try "John 3:16" or "Romans 8:28-30".');
      return;
    }
    setLoading(true);
    setResults(null);
    setWordStudy(null);
    setWordMap(null);

    const fetched = await Promise.all(
      TRANSLATIONS.map(async (t) => {
        try {
          const { data, error } = await supabase.functions.invoke('bible-proxy', {
            body: { bibleId: t.id, passageId },
          });
          if (error || !data?.data?.content) throw new Error(error?.message || 'No content');
          return { ...t, content: data.data.content };
        } catch {
          return { ...t, content: null, error: true };
        }
      })
    );

    setResults({ ref: query.trim(), translations: fetched });
    setLoading(false);

    // Background: fetch live Hebrew Strongs for OT passages
    fetchPassageStrongs(passageId);
  };

  const handleCopy = (t) => {
    const text = `${results.ref} (${t.label})\n\n${t.content}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleWordClick = (word, entries) => {
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
              <p className="bl-word-hint">Tap an underlined word to explore its Hebrew or Greek meaning.</p>
            </div>
            <div className="bible-lookup-columns">
              {results.translations.map((t) => (
                <div key={t.id} className={`bible-lookup-col bl-style-${t.style}`}>
                  <div className="bl-col-header">
                    <span className="bl-col-label">{t.label}</span>
                    <span className="bl-col-style">{t.styleLabel}</span>
                    {!t.error && (
                      <button
                        className={`bl-copy-btn ${copiedId === t.id ? 'copied' : ''}`}
                        onClick={() => handleCopy(t)}
                        title={copiedId === t.id ? 'Copied!' : `Copy ${t.label}`}
                      >
                        {copiedId === t.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
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
                    />
                  )}
                </div>
              ))}
            </div>
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
                    <span className={entry.id.startsWith('H') ? 'bl-strongs-script bl-hebrew' : 'bl-strongs-script bl-greek'}>
                      {entry.script}
                    </span>
                    <div className="bl-strongs-meta">
                      <span className="bl-strongs-id">{entry.id}</span>
                      <span className="bl-strongs-lang">
                        {entry.id.startsWith('H') ? 'Hebrew' : 'Greek'}{entry.xlit ? ` · ${entry.xlit}` : ''}
                      </span>
                    </div>
                  </div>
                  {entry.pron && <p className="bl-strongs-translit">{entry.pron}</p>}
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
                        <span className={`bl-strongs-script ${strongsResult.id?.startsWith('H') ? 'bl-hebrew' : 'bl-greek'}`}>
                          {strongsResult.script || '—'}
                        </span>
                        <div className="bl-strongs-meta">
                          <span className="bl-strongs-id">{strongsResult.id}</span>
                          <span className="bl-strongs-lang">
                            {strongsResult.id?.startsWith('H') ? 'Hebrew' : 'Greek'}
                            {strongsResult.pos ? ` · ${strongsResult.pos}` : ''}
                          </span>
                        </div>
                      </div>
                      {strongsResult.xlit && (
                        <p className="bl-strongs-translit">
                          {strongsResult.xlit}
                          {strongsResult.pron && <span className="bl-strongs-pron"> · {strongsResult.pron}</span>}
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
        </div>
      </div>
    </>
  );
}
