// Personal verse highlights — pure helpers shared by the reader and the
// highlights review surfaces. Anything touching Supabase lives in
// components/bible/useVerseHighlights.js; everything here is testable in
// isolation.

import { CODE_TO_NAME, CANONICAL_ORDER } from './scripture';

// Colors double as meaning. Naming them turns highlighting from decoration into
// lightweight inductive study (observation → interpretation → application),
// which is the difference between a pretty page and a usable one.
export const HIGHLIGHT_COLORS = [
  { key: 'gold', label: 'Promise', hint: 'Something God pledges' },
  { key: 'blue', label: 'Command', hint: 'Something to obey' },
  { key: 'green', label: 'Comfort', hint: 'Something that steadies you' },
  { key: 'rose', label: 'Conviction', hint: 'Something that convicts' },
  { key: 'violet', label: 'Question', hint: 'Something to dig into' },
];

export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0].key;

const COLOR_KEYS = new Set(HIGHLIGHT_COLORS.map((c) => c.key));

export function isValidColor(color) {
  return COLOR_KEYS.has(color);
}

export function colorLabel(color) {
  return HIGHLIGHT_COLORS.find((c) => c.key === color)?.label || 'Highlight';
}

// 'JHN.3.16' → { bookCode: 'JHN', chapter: 3, verse: 16 }; null when the id is
// not a single verse (bare chapters and ranges are never highlighted directly —
// the reader always resolves a tap to one verse).
export function parseVerseId(verseId) {
  if (typeof verseId !== 'string') return null;
  const parts = verseId.split('.');
  if (parts.length !== 3) return null;
  const [bookCode, rawChapter, rawVerse] = parts;
  if (!CODE_TO_NAME[bookCode]) return null;
  const chapter = Number(rawChapter);
  const verse = Number(rawVerse);
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  if (chapter < 1 || verse < 1) return null;
  return { bookCode, chapter, verse };
}

export function buildVerseId(bookCode, chapter, verse) {
  if (!CODE_TO_NAME[bookCode]) return null;
  if (!Number.isInteger(Number(chapter)) || !Number.isInteger(Number(verse))) return null;
  return `${bookCode}.${Number(chapter)}.${Number(verse)}`;
}

// 'JHN.3.16' → 'John 3:16'. null when unparseable.
export function verseIdToDisplay(verseId) {
  const parsed = parseVerseId(verseId);
  if (!parsed) return null;
  return `${CODE_TO_NAME[parsed.bookCode]} ${parsed.chapter}:${parsed.verse}`;
}

// Row → the shape the reader indexes by. Keeps component code free of column
// naming so a schema change lands in one place.
export function toHighlight(row) {
  if (!row?.verse_id) return null;
  return {
    id: row.id,
    verseId: row.verse_id,
    bookCode: row.book_code,
    chapter: row.chapter,
    verse: row.verse,
    color: isValidColor(row.color) ? row.color : DEFAULT_HIGHLIGHT_COLOR,
    note: row.note || '',
    verseText: row.verse_text || '',
    translation: row.translation || null,
    createdAt: row.created_at || null,
  };
}

export function indexByVerseId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const h = toHighlight(row);
    if (h) map.set(h.verseId, h);
  }
  return map;
}

// Canonical (Genesis → Revelation) ordering for a highlights list, so a review
// page reads like a Bible rather than a changelog.
const CANONICAL_INDEX = new Map(CANONICAL_ORDER.map((code, i) => [code, i]));

export function compareCanonical(a, b) {
  const ai = CANONICAL_INDEX.get(a.bookCode) ?? Number.MAX_SAFE_INTEGER;
  const bi = CANONICAL_INDEX.get(b.bookCode) ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  return a.verse - b.verse;
}

// Every verse id covered by a passage id, so the reader can fetch exactly the
// highlights the current view can display. Bare chapters return null: the
// caller should query by (book, chapter) instead of enumerating every verse.
export function versesCoveredBy(passageId) {
  const [startId, endId] = String(passageId || '').split('-');
  const start = parseVerseId(startId);
  if (!start) return null;
  if (!endId) return [startId];
  const end = parseVerseId(endId);
  if (!end || end.bookCode !== start.bookCode || end.chapter !== start.chapter) return [startId];
  if (end.verse < start.verse || end.verse - start.verse > 200) return [startId];
  const out = [];
  for (let v = start.verse; v <= end.verse; v += 1) out.push(`${start.bookCode}.${start.chapter}.${v}`);
  return out;
}

// The distinct (book, chapter) pairs a set of passage ids touches. This is what
// the reader actually queries on: one row per chapter beats one per verse, and
// it also covers bare-chapter lookups where the verse list is unknown.
export function chaptersCoveredBy(passageIds) {
  const seen = new Map();
  for (const passageId of passageIds || []) {
    for (const part of String(passageId).split('-')) {
      const segments = part.split('.');
      if (segments.length < 2) continue;
      const [bookCode, rawChapter] = segments;
      if (!CODE_TO_NAME[bookCode]) continue;
      const chapter = Number(rawChapter);
      if (!Number.isInteger(chapter)) continue;
      seen.set(`${bookCode}.${chapter}`, { bookCode, chapter });
    }
  }
  return [...seen.values()];
}
