import { useCallback, useEffect, useRef, useState } from 'react';
import { loadVoices, runTour, tourStops } from '../../lib/sceneNarration';

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

  const abortRef = useRef(null);
  const timersRef = useRef(new Set());
  // Asked for once per scene, not once per stop: a site with no voices
  // configured should cost a single request and then run silently.
  const voiceRef = useRef(undefined);

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

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimers();
    setTouring(false);
    setSpeaking(false);
    setStopIndex(-1);
  }, [clearTimers]);

  const start = useCallback(async () => {
    const stops = tourStops(scene);
    if (!stops.length || !enabled) return;

    // Restarting mid-tour is a restart, not two tours.
    abortRef.current?.abort();
    clearTimers();
    const controller = new AbortController();
    abortRef.current = controller;
    setTouring(true);
    setStopIndex(-1);

    if (voiceRef.current === undefined) {
      const voices = await loadVoices();
      voiceRef.current = voices[0]?.id || null;
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

  return {
    touring, speaking, stopIndex, start, stop,
  };
}
