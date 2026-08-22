import { hasSupabaseConfig, supabase } from './supabaseClient';

// Client half of the music-resolve edge function: turn a preview-limited song
// link (Spotify, Apple Music) into a YouTube video id that plays in full.
//
// Spotify's embed only plays 30-second previews unless the listener's own
// browser has a logged-in Spotify Premium session, so a link shared in chat can
// never play through for the whole group. The server finds the YouTube
// equivalent; this module keeps a per-session memo so a queue replayed twice
// costs nothing, and so does an unresolvable song (memoized as null).
//
// Every failure path returns null, and every caller falls back to the original
// embed — a 30-second preview, exactly the current behavior. Resolution can
// make playback better, never worse.

const memo = new Map(); // url -> Promise<string|null>

export function resolveToYouTube(url) {
  if (!url) return Promise.resolve(null);
  if (!hasSupabaseConfig || !supabase?.functions?.invoke) return Promise.resolve(null);

  if (!memo.has(url)) {
    memo.set(
      url,
      supabase.functions
        .invoke('music-resolve', { body: { url } })
        .then(({ data, error }) => (error ? null : data?.videoId || null))
        .catch(() => null),
    );
  }
  return memo.get(url);
}

// Kick off a resolution without waiting on it, so the next song in the queue is
// already resolved by the time the current one ends.
export function prefetchResolution(url) {
  resolveToYouTube(url);
}
