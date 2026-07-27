// How long a "Read aloud" request is likely to take, so the UI can show an
// honest countdown instead of an open-ended spinner.
//
// Synthesis time scales roughly with character count, but the real spread is
// dominated by whether the edge function hits its `tts-cache` bucket (~0.3s)
// or pays Fish Audio for a fresh synthesis (several seconds). We can't know
// which in advance, so the running average is deliberately PESSIMISTIC: slow
// samples pull the estimate up fast, fast samples pull it down slowly. An
// estimate that finishes early is a pleasant surprise; one that overruns
// makes the countdown a lie.

const STORAGE_KEY = 'ttsRateStats';
const MIN_MS = 1200;
const MAX_MS = 90_000;

// Per-engine seeds used until we have a real measurement from this device.
const DEFAULTS = {
  fish: { msPerChar: 8, overheadMs: 900 },
  kokoro: { msPerChar: 6, overheadMs: 1200 },
};
const FALLBACK = { msPerChar: 8, overheadMs: 1000 };

const UP_ALPHA = 0.5; // slower than expected -> believe it quickly
const DOWN_ALPHA = 0.12; // faster than expected -> stay cautious

function baseline(engine) {
  return DEFAULTS[engine] || FALLBACK;
}

function readStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Private mode / quota — estimates just fall back to the seeds.
  }
}

function rateFor(engine) {
  const seed = baseline(engine);
  const saved = readStats()[engine];
  const msPerChar = Number(saved?.msPerChar);
  const overheadMs = Number(saved?.overheadMs);
  return {
    msPerChar: Number.isFinite(msPerChar) && msPerChar > 0 ? msPerChar : seed.msPerChar,
    overheadMs: Number.isFinite(overheadMs) && overheadMs >= 0 ? overheadMs : seed.overheadMs,
  };
}

// Expected wall-clock ms before audio starts for `chars` of text.
export function estimateSynthesisMs(chars, engine = 'fish') {
  const { msPerChar, overheadMs } = rateFor(engine);
  const safeChars = Number.isFinite(chars) && chars > 0 ? chars : 0;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(overheadMs + safeChars * msPerChar)));
}

// Feed a completed request back in so the next estimate is sharper.
export function recordSynthesis(chars, elapsedMs, engine = 'fish') {
  if (!Number.isFinite(chars) || chars <= 0) return;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_MS) return;

  const { msPerChar, overheadMs } = rateFor(engine);
  const expected = overheadMs + chars * msPerChar;
  const observedPerChar = Math.max(0, (elapsedMs - overheadMs) / chars);
  const alpha = elapsedMs > expected ? UP_ALPHA : DOWN_ALPHA;
  const blended = msPerChar + alpha * (observedPerChar - msPerChar);

  const stats = readStats();
  stats[engine] = {
    msPerChar: Math.min(120, Math.max(0.2, Number(blended.toFixed(3)))),
    overheadMs,
    samples: Math.min(999, Number(stats[engine]?.samples || 0) + 1),
  };
  writeStats(stats);
}

// "about 6s" / "about 1m 10s" — deliberately vague, because it is an estimate.
export function formatEta(remainingMs) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s ? `about ${m}m ${s}s` : `about ${m}m`;
  }
  return `about ${secs}s`;
}

// Test seam — clears the learned rates for this device.
export function resetTtsRates() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
