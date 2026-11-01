// Member-facing "insight pack" for a sermon, derived from its Berean report.
//
// The Berean report is a leader tool (RLS: leaders only) and carries flags a
// congregation should not receive second-hand. The pack is the part of a
// sermon that is safe and useful to offer every member of the church: a few
// grounded claims, each tied to a verified passage and to the speaker's own
// words, with a question to sit with. It is stored on sermon_talks.canvas_insights
// and read by the Living Canvas ("Hear it in a sermon").
//
// Privacy rule, deliberately encoded in the shape of this module: the pack is
// built from the SERMON only. Nothing here takes, reads or returns a member's
// canvas, journal or reflection. Matching a pack to a person's moment happens on
// that person's side, when they ask. See docs/living-study-canvas.md.
//
// Pure functions - no Deno APIs - so they are unit-testable (insights.test.js).

import { parseReference, type ParsedRef } from './reference.ts';
import { makeQuoteChecker } from './textmatch.ts';

export const INSIGHT_PACK_VERSION = 1;
export const MAX_INSIGHTS = 6;
export const MAX_EXTRA_REFS = 4;
export const LIMITS = { claim: 280, question: 240, quote: 400, reference: 100, at: 8 };

export type SermonInsight = {
  id: string;
  anchor: string; // canonical "Book C:V-V" the claim rests on
  refs: string[]; // further passages the sermon tied it to (used only for matching)
  claim: string;
  quote: { text: string; at: string | null } | null;
  question: string;
  cards: string[]; // Berean card ids this was drawn from (kept for the leader's audit trail)
};

export type InsightPack = {
  version: number;
  generatedAt: string;
  model: string;
  basedOn: string;
  insights: SermonInsight[];
};

const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const wordCount = (text: string) => text.split(' ').filter(Boolean).length;

// "Luke 4:18-19" - the form every member-side consumer parses.
export function canonicalReference(ref: ParsedRef): string {
  if (!ref.startVerse) return `${ref.book} ${ref.chapter}`;
  const end = ref.endVerse ?? ref.startVerse;
  return `${ref.book} ${ref.chapter}:${ref.startVerse}${end !== ref.startVerse ? `-${end}` : ''}`;
}

function toCanonical(value: unknown): string | null {
  const raw = clean(value);
  if (!raw || raw.length > LIMITS.reference) return null;
  const parsed = parseReference(raw);
  return parsed ? canonicalReference(parsed) : null;
}

// The stored transcript carries a [mm:ss] marker at the start of each paragraph. A quote's time
// must fall inside the paragraph it is spoken in, so a "Watch from 31:22" link cannot point at
// the wrong minute of the recording. Transcripts without markers (older talks) skip this check.
const toSeconds = (at: string) => at.split(':').reduce((total, part) => total * 60 + Number(part), 0);
const squash = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
export function paragraphWindows(transcript: string) {
  const windows: Array<{ start: number; end: number; text: string }> = [];
  for (const block of transcript.split(/\n\s*\n/)) {
    const marker = block.trim().match(/^(?:>\s*)?\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\s*([\s\S]*)$/);
    if (!marker) continue;
    windows.push({ start: toSeconds(marker[1]), end: Infinity, text: squash(marker[2]) });
  }
  windows.forEach((window, index) => { if (index + 1 < windows.length) window.end = windows[index + 1].start; });
  return windows;
}

const validAt = (value: unknown) => typeof value === 'string' && /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(value.trim()) && value.trim().length <= LIMITS.at;

type Report = { promptVersion?: string; cards?: Array<{ id: string; assessment: string; passageText?: string | null; quoteVerified?: boolean | null }> };

/**
 * Validates the agent's raw insights against the finished Berean report and the
 * stored transcript and returns the pack to write. `problems` must be empty
 * before anything is saved: this never repairs or guesses.
 *
 * Rules that exist to protect members:
 *  - an insight may only rest on cards the review judged `aligned`, with fetched
 *    passage text and a quote that really occurs in the transcript, so a
 *    congregation is never handed a point the review had doubts about;
 *  - the quoted words must really occur in the transcript (no invented quotes);
 *  - the question must be a question: the pack invites reflection, it does not
 *    tell anyone what God is saying to them.
 */
export function buildInsightPack(raw: any, report: Report, transcript: string, meta: { model: string; now?: Date }) {
  const problems: string[] = [];
  const list: any[] = Array.isArray(raw?.insights) ? raw.insights : [];
  if (!list.length) problems.push('Provide at least one insight.');
  if (list.length > MAX_INSIGHTS) problems.push(`At most ${MAX_INSIGHTS} insights per sermon (got ${list.length}).`);

  const cards = new Map((report?.cards || []).map((card) => [card.id, card]));
  const checkQuote = makeQuoteChecker(transcript);
  const windows = paragraphWindows(transcript);
  const insights: SermonInsight[] = [];
  const seen = new Set<string>();

  list.slice(0, MAX_INSIGHTS).forEach((item, index) => {
    const label = `insight ${index + 1}`;
    const anchor = toCanonical(item?.anchor);
    if (!anchor) problems.push(`${label}: anchor "${clean(item?.anchor)}" is not a valid single-chapter reference.`);

    const refs: string[] = [];
    for (const extra of Array.isArray(item?.refs) ? item.refs.slice(0, MAX_EXTRA_REFS + 1) : []) {
      const canonical = toCanonical(extra);
      if (!canonical) problems.push(`${label}: reference "${clean(extra)}" is not valid.`);
      else if (canonical !== anchor && !refs.includes(canonical)) refs.push(canonical);
    }
    if (Array.isArray(item?.refs) && item.refs.length > MAX_EXTRA_REFS) problems.push(`${label}: at most ${MAX_EXTRA_REFS} extra references.`);

    const claim = clean(item?.claim);
    if (!claim || claim.length > LIMITS.claim) problems.push(`${label}: claim must be 1-${LIMITS.claim} characters.`);

    const question = clean(item?.question);
    if (!question || question.length > LIMITS.question || !question.endsWith('?')) problems.push(`${label}: question must be a question of 1-${LIMITS.question} characters.`);

    const ids: string[] = Array.isArray(item?.cards) ? item.cards.map((id: unknown) => clean(id)).filter(Boolean) : [];
    if (!ids.length) problems.push(`${label}: name the Berean card(s) it is drawn from.`);
    for (const id of ids) {
      const card = cards.get(id);
      if (!card) problems.push(`${label}: card ${id} does not exist in the report.`);
      else if (card.assessment !== 'aligned') problems.push(`${label}: card ${id} is "${card.assessment}", not aligned - leader-only review findings are never turned into member insights.`);
      else if (!card.passageText) problems.push(`${label}: card ${id} has no fetched passage text.`);
      else if (card.quoteVerified === false) problems.push(`${label}: card ${id}'s quote was not found in the transcript.`);
    }

    let quote: SermonInsight['quote'] = null;
    if (item?.quote != null) {
      const text = clean(item.quote.text);
      const at = item.quote.at == null || item.quote.at === '' ? null : clean(item.quote.at);
      if (wordCount(text) < 4 || text.length > LIMITS.quote) problems.push(`${label}: quote must be 4+ words and at most ${LIMITS.quote} characters.`);
      else if (checkQuote(text) !== true) problems.push(`${label}: quote is not found in the transcript: "${text.slice(0, 60)}".`);
      else if (at !== null && !validAt(at)) problems.push(`${label}: quote time "${at}" must look like 31:22 or 1:02:03.`);
      else {
        // Find the paragraph the quote opens in and check the time falls inside it.
        const opening = squash(text.split(/\.\.\.|…/)[0]);
        const home = windows.find((window) => window.text.includes(opening));
        if (at !== null && home && !(toSeconds(at) >= home.start && toSeconds(at) < home.end)) {
          problems.push(`${label}: quote time ${at} is outside the paragraph it is spoken in (starts ${Math.floor(home.start / 60)}:${String(home.start % 60).padStart(2, '0')}).`);
        } else quote = { text, at };
      }
    }

    if (anchor) {
      const key = `${anchor}|${claim.toLowerCase()}`;
      if (seen.has(key)) problems.push(`${label}: duplicates an earlier insight.`);
      seen.add(key);
    }
    if (anchor && claim && question) insights.push({ id: `i${index + 1}`, anchor, refs, claim, quote, question, cards: [...new Set(ids)] });
  });

  const pack: InsightPack = {
    version: INSIGHT_PACK_VERSION,
    generatedAt: (meta.now ?? new Date()).toISOString(),
    model: meta.model,
    basedOn: String(report?.promptVersion || ''),
    insights,
  };
  return { pack, problems };
}
