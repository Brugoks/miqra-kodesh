// Scripture engagement ledger — records which chapters a user touched, by
// source ('plan' | 'lookup'), one row per user/chapter/source/local-day.
// Only user-initiated actions are recorded: completing a reading-plan day
// and performing a Bible Lookup. The Dashboard daily verse and other
// passive displays are deliberately excluded.

import { supabase } from './supabaseClient';
import { BOOK_CHAPTERS, getPlan, getPlanChapters } from './readingPlans';
import { CODE_TO_NAME } from './scripture';

// 'JHN.3.16-JHN.3.18' | 'JHN.3.16' | 'PSA.23' → 'JHN.3' / 'PSA.23'.
// Passage ids from refToPassageIds never span chapters, so the start id
// alone names the chapter.
export function passageIdsToChapters(passageIds) {
  const chapters = new Set();
  for (const id of passageIds || []) {
    const [book, chapter] = String(id).split('-')[0].split('.');
    if (book && chapter && BOOK_CHAPTERS[book]) chapters.add(`${book}.${chapter}`);
  }
  return [...chapters];
}

// Local calendar date as 'YYYY-MM-DD' — engaged_on must reflect the user's
// day, not the server's UTC day.
export function localDateStr(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 'YYYY-MM-DD' → local-midnight Date (new Date('YYYY-MM-DD') would parse as
// UTC midnight and shift the day in negative-offset timezones).
export function parseLocalDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Idempotent write: the PK (user, book, chapter, source, engaged_on) makes
// repeat engagement the same day a no-op. Fire-and-forget at call sites —
// engagement recording must never break a lookup or a plan completion.
export async function recordEngagement(userId, chapterIds, source, engagedOn = localDateStr()) {
  if (!userId || !chapterIds?.length) return;
  const rows = chapterIds.map((id) => {
    const [book, chapter] = id.split('.');
    return { user_id: userId, book, chapter: Number(chapter), source, engaged_on: engagedOn };
  });
  await supabase.from('scripture_engagement').upsert(rows, {
    onConflict: 'user_id,book,chapter,source,engaged_on',
    ignoreDuplicates: true,
  });
}

// Per-book engagement rollup for the 66-book map. Plan coverage comes from
// reading_plan_progress expanded through the plan definitions (the existing
// source of truth); lookup coverage comes from scripture_engagement rows.
// planRows: [{ plan_id, day }], lookupChapterIds: ['JHN.3', ...].
export function getEngagedBooksProgress(planRows, lookupChapterIds) {
  const planByBook = {};
  for (const { plan_id: planId, day } of planRows || []) {
    const plan = getPlan(planId);
    if (!plan) continue;
    for (const id of getPlanChapters(plan, day)) {
      const [book, chapter] = id.split('.');
      if (!planByBook[book]) planByBook[book] = new Set();
      planByBook[book].add(Number(chapter));
    }
  }
  const lookupByBook = {};
  for (const id of lookupChapterIds || []) {
    const [book, chapter] = id.split('.');
    if (!BOOK_CHAPTERS[book]) continue;
    if (!lookupByBook[book]) lookupByBook[book] = new Set();
    lookupByBook[book].add(Number(chapter));
  }
  return Object.keys(BOOK_CHAPTERS).map((code) => {
    const planSet = planByBook[code] || new Set();
    const engagedSet = new Set([...planSet, ...(lookupByBook[code] || new Set())]);
    const total = BOOK_CHAPTERS[code];
    return {
      code,
      name: CODE_TO_NAME[code],
      total,
      planRead: planSet.size,
      engaged: engagedSet.size,
      done: planSet.size >= total,
      exploredOnly: planSet.size === 0 && engagedSet.size > 0,
    };
  });
}

const BACKFILL_KEY_PREFIX = 'engagementBackfill:v1:';

// One-time backfill of lookup engagement from scripture_lookup_history.
// That table keeps one row per reference with the *latest* lookup time, so
// backfilled days are approximate (last-known); everything recorded after
// this ships is exact. Guarded per user via localStorage, and idempotent
// anyway thanks to the upsert PK.
export async function backfillLookupEngagement(userId, refToChapters) {
  if (!userId) return;
  const key = `${BACKFILL_KEY_PREFIX}${userId}`;
  if (localStorage.getItem(key)) return;
  const { data, error } = await supabase
    .from('scripture_lookup_history')
    .select('reference, looked_up_at')
    .limit(1000);
  if (error) return; // retry next visit — flag stays unset
  const rows = [];
  for (const { reference, looked_up_at: lookedUpAt } of data || []) {
    const engagedOn = localDateStr(new Date(lookedUpAt));
    for (const id of refToChapters(reference)) {
      const [book, chapter] = id.split('.');
      rows.push({ user_id: userId, book, chapter: Number(chapter), source: 'lookup', engaged_on: engagedOn });
    }
  }
  if (rows.length) {
    const { error: upsertError } = await supabase.from('scripture_engagement').upsert(rows, {
      onConflict: 'user_id,book,chapter,source,engaged_on',
      ignoreDuplicates: true,
    });
    if (upsertError) return;
  }
  localStorage.setItem(key, '1');
}
