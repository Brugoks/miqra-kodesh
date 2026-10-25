// "Hear it in a sermon": lets a Living Canvas moment meet the sermons its own
// church has recently heard.
//
// The sermon side is prepared in advance (sermon_talks.canvas_insights, built by
// the sermon-berean-review skill from the sermon alone). Everything that touches
// a person's moment happens HERE, on their device and at their request:
//   - matching a moment to insights compares passage references only (no AI, no
//     network beyond reading the church's own published talks);
//   - nothing from a canvas is read by any server job, and the only thing that
//     ever leaves the device is what the person sends by pressing the AI button.

import { supabase } from './supabaseClient';
import { normalizeSermonSource } from './canvasJourney';
import { refToPassageIds, splitScriptureReferences } from './scripture';

export const RECENT_TALKS = 12;
export const MAX_INSIGHTS_PER_TALK = 6;
const WHOLE_CHAPTER = 999;

const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const validAt = (value) => typeof value === 'string' && /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(value) && value.length <= 8;

/** Verse ranges a reference covers: [{ book, chapter, from, to }]. A bare chapter covers all of it. */
export function spansOf(reference) {
  const spans = [];
  for (const id of refToPassageIds(reference || '')) {
    const [start, end] = id.split('-');
    const [book, chapter, verse] = start.split('.');
    if (!verse) { spans.push({ book, chapter: Number(chapter), from: 1, to: WHOLE_CHAPTER }); continue; }
    const [, endChapter, endVerse] = end ? end.split('.') : [];
    spans.push({ book, chapter: Number(chapter), from: Number(verse), to: !end ? Number(verse) : endChapter === chapter ? Number(endVerse) : WHOLE_CHAPTER });
  }
  return spans;
}
const overlap = (a, b) => a.book === b.book && a.chapter === b.chapter && a.from <= b.to && b.from <= a.to;
const isWholeChapter = (span) => span.from === 1 && span.to === WHOLE_CHAPTER;

function normalizeInsight(item) {
  if (!item || !text(item.id, 16) || !text(item.anchor, 100) || !text(item.claim, 280) || !text(item.question, 240) || !spansOf(item.anchor).length) return null;
  const refs = (Array.isArray(item.refs) ? item.refs : []).filter((ref) => text(ref, 100) && spansOf(ref).length).slice(0, 4);
  const quote = item.quote && text(item.quote.text, 400) ? { text: item.quote.text, at: validAt(item.quote.at) ? item.quote.at : null } : null;
  return { id: item.id, anchor: item.anchor, refs, claim: item.claim, question: item.question, quote };
}

/** A pack as stored on a talk, or null. Anything unreadable is dropped, never guessed at. */
export function normalizeInsightPack(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.insights)) return null;
  const insights = value.insights.slice(0, MAX_INSIGHTS_PER_TALK).map(normalizeInsight).filter(Boolean);
  return insights.length ? { insights } : null;
}

const talkSummary = (talk) => ({ id: talk.id, title: talk.title, speaker: talk.speaker_name || '', date: talk.talk_date || '', videoUrl: talk.video_url || '' });

/** The church's recent published talks that carry an insight pack. Row-level security scopes this to the member's own organization. */
export async function loadRecentInsightTalks(orgId, signal) {
  if (!supabase || !orgId) return [];
  let query = supabase.from('sermon_talks').select('id, title, speaker_name, talk_date, video_url, canvas_insights')
    .eq('organization_id', orgId).eq('is_published', true).not('canvas_insights', 'is', null)
    .order('talk_date', { ascending: false }).limit(RECENT_TALKS);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((talk) => normalizeInsightPack(talk.canvas_insights));
}

/**
 * Every passage the person has put on this moment: those they attached as
 * Scripture entries, and any they mentioned in their own words. Read on the
 * device, from the open canvas; nothing is sent anywhere.
 */
export function momentReferences(journey) {
  const found = new Map();
  const add = (ref) => { if (ref && !found.has(ref)) { const spans = spansOf(ref); if (spans.length) found.set(ref, { ref, spans, wide: spans.every(isWholeChapter) }); } };
  for (const entry of journey.entries) if (entry.kind === 'scripture' && entry.reference) add(entry.reference);
  for (const words of [journey.moment, ...journey.entries.map((entry) => entry.text)]) {
    for (const segment of splitScriptureReferences(words || '')) add(segment.ref);
  }
  return [...found.values()];
}

/** Insights this moment already has a card for, so the same one is not offered twice. */
export const pulledKeys = (journey) => new Set(journey.entries.filter((e) => e.sermon).map((e) => `${e.sermon.talkId}:${e.sermon.insightId}`));

/**
 * Insights whose passage overlaps one already on this moment. Pure reference
 * comparison: no AI, no network. A match on the insight's own anchor passage
 * outranks one on a text the sermon merely touched; a bare-chapter reference
 * on the moment counts for less than a verse-level one.
 */
export function matchInsights(journey, talks, limit = 5) {
  const mine = momentReferences(journey);
  if (!mine.length) return [];
  const skip = pulledKeys(journey);
  const hits = [];
  talks.forEach((talk, talkIndex) => {
    const pack = normalizeInsightPack(talk.canvas_insights);
    if (!pack) return;
    pack.insights.forEach((insight, insightIndex) => {
      if (skip.has(`${talk.id}:${insight.id}`)) return;
      const candidates = [{ ref: insight.anchor, weight: 3 }, ...insight.refs.map((ref) => ({ ref, weight: 2 }))];
      let best = null;
      for (const m of mine) {
        for (const c of candidates) {
          const shared = spansOf(c.ref);
          if (!m.spans.some((a) => shared.some((b) => overlap(a, b)))) continue;
          const score = c.weight - (m.wide ? 1 : 0);
          if (!best || score > best.score) best = { score, via: m.ref, shared: c.ref };
        }
      }
      if (best) hits.push({ talk: talkSummary(talk), insight, via: best.via, shared: best.shared, score: best.score, order: talkIndex * 10 + insightIndex });
    });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit)
    .map(({ talk, insight, via, shared, score }) => ({ talk, insight, via, shared, score }));
}

/** AI picks ({ talkId, insightId, why }) joined back to the member's own copy of the talks; anything not found is dropped. */
export function joinSuggestions(suggestions, talks, journey) {
  const skip = pulledKeys(journey);
  const out = [];
  for (const pick of Array.isArray(suggestions) ? suggestions : []) {
    const talk = talks.find((t) => t.id === pick?.talkId);
    const insight = talk && normalizeInsightPack(talk.canvas_insights)?.insights.find((i) => i.id === pick.insightId);
    if (!insight || !text(pick.why, 700) || skip.has(`${talk.id}:${insight.id}`)) continue;
    out.push({ talk: talkSummary(talk), insight, why: pick.why.trim() });
  }
  return out;
}

export function secondsAt(at) {
  if (!validAt(at)) return null;
  return at.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** The recording opened at the moment the speaker said it, where the host supports that (YouTube); otherwise just the recording. */
export function videoLink(videoUrl, at) {
  if (typeof videoUrl !== 'string' || !/^https:\/\//.test(videoUrl)) return null;
  try {
    const url = new URL(videoUrl);
    const seconds = secondsAt(at);
    if (seconds !== null && /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) url.searchParams.set('t', `${seconds}s`);
    return url.toString();
  } catch { return null; }
}

/** The Scripture entry for a connection the person has chosen to bring in. Their own words are required: the sermon sits beside them. */
export function sermonEntry({ talk, insight }, words, now = new Date()) {
  const source = normalizeSermonSource({
    talkId: talk.id, insightId: insight.id, title: talk.title, claim: insight.claim, question: insight.question,
    ...(talk.speaker ? { speaker: talk.speaker } : {}), ...(talk.date ? { date: talk.date } : {}),
    ...(insight.quote ? { quote: insight.quote } : {}),
    ...(videoLink(talk.videoUrl, null) ? { videoUrl: talk.videoUrl } : {}),
  });
  if (!words?.trim()) throw new Error('Add a few of your own words to bring this into your canvas.');
  if (!source) throw new Error('This sermon connection could not be saved. Please try another.');
  return { id: crypto.randomUUID(), kind: 'scripture', reference: insight.anchor, text: words.trim(), createdAt: now.toISOString(), sermon: source };
}
