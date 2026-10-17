import { describe, expect, it } from 'vitest';
import { planSplit, splitParagraphs } from './canvasSplit';

describe('splitting pasted paragraphs', () => {
  it('splits only at blank lines and keeps every word exactly', () => {
    const text = 'First line\nstill the first thought.\n\n  Second thought, with  odd   spacing.  \n\t\n\nThird.';
    expect(splitParagraphs(text)).toEqual(['First line\nstill the first thought.', 'Second thought, with  odd   spacing.', 'Third.']);
  });

  it('offers nothing for a single paragraph, however long, or for blank lines around one', () => {
    expect(planSplit('Just one thought.')).toBeNull();
    expect(planSplit('\n\nJust one thought across\ntwo lines.\n\n')).toBeNull();
    expect(planSplit('')).toBeNull();
  });

  it('previews each piece shortly and counts what fits', () => {
    const plan = planSplit(`${'word '.repeat(60)}\n\nShort one`, 90);
    expect(plan.ok).toBe(true);
    expect(plan.pieces).toHaveLength(2);
    expect(plan.previews[0].length).toBeLessThanOrEqual(90);
    expect(plan.previews[0].endsWith('…')).toBe(true);
    expect(plan.previews[1]).toBe('Short one');
    expect(plan.room).toBe(10);
  });

  it('refuses rather than cutting: too many pieces, or one too long', () => {
    const many = planSplit(Array.from({ length: 5 }, (_, i) => `Thought ${i}`).join('\n\n'), 97);
    expect(many.ok).toBe(false);
    expect(many.problem).toBe('Only 3 more thoughts fit on this canvas, and this would add 5.');
    expect(planSplit('a\n\nb', 99).problem).toBe('Only 1 more thought fits on this canvas, and this would add 2.');
    expect(planSplit('a\n\nb', 100).problem).toBe('This canvas already holds 100 later thoughts.');
    const long = planSplit(`ok\n\n${'x'.repeat(4001)}`);
    expect(long.ok).toBe(false);
    expect(long.problem).toMatch(/Paragraph 2 is longer than 4,000/);
    expect(long.pieces[1]).toHaveLength(4001);
  });
});
