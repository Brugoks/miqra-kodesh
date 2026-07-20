import { describe, it, expect } from 'vitest';
import { generateReelQuiz, quizPeople, scoreAnswer } from './reelsQuiz';

// A tiny synthetic wiki with enough people to exercise every archetype.
function makeWiki() {
  const people = [
    { s: 'moses_2108', type: 'person', name: 'Moses', g: 'M', vc: 774, y: [-1571, -1452], fv: 'EXO.2.10', desc: 'Led Israel out of Egypt. He received the law.', rel: { fa: 'amram_1', ch: ['gershom_1'] }, nm: "Hebrew — 'drawn out'", kv: ['Exodus 3:14'], arc: [{ t: 'The burning bush', r: 'Exodus 3' }] },
    { s: 'david_921', type: 'person', name: 'David', g: 'M', vc: 896, y: [-1040, -970], fv: '1SA.16.13', desc: 'Shepherd who became king. He wrote psalms.', rel: { fa: 'jesse_1', ch: ['solomon_2762'] }, nm: "Hebrew — 'beloved'", kv: ['Psalm 23:1'], arc: [{ t: 'David and Goliath', r: '1 Samuel 17' }] },
    { s: 'solomon_2762', type: 'person', name: 'Solomon', g: 'M', vc: 273, y: [-1010, -931], fv: '2SA.5.14', desc: 'Wise king who built the temple.', rel: { fa: 'david_921' }, nm: "Hebrew — 'peace'", kv: ['1 Kings 3:9'], arc: [{ t: "Solomon's wisdom", r: '1 Kings 3' }] },
    { s: 'deborah_997', type: 'person', name: 'Deborah', g: 'F', vc: 9, y: [-1200, -1120], fv: 'JDG.4.4', desc: 'Prophetess and judge of Israel.', rel: { pt: 'lappidoth_1' }, nm: "Hebrew — 'bee'", kv: ['Judges 4:4'], arc: [{ t: 'The song of Deborah', r: 'Judges 5' }] },
    { s: 'ruth_1', type: 'person', name: 'Ruth', g: 'F', vc: 12, y: [-1150, -1100], fv: 'RUT.1.4', desc: 'Moabite who followed Naomi. She married Boaz.', rel: { pt: 'boaz_1' }, nm: "Hebrew — 'friendship'", kv: ['Ruth 1:16'], arc: [{ t: 'Ruth and Naomi', r: 'Ruth 1' }] },
    { s: 'peter_2745', type: 'person', name: 'Peter', g: 'M', vc: 175, y: [-1, 64], fv: 'MAT.4.18', desc: 'Fisherman and apostle of Jesus.', rel: { sib: 'andrew_1' }, nm: "Greek — 'rock'", kv: ['Matthew 16:18'], arc: [{ t: "Peter's denial", r: 'Luke 22' }] },
    { s: 'paul_1', type: 'person', name: 'Paul', g: 'M', vc: 179, y: [5, 67], fv: 'ACT.7.58', desc: 'Apostle to the Gentiles. He wrote many letters.', rel: {}, nm: "Latin — 'small'", kv: ['Philippians 4:13'], arc: [{ t: 'Road to Damascus', r: 'Acts 9' }] },
    { s: 'mary_1', type: 'person', name: 'Mary', g: 'F', vc: 54, y: [-18, 40], fv: 'MAT.1.16', desc: 'Mother of Jesus.', rel: { ch: ['jesus_905'] }, nm: "Hebrew — 'bitter'", kv: ['Luke 1:38'], arc: [{ t: 'The Annunciation', r: 'Luke 1' }] },
    { s: 'god_1324', type: 'person', name: 'God', g: 'M', vc: 8587, desc: 'The Almighty.' },
    { s: 'egypt_1', type: 'place', name: 'Egypt', desc: 'A land.' },
  ];
  const rel = { amram_1: 'Amram', gershom_1: 'Gershom', jesse_1: 'Jesse', lappidoth_1: 'Lappidoth', boaz_1: 'Boaz', andrew_1: 'Andrew', jesus_905: 'Jesus' };
  const bySlug = new Map(people.map((p) => [p.s, p]));
  for (const [s, name] of Object.entries(rel)) bySlug.set(s, { s, name, type: 'person' });
  return { entries: people, bySlug };
}

const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

describe('quizPeople', () => {
  it('keeps described, gendered people and drops places + no-image figures', () => {
    const slugs = quizPeople(makeWiki()).map((p) => p.s);
    expect(slugs).toContain('moses_2108');
    expect(slugs).not.toContain('egypt_1'); // place
    expect(slugs).not.toContain('god_1324'); // no generated image
  });
});

describe('generateReelQuiz', () => {
  it('produces the requested number of well-formed questions', () => {
    const quiz = generateReelQuiz(makeWiki(), 7, seeded(7));
    expect(quiz).toHaveLength(7);
    for (const q of quiz) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4); // no duplicate options
      expect(q.options).toContain(q.answer); // answer is present
      expect(q.subject).toBeTruthy();
      expect(q.about).toBe(q.subject);
    }
  });

  it('never repeats a subject within a round', () => {
    const quiz = generateReelQuiz(makeWiki(), 7, seeded(3));
    const subjects = quiz.map((q) => q.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('includes the identify archetype and hides the name only there', () => {
    const quiz = generateReelQuiz(makeWiki(), 7, seeded(11));
    const identify = quiz.filter((q) => q.type === 'identify');
    expect(identify.length).toBeGreaterThanOrEqual(1);
    for (const q of quiz) expect(q.hideName).toBe(q.type === 'identify');
    for (const q of identify) expect(q.hints.length).toBeGreaterThanOrEqual(1);
  });

  it('mixes in more than one archetype', () => {
    const types = new Set(generateReelQuiz(makeWiki(), 7, seeded(21)).map((q) => q.type));
    expect(types.size).toBeGreaterThan(1);
  });

  it('is deterministic for a given seed', () => {
    const a = generateReelQuiz(makeWiki(), 7, seeded(99));
    const b = generateReelQuiz(makeWiki(), 7, seeded(99));
    expect(a.map((q) => `${q.q}|${q.answer}`)).toEqual(b.map((q) => `${q.q}|${q.answer}`));
  });

  it('returns nothing when there are too few people', () => {
    expect(generateReelQuiz({ entries: [], bySlug: new Map() })).toEqual([]);
  });
});

describe('scoreAnswer', () => {
  const identify = { type: 'identify' };
  const other = { type: 'relation' };

  it('rewards a faster identify guess', () => {
    expect(scoreAnswer(identify, 0, 1)).toBeGreaterThan(scoreAnswer(identify, 2, 1));
  });

  it('applies a streak multiplier that caps at 2x', () => {
    expect(scoreAnswer(other, 0, 1)).toBe(100); // no streak yet
    expect(scoreAnswer(other, 0, 2)).toBe(110); // +10%
    expect(scoreAnswer(other, 0, 50)).toBe(200); // capped at 2x
  });

  it('gives no speed bonus to non-identify questions', () => {
    expect(scoreAnswer(other, 0, 1)).toBe(scoreAnswer(other, 2, 1));
  });
});
