// Character Reels quiz generator. Unlike wikiQuiz (text-only, names the subject
// in the question), here the subject is shown as a full-screen picture/animation
// and the question asks about it. Questions come entirely from the foundation +
// curated data merged onto wiki entries, so there is nothing to author.
//
// Question shape:
//   { type, subject, subjectName, hideName, q, options[4], answer, about,
//     hints[], fact }
// `subject` is the slug whose picture the card shows; `hideName` (identify only)
// keeps the name hidden until the player answers.

import { CODE_TO_NAME } from './scripture';
import { NO_GENERATED_IMAGE } from './bibleWiki';

const NT_CODES = new Set([
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE',
  '1JN', '2JN', '3JN', 'JUD', 'REV',
]);

// Broad, distinguishable eras (better quiz options than raw centuries), keyed
// to the signed years the wiki uses (BC negative). Ordered by upper bound.
const ERA_BANDS = [
  { max: -1400, label: 'The Patriarchs' },
  { max: -1100, label: 'Exodus & Conquest' },
  { max: -930, label: 'The United Kingdom' },
  { max: -586, label: 'The Divided Kingdom' },
  { max: -430, label: 'Exile & Return' },
  { max: 0, label: 'Between the Testaments' },
  { max: Infinity, label: 'The New Testament' },
];

function eraBand(y) {
  if (!y || !Number.isFinite(y[0])) return null;
  const mid = (y[0] + y[1]) / 2;
  for (const band of ERA_BANDS) if (mid <= band.max) return band.label;
  return 'The New Testament';
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function firstSentence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : s;
}

// "Hebrew mosheh — 'drawn out' (of the water)" → "drawn out (of the water)"
function cleanMeaning(nm) {
  return String(nm || '')
    .replace(/^[^—]*—\s*/, '')
    .replace(/[‘’'"“”]/g, '')
    .trim();
}

function firstBookName(entry) {
  const code = entry.fv?.split('.')[0];
  return code ? CODE_TO_NAME[code] : null;
}

// Distractor names for "who is this?": same gender, and — when the subject has
// a known era — clustered near it, so wrong answers are plausible, not random.
function nameDistractors(subject, people, count, rand) {
  const taken = new Set([subject.name.toLowerCase()]);
  let pool = people.filter(
    (p) => p.s !== subject.s && p.g === subject.g && !taken.has(p.name.toLowerCase()),
  );
  if (pool.length < count) {
    pool = people.filter((p) => p.s !== subject.s && !taken.has(p.name.toLowerCase()));
  }
  const mid = subject.y ? (subject.y[0] + subject.y[1]) / 2 : null;
  if (mid != null) {
    const scored = pool
      .map((p) => {
        const pm = p.y ? (p.y[0] + p.y[1]) / 2 : null;
        return { p, d: pm == null ? 1e9 : Math.abs(mid - pm) };
      })
      .sort((a, b) => a.d - b.d);
    pool = scored.slice(0, Math.max(count * 5, 15)).map((s) => s.p);
  }
  const names = [];
  for (const p of shuffle(pool, rand)) {
    if (names.length >= count) break;
    if (!names.some((n) => n.toLowerCase() === p.name.toLowerCase())) names.push(p.name);
  }
  return names;
}

function buildIdentify(entry, people, rand) {
  const wrong = nameDistractors(entry, people, 3, rand);
  if (wrong.length < 3) return null;
  const hints = [];
  const era = eraBand(entry.y);
  hints.push(era
    || (NT_CODES.has(entry.fv?.split('.')[0]) ? 'A New Testament figure' : 'An Old Testament figure'));
  const book = firstBookName(entry);
  if (book) hints.push(`First appears in ${book}`);
  return {
    type: 'identify',
    subject: entry.s,
    subjectName: entry.name,
    hideName: true,
    q: 'Who is this figure?',
    options: shuffle([entry.name, ...wrong], rand),
    answer: entry.name,
    about: entry.s,
    hints,
    fact: firstSentence(entry.desc),
  };
}

function buildFirstBook(entry, people, rand) {
  const book = firstBookName(entry);
  if (!book) return null;
  const others = [...new Set(people.map(firstBookName).filter((b) => b && b !== book))];
  if (others.length < 3) return null;
  return {
    type: 'first-book',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: `Where does ${entry.name} first appear in Scripture?`,
    options: shuffle([book, ...shuffle(others, rand).slice(0, 3)], rand),
    answer: book,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

const RELATIONS = [
  ['fa', (n) => `Who was ${n}'s father?`],
  ['mo', (n) => `Who was ${n}'s mother?`],
  ['pt', (n) => `Who was ${n}'s spouse?`],
  ['ch', (n) => `Which of these was a child of ${n}?`],
  ['sib', (n) => `Who was a sibling of ${n}?`],
];

function buildRelation(entry, wiki, people, rand) {
  const candidates = RELATIONS.filter(([key]) => {
    const v = entry.rel?.[key];
    return v && (Array.isArray(v) ? v.length : true);
  });
  if (!candidates.length) return null;
  const [key, phrase] = pick(candidates, rand);
  const target = wiki.bySlug.get(pick([].concat(entry.rel[key]), rand));
  if (!target) return null;
  const related = Object.values(entry.rel)
    .flatMap((v) => [].concat(v))
    .map((s) => wiki.bySlug.get(s)?.name)
    .filter(Boolean);
  const exclude = new Set([entry.name, target.name, ...related].map((n) => n.toLowerCase()));
  const wrong = shuffle(people.filter((p) => !exclude.has(p.name.toLowerCase())), rand)
    .slice(0, 3)
    .map((p) => p.name);
  if (wrong.length < 3) return null;
  return {
    type: 'relation',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: phrase(entry.name),
    options: shuffle([target.name, ...wrong], rand),
    answer: target.name,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

function buildEra(entry, rand) {
  const band = eraBand(entry.y);
  if (!band) return null;
  const others = ERA_BANDS.map((b) => b.label).filter((l) => l !== band);
  return {
    type: 'era',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: `When did ${entry.name} live?`,
    options: shuffle([band, ...shuffle(others, rand).slice(0, 3)], rand),
    answer: band,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

function buildKeyVerse(entry, people, rand) {
  const kv = entry.kv?.[0];
  if (!kv) return null;
  const others = [...new Set(people.flatMap((p) => p.kv || []).filter((v) => v && v !== kv))];
  if (others.length < 3) return null;
  return {
    type: 'key-verse',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: `Which verse anchors the story of ${entry.name}?`,
    options: shuffle([kv, ...shuffle(others, rand).slice(0, 3)], rand),
    answer: kv,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

function buildMeaning(entry, people, rand) {
  const mine = cleanMeaning(entry.nm);
  if (!mine) return null;
  const others = [...new Set(
    people
      .filter((p) => p.nm && p.s !== entry.s)
      .map((p) => cleanMeaning(p.nm))
      .filter((m) => m && m !== mine),
  )];
  if (others.length < 3) return null;
  return {
    type: 'meaning',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: `What does the name “${entry.name}” mean?`,
    options: shuffle([mine, ...shuffle(others, rand).slice(0, 3)], rand),
    answer: mine,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

function buildStoryBeat(entry, people, rand) {
  if (!entry.arc?.length) return null;
  const mine = pick(entry.arc, rand).t;
  const others = [...new Set(
    people
      .filter((p) => p.s !== entry.s && p.arc)
      .flatMap((p) => p.arc.map((a) => a.t))
      .filter((t) => t && t !== mine),
  )];
  if (others.length < 3) return null;
  return {
    type: 'story-beat',
    subject: entry.s,
    subjectName: entry.name,
    hideName: false,
    q: `Which of these is a scene from ${entry.name}'s life?`,
    options: shuffle([mine, ...shuffle(others, rand).slice(0, 3)], rand),
    answer: mine,
    about: entry.s,
    hints: [],
    fact: firstSentence(entry.desc),
  };
}

// Only image-eligible, described, gendered people are quiz subjects (core
// entries are reliably pictured; gender drives the identify distractors).
export function quizPeople(wiki) {
  return wiki.entries.filter(
    (e) => e.type === 'person'
      && !NO_GENERATED_IMAGE.has(e.s)
      && e.desc
      && (e.g === 'M' || e.g === 'F'),
  );
}

// A round of `count` questions: varied archetypes, no repeated subject, a fame
// ramp (famous first, deeper cuts later), identify as the signature type and
// the universal fallback. Deterministic when given a seeded `rand`.
export function generateReelQuiz(wiki, count = 7, rand = Math.random) {
  const people = quizPeople(wiki);
  if (people.length < 8) return [];
  const byFame = [...people].sort((a, b) => (b.vc || 0) - (a.vc || 0));
  const tierFor = (i) => (i < 2
    ? byFame.slice(0, 25)
    : i < 4 ? byFame.slice(0, 70) : byFame.slice(0, Math.min(150, byFame.length)));
  // "Who is this?" needs a recognizable face — always draw it from the famous
  // tier, even late in the round. Name-shown types can use deeper cuts.
  const identifyTier = byFame.slice(0, 60);

  const builders = {
    identify: (e) => buildIdentify(e, people, rand),
    'first-book': (e) => buildFirstBook(e, people, rand),
    relation: (e) => buildRelation(e, wiki, people, rand),
    era: (e) => buildEra(e, rand),
    'key-verse': (e) => buildKeyVerse(e, people, rand),
    meaning: (e) => buildMeaning(e, people, rand),
    'story-beat': (e) => buildStoryBeat(e, people, rand),
  };

  const bonus = shuffle(['era', 'key-verse', 'meaning', 'story-beat'], rand);
  const plan = ['identify', 'relation', 'first-book', 'identify', bonus[0], 'relation', 'identify'];
  while (plan.length < count) plan.push(pick(['identify', 'relation', 'first-book'], rand));

  const usedSubjects = new Set();
  const usedKeys = new Set();
  const out = [];

  const realize = (archetype, tier) => {
    const pool = archetype === 'identify' ? identifyTier : tier;
    for (const e of shuffle(pool, rand)) {
      if (usedSubjects.has(e.s)) continue;
      const q = builders[archetype]?.(e);
      if (!q) continue;
      if (q.options.length < 4 || new Set(q.options).size !== q.options.length) continue;
      const qKey = `${q.q}|${q.answer}`;
      if (usedKeys.has(qKey)) continue;
      return q;
    }
    return null;
  };

  for (let i = 0; i < count; i += 1) {
    const tier = tierFor(i);
    let q = null;
    for (const archetype of [plan[i], 'identify', 'relation', 'first-book']) {
      q = realize(archetype, tier);
      if (q) break;
    }
    if (!q) q = realize('identify', byFame); // last resort: widen the pool
    if (!q) break;
    usedSubjects.add(q.subject);
    usedKeys.add(`${q.q}|${q.answer}`);
    out.push(q);
  }
  return out;
}

// Score for a correct answer: base + speed bonus (identify only, decaying as
// the picture sharpens) times the streak multiplier (caps at 2×).
export function scoreAnswer(question, revealStage, newStreak) {
  const speed = question.type === 'identify' ? [50, 30, 10][revealStage] || 0 : 0;
  const multiplier = Math.min(2, 1 + 0.1 * (newStreak - 1));
  return Math.round((100 + speed) * multiplier);
}
