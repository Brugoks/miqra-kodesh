import { describe, it, expect } from 'vitest';
import {
  getScene,
  formatScenePeriod,
  formatSceneEntryCta,
  describePeriodMismatch,
} from './scenes';

describe('scenes period metadata and mismatch helpers', () => {
  it('formats periods for all 4 scenes', () => {
    const capernaum = getScene('capernaum');
    expect(formatScenePeriod(capernaum)).toBe('c. AD 28');

    const temple = getScene('second-temple');
    expect(formatScenePeriod(temple)).toBe('c. AD 30');

    const caesarea = getScene('caesarea');
    expect(formatScenePeriod(caesarea)).toContain('First century AD');

    const tabernacle = getScene('tabernacle');
    expect(formatScenePeriod(tabernacle)).toContain('Wilderness setting');
  });

  it('formats scene entry CTA button label naming the period', () => {
    const temple = getScene('second-temple');
    expect(formatSceneEntryCta(temple)).toBe('Step inside Herod’s Temple · c. AD 30');

    const capernaum = getScene('capernaum');
    expect(formatSceneEntryCta(capernaum)).toBe('Step inside Capernaum · c. AD 28');
  });

  it('describes period mismatch when Atlas year differs from scene reference year', () => {
    const temple = getScene('second-temple');
    // Year -4003 on Jerusalem
    const warning = describePeriodMismatch(-4003, temple);
    expect(warning).toBe('Atlas: 4003 BC. This reconstruction depicts c. AD 30.');

    // Year 30 on Jerusalem matches referenceYear 30 -> no warning
    expect(describePeriodMismatch(30, temple)).toBeNull();
  });

  it('returns null mismatch for scenes with undetermined reference year', () => {
    const tabernacle = getScene('tabernacle');
    expect(describePeriodMismatch(-1445, tabernacle)).toBeNull();

    const caesarea = getScene('caesarea');
    expect(describePeriodMismatch(50, caesarea)).toBeNull();
  });
});
