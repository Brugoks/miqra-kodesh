// Pasting several paragraphs into one thought is common. This finds the paragraphs so the person can choose to
// make several thoughts instead — with a preview first. It only ever splits at blank lines and trims the edges of
// each piece: no wording is changed, merged, summarized or dropped, and nothing is invented.

import { JOURNEY_ENTRY_MAX, JOURNEY_TEXT_MAX } from './canvasJourney';

export const SPLIT_PREVIEW_LENGTH = 90;

/** The paragraphs of `text`, split at blank lines. Empty pieces (stray blank lines) are not thoughts. */
export const splitParagraphs = (text) => text.split(/\n[ \t\u00a0]*\n/).map((piece) => piece.trim()).filter(Boolean);

/**
 * What splitting `text` would do on a canvas that already holds `existing` later thoughts.
 * Returns null when there is nothing to offer (one paragraph). Otherwise `ok` says whether it can be done
 * as it stands, and `problem` says why not: never by quietly cutting or dropping a piece.
 */
export function planSplit(text, existing = 0) {
  const pieces = splitParagraphs(text);
  if (pieces.length < 2) return null;
  const room = Math.max(0, JOURNEY_ENTRY_MAX - existing);
  const tooLong = pieces.findIndex((piece) => piece.length > JOURNEY_TEXT_MAX);
  let problem = '';
  if (pieces.length > room) problem = room ? `Only ${room} more ${room === 1 ? 'thought fits' : 'thoughts fit'} on this canvas, and this would add ${pieces.length}.` : 'This canvas already holds 100 later thoughts.';
  else if (tooLong >= 0) problem = `Paragraph ${tooLong + 1} is longer than ${JOURNEY_TEXT_MAX.toLocaleString()} characters, which is the most one thought can hold.`;
  return {
    pieces, room, ok: !problem, problem,
    previews: pieces.map((piece) => { const flat = piece.replace(/\s+/g, ' '); return flat.length > SPLIT_PREVIEW_LENGTH ? `${flat.slice(0, SPLIT_PREVIEW_LENGTH - 1).trimEnd()}…` : flat; }),
  };
}
