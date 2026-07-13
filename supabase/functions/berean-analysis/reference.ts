// Scripture reference parsing: canonical book name → USFM passage id.
// Pure functions — no Deno APIs — so they are unit-testable (reference.test.js).

export const NAME_TO_CODE: Record<string, string> = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU',
  'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA',
  '1 Kings': '1KI', '2 Kings': '2KI', '1 Chronicles': '1CH', '2 Chronicles': '2CH',
  'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB', 'Psalms': 'PSA',
  'Psalm': 'PSA', 'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Solomon': 'SNG',
  'Song of Songs': 'SNG', 'Isaiah': 'ISA', 'Jeremiah': 'JER', 'Lamentations': 'LAM',
  'Ezekiel': 'EZK', 'Daniel': 'DAN', 'Hosea': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO',
  'Obadiah': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB',
  'Zephaniah': 'ZEP', 'Haggai': 'HAG', 'Zechariah': 'ZEC', 'Malachi': 'MAL',
  'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK', 'John': 'JHN', 'Acts': 'ACT',
  'Romans': 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO', 'Galatians': 'GAL',
  'Ephesians': 'EPH', 'Philippians': 'PHP', 'Colossians': 'COL',
  '1 Thessalonians': '1TH', '2 Thessalonians': '2TH', '1 Timothy': '1TI', '2 Timothy': '2TI',
  'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB', 'James': 'JAS',
  '1 Peter': '1PE', '2 Peter': '2PE', '1 John': '1JN', '2 John': '2JN', '3 John': '3JN',
  'Jude': 'JUD', 'Revelation': 'REV',
};

// Books with a single chapter: "Jude 5" means Jude 1:5, not chapter 5.
const SINGLE_CHAPTER_CODES = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

export type ParsedRef = { code: string; book: string; chapter: number; startVerse?: number; endVerse?: number };

function lookupBook(bookRaw: string): string | null {
  const bookKey = Object.keys(NAME_TO_CODE).find(
    (name) => name.toLowerCase() === bookRaw.toLowerCase(),
  );
  return bookKey || null;
}

// 'John 3:16', 'John 3:16-18', '1 Corinthians 13', 'Psalm 23', and for
// single-chapter books 'Jude 5' / 'Jude 5-7' (verse, not chapter).
// null if unparseable.
export function parseReference(raw: string): ParsedRef | null {
  const cleaned = raw.trim().replace(/[.]$/, '').replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d?\s?[A-Za-z ]+?)\s+(\d{1,3})(?::(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?$/);
  if (match) {
    const bookKey = lookupBook(match[1].trim());
    if (!bookKey) return null;
    const code = NAME_TO_CODE[bookKey];
    const chapter = Number(match[2]);
    const startVerse = match[3] ? Number(match[3]) : undefined;
    const endVerse = match[4] ? Number(match[4]) : startVerse;
    if (!chapter || chapter < 1) return null;
    // "Jude 5" without a colon is a verse of the book's only chapter.
    if (SINGLE_CHAPTER_CODES.has(code) && startVerse === undefined && chapter !== 1) {
      return { code, book: bookKey, chapter: 1, startVerse: chapter, endVerse: chapter };
    }
    return { code, book: bookKey, chapter, startVerse, endVerse };
  }
  // "Jude 5-7": a verse range in a single-chapter book has no colon, so the
  // main pattern (which requires ':' before a range) does not match it.
  const singleRange = cleaned.match(/^(\d?\s?[A-Za-z ]+?)\s+(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
  if (singleRange) {
    const bookKey = lookupBook(singleRange[1].trim());
    if (!bookKey || !SINGLE_CHAPTER_CODES.has(NAME_TO_CODE[bookKey])) return null;
    const startVerse = Number(singleRange[2]);
    const endVerse = Number(singleRange[3]);
    if (!startVerse || endVerse < startVerse) return null;
    return { code: NAME_TO_CODE[bookKey], book: bookKey, chapter: 1, startVerse, endVerse };
  }
  return null;
}

export function toPassageId(ref: ParsedRef, contextVerses: number): string {
  if (!ref.startVerse) return `${ref.code}.${ref.chapter}`;
  const start = Math.max(1, ref.startVerse - contextVerses);
  const end = (ref.endVerse ?? ref.startVerse) + contextVerses;
  if (start === end) return `${ref.code}.${ref.chapter}.${start}`;
  return `${ref.code}.${ref.chapter}.${start}-${ref.code}.${ref.chapter}.${end}`;
}
