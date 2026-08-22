// A holding pen for scripture-reader taps that arrive before the reader exists.
//
// Both entry points to the reader are plain window events: the top bar's Bible
// icon dispatches 'scripture:toggle' (Layout.jsx) and every auto-linked
// reference dispatches 'scripture:open' (scriptureLinker.js and friends). The
// only listeners live inside BibleLookup, which is lazy-loaded and doesn't even
// begin downloading until the Supabase session resolves — so a tap in that
// window dispatched into nothing at all, looked like the app had ignored it,
// and left the user tapping a second time once the chunk had quietly landed.
//
// This module ships in the initial bundle. It records the most recent intent
// while the reader is not yet listening and hands it over the moment the reader
// mounts, so the first tap always counts.

const TOGGLE = 'scripture:toggle';
const OPEN = 'scripture:open';

let pending = null;      // { type, detail } | null
let readerReady = false; // BibleLookup is mounted and listening for itself
let uninstall = null;

export function installScriptureIntentBuffer() {
  if (uninstall || typeof window === 'undefined') return;
  const remember = (type) => (event) => {
    if (readerReady) return; // the reader's own listener is handling this one
    pending = { type, detail: event.detail ?? null };
  };
  const onToggle = remember(TOGGLE);
  const onOpen = remember(OPEN);
  window.addEventListener(TOGGLE, onToggle);
  window.addEventListener(OPEN, onOpen);
  uninstall = () => {
    window.removeEventListener(TOGGLE, onToggle);
    window.removeEventListener(OPEN, onOpen);
    uninstall = null;
  };
}

// Called by the reader as it mounts. Returns whatever arrived while it was
// still loading (at most one intent — a second tap supersedes the first rather
// than queueing a second open).
export function claimPendingScriptureIntent() {
  readerReady = true;
  const intent = pending;
  pending = null;
  return intent;
}

// Called by the reader as it unmounts (sign-out, route teardown): buffer again
// from here on, since nothing is listening any more.
export function releaseScriptureIntents() {
  readerReady = false;
  pending = null;
}

// Test seam.
export function resetScriptureIntents() {
  pending = null;
  readerReady = false;
  uninstall?.();
}
