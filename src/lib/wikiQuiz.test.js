import { describe, it, expect } from 'vitest';
import { generateQuiz } from './wikiQuiz';
import { normalizeWiki } from './bibleWiki';
import rawWiki from '../assets/bible-wiki.json';

// Deterministic PRNG so failures reproduce.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateQuiz', () => {
  const wiki = normalizeWiki(rawWiki);

  it('produces the requested number of well-formed questions', () => {
    const questions = generateQuiz(wiki, 5, mulberry32(42));
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.q).toBeTruthy();
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.answer);
      // options are distinct
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('never asks about God directly', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const questions = generateQuiz(wiki, 5, mulberry32(seed));
      for (const q of questions) {
        expect(q.about).not.toBe('god_1324');
      }
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateQuiz(wiki, 5, mulberry32(7));
    const b = generateQuiz(wiki, 5, mulberry32(7));
    expect(a).toEqual(b);
  });
});
