import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, X, Search, Loader2, Copy, Check, Languages, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles, Volume2, ScrollText, ShieldCheck, MessageSquare, Maximize2, Minimize2, Globe2, MapPin, User, Users, Landmark, ExternalLink, RefreshCw, Clock, Trash2, Link2, Brain, Columns2 } from 'lucide-react';
import './BibleLookup.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { refToPassageIds, refToPassageId, getTestament, expandPassageIdVerses, passageIdToDisplay, splitContentVerses, CODE_TO_NAME, BOOK_CHAPTERS, stepChapter } from '../lib/scripture';
import { fetchHelloaoPassage, fetchTyndaleNotes } from '../lib/helloao';
import { fetchSefariaPassage } from '../lib/sefaria';
import { fetchWikipediaSummary } from '../lib/wikipedia';
import { fetchDefinition } from '../lib/dictionary';
import { recordEngagement, passageIdsToChapters } from '../lib/scriptureEngagement';
import { loadBibleWiki, buildNameIndex } from '../lib/bibleWiki';
import { loadEntityLinkIndex } from '../lib/wikiEntityLinker';
import { estimateSynthesisMs, recordSynthesis } from '../lib/ttsEstimate';
import SemanticSearch from './SemanticSearch';
import ScriptureImage from './ScriptureImage';
import TtsLoadingToast from './TtsLoadingToast';
import PassageMap from './PassageMap';
import LinkedText from './LinkedText';
import WikiCastStrip from './wiki/WikiCastStrip';
import ScriptureNavigator from './bible/ScriptureNavigator';
import { loadLastPosition, saveLastPosition } from './bible/useScripturePosition';


// Max verses the commentary range can extend on each side of the focus verse.
const COMMENTARY_MAX_CONTEXT = 5;

// LLM commentary is untrusted text; escape it before the **bold** markdown
// pass so model output can never inject live markup.
const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Original Hebrew (Masoretic text via Sefaria) — offered for OT lookups only.
const SEFARIA_HEBREW_ID = 'sefaria:hebrew';

// Default "Read aloud" voice: HuggingFace Kokoro (see handleSpeakTranslation).
// Any other value is a Fish Audio cloned-voice reference_id (opt-in).
const KOKORO_VOICE = 'kokoro';
const BIBLE_LOOKUP_VOICE_KEY = 'bibleLookupVoice';

const TRANSLATIONS = [
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB', style: 'formal',  styleLabel: 'Word-for-Word' },
  { id: 'esv', label: 'ESV', style: 'essential', styleLabel: 'Literal' },
  { id: 'a556c5305ee15c3f-01', label: 'CSB',  style: 'optimal', styleLabel: 'Balanced' },
  { id: 'd6e14a625393b4da-01', label: 'NLT',  style: 'dynamic', styleLabel: 'Thought-for-Thought' },
  // 'helloao:' ids are served by bible.helloao.org (keyless, no rate limits,
  // fetched straight from the browser) — no api.bible quota used.
  { id: 'helloao:eng_kjv', label: 'KJV', style: 'formal', styleLabel: 'Classic' },
  { id: 'helloao:BSB', label: 'BSB', style: 'optimal', styleLabel: 'Modern Literal' },
  // Served by bible-api.com (public domain, keyless) — no api.bible quota used.
  { id: 'free:web', label: 'WEB', style: 'formal', styleLabel: 'Public Domain' },
  { id: 'helloao:spa_r09', label: 'RVR', style: 'dynamic', styleLabel: 'Español 1909' },
  { id: SEFARIA_HEBREW_ID, label: 'Hebrew', style: 'original', styleLabel: 'Tanakh · OT only' },
];

const isEnglishTranslation = (translationId) =>
  translationId !== SEFARIA_HEBREW_ID && !translationId.includes('spa_');

// Reader preferences: which translation loads first, which ones are compared,
// and whether the read tab is in single or compare view. All survive reloads.
const PREFERRED_TRANSLATION_KEY = 'miqra_preferred_translation';
const COMPARE_TRANSLATIONS_KEY = 'miqra_compare_translations';
const VIEW_MODE_KEY = 'miqra_scripture_view_mode';
const COMPARE_MIN = 2;
const COMPARE_MAX = 3;

function loadPreferredTranslationId() {
  try {
    const stored = localStorage.getItem(PREFERRED_TRANSLATION_KEY);
    if (TRANSLATIONS.some((t) => t.id === stored)) return stored;
  } catch { /* storage unavailable */ }
  return TRANSLATIONS[0].id;
}

function loadCompareIds(preferredId) {
  try {
    const stored = JSON.parse(localStorage.getItem(COMPARE_TRANSLATIONS_KEY) || '[]');
    const valid = Array.isArray(stored) ? stored.filter((id) => TRANSLATIONS.some((t) => t.id === id)) : [];
    if (valid.length >= COMPARE_MIN) return valid.slice(0, COMPARE_MAX);
  } catch { /* storage unavailable */ }
  // Default pairing: the preferred translation next to a contrasting
  // thought-for-thought rendering, so differences are actually visible.
  const partner = TRANSLATIONS.find((t) => t.id !== preferredId && t.style === 'dynamic')
    || TRANSLATIONS.find((t) => t.id !== preferredId);
  return [preferredId, partner.id];
}

function loadViewMode() {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === 'single' || stored === 'compare') return stored;
  } catch { /* storage unavailable */ }
  return 'single';
}


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Statuses that mean "the edge function / upstream is transiently unavailable"
// (cold start, rate limit, gateway hiccup) — worth an automatic retry rather
// than bouncing the user back to a "Try Again" button.
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

// Parse a supabase.functions.invoke error into its parts. The response body can
// only be read once, so callers that need the status/retry hint should use this
// rather than getFunctionErrorMessage (which is a thin wrapper for display).
async function parseFunctionError(error, fallback) {
  const response = error?.context;
  const status = typeof response?.status === 'number' ? response.status : null;
  let message = error?.message || fallback;
  let retryAfterSeconds = null;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      if (body?.retryAfterSeconds) retryAfterSeconds = body.retryAfterSeconds;
    } catch {
      // Keep the client-side message.
    }
  }
  return { message, status, retryAfterSeconds };
}

async function getFunctionErrorMessage(error, fallback) {
  const { message, retryAfterSeconds } = await parseFunctionError(error, fallback);
  return retryAfterSeconds
    ? `${message} Try again in about ${retryAfterSeconds} seconds.`
    : message;
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

// Split a passage into sentence-bounded chunks under the fish-tts char cap so
// each cloned-voice request stays small and reliable (mirrors DailyReading).
function chunkTtsText(text, max = 1000) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
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

// Group a token stream into per-verse segments so each verse has a DOM anchor
// to scroll to and tint. Token indices are preserved because the click handlers
// below close over them. Anything before the first verse marker (a section
// heading, say) lands in a leading segment with verse === null.
function groupTokensByVerse(tokens) {
  const segments = [{ chapter: null, verse: null, items: [] }];
  tokens.forEach((tok, i) => {
    if (tok.type === 'verse') {
      const parts = tok.text.slice(1, -1).split(':');
      segments.push({
        chapter: parts.length > 1 ? Number(parts[0]) : null,
        verse: Number(parts[parts.length - 1]),
        items: [],
      });
    }
    segments[segments.length - 1].items.push({ tok, i });
  });
  return segments.filter((segment) => segment.items.length);
}

function PassageText({ content, wordMap, testament, selectedWord, onWordClick, onVerseClick, baseRef, entityIndex, onEntityClick, onAmbiguousClick, onDefineWord, focusVerse = null, chapterOfFocus = null }) {
  const tokens = tokenizePassage(content);

  const renderToken = (tok, i) => {
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
      // Bible Wiki entity (person/place) — only proper-noun-looking words.
      const entity = entityIndex && onEntityClick && /^[A-Z]/.test(tok.text)
        ? entityIndex.get(tok.text.toLowerCase())
        : null;
      // Most names also carry a Strong's number (they're words in the
      // original language too) — ask which the tap meant instead of the
      // word study silently winning and yanking the reader to another tab.
      if (entries?.length && entity && onAmbiguousClick) {
        return (
          <button
            key={i}
            className={`bl-word-btn bl-dual-btn ${isActive ? 'active' : ''}`}
            onClick={() => onAmbiguousClick(tok.text, entries, entity)}
            title={`"${tok.text}" — word study or about ${entity.name}?`}
          >
            {tok.text}
          </button>
        );
      }
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
      if (entity) {
        return (
          <button
            key={i}
            className="bl-entity-btn"
            onClick={() => onEntityClick(entity)}
            title={`About ${entity.name}`}
          >
            {tok.text}
          </button>
        );
      }
      // No Strong's entry or wiki entity — offer a plain English
      // dictionary definition instead so every word stays explorable.
      if (onDefineWord && tok.text.length > 2) {
        return (
          <button
            key={i}
            className="bl-plain-word"
            onClick={() => onDefineWord(tok.text)}
            title={`Define "${tok.text}"`}
          >
            {tok.text}
          </button>
        );
      }
      return <span key={i}>{tok.text}</span>;
    }
    return <span key={i}>{tok.text}</span>;
  };

  return (
    <div className="bl-col-text">
      {groupTokensByVerse(tokens).map((segment, si) => {
        if (segment.verse == null) return segment.items.map(({ tok, i }) => renderToken(tok, i));
        // Content can carry explicit "[3:16]" markers across chapters, so only
        // tint a verse whose chapter matches the one being focused.
        const isFocus = focusVerse != null
          && segment.verse === focusVerse
          && (segment.chapter == null || chapterOfFocus == null || segment.chapter === chapterOfFocus);
        return (
          <span
            key={`seg-${si}`}
            className={`bl-verse-seg${isFocus ? ' bl-verse-focus' : ''}`}
            data-verse={segment.verse}
            data-focus-verse={isFocus ? 'true' : undefined}
          >
            {segment.items.map(({ tok, i }) => renderToken(tok, i))}
          </span>
        );
      })}
    </div>
  );
}

export default function BibleLookup({ session, pageMode = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('read'); // 'read' | 'search' | 'context' | 'insights' | 'words'
  const [query, setQuery] = useState('');
  // { ref, passageIds, runId, byId: { [translationId]: { status, content } } }
  // status: 'idle' (not requested) | 'loading' | 'loaded' | 'error'
  const [results, setResults] = useState(null);
  // When the reader is opened from a list of sibling references (e.g. a meeting's
  // Focus Passages), this holds { refs: string[], index } so the user can cycle
  // prev/next through the whole list. Any plain lookup clears it back to null.
  const [passageSet, setPassageSet] = useState(null);
  const [activeTranslationId, setActiveTranslationId] = useState(loadPreferredTranslationId);
  const [viewMode, setViewMode] = useState(loadViewMode);
  const [compareIds, setCompareIds] = useState(() => loadCompareIds(loadPreferredTranslationId()));
  const lookupRunRef = useRef(0);
  const requestedTranslationsRef = useRef(new Set()); // `${runId}:${translationId}`
  // Bible navigation. `navSel` drives the breadcrumb and is synced from every
  // lookup; `focusVerse` is set ONLY by navigator picks, which is what keeps
  // typed and auto-linked references on their existing narrow fetch.
  const [navSel, setNavSel] = useState(loadLastPosition); // { code, chapter, verse } | null
  const [focusVerse, setFocusVerse] = useState(null);
  const [focusNotice, setFocusNotice] = useState('');     // aria-live announcement
  const resultsScrollRef = useRef(null);
  const centeredKeyRef = useRef(null);
  const [parseError, setParseError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [wordMap, setWordMap] = useState(null);
  const navigate = useNavigate();

  // Bible Wiki entities (people/places) — tap a name in the passage to peek.
  const [wikiIndex, setWikiIndex] = useState(null);
  const [entityPeek, setEntityPeek] = useState(null);
  // A tapped word that's both a Strong's word and a Bible Wiki entity —
  // ask which the reader meant instead of picking for them.
  const [wordChoice, setWordChoice] = useState(null); // { word, entries, entity }
  const handleAmbiguousClick = (word, entries, entity) => {
    setEntityPeek(null);
    setWordChoice({ word, entries, entity });
  };
  useEffect(() => {
    if (!isOpen && !pageMode) return;
    if (wikiIndex) return;
    let cancelled = false;
    loadBibleWiki()
      .then(({ entries }) => { if (!cancelled) setWikiIndex(buildNameIndex(entries)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, pageMode, wikiIndex]);

  // Combined Bible Wiki + Church History index, for linkifying names inside
  // Insights prose (this panel opts out of the app-wide auto-linkers).
  const [entityLinkIndex, setEntityLinkIndex] = useState(null);
  useEffect(() => {
    if (!isOpen && !pageMode) return;
    if (entityLinkIndex) return;
    let cancelled = false;
    loadEntityLinkIndex().then((idx) => { if (!cancelled) setEntityLinkIndex(idx); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, pageMode, entityLinkIndex]);

  // Insights prose mentions a reference inline — jump this same panel to it
  // rather than dispatching the global scripture:open event (which this
  // panel already is, so re-entering would just be a no-op reopen).
  const jumpToRef = (ref) => {
    setActiveTab('read');
    setQuery(ref);
    lookupReference(ref);
  };

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
  const [insightsProgress, setInsightsProgress] = useState(0); // 0–100, eased while loading
  const [insightsAttempt, setInsightsAttempt] = useState(0);   // >1 means we're auto-retrying

  // Discussion Questions
  const [questions, setQuestions] = useState(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState('');

  // Wikidata Context
  const [wikidataContext, setWikidataContext] = useState(null);
  const [wikidataLoading, setWikidataLoading] = useState(false);
  const [wikidataError, setWikidataError] = useState('');

  // Cross references (Treasury of Scripture Knowledge)
  const [crossRefs, setCrossRefs] = useState(null); // [{ fromRef, fromDisplay, refs: [{to_ref, display, votes}] }]
  const [crossRefsLoading, setCrossRefsLoading] = useState(false);
  const [showCrossRefs, setShowCrossRefs] = useState(false);

  // ESV passage audio (real narration, not TTS)
  const [esvAudioUrl, setEsvAudioUrl] = useState(null);
  const [esvAudioLoading, setEsvAudioLoading] = useState(false);
  const [esvAudioError, setEsvAudioError] = useState('');

  // Passage map modal
  const [showMap, setShowMap] = useState(false);

  // Memorize (spaced repetition) save state: '' | 'saving' | 'saved' | 'error'
  const [memorizeState, setMemorizeState] = useState('');

  const [speakingId, setSpeakingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  // Feeds the non-blocking "preparing the voice" pill while audio is being
  // synthesized; null the moment playback starts.
  const [ttsPending, setTtsPending] = useState(null);
  // Opt-in Fish Audio cloned voices ({ id, label }); Kokoro stays the default.
  const [fishVoices, setFishVoices] = useState([]);
  const [voiceChoice, setVoiceChoice] = useState(
    () => localStorage.getItem(BIBLE_LOOKUP_VOICE_KEY) || KOKORO_VOICE,
  );
  const [pronunciationError, setPronunciationError] = useState('');
  const [blbReferenceEntry, setBlbReferenceEntry] = useState(null);
  const activeAudioRef = useRef(null);
  const playbackRunRef = useRef(0);

  // Commentary modal
  const [commentaryModal, setCommentaryModal] = useState(null);
  const commentaryReqRef = useRef(0);
  const previewReqRef = useRef(0);
  const requestedVersesRef = useRef(new Set());

  // Tyndale Open Study Notes (bible.helloao.org, CC BY-SA 4.0) for the chapter
  // the commentary modal is focused on. { status, notes: [{ verse, text }] }
  const [tyndaleNotes, setTyndaleNotes] = useState(null);
  useEffect(() => {
    const baseVerseRef = commentaryModal?.baseVerseRef;
    if (!baseVerseRef) { setTyndaleNotes(null); return undefined; }
    const passageIds = refToPassageIds(baseVerseRef);
    if (!passageIds.length) { setTyndaleNotes(null); return undefined; }
    const [book, chapter] = passageIds[0].split('.');
    let cancelled = false;
    setTyndaleNotes({ status: 'loading', notes: [] });
    fetchTyndaleNotes(book, Number(chapter))
      .then((notes) => { if (!cancelled) setTyndaleNotes({ status: 'loaded', notes }); })
      .catch(() => { if (!cancelled) setTyndaleNotes({ status: 'error', notes: [] }); });
    return () => { cancelled = true; };
  }, [commentaryModal?.baseVerseRef]);

  // Wikipedia lead-section summaries (CC BY-SA) keyed by Wikidata entity id,
  // fetched once the Wikidata context loads.
  const [wikiSummaries, setWikiSummaries] = useState({});
  useEffect(() => {
    const entities = (wikidataContext?.entities || []).filter((e) => e.wikipediaUrl).slice(0, 8);
    setWikiSummaries({});
    if (!entities.length) return undefined;
    let cancelled = false;
    entities.forEach(async (entity) => {
      const summary = await fetchWikipediaSummary(entity.wikipediaUrl).catch(() => null);
      if (!cancelled && summary) setWikiSummaries((prev) => ({ ...prev, [entity.id]: summary }));
    });
    return () => { cancelled = true; };
  }, [wikidataContext]);

  // English dictionary lookup (dictionaryapi.dev) for tapped words that have
  // no Strong's entry. { word, status, entry }
  const [dictionaryResult, setDictionaryResult] = useState(null);
  const handleDefineWord = async (word) => {
    setWordStudy(null);
    setStrongsResult(null);
    setWordChoice(null);
    setEntityPeek(null);
    setActiveTab('words');
    setDictionaryResult({ word, status: 'loading', entry: null });
    const entry = await fetchDefinition(word).catch(() => null);
    setDictionaryResult((prev) => (prev?.word === word ? { word, status: 'loaded', entry } : prev));
  };

  const [isMaximized, setIsMaximized] = useState(false);

  // Lookup history (Supabase-backed, authenticated users only)
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const insightsBodyRef = useRef(null);

  const isConfigured = hasSupabaseConfig && Boolean(session?.user?.id);
  const testament = results ? getTestament(results.ref) : 'both';

  // Translation metadata merged with this lookup's per-translation fetch state.
  const translationsView = TRANSLATIONS.map((t) => ({
    ...t,
    ...(results?.byId?.[t.id] ?? { status: 'idle', content: null }),
  }));
  // Sefaria serves the Tanakh only, so the Hebrew option applies to OT lookups.
  // When a Hebrew reader looks up an NT passage, fall back to their stored
  // preference (Hebrew is never persisted as the preference).
  const hebrewAvailable = testament === 'OT';
  const effectiveActiveId = (!hebrewAvailable && activeTranslationId === SEFARIA_HEBREW_ID)
    ? loadPreferredTranslationId()
    : activeTranslationId;
  const activeTranslation = translationsView.find((t) => t.id === effectiveActiveId) ?? translationsView[0];
  const compareTranslations = translationsView.filter(
    (t) => compareIds.includes(t.id) && (hebrewAvailable || t.id !== SEFARIA_HEBREW_ID)
  );
  const visibleTranslations = viewMode === 'compare' ? compareTranslations : [activeTranslation];
  const anyFetching = translationsView.some((t) => t.status === 'loading');

  const selectTranslation = (translationId) => {
    setActiveTranslationId(translationId);
    if (translationId === SEFARIA_HEBREW_ID) return;
    try { localStorage.setItem(PREFERRED_TRANSLATION_KEY, translationId); } catch { /* storage unavailable */ }
  };

  const toggleCompareTranslation = (translationId) => {
    const selected = compareIds.includes(translationId);
    if (selected && compareIds.length <= COMPARE_MIN) return;
    if (!selected && compareIds.length >= COMPARE_MAX) return;
    const next = selected ? compareIds.filter((id) => id !== translationId) : [...compareIds, translationId];
    setCompareIds(next);
    try { localStorage.setItem(COMPARE_TRANSLATIONS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const setMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* storage unavailable */ }
  };

  // Passage-wide features (insights, questions, memorize, image) quote the
  // reader's active translation when loaded, else the first loaded one.
  // Hebrew is a last resort — those features expect an English source text.
  const getPrimaryPassage = () => {
    if (!results) return null;
    const loaded = [activeTranslation, ...translationsView].filter((t) => t.status === 'loaded' && t.content);
    return loaded.find((t) => t.id !== SEFARIA_HEBREW_ID) || loaded[0] || null;
  };

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

  // Fetch one translation's text for a lookup run and merge it into results as
  // it arrives. The runId guard drops responses from superseded lookups; the
  // requested-set makes it idempotent so the ensure-effect can't double-fetch.
  const fetchTranslationContent = async (runId, translationId, passageIds, { force = false } = {}) => {
    const requestKey = `${runId}:${translationId}`;
    if (!force && requestedTranslationsRef.current.has(requestKey)) return;
    requestedTranslationsRef.current.add(requestKey);
    const setTranslationState = (state) => {
      setResults((prev) => (prev && prev.runId === runId
        ? { ...prev, byId: { ...prev.byId, [translationId]: state } }
        : prev));
    };
    setTranslationState({ status: 'loading', content: null });
    // Verse markers are chapter-implicit ("[16]") for the lookup's first
    // chapter, explicit ("[3:16]") otherwise — same convention as bible-proxy.
    const implicitChapter = Number(passageIds[0]?.split('.')[1]);
    try {
      const passages = await Promise.all(passageIds.map(async (passageId) => {
        if (translationId === SEFARIA_HEBREW_ID) {
          return fetchSefariaPassage(passageId, implicitChapter);
        }
        if (translationId.startsWith('helloao:')) {
          return fetchHelloaoPassage(translationId.slice('helloao:'.length), passageId, implicitChapter);
        }
        const { data, error } = await supabase.functions.invoke('bible-proxy', {
          body: { bibleId: translationId, passageId },
        });
        if (error || !data?.data?.content) throw new Error(error?.message || 'No content');
        return data.data.content;
      }));
      setTranslationState({ status: 'loaded', content: passages.join('\n\n') });
    } catch {
      setTranslationState({ status: 'error', content: null });
    }
  };

  const retryTranslation = (translationId) => {
    if (!results) return;
    fetchTranslationContent(results.runId, translationId, results.passageIds, { force: true });
  };

  // Lazily fetch whatever the current view needs: the active translation in
  // single view, the compared set in compare view. Errors are not auto-retried.
  useEffect(() => {
    if (!results) return;
    const otLookup = getTestament(results.ref) === 'OT';
    const wanted = viewMode === 'compare' ? compareIds : [activeTranslationId];
    const needed = wanted
      .map((id) => (!otLookup && id === SEFARIA_HEBREW_ID
        ? (viewMode === 'compare' ? null : loadPreferredTranslationId())
        : id))
      .filter(Boolean);
    for (const id of new Set(needed)) {
      if (results.byId[id]?.status === 'idle') {
        fetchTranslationContent(results.runId, id, results.passageIds);
      }
    }
  }, [results, viewMode, activeTranslationId, compareIds]);

  // `focus` is the verse to center inside a chapter read. Every pre-existing
  // call site passes one or two arguments and so gets focus = null — i.e. the
  // narrow-fetch behavior it has always had.
  const lookupReference = async (refStr, set = null, { focus = null } = {}) => {
    if (!refStr.trim()) return;
    setParseError('');
    setFocusVerse(focus);
    setFocusNotice('');
    centeredKeyRef.current = null;
    const passageIds = refToPassageIds(refStr.trim());
    if (!passageIds.length) {
      setParseError('Could not parse reference. Try "John 3:16", "Romans 8:28-30", or "Revelation 3:5;13:8".');
      return;
    }
    // A plain lookup (set === null) clears any active Focus-Passage navigation;
    // set-aware callers pass their { refs, index } so prev/next keeps working.
    setPassageSet(set);
    setWordStudy(null);
    setWordMap(null);
    setEntityPeek(null);
    setWordChoice(null);
    setDictionaryResult(null);
    setInsights(null);
    setInsightsError('');
    setQuestions(null);
    setQuestionsError('');
    setWikidataContext(null);
    setWikidataError('');
    setCrossRefs(null);
    setShowCrossRefs(false);
    setEsvAudioUrl(null);
    setEsvAudioError('');
    setShowMap(false);
    setMemorizeState('');

    // Skeleton first — the ensure-effect fetches only what the current view
    // shows, so switching translations later never re-pays for text you have.
    const runId = ++lookupRunRef.current;
    setResults({
      ref: refStr.trim(),
      passageIds,
      runId,
      byId: Object.fromEntries(TRANSLATIONS.map((t) => [t.id, { status: 'idle', content: null }])),
    });

    // Background: fetch live Hebrew Strongs for OT passages
    if (passageIds.length === 1) fetchPassageStrongs(passageIds[0]);

    // Persist to user history
    if (isConfigured) {
      recordEngagement(session.user.id, passageIdsToChapters(passageIds), 'lookup').catch(() => {});
      const now = new Date().toISOString();
      const ref = refStr.trim();
      const optId = `opt-${Date.now()}`;
      setHistory(prev => {
        const filtered = prev.filter(h => h.reference !== ref);
        return [{ id: optId, reference: ref, looked_up_at: now }, ...filtered].slice(0, 30);
      });
      supabase
        .from('scripture_lookup_history')
        .upsert(
          { user_id: session.user.id, reference: ref, looked_up_at: now },
          { onConflict: 'user_id,reference' }
        )
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (error) { console.error('[history] upsert failed:', error); return; }
          if (data?.id) {
            setHistory(prev => prev.map(h => h.id === optId ? { ...h, id: data.id } : h));
          }
        });
    }
  };

  // ── Bible navigation ──────────────────────────────────────
  // The navigator's entry point: load the WHOLE chapter and focus one verse in
  // it. The reference is chapter-scoped ("John 3"), so refToPassageIds yields
  // ['JHN.3'] and the existing fetch path returns the entire chapter.
  const openChapter = (code, chapter, verse) => {
    const name = CODE_TO_NAME[code];
    if (!name || !chapter) return;
    const ref = `${name} ${chapter}`;
    setActiveTab('read');
    setQuery(ref);
    setNavSel({ code, chapter, verse: verse ?? null });
    // Paging into a new chapter must not inherit the previous chapter's scroll.
    if (verse == null && resultsScrollRef.current) resultsScrollRef.current.scrollTop = 0;
    lookupReference(ref, null, { focus: verse ?? null });
  };

  // Keep the breadcrumb pointed at wherever the reader actually is, including
  // after a typed lookup or a reference tapped in chat, so they can browse on
  // from there. Unparseable references leave it untouched.
  useEffect(() => {
    if (!results?.ref) return;
    const passageId = refToPassageId(results.ref);
    if (!passageId) return;
    const [code, chapter, verse] = passageId.split('-')[0].split('.');
    if (!BOOK_CHAPTERS[code]) return;
    setNavSel((prev) => {
      const next = { code, chapter: Number(chapter), verse: verse ? Number(verse) : null };
      // The navigator issues chapter-only references ("John 3") while tracking
      // the verse it focused, so a chapter-only ref for the chapter we are
      // already on must not wipe that verse back out of the breadcrumb.
      if (!verse && prev?.code === next.code && prev?.chapter === next.chapter) return prev;
      return next;
    });
  }, [results?.ref]);

  useEffect(() => { saveLastPosition(navSel); }, [navSel]);

  // Center the focused verse once the chapter's text is actually in the DOM.
  useLayoutEffect(() => {
    if (focusVerse == null) return;
    const container = resultsScrollRef.current;
    if (!container) return;

    // Re-center when the translation or view mode changes, but never fight a
    // re-render after the reader has scrolled away themselves.
    const key = `${results?.runId}:${viewMode}:${effectiveActiveId}:${focusVerse}`;
    if (centeredKeyRef.current === key) return;

    let target = container.querySelector('[data-focus-verse="true"]');
    let notice = '';
    if (!target) {
      // Versification gap: modern translations omit verses the KJV carries
      // (Matthew 17:21, Acts 8:37, John 5:4, …) and Psalm superscriptions shift
      // numbering. Fall back to the nearest lower verse that is present.
      const earlier = [...container.querySelectorAll('[data-verse]')]
        .filter((node) => Number(node.dataset.verse) < focusVerse);
      target = earlier[earlier.length - 1] ?? null;
      if (target) {
        notice = `Verse ${focusVerse} is not present in ${activeTranslation.label}. Showing verse ${target.dataset.verse}.`;
      }
    }
    if (!target) return;
    centeredKeyRef.current = key;
    setFocusNotice(notice || `${results?.ref} loaded, verse ${focusVerse} focused.`);

    // getBoundingClientRect deltas rather than offsetTop: offsetTop is relative
    // to the nearest positioned ancestor, which this container is not.
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop
      + (targetRect.top - containerRect.top)
      - containerRect.height / 2
      + targetRect.height / 2;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [focusVerse, results?.runId, results?.ref, viewMode, effectiveActiveId, activeTranslation.status, activeTranslation.label]);

  // ── History ───────────────────────────────────────────────
  const fetchHistory = async () => {
    if (!isConfigured) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('scripture_lookup_history')
      .select('id, reference, looked_up_at')
      .order('looked_up_at', { ascending: false })
      .limit(30);
    if (error) console.error('[history] fetch failed:', error);
    if (data) setHistory(data);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (showHistory && isConfigured) fetchHistory();
  }, [showHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) setShowHistory(false);
  }, [isOpen]);

  const handleDeleteHistoryItem = async (item) => {
    setHistory(prev => prev.filter(h => h.id !== item.id));
    await supabase.from('scripture_lookup_history').delete().eq('id', item.id);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    await supabase.from('scripture_lookup_history').delete().eq('user_id', session.user.id);
  };

  // Open + look up a reference when an auto-linked scripture reference is clicked anywhere.
  // A caller may also pass `set` (an array of sibling references, e.g. a meeting's
  // Focus Passages) and `index` so the reader can offer prev/next through the list.
  useEffect(() => {
    const onOpenRef = (e) => {
      const ref = e.detail?.ref;
      if (!ref) return;
      const rawSet = Array.isArray(e.detail?.set) ? e.detail.set : null;
      const set = rawSet && rawSet.length > 1
        ? {
            refs: rawSet,
            index: Number.isInteger(e.detail?.index) && e.detail.index >= 0 && e.detail.index < rawSet.length
              ? e.detail.index
              : Math.max(0, rawSet.indexOf(ref)),
          }
        : null;
      setIsOpen(true);
      setActiveTab('read');
      setQuery(ref);
      lookupReference(ref, set);
    };
    window.addEventListener('scripture:open', onOpenRef);
    return () => window.removeEventListener('scripture:open', onOpenRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step through the sibling references of the active Focus-Passage set (wraps around).
  const navigatePassageSet = (dir) => {
    if (!passageSet || passageSet.refs.length < 2) return;
    const n = passageSet.refs.length;
    const nextIndex = (passageSet.index + dir + n) % n;
    const nextRef = passageSet.refs[nextIndex];
    setQuery(nextRef);
    lookupReference(nextRef, { refs: passageSet.refs, index: nextIndex });
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    lookupReference(query);
  };

  // Gemini insights are prone to transient failures — cold starts, rate limits,
  // and gateway hiccups — that succeed on a manual retry moments later. Instead
  // of surfacing those as an error the user has to re-click, we keep the loading
  // state alive and auto-retry with backoff, only showing an error once we've
  // genuinely exhausted our attempts (or hit a terminal, non-retryable error).
  const fetchInsights = async () => {
    if (!results || insightsLoading) return;
    setInsightsLoading(true);
    setInsightsError('');
    setInsights(null);
    const passageText = getPrimaryPassage()?.content || '';
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      setInsightsAttempt(attempt);
      const isLast = attempt === maxAttempts;
      try {
        const { data, error } = await supabase.functions.invoke('gemini-proxy', {
          body: {
            reference: results.ref,
            passageText,
            userId: session?.user?.id ?? null,
          },
        });
        if (error) {
          const { message, status, retryAfterSeconds } = await parseFunctionError(error, 'Failed to load insights.');
          const retryable = status == null || RETRYABLE_STATUSES.has(status);
          if (retryable && !isLast) {
            // Honor the rate-limit hint when present, but cap it so we never
            // leave the user staring at a bar for too long between attempts.
            const waitMs = retryAfterSeconds ? Math.min(retryAfterSeconds * 1000, 8000) : attempt * 1500;
            await sleep(waitMs);
            continue;
          }
          setInsightsError(retryAfterSeconds ? `${message} Try again in about ${retryAfterSeconds} seconds.` : message);
          break;
        }
        if (!data?.insights) {
          if (!isLast) { await sleep(attempt * 1500); continue; }
          setInsightsError('No insights returned.');
          break;
        }
        setInsights(data.insights);
        break;
      } catch (err) {
        // invoke() threw — network drop or timeout. Same treatment: retry.
        if (!isLast) { await sleep(attempt * 1500); continue; }
        setInsightsError(err.message || 'Failed to load insights.');
        break;
      }
    }

    setInsightsLoading(false);
    setInsightsAttempt(0);
  };

  // Ease a progress bar toward ~92% while insights load (we can't know the real
  // duration), then let a successful result snap it to 100%.
  useEffect(() => {
    if (!insightsLoading) {
      setInsightsProgress(insights ? 100 : 0);
      return undefined;
    }
    setInsightsProgress(8);
    const id = setInterval(() => {
      setInsightsProgress((p) => (p >= 92 ? p : p + (92 - p) * 0.08));
    }, 400);
    return () => clearInterval(id);
  }, [insightsLoading, insights]);

  const openInsights = () => {
    setActiveTab('insights');
    setTimeout(() => insightsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 60);
    if (results && !insights && !insightsLoading && !insightsError) {
      fetchInsights();
    }
  };

  const getPrimaryPassageText = () => getPrimaryPassage()?.content || '';

  const fetchWikidataContext = async () => {
    if (!results || wikidataLoading) return;
    setWikidataLoading(true);
    setWikidataError('');
    setWikidataContext(null);
    try {
      const { data, error } = await supabase.functions.invoke('wikidata-proxy', {
        body: {
          reference: results.ref,
          passageText: getPrimaryPassageText(),
          userId: session?.user?.id ?? null,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to load Wikidata context.'));
      setWikidataContext(data);
    } catch (err) {
      setWikidataError(err.message || 'Failed to load Wikidata context.');
    } finally {
      setWikidataLoading(false);
    }
  };

  const openContext = () => {
    setActiveTab('context');
    if (results && !wikidataContext && !wikidataLoading && !wikidataError) {
      fetchWikidataContext();
    }
  };

  // ── Cross references ──────────────────────────────────────────
  const fetchCrossRefs = async () => {
    if (!results || crossRefsLoading) return;
    setCrossRefsLoading(true);
    try {
      const passageIds = refToPassageIds(results.ref);
      const verseIds = [...new Set(passageIds.flatMap(expandPassageIdVerses))].slice(0, 20);
      const { data, error } = await supabase
        .from('cross_references')
        .select('from_ref, to_ref, votes')
        .in('from_ref', verseIds)
        .order('votes', { ascending: false })
        .limit(120);
      if (error) throw error;
      const grouped = verseIds
        .map((fromRef) => ({
          fromRef,
          fromDisplay: passageIdToDisplay(fromRef),
          refs: (data || [])
            .filter((row) => row.from_ref === fromRef)
            .slice(0, 8)
            .map((row) => {
              const [startId, endId] = row.to_ref.split('-');
              // Cross-chapter ranges can't be parsed back by refToPassageIds,
              // so those chips look up their starting verse instead.
              const crossChapter = endId && endId.split('.')[1] !== startId.split('.')[1];
              return {
                toRef: row.to_ref,
                display: passageIdToDisplay(row.to_ref),
                lookupRef: crossChapter ? passageIdToDisplay(startId) : passageIdToDisplay(row.to_ref),
                votes: row.votes,
              };
            })
            .filter((row) => row.display && row.lookupRef),
        }))
        .filter((group) => group.refs.length > 0);
      setCrossRefs(grouped);
    } catch {
      setCrossRefs([]);
    } finally {
      setCrossRefsLoading(false);
    }
  };

  const toggleCrossRefs = () => {
    const next = !showCrossRefs;
    setShowCrossRefs(next);
    if (next && !crossRefs) fetchCrossRefs();
  };

  // ── Memorize (spaced repetition) ──────────────────────────────
  const handleMemorize = async () => {
    if (!results || !isConfigured || memorizeState === 'saving') return;
    const usable = getPrimaryPassage();
    if (!usable) return;
    setMemorizeState('saving');
    // Strip "[n]" verse markers for a clean recitation text.
    const cleanText = usable.content.replace(/\[\d+(?::\d+)?]\s*/g, '').replace(/\s+/g, ' ').trim();
    const { error } = await supabase.from('memory_verses').upsert({
      user_id: session.user.id,
      reference: results.ref,
      verse_text: cleanText,
      translation: usable.label,
    }, { onConflict: 'user_id,reference', ignoreDuplicates: true });
    setMemorizeState(error ? 'error' : 'saved');
  };

  // ── ESV passage audio ─────────────────────────────────────────
  const fetchEsvAudio = async () => {
    if (!results || esvAudioLoading) return;
    setEsvAudioLoading(true);
    setEsvAudioError('');
    stopSpeaking();
    try {
      const { data, error } = await supabase.functions.invoke('esv-audio-proxy', {
        body: { reference: results.ref },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Audio unavailable.'));
      if (!data?.url) throw new Error('Audio unavailable.');
      setEsvAudioUrl(data.url);
    } catch (err) {
      setEsvAudioError(err.message || 'Audio unavailable.');
    } finally {
      setEsvAudioLoading(false);
    }
  };

  const fetchQuestions = async () => {
    if (!results || questionsLoading) return;
    setQuestionsLoading(true);
    setQuestionsError('');
    setQuestions(null);
    const passageText = getPrimaryPassageText();
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
    setTtsPending(null);
  };

  const playClientSpeech = (text, speechId, language = 'en-US') => {
    if (!('speechSynthesis' in window)) {
      setTtsLoadingId(null);
      setTtsPending(null);
      return;
    }
    setTtsLoadingId(null);
    setTtsPending(null);
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
          setTtsPending(null);
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

  // Synthesize + play a passage in a Fish Audio cloned voice, chunk by chunk,
  // reusing the shared playback run/cancel plumbing so stopSpeaking() works.
  // Throws only if nothing has played yet, letting the caller fall back to
  // Kokoro; a mid-stream failure just stops gracefully.
  const playFishSpeech = async (cleanText, speechId, voiceId, voiceLabel = '') => {
    const runId = playbackRunRef.current;
    const chunks = chunkTtsText(cleanText);
    let started = false;

    for (let i = 0; i < chunks.length; i += 1) {
      if (playbackRunRef.current !== runId) return;
      const chunk = chunks[i];
      let url;
      try {
        // Each chunk is its own round-trip (and a gap in playback), so the
        // status pill reappears between parts with a fresh estimate.
        const startedAt = Date.now();
        setTtsPending({
          voiceLabel,
          part: i + 1,
          totalParts: chunks.length,
          etaMs: estimateSynthesisMs(chunk.length, 'fish'),
          startedAt,
        });
        const { data, error } = await supabase.functions.invoke('fish-tts', {
          body: { text: chunk, voice_id: voiceId },
        });
        if (playbackRunRef.current !== runId) return;
        // fish-tts returns an octet-stream Blob; wrap it as audio/mpeg for <audio>.
        if (error || !data) throw new Error(error?.message || 'No audio returned');
        recordSynthesis(chunk.length, Date.now() - startedAt, 'fish');

        url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
        const audio = new Audio(url);
        activeAudioRef.current = audio;

        await new Promise((resolve, reject) => {
          audio.onplay = () => {
            setTtsPending(null);
            if (!started) {
              started = true;
              setTtsLoadingId(null);
              setSpeakingId(speechId);
            }
          };
          audio.onended = resolve;
          audio.onpause = resolve;
          audio.onerror = () => reject(new Error('Playback failed'));
          audio.play().catch(reject);
        });
      } catch (err) {
        if (!started) throw err; // nothing played yet → let caller fall back
        if (playbackRunRef.current === runId) {
          activeAudioRef.current = null;
          setSpeakingId(null);
          setTtsPending(null);
        }
        return; // mid-stream failure → stop gracefully
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }

    if (playbackRunRef.current === runId) {
      activeAudioRef.current = null;
      setSpeakingId(null);
      setTtsPending(null);
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

    // Opt-in Fish Audio cloned voice. If it can't start, fall through to the
    // default Kokoro path below so "Read aloud" still works.
    const fishVoice =
      voiceChoice !== KOKORO_VOICE ? fishVoices.find((v) => v.id === voiceChoice) : null;
    if (fishVoice) {
      try {
        await playFishSpeech(cleanText, t.id, fishVoice.id, fishVoice.label);
        return;
      } catch (err) {
        if (playbackRunRef.current !== requestRunId) return;
        console.warn('Cloned-voice TTS failed, falling back to default voice:', err);
      }
    }

    try {
      const startedAt = Date.now();
      setTtsPending({
        voiceLabel: 'Default voice',
        part: 1,
        totalParts: 1,
        etaMs: estimateSynthesisMs(cleanText.length, 'kokoro'),
        startedAt,
      });
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
      recordSynthesis(cleanText.length, Date.now() - startedAt, 'kokoro');

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
      stopSpeaking();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Load the opt-in cloned voices from fish-tts (labels only — no keys exposed).
  // If a previously-chosen voice is gone, fall back to the default Kokoro voice.
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase?.functions?.invoke) return undefined;
    let cancelled = false;
    supabase.functions
      .invoke('fish-tts', { method: 'GET' })
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data?.voices)) return;
        setFishVoices(data.voices);
        setVoiceChoice((prev) =>
          prev === KOKORO_VOICE || data.voices.some((v) => v.id === prev) ? prev : KOKORO_VOICE,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(BIBLE_LOOKUP_VOICE_KEY, voiceChoice);
  }, [voiceChoice]);

  const handleWordClick = (word, entries) => {
    setPronunciationError('');
    setWordStudy({ word, entries });
    setStrongsResult(null);
    setWordChoice(null);
    setDictionaryResult(null);
    setActiveTab('words');
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
    setDictionaryResult(null);
    setStrongsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('strongs-proxy', {
        body: { strongsId: id },
      });
      if (error || !data?.data) throw new Error(error?.message || 'No result');
      setStrongsResult({ id, ...data.data });
      setActiveTab('words');
    } catch {
      setStrongsError('Could not find that Strongs number. Check the format and try again.');
    } finally {
      setStrongsLoading(false);
    }
  };

  // ── Commentary ────────────────────────────────────────────────

  // Fetch a chapter verse range from the Scripture API and return [{verse,text}].
  const fetchRangeVerses = async (translationId, parsed, start, end) => {
    const rangeRef = `${parsed.book} ${parsed.chapter}:${Math.max(1, start)}-${end}`;
    const passageIds = refToPassageIds(rangeRef);
    if (!passageIds.length) return [];
    try {
      const { data } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: translationId, passageId: passageIds[0] },
      });
      if (data?.data?.content) {
        return extractChapterVerses(data.data.content, parsed.chapter, parsed.chapter);
      }
    } catch { /* fall through to empty */ }
    return [];
  };

  const mergeVerses = (existing, incoming) => {
    const map = new Map((existing || []).map((v) => [v.verse, v]));
    for (const v of incoming) if (!map.has(v.verse)) map.set(v.verse, v);
    return [...map.values()].sort((a, b) => a.verse - b.verse);
  };

  const runCommentary = async (ctx) => {
    const reqId = ++commentaryReqRef.current;

    // Hybrid: prefer verses already loaded from the original lookup; only if the
    // chosen range reaches past them do we fetch the gap. Guarantees the AI sees
    // the full selected passage even when the user expanded beyond the search.
    let working = ctx;
    const parsed = parseVerseRef(ctx.baseVerseRef);
    if (parsed) {
      const start = Math.max(1, parsed.verse - ctx.versesBefore);
      const end = parsed.verse + ctx.versesAfter;
      const have = new Set((ctx.chapterVerses || []).map((v) => v.verse));
      let missing = false;
      for (let v = start; v <= end; v += 1) if (!have.has(v)) { missing = true; break; }
      if (missing) {
        const fetched = await fetchRangeVerses(ctx.translationId, parsed, start, end);
        if (commentaryReqRef.current !== reqId) return;
        working = { ...ctx, chapterVerses: mergeVerses(ctx.chapterVerses, fetched) };
      }
    }

    const view = computeCommentaryView(working);

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
      setCommentaryModal(prev => prev ? { ...prev, chapterVerses: working.chapterVerses, commentary: data.commentary, loading: false } : null);
    } catch (err) {
      if (commentaryReqRef.current !== reqId) return;
      setCommentaryModal(prev => prev ? { ...prev, loading: false, error: err?.message || 'Failed to generate commentary. Please try again.' } : null);
    }
  };

  const openCommentary = (verseRef, verseText, translationId, translationLabel) => {
    // Open the modal but wait for the user to confirm the range and press
    // "Generate" — no API call on open. Pre-slice the clicked translation's
    // already-loaded text into chapter verses so nearby preview is instant.
    const parsed = parseVerseRef(verseRef);
    const translationContent = results?.byId?.[translationId]?.content;
    const lookupFirstChapter = results ? firstChapterOf(results.ref) : null;
    const chapterVerses = (translationContent && parsed)
      ? extractChapterVerses(translationContent, lookupFirstChapter ?? parsed.chapter, parsed.chapter)
      : [];
    setCommentaryModal({
      baseVerseRef: verseRef,
      verseText,
      translationId,
      translationLabel,
      chapterVerses,
      chapterMaxVerse: null,
      versesBefore: 0,
      versesAfter: 0,
      previewLoading: false,
      commentary: null,
      loading: false,
      error: null,
    });
  };

  // Set the included range by tapping a verse: tap a verse before the focus to
  // include back to it, after to include forward to it, or the focus to reset.
  const setCommentaryRangeToVerse = (verse) => {
    setCommentaryModal((prev) => {
      if (!prev || prev.loading) return prev;
      const parsed = parseVerseRef(prev.baseVerseRef);
      if (!parsed) return prev;
      const focus = parsed.verse;
      let { versesBefore, versesAfter } = prev;
      if (verse === focus) { versesBefore = 0; versesAfter = 0; }
      else if (verse < focus) versesBefore = Math.min(COMMENTARY_MAX_CONTEXT, focus - verse);
      else versesAfter = Math.min(COMMENTARY_MAX_CONTEXT, verse - focus);
      if (versesBefore === prev.versesBefore && versesAfter === prev.versesAfter) return prev;
      return { ...prev, versesBefore, versesAfter, commentary: null, error: null };
    });
  };

  const generateCommentary = () => {
    if (!commentaryModal || commentaryModal.loading) return;
    const ctx = { ...commentaryModal, loading: true, error: null, commentary: null };
    setCommentaryModal(ctx);
    runCommentary(ctx);
  };

  // Hybrid preview: whenever the chosen range reaches past the verses already
  // loaded, fetch the gap once and merge it in so the quote fills in live.
  useEffect(() => {
    if (!commentaryModal || commentaryModal.previewLoading || commentaryModal.loading) return undefined;
    const parsed = parseVerseRef(commentaryModal.baseVerseRef);
    if (!parsed) return undefined;
    const focus = parsed.verse;
    const start = Math.max(1, focus - commentaryModal.versesBefore);
    const end = focus + commentaryModal.versesAfter;
    const have = new Set((commentaryModal.chapterVerses || []).map((v) => v.verse));
    
    let missing = false;
    const toFetch = [];
    for (let v = start; v <= end; v += 1) {
      if (!have.has(v)) {
        const key = `${commentaryModal.translationId}:${parsed.book}:${parsed.chapter}:${v}`;
        if (!requestedVersesRef.current.has(key)) {
          missing = true;
          toFetch.push(v);
        }
      }
    }
    if (!missing) return undefined;

    // Mark these verses as requested immediately to prevent duplicate fetches
    for (const v of toFetch) {
      const key = `${commentaryModal.translationId}:${parsed.book}:${parsed.chapter}:${v}`;
      requestedVersesRef.current.add(key);
    }

    let cancelled = false;
    const reqId = ++previewReqRef.current;
    setCommentaryModal(prev => prev ? { ...prev, previewLoading: true } : prev);
    (async () => {
      const fetched = await fetchRangeVerses(commentaryModal.translationId, parsed, start, end);
      if (cancelled || previewReqRef.current !== reqId) return;
      setCommentaryModal((prev) => {
        if (!prev) return prev;
        const fetchedMax = fetched.length ? Math.max(...fetched.map((v) => v.verse)) : 0;
        // If the API returned fewer verses than asked, we've hit the chapter end.
        const chapterMaxVerse = fetched.length && fetchedMax < end ? fetchedMax : prev.chapterMaxVerse;
        const versesAfter = chapterMaxVerse != null
          ? Math.min(prev.versesAfter, Math.max(0, chapterMaxVerse - focus))
          : prev.versesAfter;
        return {
          ...prev,
          chapterVerses: mergeVerses(prev.chapterVerses, fetched),
          chapterMaxVerse,
          versesAfter,
          previewLoading: false,
        };
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentaryModal?.baseVerseRef, commentaryModal?.translationId, commentaryModal?.versesBefore, commentaryModal?.versesAfter]);

  const commentaryView = commentaryModal ? computeCommentaryView(commentaryModal) : null;
  const commentaryDisplayRef = commentaryView?.displayRef ?? null;
  const commentaryPassageText = commentaryView
    ? commentaryView.passageText.replace(/\[[\d:]+\]/g, '').replace(/\s+/g, ' ').trim()
    : '';
  // Verse chips window: up to COMMENTARY_MAX_CONTEXT each side of the focus,
  // clamped to verse 1 and (once known) the chapter's last verse.
  const commentaryFocus = commentaryView?.focus ?? null;
  const commentaryChips = [];
  if (commentaryFocus != null) {
    const lo = Math.max(1, commentaryFocus - COMMENTARY_MAX_CONTEXT);
    let hi = commentaryFocus + COMMENTARY_MAX_CONTEXT;
    if (commentaryModal?.chapterMaxVerse != null) hi = Math.min(hi, commentaryModal.chapterMaxVerse);
    const rangeStart = commentaryFocus - (commentaryModal?.versesBefore ?? 0);
    const rangeEnd = commentaryFocus + (commentaryModal?.versesAfter ?? 0);
    for (let v = lo; v <= hi; v += 1) {
      commentaryChips.push({ verse: v, selected: v >= rangeStart && v <= rangeEnd, focus: v === commentaryFocus });
    }
  }
  // Tyndale study notes covering the currently selected commentary range.
  const tyndaleInRange = (commentaryFocus != null && tyndaleNotes?.status === 'loaded')
    ? tyndaleNotes.notes.filter((note) =>
      note.verse >= commentaryFocus - (commentaryModal?.versesBefore ?? 0)
      && note.verse <= commentaryFocus + (commentaryModal?.versesAfter ?? 0))
    : [];

  // ── Compare view: align the selected translations verse by verse ──────────
  // Row order follows the first loaded translation; translations that skip a
  // verse (or number it differently) just leave that cell empty.
  const compareRows = [];
  const compareMultiChapter = (() => {
    if (viewMode !== 'compare' || !results) return false;
    const fallbackChapter = firstChapterOf(results.ref);
    const rowsByKey = new Map();
    for (const t of compareTranslations) {
      if (t.status !== 'loaded' || !t.content) continue;
      for (const seg of splitContentVerses(t.content, fallbackChapter)) {
        const key = `${seg.chapter ?? ''}:${seg.verse ?? 'passage'}`;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, { chapter: seg.chapter, verse: seg.verse, cells: {} });
          compareRows.push(rowsByKey.get(key));
        }
        rowsByKey.get(key).cells[t.id] = seg.text;
      }
    }
    return new Set(compareRows.map((row) => row.chapter)).size > 1;
  })();

  return (
    <>
      {!pageMode && (
        <button
          className={`bible-lookup-fab ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen((v) => !v)}
          aria-label="Bible Lookup"
          title="Open Scripture Lookup"
        >
          <BookOpen size={22} />
        </button>
      )}

      {!pageMode && isOpen && <div className="bible-lookup-backdrop" onClick={() => setIsOpen(false)} />}

      <div className={`bible-lookup-panel ${pageMode ? 'page-mode open' : `${isOpen ? 'open' : ''} ${isMaximized ? 'maximized' : ''}`}`} ref={panelRef}>
        <div className="bible-lookup-header">
          <div className="bible-lookup-title">
            <BookOpen size={18} />
            <span>Scripture Lookup</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {isConfigured && (
              <button
                className={`bible-lookup-close${showHistory ? ' bl-active' : ''}`}
                onClick={() => setShowHistory(v => !v)}
                aria-label="Lookup history"
                title="Lookup history"
              >
                <Clock size={16} />
              </button>
            )}
            {!pageMode && (
              <button
                className="bible-lookup-close bible-lookup-maximize-btn"
                onClick={() => setIsMaximized((v) => !v)}
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            {!pageMode && (
              <button className="bible-lookup-close" onClick={() => setIsOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ── History Panel ── */}
        {showHistory && isConfigured && (
          <div className="bl-history-panel">
            <div className="bl-history-bar">
              <span className="bl-history-label">
                <Clock size={13} />
                Recent Lookups
              </span>
              {history.length > 0 && (
                <button className="bl-history-clear" onClick={handleClearHistory}>
                  <Trash2 size={13} />
                  Clear all
                </button>
              )}
            </div>
            {historyLoading ? (
              <div className="bl-history-loading"><Loader2 size={16} className="bl-spin" /></div>
            ) : history.length === 0 ? (
              <p className="bl-history-empty">No history yet — look up a passage to get started.</p>
            ) : (
              <ul className="bl-history-list">
                {history.map((item) => (
                  <li key={item.id} className="bl-history-item">
                    <button
                      className="bl-history-ref"
                      onClick={() => {
                        setQuery(item.reference);
                        lookupReference(item.reference);
                        setActiveTab('read');
                        setShowHistory(false);
                      }}
                    >
                      <BookOpen size={13} />
                      <span>{item.reference}</span>
                    </button>
                    <button
                      className="bl-history-delete"
                      onClick={() => handleDeleteHistoryItem(item)}
                      aria-label={`Remove ${item.reference} from history`}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="bible-lookup-tabs">
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'read' ? 'active' : ''}`}
            onClick={() => setActiveTab('read')}
          >
            <ScrollText size={16} className="bl-tab-icon" />
            <span className="bl-tab-label">Read</span>
          </button>
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={16} className="bl-tab-icon" />
            <span className="bl-tab-label">Search</span>
          </button>
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'context' ? 'active' : ''}`}
            onClick={openContext}
          >
            <Globe2 size={16} className="bl-tab-icon" />
            <span className="bl-tab-label">Context</span>
          </button>
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            <Sparkles size={16} className="bl-tab-icon" />
            <span className="bl-tab-label">Insights</span>
          </button>
          <button
            type="button"
            className={`bible-lookup-tab ${activeTab === 'words' ? 'active' : ''}`}
            onClick={() => setActiveTab('words')}
          >
            <Languages size={16} className="bl-tab-icon" />
            <span className="bl-tab-label">Words</span>
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

        {/* Wikidata Context Tab */}
        <div
          className="bible-lookup-tab-content bl-context-panel"
          style={{ display: activeTab === 'context' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div className="bl-context-body">
            {!results && (
              <p className="bible-lookup-hint">
                Look up a passage in the Read tab, then pull structured book, person, and place context from Wikidata.
              </p>
            )}

            {results && !wikidataContext && !wikidataLoading && !wikidataError && (
              <div className="bl-insights-prompt">
                <Globe2 size={28} className="bl-insights-icon" />
                <p className="bl-insights-prompt-ref">{results.ref}</p>
                <p className="bl-insights-prompt-desc">Find related books, people, and places from Wikidata's open knowledge graph.</p>
                <button
                  type="button"
                  className="bl-insights-fetch-btn"
                  onClick={fetchWikidataContext}
                  disabled={!isConfigured}
                >
                  <Globe2 size={15} />
                  Load Context
                </button>
                {!isConfigured && (
                  <p className="bible-lookup-notice" style={{ marginTop: '0.5rem' }}>Sign in to enable Wikidata context.</p>
                )}
              </div>
            )}

            {wikidataLoading && (
              <div className="bible-lookup-loading">
                <Loader2 size={20} className="bl-spin" />
                <span>Loading structured context from Wikidata...</span>
              </div>
            )}

            {wikidataError && (
              <div className="bl-insights-error">
                <p className="bible-lookup-parse-error">{wikidataError}</p>
                <button type="button" className="bl-insights-fetch-btn" onClick={fetchWikidataContext}>
                  Try Again
                </button>
              </div>
            )}

            {wikidataContext && (
              <div className="bl-context-result animate-fade-in">
                <div className="bl-insights-ref-bar">
                  <Globe2 size={14} />
                  <span>{results.ref} · Wikidata context</span>
                  <button
                    type="button"
                    className="bl-insights-refresh"
                    onClick={fetchWikidataContext}
                    disabled={wikidataLoading}
                    title="Refresh Wikidata context"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                {wikidataContext.entities?.length ? (
                  <div className="bl-context-grid">
                    {wikidataContext.entities.map((entity) => {
                      const Icon = entity.type === 'place'
                        ? MapPin
                        : entity.type === 'person'
                          ? Users
                          : entity.type === 'book'
                            ? BookOpen
                            : Landmark;
                      return (
                        <article key={entity.id} className={`bl-context-card bl-context-${entity.type}`}>
                          <div className="bl-context-card-main">
                            <div className="bl-context-card-top">
                              <span className="bl-context-type">
                                <Icon size={13} />
                                {entity.type}
                              </span>
                              <code>{entity.id}</code>
                            </div>
                            <h4>{entity.label}</h4>
                            <p>{entity.description}</p>
                            {wikiSummaries[entity.id]?.extract && wikiSummaries[entity.id].extract !== entity.description && (
                              <p className="bl-context-extract">{wikiSummaries[entity.id].extract}</p>
                            )}
                            {entity.aliases?.length > 0 && (
                              <span className="bl-context-aliases">{entity.aliases.join(', ')}</span>
                            )}
                            {entity.coordinates && (
                              <a
                                className="bl-context-map-link"
                                href={`https://www.openstreetmap.org/?mlat=${entity.coordinates.latitude}&mlon=${entity.coordinates.longitude}#map=9/${entity.coordinates.latitude}/${entity.coordinates.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MapPin size={12} />
                                Open map
                              </a>
                            )}
                            <div className="bl-context-links">
                              {entity.wikipediaUrl && (
                                <a href={entity.wikipediaUrl} target="_blank" rel="noreferrer">
                                  Wikipedia
                                  <ExternalLink size={11} />
                                </a>
                              )}
                              <a href={entity.wikidataUrl} target="_blank" rel="noreferrer">
                                Wikidata
                                <ExternalLink size={11} />
                              </a>
                            </div>
                            {entity.archaeologyLinks?.length > 0 && (
                              <div className="bl-context-resource-links" aria-label={`Research resources for ${entity.label}`}>
                                {entity.archaeologyLinks.map((link) => (
                                  <a key={`${entity.id}-${link.label}`} href={link.url} target="_blank" rel="noreferrer" title={link.note}>
                                    {link.label}
                                    <ExternalLink size={11} />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          {(entity.imageUrl || wikiSummaries[entity.id]?.thumbnail) && (
                            <img className="bl-context-image" src={entity.imageUrl || wikiSummaries[entity.id].thumbnail} alt="" loading="lazy" />
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bible-lookup-hint">No clear Wikidata matches were found for this passage yet.</p>
                )}

                {wikidataContext.resources?.length > 0 && (
                  <section className="bl-context-resources">
                    <h4>Research Resources</h4>
                    <div className="bl-context-resource-list">
                      {wikidataContext.resources.map((resource) => (
                        <a key={resource.label} href={resource.url} target="_blank" rel="noreferrer">
                          <span>{resource.label}</span>
                          <small>{resource.note}</small>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <p className="bl-context-attribution">
                  {wikidataContext.attribution || 'Data from Wikidata (CC0).'}
                  {Object.keys(wikiSummaries).length > 0 && ' Summaries from Wikipedia (CC BY-SA).'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Insights Tab ── */}
        <div
          className="bible-lookup-tab-content bl-insights-panel"
          style={{ display: activeTab === 'insights' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div className="bl-insights-body" ref={insightsBodyRef}>
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
              <div className="bl-insights-progress" role="status" aria-live="polite">
                <div className="bl-insights-progress-head">
                  <Loader2 size={18} className="bl-spin" />
                  <span>
                    {insightsAttempt > 1
                      ? 'Gemini is warming up — retrying…'
                      : 'Generating insights with Gemini…'}
                  </span>
                </div>
                <div
                  className="bl-insights-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(insightsProgress)}
                >
                  <div
                    className="bl-insights-progress-fill"
                    style={{ width: `${insightsProgress}%` }}
                  />
                </div>
                <span className="bl-insights-progress-hint">
                  This can take up to a minute for longer passages.
                </span>
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
                  <LinkedText
                    as="p"
                    className="bl-insights-text"
                    text={insights.historicalContext?.text || insights.historicalContext}
                    entityIndex={entityLinkIndex}
                    onRefClick={jumpToRef}
                  />
                  {insights.historicalContext?.confidence && (
                    <p className="bl-insights-support">
                      {insights.historicalContext.confidence} confidence · {insights.historicalContext.sourceIds?.join(', ')}
                    </p>
                  )}
                </section>

                {insights.literaryContext && (
                  <section className="bl-insights-section">
                    <h4 className="bl-insights-heading">Literary Context</h4>
                    <LinkedText
                      as="p"
                      className="bl-insights-text"
                      text={insights.literaryContext.text}
                      entityIndex={entityLinkIndex}
                      onRefClick={jumpToRef}
                    />
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
                          <LinkedText
                            text={typeof theme === 'string' ? theme : theme.theme}
                            entityIndex={entityLinkIndex}
                            onRefClick={jumpToRef}
                          />
                          {theme?.confidence && <span className="bl-insights-confidence">{theme.confidence}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="bl-insights-section">
                  <h4 className="bl-insights-heading">Interpretation</h4>
                  <LinkedText
                    as="p"
                    className="bl-insights-text"
                    text={insights.interpretation?.text || insights.commentary}
                    entityIndex={entityLinkIndex}
                    onRefClick={jumpToRef}
                  />
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
                    <LinkedText
                      as="p"
                      className="bl-insights-text"
                      text={insights.application}
                      entityIndex={entityLinkIndex}
                      onRefClick={jumpToRef}
                    />
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
                            onClick={() => jumpToRef(xref.reference)}
                          >
                            {xref.reference}
                          </button>
                          <LinkedText
                            as="span"
                            className="bl-insights-xref-desc"
                            text={xref.connection}
                            entityIndex={entityLinkIndex}
                            onRefClick={jumpToRef}
                          />
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
                            <LinkedText
                              as="span"
                              className="bl-insights-question-text"
                              text={q.question}
                              entityIndex={entityLinkIndex}
                              onRefClick={jumpToRef}
                            />
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
            <div className="bl-input-wrap">
              <input
                ref={inputRef}
                className="bible-lookup-input"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setParseError(''); }}
                placeholder="e.g. John 3:16  ·  Romans 8:28-30  ·  Psalm 23:1-6"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className="bl-input-clear"
                  onClick={() => { setQuery(''); setParseError(''); inputRef.current?.focus(); }}
                  aria-label="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="bible-lookup-search-btn" disabled={!query.trim()}>
              {anyFetching ? <Loader2 size={16} className="bl-spin" /> : <Search size={16} />}
            </button>
          </form>

          <ScriptureNavigator
            value={navSel}
            onSelect={openChapter}
            disabled={!isConfigured}
            containerRef={panelRef}
          />

          <p className="bl-sr-only" role="status" aria-live="polite">{focusNotice}</p>

          {parseError && <p className="bible-lookup-parse-error">{parseError}</p>}
          {!isConfigured && <p className="bible-lookup-notice">Sign in to enable inline scripture reading.</p>}

          {results && (
            <div className="bible-lookup-results animate-fade-in" ref={resultsScrollRef}>
              {passageSet && passageSet.refs.length > 1 && (() => {
                const total = passageSet.refs.length;
                const prevRef = passageSet.refs[(passageSet.index - 1 + total) % total];
                const nextRef = passageSet.refs[(passageSet.index + 1) % total];
                return (
                  <div className="bl-passage-set-nav" role="group" aria-label="Focus passages">
                    <button
                      type="button"
                      className="bl-passage-set-btn"
                      onClick={() => navigatePassageSet(-1)}
                      aria-label={`Previous focus passage: ${prevRef}`}
                      title={`Previous focus passage: ${prevRef}`}
                    >
                      <ChevronLeft size={15} />
                      <span className="bl-passage-set-label">
                        <span className="bl-passage-set-dir">Prev</span>
                        <span className="bl-passage-set-ref">{prevRef}</span>
                      </span>
                    </button>
                    <span className="bl-passage-set-count">
                      Focus passage {passageSet.index + 1} of {total}
                    </span>
                    <button
                      type="button"
                      className="bl-passage-set-btn bl-passage-set-btn-next"
                      onClick={() => navigatePassageSet(1)}
                      aria-label={`Next focus passage: ${nextRef}`}
                      title={`Next focus passage: ${nextRef}`}
                    >
                      <span className="bl-passage-set-label">
                        <span className="bl-passage-set-dir">Next</span>
                        <span className="bl-passage-set-ref">{nextRef}</span>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                );
              })()}
              <div className="bl-results-meta">
                <p className="bible-lookup-ref-label">{results.ref}</p>
                <p className="bl-word-hint">
                  Tap a verse number for AI commentary · tap an underlined word for Hebrew/Greek meaning.
                </p>
              </div>

              <div className="bl-translation-bar" role="group" aria-label="Choose translations">
                <div className="bl-trans-chips">
                  {translationsView.map((t) => {
                    const isHebrew = t.id === SEFARIA_HEBREW_ID;
                    if (isHebrew && !hebrewAvailable && viewMode === 'compare') return null;
                    const selected = viewMode === 'compare'
                      ? compareIds.includes(t.id)
                      : t.id === effectiveActiveId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`bl-trans-chip${selected ? ' selected' : ''}`}
                        onClick={() => (viewMode === 'compare' ? toggleCompareTranslation(t.id) : selectTranslation(t.id))}
                        aria-pressed={selected}
                        disabled={isHebrew && !hebrewAvailable}
                        title={isHebrew && !hebrewAvailable ? 'Original Hebrew is available for Old Testament passages' : `${t.label} · ${t.styleLabel}`}
                      >
                        {selected && t.status === 'loading' && <Loader2 size={11} className="bl-spin" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={`bl-compare-toggle${viewMode === 'compare' ? ' selected' : ''}`}
                  onClick={() => setMode(viewMode === 'compare' ? 'single' : 'compare')}
                  aria-pressed={viewMode === 'compare'}
                  title={viewMode === 'compare' ? 'Back to single translation' : `Compare up to ${COMPARE_MAX} translations verse by verse`}
                >
                  <Columns2 size={13} />
                  Compare
                </button>
              </div>

              {viewMode === 'single' && (
                <div className="bible-lookup-columns">
                  <div className={`bible-lookup-col bl-style-${activeTranslation.style}${activeTranslation.id === SEFARIA_HEBREW_ID ? ' bl-col-rtl' : ''}`}>
                    <div className="bl-col-header">
                      <span className="bl-col-label">{activeTranslation.label}</span>
                      <span className="bl-col-style">{activeTranslation.styleLabel}</span>
                      {activeTranslation.status === 'loaded' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {activeTranslation.id !== SEFARIA_HEBREW_ID && fishVoices.length > 0 && (
                            <select
                              className="bl-voice-select"
                              value={voiceChoice}
                              onChange={(e) => setVoiceChoice(e.target.value)}
                              disabled={speakingId === activeTranslation.id || ttsLoadingId === activeTranslation.id}
                              title="Choose narration voice"
                              aria-label="Narration voice"
                            >
                              <option value={KOKORO_VOICE}>Default voice</option>
                              {fishVoices.map((v) => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                              ))}
                            </select>
                          )}
                          {activeTranslation.id !== SEFARIA_HEBREW_ID && (
                          <button
                            type="button"
                            className={`bl-speak-btn ${speakingId === activeTranslation.id ? 'speaking' : ''}`}
                            onClick={() => handleSpeakTranslation(activeTranslation)}
                            title={speakingId === activeTranslation.id ? (ttsLoadingId === activeTranslation.id ? 'Loading voice…' : 'Stop playing') : `Read aloud (${activeTranslation.label})`}
                          >
                            {ttsLoadingId === activeTranslation.id ? (
                              <Loader2 size={13} className="bl-spin" />
                            ) : (
                              <Volume2 size={13} />
                            )}
                          </button>
                          )}
                          <button
                            type="button"
                            className={`bl-copy-btn ${copiedId === activeTranslation.id ? 'copied' : ''}`}
                            onClick={() => handleCopy(activeTranslation)}
                            title={copiedId === activeTranslation.id ? 'Copied!' : `Copy ${activeTranslation.label}`}
                          >
                            {copiedId === activeTranslation.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      )}
                    </div>
                    {activeTranslation.status === 'error' ? (
                      <div className="bl-col-unavailable-wrap">
                        <p className="bl-col-unavailable">Passage unavailable in this translation.</p>
                        <button type="button" className="bl-col-retry" onClick={() => retryTranslation(activeTranslation.id)}>
                          <RefreshCw size={13} />
                          Retry
                        </button>
                      </div>
                    ) : activeTranslation.status !== 'loaded' ? (
                      <div className="bl-col-loading">
                        <Loader2 size={15} className="bl-spin" />
                        <span>Loading {activeTranslation.label}…</span>
                      </div>
                    ) : (
                      <PassageText
                        content={activeTranslation.content}
                        wordMap={wordMap}
                        testament={testament}
                        selectedWord={wordStudy?.word}
                        onWordClick={handleWordClick}
                        onVerseClick={isConfigured ? (verseRef, verseText) => openCommentary(verseRef, verseText, activeTranslation.id, activeTranslation.label) : null}
                        baseRef={results.ref}
                        entityIndex={wikiIndex}
                        onEntityClick={(entity) => { setWordChoice(null); setEntityPeek(entity); }}
                        onAmbiguousClick={handleAmbiguousClick}
                        onDefineWord={isEnglishTranslation(activeTranslation.id) ? handleDefineWord : null}
                        focusVerse={focusVerse}
                        chapterOfFocus={navSel?.chapter ?? null}
                      />
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'compare' && (
                <div className="bl-compare">
                  {compareRows.map((row) => {
                    const label = row.verse == null
                      ? null
                      : (compareMultiChapter && row.chapter != null ? `${row.chapter}:${row.verse}` : `${row.verse}`);
                    const commentarySource = compareTranslations.find((t) => t.status === 'loaded' && row.cells[t.id]);
                    const rowIsFocus = focusVerse != null
                      && row.verse === focusVerse
                      && (row.chapter == null || navSel?.chapter == null || row.chapter === navSel.chapter);
                    return (
                      <div
                        key={`${row.chapter}:${row.verse}`}
                        className={`bl-compare-row${rowIsFocus ? ' bl-verse-focus' : ''}`}
                        data-verse={row.verse ?? undefined}
                        data-focus-verse={rowIsFocus ? 'true' : undefined}
                      >
                        {label && (isConfigured && commentarySource ? (
                          <button
                            type="button"
                            className="bl-compare-verse bl-compare-verse-btn"
                            onClick={() => openCommentary(
                              resolveVerseRef(results.ref, `[${row.chapter != null ? `${row.chapter}:${row.verse}` : row.verse}]`),
                              row.cells[commentarySource.id],
                              commentarySource.id,
                              commentarySource.label,
                            )}
                            title="AI commentary on this verse"
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="bl-compare-verse">{label}</span>
                        ))}
                        <div className="bl-compare-cells">
                          {compareTranslations.map((t) => (
                            <div key={t.id} className={`bl-compare-cell bl-style-${t.style}${t.id === SEFARIA_HEBREW_ID ? ' bl-col-rtl' : ''}`}>
                              <span className="bl-compare-cell-label">{t.label}</span>
                              {row.cells[t.id] ? (
                                <PassageText
                                  content={row.cells[t.id]}
                                  wordMap={wordMap}
                                  testament={testament}
                                  selectedWord={wordStudy?.word}
                                  onWordClick={handleWordClick}
                                  onVerseClick={null}
                                  baseRef={results.ref}
                                  entityIndex={wikiIndex}
                                  onEntityClick={(entity) => { setWordChoice(null); setEntityPeek(entity); }}
                                  onAmbiguousClick={handleAmbiguousClick}
                                  onDefineWord={isEnglishTranslation(t.id) ? handleDefineWord : null}
                                />
                              ) : (
                                <span className="bl-compare-cell-missing">
                                  {t.status === 'error' ? 'Unavailable' : t.status === 'loaded' ? '—' : ''}
                                  {(t.status === 'loading' || t.status === 'idle') && <Loader2 size={12} className="bl-spin" />}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {compareRows.length === 0 && (
                    <div className="bl-col-loading">
                      {compareTranslations.some((t) => t.status === 'loading' || t.status === 'idle') ? (
                        <>
                          <Loader2 size={15} className="bl-spin" />
                          <span>Loading translations…</span>
                        </>
                      ) : (
                        <span>Passage unavailable in the selected translations.</span>
                      )}
                    </div>
                  )}
                  {compareTranslations.some((t) => t.status === 'error') && compareRows.length > 0 && (
                    <p className="bl-compare-footnote">
                      {compareTranslations.filter((t) => t.status === 'error').map((t) => t.label).join(', ')} unavailable for this passage.
                      {' '}
                      <button
                        type="button"
                        className="bl-col-retry"
                        onClick={() => compareTranslations.filter((t) => t.status === 'error').forEach((t) => retryTranslation(t.id))}
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    </p>
                  )}
                </div>
              )}

              {wordChoice && (
                <div className="bl-entity-peek bl-word-choice">
                  <div className="bl-entity-peek-head">
                    <span className="bl-entity-peek-type person">
                      <Languages size={14} />
                    </span>
                    <div className="bl-entity-peek-main">
                      <strong>"{wordChoice.word}"</strong>
                      <span className="bl-entity-peek-meta">Word study, or about {wordChoice.entity.name}?</span>
                    </div>
                    <button
                      type="button"
                      className="bl-entity-peek-close"
                      onClick={() => setWordChoice(null)}
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="bl-word-choice-actions">
                    <button
                      type="button"
                      className="bl-entity-peek-open"
                      onClick={() => handleWordClick(wordChoice.word, wordChoice.entries)}
                    >
                      Word Study
                    </button>
                    <button
                      type="button"
                      className="bl-entity-peek-open bl-word-choice-entity"
                      onClick={() => { setWordChoice(null); setEntityPeek(wordChoice.entity); }}
                    >
                      About {wordChoice.entity.name}
                    </button>
                  </div>
                </div>
              )}

              {entityPeek && (
                <div className="bl-entity-peek">
                  <div className="bl-entity-peek-head">
                    <span className={`bl-entity-peek-type ${entityPeek.type}`}>
                      {entityPeek.type === 'person' ? <User size={14} /> : <MapPin size={14} />}
                    </span>
                    <div className="bl-entity-peek-main">
                      <strong>{entityPeek.name}</strong>
                      <span className="bl-entity-peek-meta">
                        {entityPeek.type === 'person'
                          ? `${entityPeek.vc} verses`
                          : `${entityPeek.p.length} chapters`}
                        {entityPeek.fv && passageIdToDisplay(entityPeek.fv)
                          ? ` · first at ${passageIdToDisplay(entityPeek.fv)}`
                          : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bl-entity-peek-close"
                      onClick={() => setEntityPeek(null)}
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {entityPeek.desc && <p className="bl-entity-peek-desc">{entityPeek.desc}</p>}
                  <button
                    type="button"
                    className="bl-entity-peek-open"
                    onClick={() => {
                      setEntityPeek(null);
                      setIsOpen(false);
                      navigate(`/wiki/${entityPeek.s}`);
                    }}
                  >
                    Open page
                  </button>
                </div>
              )}

              {visibleTranslations.some((t) => t.label === 'ESV' && t.status === 'loaded' && t.content) && (
                <div className="bl-esv-notice">
                  <p>
                    Scripture quotations marked ESV are from the ESV Bible (The Holy Bible, English Standard Version),
                    copyright 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.
                    The ESV text may not be quoted in any publication made available to the public by a Creative Commons license,
                    and may not be translated into any other language.
                  </p>
                  <p>
                    Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.
                    Visit <a href="https://www.esv.org/" target="_blank" rel="noreferrer">ESV.org</a>.
                  </p>
                </div>
              )}

              {results?.passageIds?.length > 0 && (() => {
                const castChapters = passageIdsToChapters(results.passageIds);
                if (!castChapters.length) return null;
                return (
                  <WikiCastStrip
                    chapters={castChapters}
                    title={castChapters.length > 1 ? "Who's in these chapters" : "Who's in this chapter"}
                    limit={8}
                    compact
                  />
                );
              })()}

              {(() => {
                const usable = getPrimaryPassage();
                return usable ? (
                  <div className="bl-passage-actions">
                    <button
                      type="button"
                      className="bl-inline-context-btn"
                      onClick={toggleCrossRefs}
                      disabled={!isConfigured || crossRefsLoading}
                    >
                      {crossRefsLoading ? <Loader2 size={14} className="bl-spin" /> : <Link2 size={14} />}
                      Cross References
                    </button>
                    {!esvAudioUrl && !esvAudioError && (
                      <button
                        type="button"
                        className="bl-inline-context-btn"
                        onClick={fetchEsvAudio}
                        disabled={!isConfigured || esvAudioLoading}
                        title="Listen to this passage read aloud (ESV narration)"
                      >
                        {esvAudioLoading ? <Loader2 size={14} className="bl-spin" /> : <Volume2 size={14} />}
                        Listen (ESV)
                      </button>
                    )}
                    <button
                      type="button"
                      className="bl-inline-context-btn"
                      onClick={() => setShowMap(true)}
                      title="Show places from this passage on a map"
                    >
                      <MapPin size={14} />
                      Map
                    </button>
                    <button
                      type="button"
                      className="bl-inline-context-btn"
                      onClick={handleMemorize}
                      disabled={!isConfigured || memorizeState === 'saving' || memorizeState === 'saved'}
                      title="Add this passage to your spaced-repetition memory deck (reviews appear on the Dashboard)"
                    >
                      {memorizeState === 'saving' ? <Loader2 size={14} className="bl-spin" /> : memorizeState === 'saved' ? <Check size={14} /> : <Brain size={14} />}
                      {memorizeState === 'saved' ? 'In your deck' : memorizeState === 'error' ? 'Retry Memorize' : 'Memorize'}
                    </button>
                    <button
                      type="button"
                      className="bl-inline-context-btn"
                      onClick={openContext}
                      disabled={!isConfigured || wikidataLoading}
                    >
                      {wikidataLoading ? <Loader2 size={14} className="bl-spin" /> : <Globe2 size={14} />}
                      {wikidataContext ? 'View Context' : 'Wikidata Context'}
                    </button>
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

              {esvAudioUrl && (
                <div className="bl-esv-audio animate-fade-in">
                  <audio controls autoPlay src={esvAudioUrl} style={{ width: '100%', height: '36px' }} />
                  <p className="bl-esv-audio-credit">ESV audio · Crossway</p>
                </div>
              )}
              {esvAudioError && (
                <p className="bl-crossrefs-empty" style={{ marginTop: '0.5rem' }}>ESV audio: {esvAudioError}</p>
              )}

              {showCrossRefs && !crossRefsLoading && (
                <div className="bl-crossrefs animate-fade-in">
                  <p className="bl-crossrefs-title">
                    <Link2 size={13} /> Cross References
                    <span className="bl-crossrefs-credit">openbible.info · CC-BY</span>
                  </p>
                  {(!crossRefs || crossRefs.length === 0) && (
                    <p className="bl-crossrefs-empty">No cross references found for this passage.</p>
                  )}
                  {(crossRefs || []).map((group) => (
                    <div key={group.fromRef} className="bl-crossrefs-group">
                      <span className="bl-crossrefs-from">{group.fromDisplay}</span>
                      <span className="bl-crossrefs-links">
                        {group.refs.map((r) => (
                          <button
                            key={r.toRef}
                            type="button"
                            className="bl-crossref-chip"
                            title={`${r.votes} helpfulness votes`}
                            onClick={() => { setQuery(r.lookupRef); lookupReference(r.lookupRef); }}
                          >
                            {r.display}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {navSel && (() => {
                // Rolls into the neighbouring book at a book edge; stepChapter
                // returns null past Genesis 1 / Revelation 22, and those ends
                // render nothing rather than a disabled stub.
                const prev = stepChapter(navSel.code, navSel.chapter, -1);
                const next = stepChapter(navSel.code, navSel.chapter, 1);
                const label = (t) => `${CODE_TO_NAME[t.code]} ${t.chapter}`;
                if (!prev && !next) return null;
                return (
                  <div className="bl-chapter-nav" role="group" aria-label="Chapter navigation">
                    {prev ? (
                      <button
                        type="button"
                        className="bl-chapter-nav-btn"
                        onClick={() => openChapter(prev.code, prev.chapter, null)}
                        aria-label={`Previous chapter: ${label(prev)}`}
                      >
                        <ChevronLeft size={15} />
                        <span>{label(prev)}</span>
                      </button>
                    ) : <span />}
                    {next ? (
                      <button
                        type="button"
                        className="bl-chapter-nav-btn bl-chapter-nav-next"
                        onClick={() => openChapter(next.code, next.chapter, null)}
                        aria-label={`Next chapter: ${label(next)}`}
                      >
                        <span>{label(next)}</span>
                        <ChevronRight size={15} />
                      </button>
                    ) : <span />}
                  </div>
                );
              })()}
            </div>
          )}

          {!results && !parseError && (
            <div className="bible-lookup-hint-block">
              <p className="bible-lookup-hint">
                Read any passage in your preferred translation — NASB, ESV, CSB, NLT, KJV, BSB, WEB, or Spanish Reina Valera — then tap Compare to see up to three side by side, verse by verse. Old Testament passages can also be read in the original Hebrew. Tap any underlined word to see its Hebrew or Greek meaning.
              </p>
              <Link to="/translation-guide" className="bible-lookup-guide-btn" onClick={() => setIsOpen(false)}>
                <BookOpen size={13} />
                Why does translation style matter?
              </Link>
            </div>
          )}

          {results && (
            <p className="bible-lookup-guide-footer">
              <Link to="/translation-guide" className="bible-lookup-guide-link" onClick={() => setIsOpen(false)}>
                About these translation styles →
              </Link>
            </p>
          )}

        </div>

        {/* ── Words tab (Hebrew & Greek Word Study) ── */}
        <div
          className="bible-lookup-tab-content bl-words-panel"
          style={{ display: activeTab === 'words' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div className="bl-words-body">
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

            {dictionaryResult && (
              <div className="bl-word-click-result animate-fade-in">
                <p className="bl-clicked-word">"{dictionaryResult.word}"</p>
                {dictionaryResult.status === 'loading' && (
                  <div className="bl-col-loading">
                    <Loader2 size={15} className="bl-spin" />
                    <span>Looking up definition…</span>
                  </div>
                )}
                {dictionaryResult.status === 'loaded' && !dictionaryResult.entry && (
                  <p className="bible-lookup-hint">No dictionary entry found for this word.</p>
                )}
                {dictionaryResult.entry && (
                  <div className="bl-dict-result">
                    {dictionaryResult.entry.phonetic && (
                      <p className="bl-dict-phonetic">{dictionaryResult.entry.phonetic}</p>
                    )}
                    {dictionaryResult.entry.meanings.map((meaning, i) => (
                      <div key={i} className="bl-dict-meaning">
                        <span className="bl-dict-pos">{meaning.partOfSpeech}</span>
                        <ol className="bl-dict-defs">
                          {meaning.definitions.map((def, j) => <li key={j}>{def}</li>)}
                        </ol>
                      </div>
                    ))}
                    <p className="bl-dict-credit">English dictionary · dictionaryapi.dev</p>
                  </div>
                )}
              </div>
            )}

            {!wordStudy && !strongsResult && !dictionaryResult && (
              <p className="bible-lookup-hint bl-strongs-hint">
                Tap any underlined word while reading to explore its original Hebrew or Greek meaning — other words show a plain English definition.
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
                          <p className="bl-strongs-translit">Transliteration: {strongsResult.xlit}</p>
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

      {/* ── Passage Map Modal ─────────────────────────────────── */}
      {showMap && results && (
        <PassageMap
          reference={results.ref}
          onClose={() => setShowMap(false)}
          onOpenPlace={async (name) => {
            const { loadBibleWikiFull } = await import('../lib/bibleWiki');
            const full = await loadBibleWikiFull();
            const match = full.entries.find((e) => e.type === 'place' && e.n === name);
            setShowMap(false);
            setIsOpen(false);
            navigate(match ? `/wiki/${match.s}` : `/wiki?q=${encodeURIComponent(name)}`);
          }}
        />
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
              <div className="bl-commentary-context-heading">
                <span className="bl-commentary-context-label">Verses to include</span>
                {commentaryModal.previewLoading && <Loader2 size={13} className="bl-spin" />}
              </div>
              <div className="bl-verse-strip" role="group" aria-label="Select verses to include">
                {commentaryChips.map((chip) => (
                  <button
                    key={chip.verse}
                    type="button"
                    className={`bl-verse-chip${chip.selected ? ' selected' : ''}${chip.focus ? ' focus' : ''}`}
                    onClick={() => setCommentaryRangeToVerse(chip.verse)}
                    disabled={commentaryModal.loading}
                    aria-pressed={chip.selected}
                    aria-label={chip.focus ? `Verse ${chip.verse} (focus) — tap to reset` : `Include through verse ${chip.verse}`}
                  >
                    {chip.verse}
                  </button>
                ))}
              </div>
              <p className="bl-commentary-context-note">
                Tap a verse to include up to it · tap the highlighted verse to reset.
              </p>
            </div>

            {(tyndaleNotes?.status === 'loading' || tyndaleInRange.length > 0) && (
              <div className="bl-tyndale-notes">
                <div className="bl-tyndale-heading">
                  <BookOpen size={13} />
                  <span>Tyndale Study Notes</span>
                  {tyndaleNotes?.status === 'loading' && <Loader2 size={12} className="bl-spin" />}
                </div>
                {tyndaleInRange.map((note) => (
                  <p key={note.verse} className="bl-tyndale-note">
                    <span className="bl-tyndale-verse">v.{note.verse}</span>
                    {note.text}
                  </p>
                ))}
                {tyndaleInRange.length > 0 && (
                  <p className="bl-tyndale-credit">Tyndale Open Study Notes · CC BY-SA 4.0</p>
                )}
              </div>
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
                    <p key={i} dangerouslySetInnerHTML={{ __html: escapeHtml(para).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
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

      <TtsLoadingToast
        open={!!ttsPending}
        voiceLabel={ttsPending?.voiceLabel}
        etaMs={ttsPending?.etaMs}
        startedAt={ttsPending?.startedAt}
        part={ttsPending?.part}
        totalParts={ttsPending?.totalParts}
        onCancel={stopSpeaking}
      />
    </>
  );
}
