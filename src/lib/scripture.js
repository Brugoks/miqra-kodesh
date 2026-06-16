// Canonical Bible book data + reference parsing, shared by BibleLookup (lookup) and
// scriptureLinker (app-wide auto-detection) so detection and loading never disagree.

export const BOOK_ABBR = {
  'genesis': 'GEN', 'gen': 'GEN', 'exodus': 'EXO', 'ex': 'EXO', 'exo': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV', 'numbers': 'NUM', 'num': 'NUM',
  'deuteronomy': 'DEU', 'deut': 'DEU', 'deu': 'DEU',
  'joshua': 'JOS', 'jos': 'JOS', 'josh': 'JOS', 'judges': 'JDG', 'jdg': 'JDG', 'judg': 'JDG',
  'ruth': 'RUT', 'rut': 'RUT',
  '1 samuel': '1SA', '1sa': '1SA', '1 sam': '1SA', '2 samuel': '2SA', '2sa': '2SA', '2 sam': '2SA',
  '1 kings': '1KI', '1ki': '1KI', '1 kgs': '1KI', '2 kings': '2KI', '2ki': '2KI', '2 kgs': '2KI',
  '1 chronicles': '1CH', '1 chron': '1CH', '1 chr': '1CH', '2 chronicles': '2CH', '2 chron': '2CH', '2 chr': '2CH',
  'ezra': 'EZR', 'nehemiah': 'NEH', 'neh': 'NEH', 'esther': 'EST', 'esth': 'EST', 'job': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'ecclesiastes': 'ECC', 'eccl': 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA', 'jeremiah': 'JER', 'jer': 'JER',
  'lamentations': 'LAM', 'lam': 'LAM', 'ezekiel': 'EZK', 'ezek': 'EZK', 'daniel': 'DAN', 'dan': 'DAN',
  'hosea': 'HOS', 'joel': 'JOL', 'amos': 'AMO', 'obadiah': 'OBA', 'obad': 'OBA',
  'jonah': 'JON', 'micah': 'MIC', 'nahum': 'NAM', 'habakkuk': 'HAB', 'hab': 'HAB',
  'zephaniah': 'ZEP', 'zeph': 'ZEP', 'haggai': 'HAG', 'zechariah': 'ZEC', 'zech': 'ZEC', 'malachi': 'MAL', 'mal': 'MAL',
  'matthew': 'MAT', 'mat': 'MAT', 'matt': 'MAT', 'mark': 'MRK', 'mrk': 'MRK', 'mk': 'MRK',
  'luke': 'LUK', 'luk': 'LUK', 'lk': 'LUK', 'john': 'JHN', 'jhn': 'JHN', 'jn': 'JHN',
  'acts': 'ACT', 'act': 'ACT', 'romans': 'ROM', 'rom': 'ROM',
  '1 corinthians': '1CO', '1co': '1CO', '1 cor': '1CO', '2 corinthians': '2CO', '2co': '2CO', '2 cor': '2CO',
  'galatians': 'GAL', 'gal': 'GAL', 'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'php': 'PHP', 'colossians': 'COL', 'col': 'COL',
  '1 thessalonians': '1TH', '1 thess': '1TH', '2 thessalonians': '2TH', '2 thess': '2TH',
  '1 timothy': '1TI', '1 tim': '1TI', '2 timothy': '2TI', '2 tim': '2TI', 'titus': 'TIT', 'philemon': 'PHM', 'phlm': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB', 'james': 'JAS', 'jas': 'JAS',
  '1 peter': '1PE', '1 pet': '1PE', '2 peter': '2PE', '2 pet': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN',
  'jude': 'JUD', 'revelation': 'REV', 'revelations': 'REV', 'rev': 'REV',
};

export const NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
]);

function cleanBookName(rawBook) {
  return rawBook.toLowerCase().replace(/\.(?=\s|$)/g, '').trim();
}

function verseToPassageId(code, chapter, versePart) {
  const match = String(versePart).trim().match(/^(\d{1,3})(?:[\u2013-](\d{1,3}))?$/);
  if (!match) return null;
  const [, startV, endV] = match;
  const start = `${code}.${chapter}.${startV}`;
  return endV ? `${start}-${code}.${chapter}.${endV}` : start;
}

export function refToPassageIds(ref) {
  const normalized = normalizeReference(ref);
  const first = normalized.match(/^(.+?)\s+(\d{1,3}):(\d{1,3}(?:[\u2013-]\d{1,3})?)(.*)$/);
  if (!first) {
    const chapterMatch = normalized.match(/^(.+?)\s+(\d{1,3})$/);
    if (chapterMatch) {
      const [, rawBook, chapter] = chapterMatch;
      const code = BOOK_ABBR[cleanBookName(rawBook)];
      if (!code) return [];
      return [`${code}.${chapter}`];
    }
    return [];
  }

  const [, rawBook, firstChapter, firstVerse, tail] = first;
  const code = BOOK_ABBR[cleanBookName(rawBook)];
  if (!code) return [];

  const passageIds = [];
  let currentChapter = firstChapter;
  const firstId = verseToPassageId(code, currentChapter, firstVerse);
  if (!firstId) return [];
  passageIds.push(firstId);

  const parts = tail
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const chapterVerse = part.match(/^(\d{1,3}):(\d{1,3}(?:[\u2013-]\d{1,3})?)$/);
    if (chapterVerse) {
      currentChapter = chapterVerse[1];
      const id = verseToPassageId(code, currentChapter, chapterVerse[2]);
      if (!id) return [];
      passageIds.push(id);
      continue;
    }

    const sameChapterVerse = part.match(/^(\d{1,3}(?:[\u2013-]\d{1,3})?)$/);
    if (sameChapterVerse) {
      const id = verseToPassageId(code, currentChapter, sameChapterVerse[1]);
      if (!id) return [];
      passageIds.push(id);
      continue;
    }

    return [];
  }

  return passageIds;
}

export function refToPassageId(ref) {
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

export function getTestament(ref) {
  const pid = refToPassageId(ref);
  if (!pid) return 'both';
  return NT_BOOKS.has(pid.split('.')[0]) ? 'NT' : 'OT';
}

// ── Detection regex for auto-linking ──────────────────────────────────────────
// Built from the longest book keys first so "Song of Solomon" wins over "Song",
// and "1 Corinthians" over "1". Requires an explicit chapter:verse so it only
// matches things refToPassageId can actually load (and to avoid false positives
// on bare "Mark 3" style name+number text).
const BOOK_ALTERNATION = Object.keys(BOOK_ABBR)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

// Groups: book, then chapter:verse(-verse). Trailing (?!\d) avoids partial numbers.
export const SCRIPTURE_REGEX = new RegExp(
  `\\b(${BOOK_ALTERNATION})\\.?\\s+\\d{1,3}:\\d{1,3}(?:[–-]\\d{1,3})?(?!\\d)`,
  'gi',
);

// Normalize a matched reference into a clean, loadable string ("Jn. 3:16" → "Jn 3:16").
export const SCRIPTURE_CHAIN_REGEX = new RegExp(
  `\\b(${BOOK_ALTERNATION})\\.?\\s+\\d{1,3}:\\d{1,3}(?:[\u2013-]\\d{1,3})?(?:\\s*[;,]\\s*(?:\\d{1,3}:)?\\d{1,3}(?:[\u2013-]\\d{1,3})?)*(?!\\d)`,
  'gi',
);

export function normalizeReference(raw) {
  return raw.replace(/\.(?=\s)/g, '').replace(/\s+/g, ' ').trim();
}

// USFM code → canonical display name, for building human-readable / search-friendly book names.
export const CODE_TO_NAME = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs',
  ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations',
  EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah',
  JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai',
  ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John',
  ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians',
  EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians',
  '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
  '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
};

// Resolve the canonical book name from a reference or a bare book string.
// "Jn 1:1" → "John", "1 Cor 13" → "1 Corinthians", "genesis" → "Genesis". null if unknown.
export function bookNameFromRef(ref) {
  if (!ref) return null;
  const m = ref.trim().match(/^(.+?)\s+\d/);
  const raw = (m ? m[1] : ref).trim().toLowerCase();
  const code = BOOK_ABBR[raw];
  return code ? CODE_TO_NAME[code] : null;
}
