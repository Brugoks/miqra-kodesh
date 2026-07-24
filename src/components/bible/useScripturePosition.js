// Remembers the reader's last Book/Chapter/Verse so the navigator breadcrumb
// survives reloads. Deliberately does NOT trigger a fetch on restore — the
// panel opens showing where you were, not re-downloading it.

import { BOOK_CHAPTERS } from '../../lib/scripture';

const POSITION_KEY = 'miqra_scripture_position';

// Reject anything that is not a real book/chapter — a stale or hand-edited
// entry must never render a breadcrumb for a book that does not exist.
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { code, chapter, verse } = raw;
  const total = BOOK_CHAPTERS[code];
  if (!total || !Number.isInteger(chapter) || chapter < 1 || chapter > total) return null;
  return {
    code,
    chapter,
    verse: Number.isInteger(verse) && verse > 0 ? verse : null,
  };
}

export function loadLastPosition() {
  try {
    return normalize(JSON.parse(localStorage.getItem(POSITION_KEY) || 'null'));
  } catch { /* storage unavailable */ }
  return null;
}

export function saveLastPosition(selection) {
  const valid = normalize(selection);
  if (!valid) return;
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(valid));
  } catch { /* storage unavailable */ }
}
