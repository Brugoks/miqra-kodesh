import { beforeEach, describe, expect, it } from 'vitest';
import { CANVAS_FEELINGS, FOCUS_PROMPTS, feelingByKey, recalledFeeling, rememberFeeling, withFeelingStem } from './canvasFeelings';
import { JOURNEY_TEXT_MAX } from './canvasJourney';
import { FEELING_ANGLES } from '../../supabase/functions/study-canvas/feelings.ts';

const stemOf = (key) => feelingByKey(key).stem;

describe('feeling list', () => {
  it('has unique keys, labels and stems that invite a continuation', () => {
    expect(new Set(CANVAS_FEELINGS.map((f) => f.key)).size).toBe(CANVAS_FEELINGS.length);
    expect(new Set(CANVAS_FEELINGS.map((f) => f.label)).size).toBe(CANVAS_FEELINGS.length);
    for (const feeling of CANVAS_FEELINGS) {
      expect(feeling.key).toMatch(/^[a-z]+$/);
      expect(feeling.stem.endsWith('… ')).toBe(true); // unfinished on purpose, caret after the space
      expect(feeling.stem.length).toBeLessThan(80);
    }
  });
  it('covers the hard feelings, not only the pleasant ones', () => {
    const keys = CANVAS_FEELINGS.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['overwhelmed', 'angry', 'grieving', 'numb', 'ashamed', 'doubting']));
  });
  it('keeps the prompts short enough for the focus box', () => {
    expect(FOCUS_PROMPTS.length).toBeGreaterThanOrEqual(3);
    for (const prompt of FOCUS_PROMPTS) expect(prompt.length).toBeLessThanOrEqual(120);
  });
  it('has server guidance for exactly the feelings the page offers', () => {
    expect(Object.keys(FEELING_ANGLES).sort()).toEqual(CANVAS_FEELINGS.map((f) => f.key).sort());
  });
});

describe('withFeelingStem', () => {
  it('fills an empty box with the stem as written', () => {
    expect(withFeelingStem('', 'angry')).toBe(stemOf('angry'));
    expect(withFeelingStem('   \n', 'angry')).toBe(stemOf('angry'));
  });
  it('leaves what the person wrote alone and starts a new paragraph', () => {
    expect(withFeelingStem('My mom is in the hospital.', 'anxious')).toBe(`My mom is in the hospital.\n\n${stemOf('anxious')}`);
    expect(withFeelingStem('My mom is in the hospital.\n\n', 'anxious')).toBe(`My mom is in the hospital.\n\n${stemOf('anxious')}`);
  });
  it('does not repeat a stem that is already last, but does allow a different one after it', () => {
    const once = withFeelingStem('', 'lonely');
    expect(withFeelingStem(once, 'lonely')).toBe(once);
    expect(withFeelingStem(`${once}nobody called`, 'angry')).toBe(`${once}nobody called\n\n${stemOf('angry')}`);
  });
  it('never pushes a note past its limit and ignores unknown feelings', () => {
    const nearly = 'x'.repeat(JOURNEY_TEXT_MAX - 5);
    expect(withFeelingStem(nearly, 'angry', JOURNEY_TEXT_MAX)).toBe(nearly);
    expect(withFeelingStem('hello', 'not-a-feeling')).toBe('hello');
    expect(withFeelingStem('hello', undefined)).toBe('hello');
  });
});

describe('remembering the feeling a moment started from', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips per moment and clears', () => {
    rememberFeeling('moment-1', 'grieving');
    rememberFeeling('moment-2', 'joyful');
    expect(recalledFeeling('moment-1')).toBe('grieving');
    expect(recalledFeeling('moment-2')).toBe('joyful');
    rememberFeeling('moment-1', '');
    expect(recalledFeeling('moment-1')).toBe('');
    expect(recalledFeeling('moment-2')).toBe('joyful');
  });
  it('refuses to store or return anything that is not an offered feeling', () => {
    rememberFeeling('moment-1', 'made-up');
    expect(localStorage.getItem('miqra_moment_feeling_v1:moment-1')).toBeNull();
    localStorage.setItem('miqra_moment_feeling_v1:moment-3', '<script>');
    expect(recalledFeeling('moment-3')).toBe('');
    expect(recalledFeeling('never-saved')).toBe('');
  });
  it('degrades quietly when storage is unavailable', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try { expect(() => rememberFeeling('moment-1', 'angry')).not.toThrow(); } finally { Storage.prototype.setItem = original; }
  });
});
