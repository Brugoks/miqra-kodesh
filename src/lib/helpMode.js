import { useSyncExternalStore } from 'react';

// Whether the `?` badges are currently showing. Feedback ticket 032815b7.
//
// Deliberately session-only and not persisted: help mode is a mode, not a
// preference. Someone who turns it on to find one button should not come back
// tomorrow to an app covered in badges.
//
// An external store rather than context so the topbar toggle and the badges
// scattered through the route components don't need a provider threaded
// between them — Layout and the pages are siblings under App.

let enabled = false;
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return enabled;
}

export function setHelpMode(next) {
  const value = Boolean(next);
  if (value === enabled) return;
  enabled = value;
  listeners.forEach((listener) => listener());
}

export function toggleHelpMode() {
  setHelpMode(!enabled);
}

/** Test seam — the store outlives any single render tree. */
export function resetHelpMode() {
  enabled = false;
  listeners.clear();
}

export function useHelpMode() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
