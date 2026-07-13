import { describe, it, expect } from 'vitest';
import { quoteMatchScore, makeQuoteChecker } from './textmatch.ts';

describe('quoteMatchScore', () => {
  const passage = '[16] For God so loved the world, that he gave his only Son, '
    + 'that whoever believes in him should not perish but have eternal life.';

  it('scores a faithful quote high', () => {
    expect(quoteMatchScore('For God so loved the world that he gave his only Son', passage))
      .toBeGreaterThanOrEqual(0.9);
  });

  it('is order-aware: scrambled word order scores lower than the faithful quote', () => {
    const faithful = quoteMatchScore('whoever believes in him should not perish', passage);
    const scrambled = quoteMatchScore('perish should not him believes whoever', passage);
    expect(scrambled).toBeLessThan(faithful);
  });

  it('scores an unrelated sentence low', () => {
    expect(quoteMatchScore('Money is the root of all kinds of happiness', passage)).toBeLessThan(0.5);
  });

  it('returns 1 for quotes too short to judge', () => {
    expect(quoteMatchScore('a of', passage)).toBe(1);
  });
});

describe('makeQuoteChecker', () => {
  const transcript = 'Church, turn with me to John chapter three. For God so loved the world — '
    + 'you know this verse. And what I want you to see today is that love is not a feeling, '
    + 'it is a decision God made before you ever did anything to deserve it. My grandmother '
    + 'used to say that grace is like rain: you cannot make it fall, you can only get wet.';
  const check = makeQuoteChecker(transcript);

  it('finds excerpts that occur verbatim (punctuation-insensitive)', () => {
    expect(check('love is not a feeling, it is a decision God made')).toBe(true);
    expect(check('grace is like rain: you cannot make it fall')).toBe(true);
  });

  it('accepts ellipsized excerpts when each segment occurs', () => {
    expect(check('love is not a feeling ... before you ever did anything to deserve it')).toBe(true);
  });

  it('rejects excerpts that never occur in the transcript', () => {
    expect(check('the seven keys to unlocking your financial breakthrough this year')).toBe(false);
  });

  it('returns null for excerpts too short to judge', () => {
    expect(check('God so loved')).toBeNull();
    expect(check('')).toBeNull();
  });

  it('tolerates light drift via in-order overlap', () => {
    // "said" vs "used to say" — most content words still appear in order.
    expect(check('My grandmother said that grace is like rain you can only get wet')).toBe(true);
  });
});
