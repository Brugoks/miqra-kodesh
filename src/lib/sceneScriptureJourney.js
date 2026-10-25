import { sceneMomentsForPassage } from './sceneScripture';
import { refToPassageIds } from './scripture';

// The Scripture Lookup hands the scene the human-readable reference it had
// open. Reduce that to the first place the in-scene reader can resume. A range
// begins at its first verse; a whole chapter opens at the chapter heading.
export function readerLocationForRef(ref, bookCode) {
  const first = refToPassageIds(ref || '')[0]?.split('-')[0];
  const parts = first?.split('.') || [];
  const bookCodes = Array.isArray(bookCode) ? bookCode : [bookCode];
  if (!bookCodes.includes(parts[0]) || parts.length < 2) return null;
  const chapter = Number(parts[1]);
  const verse = parts.length > 2 ? Number(parts[2]) : null;
  if (!Number.isFinite(chapter) || (verse !== null && !Number.isFinite(verse))) return null;
  return Array.isArray(bookCode) ? { bookCode: parts[0], chapter, verse } : { chapter, verse };
}

// A reading rail is about the visible geography first. A verse can overlap an
// event, a viewpoint and several pins at once; offer the pins when there are
// any, because they name the actual gate, tower or pool the reader can see.
// Events and viewpoints remain the fallback for verses whose moment is staged
// in the scene but whose place has no permanent pin.
export function scenePlacesForVerse(sceneSlug, passageId, { limit = 3 } = {}) {
  if (!sceneSlug || !passageId) return [];
  const moments = sceneMomentsForPassage([passageId], { limit: 24, includeEventChildren: true })
    .filter((moment) => moment.slug === sceneSlug);
  const pins = moments.filter((moment) => moment.kind === 'hotspot');
  const candidates = pins.length
    ? pins
    : moments.filter((moment) => moment.kind === 'event' || moment.kind === 'vantage');
  return candidates.slice(0, limit);
}
