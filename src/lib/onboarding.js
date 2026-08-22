import { useCallback, useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from './supabaseClient';

// Which walkthroughs a user has already finished, kept on their profile rather
// than in localStorage — see 20260808000000_profile_onboarding_state.sql for
// why. Feedback ticket 032815b7.
//
// Flags are cached per user for the life of the tab. They are read on nearly
// every page but written once each, ever, so a shared snapshot beats a fetch
// per component.

// Walkthroughs that shipped before this module existed. Honoured once, then
// folded into the profile so nobody is re-onboarded by the upgrade itself.
const LEGACY_KEYS = {
  discipleship: 'miqra_discipleship_onboarding_v1',
};

// Mirror used when Supabase is unconfigured (local dev) or unreachable, so the
// walkthrough still stops nagging within the session.
const LOCAL_KEY = 'miqra_onboarding';

let cache = null; // { userId, flags }
let inflight = null; // { userId, promise }
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function readLegacyFlags() {
  const flags = {};
  for (const [key, storageKey] of Object.entries(LEGACY_KEYS)) {
    try {
      if (localStorage.getItem(storageKey) === 'done') flags[key] = true;
    } catch { /* storage unavailable */ }
  }
  return flags;
}

function readLocalFlags() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* unparseable or unavailable */ }
  return {};
}

function writeLocalFlags(flags) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(flags));
  } catch { /* storage unavailable */ }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function load(userId) {
  const legacy = readLegacyFlags();

  if (!hasSupabaseConfig || !userId) {
    return { ...legacy, ...readLocalFlags() };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding')
    .eq('id', userId)
    .maybeSingle();

  // Offline or denied: fall back to whatever this browser knows. Better to
  // under-prompt than to replay a walkthrough the user already dismissed.
  if (error) return { ...legacy, ...readLocalFlags() };

  const remote = isPlainObject(data?.onboarding) ? data.onboarding : {};
  const unmigrated = Object.keys(legacy).filter((key) => !remote[key]);
  if (!unmigrated.length) return remote;

  const merged = { ...remote, ...legacy };
  await supabase.from('profiles').update({ onboarding: merged }).eq('id', userId);
  return merged;
}

function ensureLoaded(userId) {
  if (cache && cache.userId === userId) return Promise.resolve(cache.flags);
  if (inflight && inflight.userId === userId) return inflight.promise;

  const promise = load(userId)
    .then((flags) => {
      cache = { userId, flags };
      return flags;
    })
    .catch(() => {
      // Never leave callers hanging on a walkthrough decision.
      cache = { userId, flags: readLocalFlags() };
      return cache.flags;
    })
    .finally(() => {
      if (inflight?.userId === userId) inflight = null;
      emit();
    });

  inflight = { userId, promise };
  return promise;
}

/**
 * Record a walkthrough as finished. Applied locally first so the UI closes
 * immediately — a failed write costs the user one repeat prompt, never a
 * modal that refuses to dismiss.
 */
export async function markOnboardingDone(userId, key) {
  const flags = { ...(cache?.userId === userId ? cache.flags : {}), [key]: true };
  cache = { userId, flags };
  writeLocalFlags(flags);
  emit();

  if (!hasSupabaseConfig || !userId) return;
  try {
    await supabase.from('profiles').update({ onboarding: flags }).eq('id', userId);
  } catch { /* offline — the local mirror still suppresses it this session */ }
}

/** Test seam: drop the shared snapshot so the next read refetches. */
export function resetOnboardingCache() {
  cache = null;
  inflight = null;
}

/**
 * Read a user's walkthrough flags.
 *
 * `ready` is false until the profile has been read. Gate any first-visit
 * prompt on it — rendering while unknown flashes the walkthrough at people
 * who finished it months ago.
 */
export function useOnboarding(session) {
  const userId = session?.user?.id ?? null;
  const [snapshot, setSnapshot] = useState(() => (cache?.userId === userId ? cache : null));

  // Stamped with the user it was read for, and re-derived every render: on a
  // sign-out or account switch the answer goes back to "unknown" immediately
  // rather than reporting the previous user's flags until the effect catches up.
  const flags = snapshot?.userId === userId ? snapshot.flags : null;

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (!cancelled) setSnapshot(cache?.userId === userId ? cache : null);
    };
    listeners.add(sync);
    ensureLoaded(userId).then(sync);
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, [userId]);

  const isDone = useCallback((key) => Boolean(flags?.[key]), [flags]);
  const markDone = useCallback((key) => markOnboardingDone(userId, key), [userId]);

  return { ready: flags !== null, isDone, markDone };
}
