// Narration for the guided walk through a scene.
//
// The scenes have always had good writing in them — the vantage blurbs, the
// hotspots, the barriers — and have always made you stop walking and read it.
// That is the wrong trade in a first-person scene: the moment you start reading
// a panel you are looking at a website again. Being told about the place while
// you keep moving through it is a different experience of the same words.
//
// Three paths, and neither fallback is a consolation prize:
//
//   Recorded — the ordinary case. Every vantage blurb has already been read in
//   Rico's voice by scripts/build-scene-narration.js and committed under
//   public/assets/scenes/<slug>/narration/, so the tour plays a static file off
//   the origin: no round-trip, no session required, no per-visit cost, and the
//   service worker keeps it after the first walk. See sceneNarrationManifest.js.
//
//   Synthesised — the fallback for a blurb edited since the last build, whose
//   hashed filename no longer resolves. The fish-tts edge function holds the
//   Fish Audio key and the cloned voices server-side and caches every line, so
//   this costs one synthesis and then behaves like the recorded path until
//   someone re-runs the script. It cannot reach Rico (a restricted voice), so
//   it picks the nearest voice the caller is allowed.
//
//   Silent — no session, no voices configured, a synthesis that failed, or a
//   visitor who would simply rather read. The tour still runs: it shows each
//   line and dwells for as long as that line takes to read, which is the same
//   tour at the same pace with the sound off.
//
// React-free and three.js-free, so the tour logic can be tested without
// mounting a scene.

import { supabase, hasSupabaseConfig } from './supabaseClient';
import { NARRATION_VOICE, narrationFor } from './sceneNarrationManifest';

// fish-tts caps a request at 1000 characters. Vantage blurbs run to about
// three hundred, so this is a guard rather than a working limit.
const MAX_CHARS = 1000;

// Words per minute for the silent path. Deliberately unhurried: this is
// somebody reading a caption while looking at a building, not skimming.
const READING_WPM = 165;
const MIN_DWELL_MS = 4200;
const MAX_DWELL_MS = 26000;

// How long a line should stay up when nobody is reading it aloud.
export function dwellFor(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!words) return MIN_DWELL_MS;
  const ms = (words / READING_WPM) * 60000;
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, ms));
}

// Trim a blurb to something the synthesiser will accept, on a sentence
// boundary rather than mid-word.
export function fitForSpeech(text, max = MAX_CHARS) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(' '));
}

// The voices this caller may use, or an empty list. A tour asks once and then
// stops asking: a scene with no voices configured should cost one request, not
// one per stop.
export async function loadVoices(client = supabase) {
  if (!hasSupabaseConfig || !client) return [];
  try {
    const { data, error } = await client.functions.invoke('fish-tts', { method: 'GET' });
    if (error || !Array.isArray(data?.voices)) return [];
    return data.voices;
  } catch {
    return [];
  }
}

// Which of the voices a caller may use should read a line the build did not.
// The recordings are Rico, who is restricted and so will not be in this list
// for an ordinary visitor; the point is only to be consistent about the
// substitute, so a tour that falls back twice does not change voice twice.
export function pickNarrationVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const match = voices.find((v) => v?.label?.toLowerCase() === NARRATION_VOICE.toLowerCase());
  return (match || voices[0])?.id || null;
}

// A line that was recorded at build time. Nothing to fetch and nothing to
// revoke afterwards — it is a URL on this origin, and `preload` starts the
// buffering as soon as the object exists, which is why the tour builds this
// one before the camera has finished flying.
export function recordedLine(url) {
  if (!url || typeof Audio === 'undefined') return null;
  const audio = new Audio(url);
  audio.preload = 'auto';
  return { url, audio, revoke: false };
}

// Synthesises one line and hands back an <audio> ready to play, or null if the
// voice path is not available for any reason at all. Every failure here is
// non-fatal by design — the tour continues in silence rather than stopping.
export async function synthesise(text, options = {}) {
  const { voiceId, client = supabase, signal } = options;
  if (!hasSupabaseConfig || !client) return null;
  const line = fitForSpeech(text);
  if (!line) return null;

  try {
    const { data, error } = await client.functions.invoke('fish-tts', {
      body: { text: line, voice_id: voiceId },
    });
    if (signal?.aborted) return null;
    if (error || !data) return null;
    // fish-tts returns an octet-stream Blob so that invoke() does not try to
    // parse it as text and corrupt it; it is re-typed as audio here. Same
    // handling as BibleLookup and DailyReading.
    const url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    return { url, audio: new Audio(url), revoke: true };
  } catch {
    return null;
  }
}

// Plays a prepared line to completion, or until it is cancelled. Resolves
// either way — a tour stop that cannot speak is a tour stop that reads.
export function playLine(prepared, { signal } = {}) {
  return new Promise((resolve) => {
    if (!prepared?.audio) {
      resolve('unavailable');
      return;
    }
    const { audio, url, revoke } = prepared;
    let settled = false;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      // Only a synthesised line owns a blob URL. Revoking a recorded line's
      // path would do nothing here and break it on a second listen.
      if (revoke) URL.revokeObjectURL(url);
      resolve(reason);
    };

    audio.onended = () => finish('played');
    audio.onerror = () => finish('failed');
    signal?.addEventListener('abort', () => finish('cancelled'), { once: true });

    audio.play().catch(() => finish('failed'));
    if (signal?.aborted) finish('cancelled');
  });
}

// --- the tour itself ------------------------------------------------------

// Turns a scene manifest into an ordered walk. The vantages are already a
// curated route through the site — they are what the author chose to show and
// the order they chose to show it in — so the tour is those, in that order,
// with each one's own blurb as its script.
export function tourStops(scene) {
  if (!scene?.vantages?.length) return [];
  return scene.vantages.map((vantage) => ({
    id: vantage.id,
    label: vantage.label,
    text: vantage.blurb,
    refs: vantage.refs || [],
    // The recording of this blurb, if the build made one. A miss here is what
    // sends the stop down the synthesis path, and it misses exactly when the
    // blurb has been edited since — the filename is a hash of the text.
    audio: narrationFor(scene.slug, vantage.id)?.file || null,
    vantage,
  }));
}

// Runs the walk. Everything that touches the scene is a callback, so this
// function knows nothing about three.js, React, or how a camera moves.
//
//   goTo(vantage)     — start the flight to a stop
//   settle(ms)        — a cancellable wait; the caller owns the clock
//   onStop(stop, i)   — a stop has been reached and is about to be narrated
//   onSpeaking(bool)  — whether a voice is currently reading
//
// Resolves when the walk finishes or is cancelled. Never throws: a tour that
// dies halfway leaves the visitor stranded mid-flight with no controls.
export async function runTour(stops, options = {}) {
  const {
    goTo, settle, onStop, onSpeaking, signal, voiceId, client, flightMs = 1700,
  } = options;

  const speak = async (prepared) => {
    onSpeaking?.(true);
    const outcome = await playLine(prepared, { signal });
    onSpeaking?.(false);
    return outcome;
  };

  for (let i = 0; i < stops.length; i += 1) {
    if (signal?.aborted) return 'cancelled';
    const stop = stops[i];

    // A recorded line costs nothing to open, so it is opened before the flight
    // and spends the whole move buffering; by the time the camera lands it is
    // ready to speak. A synthesis is not started until the visitor has actually
    // arrived, so a tour cancelled at the first stop never pays for the rest.
    const prepared = recordedLine(stop.audio);

    goTo?.(stop.vantage, i);
    // The camera is still flying; nobody should be talking over the move.
    await settle(flightMs);
    if (signal?.aborted) return 'cancelled';

    onStop?.(stop, i);

    let outcome = prepared ? await speak(prepared) : 'unavailable';
    if (outcome === 'cancelled') return 'cancelled';

    // The recording was missing, or would not play — a blurb edited since the
    // last build, a deploy that dropped the file, a stale cache entry pointing
    // at one. Any of those is worth one synthesis before giving up on a voice.
    if (outcome !== 'played') {
      const spoken = await synthesise(stop.text, { voiceId, client, signal });
      if (signal?.aborted) return 'cancelled';
      if (spoken) outcome = await speak(spoken);
      if (outcome === 'cancelled') return 'cancelled';
    }

    if (outcome === 'played') {
      // A breath between stops, so the walk does not feel like a slideshow.
      await settle(900);
      continue;
    }

    // No voice at all: hold the line up long enough to read it.
    await settle(dwellFor(stop.text));
  }

  return signal?.aborted ? 'cancelled' : 'finished';
}
