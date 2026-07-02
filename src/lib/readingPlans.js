// Reading plans generated from canonical chapter counts — no external data
// needed. Each plan spreads a fixed sequence of chapters evenly across its
// length; getPlanReadings(plan, day) returns human-readable chunks like
// "Matthew 1-3" that the Bible Lookup panel can open directly.

import { CODE_TO_NAME } from './scripture';

export const BOOK_CHAPTERS = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4,
  '1SA': 31, '2SA': 24, '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36,
  EZR: 10, NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31, ECC: 12, SNG: 8,
  ISA: 66, JER: 52, LAM: 5, EZK: 48, DAN: 12, HOS: 14, JOL: 3, AMO: 9,
  OBA: 1, JON: 4, MIC: 7, NAM: 3, HAB: 3, ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16, '1CO': 16, '2CO': 13,
  GAL: 6, EPH: 6, PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6, '2TI': 4,
  TIT: 3, PHM: 1, HEB: 13, JAS: 5, '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1,
  '3JN': 1, JUD: 1, REV: 22,
};

const OT_ORDER = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
];
const NT_ORDER = [
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

function chaptersOf(books) {
  const chapters = [];
  for (const code of books) {
    for (let c = 1; c <= BOOK_CHAPTERS[code]; c += 1) chapters.push(`${code}.${c}`);
  }
  return chapters;
}

export const READING_PLANS = [
  {
    id: 'gospels-30',
    name: 'The Gospels in 30 Days',
    description: 'Matthew, Mark, Luke, and John — the life of Jesus in one month.',
    days: 30,
    chapters: chaptersOf(['MAT', 'MRK', 'LUK', 'JHN']),
  },
  {
    id: 'psalms-proverbs-31',
    name: 'Wisdom in 31 Days',
    description: 'Proverbs and selected Psalms — one month of daily wisdom.',
    days: 31,
    chapters: chaptersOf(['PRO', 'PSA']).slice(0, 31 * 6), // Proverbs + Psalms 1-155ish, ~6 ch/day
  },
  {
    id: 'nt-90',
    name: 'New Testament in 90 Days',
    description: 'The full New Testament, about three chapters a day.',
    days: 90,
    chapters: chaptersOf(NT_ORDER),
  },
  {
    id: 'bible-365',
    name: 'Bible in a Year',
    description: 'The whole Bible in canonical order, about three chapters a day.',
    days: 365,
    chapters: chaptersOf([...OT_ORDER, ...NT_ORDER]),
  },
];

export function getPlan(planId) {
  return READING_PLANS.find((p) => p.id === planId) || null;
}

// The chapter ids assigned to a 1-based day, distributed evenly.
export function getPlanChapters(plan, day) {
  const total = plan.chapters.length;
  const start = Math.floor(((day - 1) * total) / plan.days);
  const end = Math.floor((day * total) / plan.days);
  return plan.chapters.slice(start, end);
}

// Group a day's chapters into readable, lookup-able chunks per book:
// ['MAT.1','MAT.2','MAT.3'] → [{ label: 'Matthew 1-3', ref: 'Matthew 1' }]
// (ref opens the first chapter; readers continue naturally from there).
export function getPlanReadings(plan, day) {
  const chapters = getPlanChapters(plan, day);
  const chunks = [];
  for (const id of chapters) {
    const [code, chapterStr] = id.split('.');
    const chapter = parseInt(chapterStr, 10);
    const last = chunks[chunks.length - 1];
    if (last && last.code === code && chapter === last.endChapter + 1) {
      last.endChapter = chapter;
    } else {
      chunks.push({ code, startChapter: chapter, endChapter: chapter });
    }
  }
  return chunks.map((chunk) => ({
    label: chunk.startChapter === chunk.endChapter
      ? `${CODE_TO_NAME[chunk.code]} ${chunk.startChapter}`
      : `${CODE_TO_NAME[chunk.code]} ${chunk.startChapter}-${chunk.endChapter}`,
    ref: `${CODE_TO_NAME[chunk.code]} ${chunk.startChapter}`,
  }));
}

// Current streak: consecutive calendar days with at least one completion,
// counting back from today (or yesterday, so an unfinished today doesn't
// break the streak). completions: array of ISO timestamps.
export function computeStreak(completions, now = new Date()) {
  if (!completions?.length) return 0;
  const days = new Set(
    completions.map((iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let streak = 0;
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" anchor
  while (days.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
