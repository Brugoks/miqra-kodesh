// Client for the Sefaria API (sefaria.org) — keyless, CORS-open. Used to show
// the original Hebrew (Masoretic) text of Old Testament passages alongside the
// English translations in Scripture Lookup.

import { parsePassageId } from './helloao';

// USFM book code → Sefaria text name (Tanakh only).
export const CODE_TO_SEFARIA = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
  '1SA': 'I Samuel', '2SA': 'II Samuel', '1KI': 'I Kings', '2KI': 'II Kings',
  '1CH': 'I Chronicles', '2CH': 'II Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job',
  PSA: 'Psalms', PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Songs',
  ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel',
  HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah',
  MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah',
  HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi',
};

// Passage id → Sefaria tref ('JHN.3.16-JHN.3.18' style ids → 'Genesis 1:1-3').
// Returns null for non-Tanakh books.
export function passageIdToSefariaRef(passageId) {
  const parsed = parsePassageId(passageId);
  if (!parsed) return null;
  const name = CODE_TO_SEFARIA[parsed.book];
  if (!name) return null;
  if (parsed.from == null) return `${name} ${parsed.chapter}`;
  return parsed.from === parsed.to
    ? `${name} ${parsed.chapter}:${parsed.from}`
    : `${name} ${parsed.chapter}:${parsed.from}-${parsed.to}`;
}

function stripHtml(text) {
  return String(text).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Fetch the Hebrew text for one passage id, formatted with the same inline
// "[16]" / "[3:16]" verse markers the rest of the lookup pipeline expects.
export async function fetchSefariaPassage(passageId, implicitChapter) {
  const tref = passageIdToSefariaRef(passageId);
  if (!tref) throw new Error('Not a Tanakh passage');
  const parsed = parsePassageId(passageId);
  const res = await fetch(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(tref)}`);
  if (!res.ok) throw new Error(`Sefaria request failed (${res.status})`);
  const json = await res.json();
  const raw = json?.versions?.[0]?.text;
  const verses = Array.isArray(raw) ? raw.flat(2) : [raw];
  const startVerse = parsed.from ?? 1;
  const pieces = [];
  verses.forEach((verse, i) => {
    const text = verse ? stripHtml(verse) : '';
    if (!text) return;
    const number = startVerse + i;
    const marker = parsed.chapter === implicitChapter ? `[${number}]` : `[${parsed.chapter}:${number}]`;
    pieces.push(`${marker} ${text}`);
  });
  if (!pieces.length) throw new Error('No content');
  return pieces.join(' ');
}
