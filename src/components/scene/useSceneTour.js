import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadVoices, pickNarrationVoice, runTour, speakLine, tourStops,
} from '../../lib/sceneNarration';

// Drives the guided walk. The tour itself lives in lib/sceneNarration.js and
// knows nothing about React; this hook is the part that owns the cancellation,
// the timers and the two pieces of state the UI needs.
//
// Cancellation is the whole difficulty. A tour is a chain of awaits — a
// flight, a synthesis round-trip, a playing audio element, a dwell — and every
// one of them has to be abandonable the instant the visitor takes the controls
// or leaves the route, or the camera keeps flying somewhere after they have
// walked off on their own. One AbortController threads through the lot, and
// every wait this hook creates is registered so it can be cleared rather than
// left to fire into an unmounted component.

export function useSceneTour({ scene, goToVantage, onStop, onSpeaking, enabled = true }) {
  const [touring, setTouring] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [stopIndex, setStopIndex] = useState(-1);
  // Which line is being read on its own, outside the walk — the id of the
  // panel that asked, so the button that started it is the one that shows as
  // playing while every other one stays offering.
  const [speakingId, setSpeakingId] = useState(null);

  const abortRef = useRef(null);
  // A second controller, because reading one panel aloud is not a tour and
  // must not be cancelled by, or leave state behind in, the tour's machinery.
  const speechRef = useRef(null);
  const timersRef = useRef(new Set());
  // Asked for once per scene, not once per stop: a site with no voices
  // configured should cost a single request and then run silently. Most tours
  // never need this at all — the lines are pre-recorded — so it only matters
  // when a blurb has been edited since the last narration build.
  const voiceRef = useRef(undefined);
  // `speak` is a stable callback, so it cannot read `speakingId` from its own
  // closure to decide whether a second press means "stop".
  const speakingIdRef = useRef(null);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current.clear();
  }, []);

  // A wait that can be abandoned. Resolves early rather than rejecting, so the
  // tour's own abort check is the single place that decides to stop.
  const settle = useCallback((ms) => new Promise((resolve) => {
    const signal = abortRef.current?.signal;
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      resolve();
    }, ms);
    timersRef.current.add(id);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      timersRef.current.delete(id);
      resolve();
    }, { once: true });
  }), []);

  // Silence, whichever of the two is talking. The render loop calls this when
  // the visitor walks off under their own steam, and being narrated at while
  // you wander somewhere else is no better for one line than for a whole walk.
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    speechRef.current?.abort();
    speechRef.current = null;
    clearTimers();
    setTouring(false);
    setSpeaking(false);
    setSpeakingId(null);
    setStopIndex(-1);
  }, [clearTimers]);

  const stopSpeaking = useCallback(() => {
    speechRef.current?.abort();
    speechRef.current = null;
    setSpeakingId(null);
  }, []);

  // Reads one panel's own words aloud. Pressing it again — or on anything else
  // that is already talking — stops rather than stacking two voices.
  const speak = useCallback(async (line) => {
    if (!line?.text || !enabled) return;
    const already = speechRef.current;
    speechRef.current = null;
    already?.abort();
    if (line.id && line.id === speakingIdRef.current) {
      setSpeakingId(null);
      onSpeaking?.(false);
      return;
    }

    const controller = new AbortController();
    speechRef.current = controller;
    setSpeakingId(line.id ?? null);

    if (voiceRef.current === undefined) {
      voiceRef.current = pickNarrationVoice(await loadVoices());
    }
    if (controller.signal.aborted) return;

    await speakLine(line, {
      signal: controller.signal,
      voiceId: voiceRef.current || undefined,
      onSpeaking: (value) => onSpeaking?.(value),
    });

    // Only the reading that is still current may clear the flag; a cancelled
    // one has already been superseded by whatever cancelled it.
    if (speechRef.current === controller) {
      speechRef.current = null;
      setSpeakingId(null);
    }
  }, [enabled, onSpeaking]);

  const start = useCallback(async () => {
    const stops = tourStops(scene);
    if (!stops.length || !enabled) return;

    // Restarting mid-tour is a restart, not two tours — and a line already
    // being read on its own is not a third voice.
    abortRef.current?.abort();
    speechRef.current?.abort();
    speechRef.current = null;
    setSpeakingId(null);
    clearTimers();
    const controller = new AbortController();
    abortRef.current = controller;
    setTouring(true);
    setStopIndex(-1);

    if (voiceRef.current === undefined) {
      voiceRef.current = pickNarrationVoice(await loadVoices());
    }
    if (controller.signal.aborted) return;

    await runTour(stops, {
      signal: controller.signal,
      voiceId: voiceRef.current || undefined,
      flightMs: 1700,
      settle,
      goTo: (vantage) => goToVantage?.(vantage),
      onStop: (tourStop, index) => {
        setStopIndex(index);
        onStop?.(tourStop, index);
      },
      onSpeaking: (value) => {
        setSpeaking(value);
        onSpeaking?.(value);
      },
    });

    // Only the tour that is still current may clear the flag; a cancelled one
    // has already been superseded by whatever cancelled it.
    if (abortRef.current === controller) {
      abortRef.current = null;
      setTouring(false);
      setSpeaking(false);
      setStopIndex(-1);
    }
  }, [scene, enabled, clearTimers, settle, goToVantage, onStop, onSpeaking]);

  // Leaving the route, or switching scenes, ends the walk. Without this the
  // timers keep firing into a component that no longer exists.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    speakingIdRef.current = speakingId;
  }, [speakingId]);

  return {
    touring, speaking, stopIndex, speakingId, speak, stopSpeaking, start, stop,
  };
}
