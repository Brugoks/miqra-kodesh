// Reading plans generated from canonical chapter counts — no external data
// needed. Each plan spreads a fixed sequence of chapters evenly across its
// length; getPlanReadings(plan, day) returns human-readable chunks like
// "Matthew 1-3" that the Bible Lookup panel can open directly.

import { CODE_TO_NAME, BOOK_CHAPTERS, OT_ORDER, NT_ORDER } from './scripture';

// Canonical book data now lives in scripture.js (chapter paging needs it there
// without a circular import). Re-exported so existing importers of
// readingPlans' BOOK_CHAPTERS keep working.
export { BOOK_CHAPTERS };

function chaptersOf(books) {
  const chapters = [];
  for (const code of books) {
    for (let c = 1; c <= BOOK_CHAPTERS[code]; c += 1) chapters.push(`${code}.${c}`);
  }
  return chapters;
}

// Book-level chronological ordering (a standard simplification used by most
// "chronological Bible" reading plans — whole books are relocated to roughly
// where they belong historically; chapters within a book stay in canonical
// order). Same set of 66 codes as OT_ORDER + NT_ORDER, just reordered.
const CHRON_OT_ORDER = [
  'GEN', 'JOB', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1CH', 'PSA', 'PRO', 'ECC', 'SNG', '1KI', '2CH', 'OBA', 'JOL', 'JON', 'AMO',
  'HOS', 'ISA', 'MIC', 'NAM', '2KI', 'ZEP', 'HAB', 'JER', 'LAM', 'EZK', 'DAN',
  'EZR', 'HAG', 'ZEC', 'EST', 'NEH', 'MAL',
];
const CHRON_NT_ORDER = [
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'JAS', 'GAL', '1TH', '2TH', '1CO', '2CO',
  'ROM', 'EPH', 'PHP', 'COL', 'PHM', '1TI', 'TIT', '1PE', 'HEB', '2TI', '2PE',
  'JUD', '1JN', '2JN', '3JN', 'REV',
];
export const CHRON_ORDER = [...CHRON_OT_ORDER, ...CHRON_NT_ORDER];

// "Life of Jesus" harmony of the Gospels, at chapter granularity: a single
// pass through all 89 Gospel chapters ordered by narrative stage (birth →
// early ministry → Galilean ministry → Judean/Perean ministry → passion week
// → resurrection) instead of canonical book order. Each chapter appears
// exactly once — see readingPlans.test.js for the permutation check.
const LIFE_OF_JESUS_CHAPTERS = [
  'LUK.1', 'LUK.2', 'MAT.1', 'MAT.2', // birth & preparation
  'JHN.1', 'MAT.3', 'MRK.1', 'LUK.3', 'LUK.4', 'MAT.4', // preparation & early ministry
  'JHN.2', 'JHN.3', 'JHN.4', // early Judean ministry
  'MAT.5', 'MAT.6', 'MAT.7', 'MAT.8', 'MAT.9', 'MRK.2', 'MRK.3', 'LUK.5', 'LUK.6', // Galilean ministry I
  'MRK.4', 'MRK.5', 'MRK.6', 'LUK.7', 'LUK.8', 'MAT.10', 'MAT.11', 'MAT.12', 'MAT.13', // Galilean ministry II
  'JHN.5', 'JHN.6', 'MAT.14', 'MAT.15', 'MAT.16', 'MRK.7', 'MRK.8', 'MRK.9', 'LUK.9', // Galilean ministry III
  'MAT.17', 'MAT.18', 'JHN.7', 'JHN.8', 'JHN.9', 'JHN.10', // transfiguration onward
  'LUK.10', 'LUK.11', 'LUK.12', 'LUK.13', 'LUK.14', 'LUK.15', 'LUK.16', 'LUK.17', 'LUK.18', // Perean ministry
  'JHN.11', 'MAT.19', 'MAT.20', 'MRK.10', 'LUK.19', // final approach to Jerusalem
  'MAT.21', 'MAT.22', 'MAT.23', 'MAT.24', 'MRK.11', 'MRK.12', 'MRK.13', 'LUK.20', 'LUK.21', 'JHN.12', // passion week I
  'MAT.25', 'MAT.26', 'MRK.14', 'LUK.22', 'JHN.13', 'JHN.14', 'JHN.15', 'JHN.16', 'JHN.17', // upper room & Gethsemane
  'MAT.27', 'MRK.15', 'LUK.23', 'JHN.18', 'JHN.19', // trial & crucifixion
  'MAT.28', 'MRK.16', 'LUK.24', 'JHN.20', 'JHN.21', // resurrection & ascension
];

export const READING_PLANS = [
  {
    id: 'gospels-30',
    name: 'The Gospels in 30 Days',
    description: 'Matthew, Mark, Luke, and John — the life of Jesus in one month.',
    category: 'gospels',
    paceLabel: '~3 chapters/day',
    days: 30,
    chapters: chaptersOf(['MAT', 'MRK', 'LUK', 'JHN']),
  },
  {
    id: 'life-of-jesus-45',
    name: 'Life of Jesus (Chronological Gospels)',
    description: 'The four Gospels harmonized into one narrative, from birth to resurrection.',
    category: 'gospels',
    paceLabel: '~2 chapters/day',
    days: 45,
    chapters: LIFE_OF_JESUS_CHAPTERS,
  },
  {
    id: 'psalms-proverbs-31',
    name: 'Wisdom in 31 Days',
    description: 'Proverbs and selected Psalms — one month of daily wisdom.',
    category: 'wisdom',
    paceLabel: '~6 chapters/day',
    days: 31,
    chapters: chaptersOf(['PRO', 'PSA']).slice(0, 31 * 6), // Proverbs + Psalms 1-155ish, ~6 ch/day
  },
  {
    id: 'proverbs-31',
    name: "Proverbs in a Month",
    description: 'One chapter of Proverbs a day, matching the day of the month.',
    category: 'wisdom',
    paceLabel: '1 chapter/day',
    days: 31,
    chapters: chaptersOf(['PRO']),
  },
  {
    id: 'psalms-60',
    name: 'Psalms in 60 Days',
    description: 'The whole book of Psalms, two and a half chapters a day.',
    category: 'wisdom',
    paceLabel: '~2.5 chapters/day',
    days: 60,
    chapters: chaptersOf(['PSA']),
  },
  {
    id: 'torah-90',
    name: 'Torah in 90 Days',
    description: 'Genesis through Deuteronomy — the five books of Moses.',
    category: 'topical',
    paceLabel: '~1.5 chapters/day',
    days: 90,
    chapters: chaptersOf(['GEN', 'EXO', 'LEV', 'NUM', 'DEU']),
  },
  {
    id: 'pauls-letters-30',
    name: "Paul's Letters in 30 Days",
    description: "Romans through Philemon — Paul's letters to the early church.",
    category: 'topical',
    paceLabel: '~3 chapters/day',
    days: 30,
    chapters: chaptersOf(['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM']),
  },
  {
    id: 'nt-30',
    name: 'New Testament in 30 Days',
    description: 'The full New Testament at an aggressive daily pace.',
    category: 'topical',
    paceLabel: '~9 chapters/day (aggressive)',
    days: 30,
    chapters: chaptersOf(NT_ORDER),
  },
  {
    id: 'nt-90',
    name: 'New Testament in 90 Days',
    description: 'The full New Testament, about three chapters a day.',
    category: 'topical',
    paceLabel: '~3 chapters/day',
    days: 90,
    chapters: chaptersOf(NT_ORDER),
  },
  {
    id: 'bible-183',
    name: 'Bible in 6 Months',
    description: 'The whole Bible in canonical order, at a faster daily pace.',
    category: 'wholeBible',
    paceLabel: '~6.5 chapters/day',
    days: 183,
    chapters: chaptersOf([...OT_ORDER, ...NT_ORDER]),
  },
  {
    id: 'bible-365',
    name: 'Bible in a Year',
    description: 'The whole Bible in canonical order, about three chapters a day.',
    category: 'wholeBible',
    paceLabel: '~3 chapters/day',
    days: 365,
    chapters: chaptersOf([...OT_ORDER, ...NT_ORDER]),
  },
  {
    id: 'chronological-365',
    name: 'Chronological Bible in a Year',
    description: 'The whole Bible in the order events actually happened.',
    category: 'chronological',
    paceLabel: '~3 chapters/day',
    days: 365,
    chapters: chaptersOf(CHRON_ORDER),
  },
  {
    id: 'bible-730',
    name: 'Bible in 2 Years',
    description: 'The whole Bible in canonical order, at an easy, sustainable pace.',
    category: 'wholeBible',
    paceLabel: '~1.6 chapters/day',
    days: 730,
    chapters: chaptersOf([...OT_ORDER, ...NT_ORDER]),
  },
];

// Plans generated at runtime (e.g. Bible Wiki character plans, registered by
// ensureWikiPlans in lib/bibleWiki.js). Kept out of READING_PLANS so the plan
// browser's curated list stays curated; getPlan resolves both.
const dynamicPlans = new Map();

export function registerDynamicPlans(plans) {
  for (const plan of plans || []) {
    if (plan?.id) dynamicPlans.set(plan.id, plan);
  }
}

export function getPlan(planId) {
  return READING_PLANS.find((p) => p.id === planId) || dynamicPlans.get(planId) || null;
}

// Well-known single verses to suggest memorizing when a day's reading
// includes their chapter. Not exhaustive — just enough well-loved verses to
// make the suggestion feel apt rather than random.
export const MEMORY_VERSE_SUGGESTIONS = {
  'GEN.1': 'Genesis 1:1', 'EXO.20': 'Exodus 20:3', 'DEU.6': 'Deuteronomy 6:5',
  'JOS.1': 'Joshua 1:9', 'PSA.23': 'Psalms 23:1', 'PSA.46': 'Psalms 46:1',
  'PSA.100': 'Psalms 100:5', 'PSA.119': 'Psalms 119:105', 'PRO.3': 'Proverbs 3:5',
  'ISA.40': 'Isaiah 40:31', 'ISA.41': 'Isaiah 41:10', 'JER.29': 'Jeremiah 29:11',
  'MIC.6': 'Micah 6:8', 'MAT.5': 'Matthew 5:16', 'MAT.6': 'Matthew 6:33',
  'MAT.11': 'Matthew 11:28', 'MAT.28': 'Matthew 28:19', 'MRK.12': 'Mark 12:30',
  'LUK.2': 'Luke 2:11', 'JHN.1': 'John 1:1', 'JHN.3': 'John 3:16',
  'JHN.14': 'John 14:6', 'JHN.15': 'John 15:5', 'ACT.1': 'Acts 1:8',
  'ROM.5': 'Romans 5:8', 'ROM.8': 'Romans 8:28', 'ROM.12': 'Romans 12:2',
  '1CO.13': '1 Corinthians 13:4', '2CO.5': '2 Corinthians 5:17', 'GAL.2': 'Galatians 2:20',
  'EPH.2': 'Ephesians 2:8', 'PHP.4': 'Philippians 4:13', 'COL.3': 'Colossians 3:23',
  '1TH.5': '1 Thessalonians 5:16', '2TI.1': '2 Timothy 1:7', 'HEB.11': 'Hebrews 11:1',
  'HEB.12': 'Hebrews 12:1', 'JAS.1': 'James 1:2', '1PE.5': '1 Peter 5:7',
  '1JN.1': '1 John 1:9', '1JN.4': '1 John 4:19', 'REV.21': 'Revelation 21:4',
};

// First memory-verse suggestion matching any chapter in the given list, or null.
export function getMemoryVerseSuggestion(chapterIds) {
  for (const id of chapterIds) {
    if (MEMORY_VERSE_SUGGESTIONS[id]) return MEMORY_VERSE_SUGGESTIONS[id];
  }
  return null;
}

// The chapter ids assigned to a 1-based day. Hand-curated plans may set
// `explicitDays` (an array indexed by day-1 of chapter-id arrays) when an
// even split would land badly; everything else spreads `chapters` evenly.
export function getPlanChapters(plan, day) {
  if (plan.explicitDays) return plan.explicitDays[day - 1] || [];
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
// opts.graceDays: number of missed days the streak forgives, each requiring
// at least 7 days since the last grace use (so it can't be spent back-to-back).
export function computeStreak(completions, now = new Date(), opts = {}) {
  if (!completions?.length) return 0;
  const graceDays = opts.graceDays || 0;
  const days = new Set(
    completions.map((iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let streak = 0;
  let graceRemaining = graceDays;
  let daysSinceGrace = Infinity;
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" anchor
  while (days.has(key(cursor)) || (graceRemaining > 0 && daysSinceGrace >= 7)) {
    if (days.has(key(cursor))) {
      streak += 1;
      daysSinceGrace += 1;
    } else {
      graceRemaining -= 1;
      daysSinceGrace = 0;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Longest streak ever achieved (no grace — a simple lifetime best).
export function getBestStreak(completions) {
  if (!completions?.length) return 0;
  const dayNums = [...new Set(completions.map((iso) => {
    const d = new Date(iso);
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  }))].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < dayNums.length; i += 1) {
    run = dayNums[i] === dayNums[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Gentle pace signal for self-paced (flexible) enrollments: how the reader's
// current day compares to "one day per calendar day since starting."
// delta > 0 means ahead of pace, delta < 0 means behind — never surfaced as
// a scolding message, just an informational nudge.
export function getPaceStatus(enrollment, currentDay, plan, now = new Date()) {
  const started = startOfDay(new Date(enrollment.started_at));
  const daysSinceStart = Math.floor((startOfDay(now) - started) / DAY_MS) + 1;
  const expectedDay = Math.min(Math.max(daysSinceStart, 1), plan.days);
  return { expectedDay, delta: currentDay - expectedDay };
}

// Calendar-mode day <-> date mapping: day N is pinned to started_at + (N-1).
export function dateForDay(enrollment, day) {
  const started = startOfDay(new Date(enrollment.started_at));
  return new Date(started.getTime() + (day - 1) * DAY_MS);
}

export function dayForDate(enrollment, date, plan) {
  const started = startOfDay(new Date(enrollment.started_at));
  const day = Math.floor((startOfDay(date) - started) / DAY_MS) + 1;
  return Math.min(Math.max(day, 1), plan.days);
}

// Calendar-mode only: past days with no progress row, oldest first.
export function getMissedDays(enrollment, resolvedDays, plan, now = new Date()) {
  const todayDay = dayForDate(enrollment, now, plan);
  const missed = [];
  for (let day = 1; day < todayDay; day += 1) {
    if (!resolvedDays.has(day)) missed.push({ day, date: dateForDay(enrollment, day) });
  }
  return missed;
}

const COMPLETION_MILESTONES = [7, 30, 100, 365];
const STREAK_MILESTONES = [7, 30, 100, 365];
const PERCENT_MILESTONES = [25, 50, 75, 100];

// Milestones crossed between a "before" and "after" snapshot (called once
// per markDayDone). Returns [] most days — only fires the run the threshold
// is actually crossed, never re-fires on subsequent days past it.
export function detectMilestones(before, after) {
  const milestones = [];
  for (const n of COMPLETION_MILESTONES) {
    if (before.totalCompleted < n && after.totalCompleted >= n) {
      milestones.push({ type: 'total', value: n, label: `${n} days read` });
    }
  }
  for (const n of STREAK_MILESTONES) {
    if (before.streak < n && after.streak >= n) {
      milestones.push({ type: 'streak', value: n, label: `${n}-day streak` });
    }
  }
  for (const n of PERCENT_MILESTONES) {
    if (before.percent < n && after.percent >= n) {
      milestones.push({ type: 'percent', value: n, label: n === 100 ? 'Plan complete' : `${n}% of the plan` });
    }
  }
  return milestones;
}

// Book codes fully read across the given completed days of a plan.
export function getBooksCompleted(plan, completedDays) {
  const readChapters = new Set();
  for (const day of completedDays) {
    for (const id of getPlanChapters(plan, day)) readChapters.add(id);
  }
  const totalByBook = {};
  for (const id of plan.chapters) {
    const [code] = id.split('.');
    totalByBook[code] = (totalByBook[code] || 0) + 1;
  }
  return Object.keys(totalByBook).filter((code) => {
    const chaptersOfBook = plan.chapters.filter((id) => id.startsWith(`${code}.`));
    return chaptersOfBook.every((id) => readChapters.has(id));
  });
}

// Lifetime chapter coverage across every plan ever read, keyed by book code
// (a Set of chapter numbers covered) — the basis for the 66-book progress
// map. rows: [{ plan_id, day }] (already filtered to non-skipped).
export function getLifetimeChaptersRead(rows) {
  const byBook = {};
  for (const { plan_id: planId, day } of rows) {
    const plan = getPlan(planId);
    if (!plan) continue;
    for (const id of getPlanChapters(plan, day)) {
      const [code, num] = id.split('.');
      if (!byBook[code]) byBook[code] = new Set();
      byBook[code].add(Number(num));
    }
  }
  return byBook;
}

export function getLifetimeBooksProgress(rows) {
  const byBook = getLifetimeChaptersRead(rows);
  return Object.keys(BOOK_CHAPTERS).map((code) => {
    const readSet = byBook[code] || new Set();
    return {
      code,
      name: CODE_TO_NAME[code],
      read: readSet.size,
      total: BOOK_CHAPTERS[code],
      done: readSet.size >= BOOK_CHAPTERS[code],
    };
  });
}

// One entry per day for the last `weeks` weeks, oldest first, for a GitHub-
// style completion heatmap.
export function getHeatmapDays(completions, weeks = 12, now = new Date()) {
  const counts = {};
  for (const iso of completions) {
    const d = new Date(iso);
    counts[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] = (counts[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] || 0) + 1;
  }
  const totalDays = weeks * 7;
  const cursor = startOfDay(now);
  cursor.setDate(cursor.getDate() - (totalDays - 1));
  const days = [];
  for (let i = 0; i < totalDays; i += 1) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    days.push({ date: new Date(cursor), count: counts[key] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
