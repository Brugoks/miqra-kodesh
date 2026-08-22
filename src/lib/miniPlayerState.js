import { useSyncExternalStore } from 'react';

// What the mini-player is doing right now, published so other surfaces — the
// channel Songs panel especially — can show which song is playing and drive
// playback themselves, instead of the listener having to find the dock.
//
// A plain module store rather than a context: the dock is mounted once at the
// app shell, well above any route, and the panels that care are far down other
// branches of the tree. Threading a provider between them would buy nothing.
//
// `url` is always the ORIGINAL shared link, even when a Spotify song is playing
// through its YouTube stand-in, so a list can match rows on the link it posted.

const EMPTY = { url: null, isPlaying: false, resolving: false };

let state = EMPTY;
const listeners = new Set();

export function getMiniPlayerState() {
  return state;
}

export function setMiniPlayerState(next) {
  const merged = { ...state, ...next };
  if (
    merged.url === state.url
    && merged.isPlaying === state.isPlaying
    && merged.resolving === state.resolving
  ) {
    return; // no change — don't churn subscribers with a new object identity
  }
  state = merged;
  listeners.forEach((listener) => listener());
}

export function clearMiniPlayerState() {
  setMiniPlayerState(EMPTY);
}

export function subscribeMiniPlayer(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Ask the dock to toggle the current song. Kept as an event (not a store write)
// because only the dock knows how to talk to each provider's embed.
export function toggleMiniPlayer() {
  window.dispatchEvent(new CustomEvent('miniplayer:toggle'));
}

export function useMiniPlayerState() {
  return useSyncExternalStore(subscribeMiniPlayer, getMiniPlayerState, getMiniPlayerState);
}
