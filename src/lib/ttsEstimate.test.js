import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateSynthesisMs,
  recordSynthesis,
  formatEta,
  resetTtsRates,
} from './ttsEstimate';

describe('ttsEstimate', () => {
  beforeEach(() => {
    resetTtsRates();
  });

  it('scales the estimate with character count', () => {
    expect(estimateSynthesisMs(1000)).toBeGreaterThan(estimateSynthesisMs(200));
  });

  it('clamps to a sane floor and ceiling', () => {
    expect(estimateSynthesisMs(0)).toBeGreaterThanOrEqual(1200);
    expect(estimateSynthesisMs(5_000_000)).toBeLessThanOrEqual(90_000);
  });

  it('survives junk input', () => {
    expect(estimateSynthesisMs(undefined)).toBeGreaterThan(0);
    expect(estimateSynthesisMs(-50)).toBeGreaterThan(0);
  });

  it('reacts quickly when requests turn out slower than expected', () => {
    const before = estimateSynthesisMs(800);
    recordSynthesis(800, before * 3);
    expect(estimateSynthesisMs(800)).toBeGreaterThan(before);
  });

  it('comes down only gradually when a request is fast (cache hit)', () => {
    const before = estimateSynthesisMs(800);
    recordSynthesis(800, 300); // cache hit
    const after = estimateSynthesisMs(800);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before * 0.6); // stays pessimistic
  });

  it('ignores implausible samples', () => {
    const before = estimateSynthesisMs(500);
    recordSynthesis(500, 0);
    recordSynthesis(500, 10 * 60 * 1000);
    recordSynthesis(0, 4000);
    expect(estimateSynthesisMs(500)).toBe(before);
  });

  it('keeps engines independent', () => {
    recordSynthesis(500, 20_000, 'fish');
    expect(estimateSynthesisMs(500, 'fish')).toBeGreaterThan(estimateSynthesisMs(500, 'kokoro'));
  });

  it('formats an eta for humans', () => {
    expect(formatEta(5400)).toBe('about 6s');
    expect(formatEta(-10)).toBe('about 0s');
    expect(formatEta(60_000)).toBe('about 1m');
    expect(formatEta(70_000)).toBe('about 1m 10s');
  });
});
