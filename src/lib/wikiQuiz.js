// Bible Wiki trivia generator — multiple-choice questions derived entirely
// from the foundation data (family relations, first appearances, aliases,
// name meanings), so there is nothing to author or keep in sync. Used by the
// wiki quiz card and fellowship game nights.

import { CODE_TO_NAME } from './scripture';

const REL_QUESTIONS = [
  ['fa', (name) => `Who was ${name}'s father?`],
  ['mo', (name) => `Who was ${name}'s mother?`],
  ['pt', (name) => `Who was ${name}'s spouse?`],
  ['ch', (name) => `Which of these was a child of ${name}?`],
  ['sib', (name) => `Who was a sibling of ${name}?`],
];

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

// Distractor names: same-type entries, excluding the subject, the correct
// answer, and anyone whose name matches the answer.
function distractorNames(entries, exclude, count, rand) {
  const excluded = new Set(exclude.map((n) => n.toLowerCase()));
  const pool = entries.filter((e) => !excluded.has(e.name.toLowerCase()));
  return shuffle(pool, rand).slice(0, count).map((e) => e.name);
}

function relationQuestion(entry, wiki, people, rand) {
  const candidates = REL_QUESTIONS.filter(([key]) => {
    const v = entry.rel?.[key];
    return v && (Array.isArray(v) ? v.length : true);
  });
  if (!candidates.length) return null;
  const [key, phrase] = pick(candidates, rand);
  const slugs = [].concat(entry.rel[key]);
  const target = wiki.bySlug.get(pick(slugs, rand));
  if (!target) return null;
  const relatedNames = Object.values(entry.rel).flatMap((v) => [].concat(v))
    .map((s) => wiki.bySlug.get(s)?.name).filter(Boolean);
  const wrong = distractorNames(people, [entry.name, target.name, ...relatedNames], 3, rand);
  if (wrong.length < 3) return null;
  return {
    q: phrase(entry.name),
    answer: target.name,
    options: shuffle([target.name, ...wrong], rand),
    about: entry.s,
    hint: `Read about ${entry.name}`,
  };
}

function firstBookQuestion(entry, wiki, people, rand) {
  if (!entry.fv) return null;
  const code = entry.fv.split('.')[0];
  const book = CODE_TO_NAME[code];
  if (!book) return null;
  const otherBooks = [...new Set(
    people.map((e) => CODE_TO_NAME[e.fv?.split('.')[0]]).filter((b) => b && b !== book),
  )];
  const wrong = shuffle(otherBooks, rand).slice(0, 3);
  if (wrong.length < 3) return null;
  return {
    q: `In which book does ${entry.name} first appear?`,
    answer: book,
    options: shuffle([book, ...wrong], rand),
    about: entry.s,
    hint: `First appears at ${entry.fv.replace(/\./g, ' ').replace(code, book)}`,
  };
}

function aliasQuestion(entry, wiki, people, rand) {
  if (!entry.al?.length) return null;
  const alias = pick(entry.al, rand);
  if (alias.toLowerCase() === entry.name.toLowerCase()) return null;
  const wrong = distractorNames(people, [entry.name, alias, entry.n], 3, rand);
  if (wrong.length < 3) return null;
  return {
    q: `Who in Scripture was also called “${alias}”?`,
    answer: entry.name,
    options: shuffle([entry.name, ...wrong], rand),
    about: entry.s,
  };
}

function meaningQuestion(entry, wiki, people, rand) {
  if (!entry.nm) return null;
  const withMeaning = people.filter((e) => e.nm && e.s !== entry.s);
  if (withMeaning.length < 3) return null;
  const wrong = shuffle(withMeaning, rand).slice(0, 3).map((e) => e.name);
  return {
    q: `Whose name means: ${entry.nm.replace(/^[^—]*—\s*/, '')}?`,
    answer: entry.name,
    options: shuffle([entry.name, ...wrong], rand),
    about: entry.s,
  };
}

const GENERATORS = [relationQuestion, firstBookQuestion, aliasQuestion, meaningQuestion];

// Generate up to `count` distinct questions from wiki data. `wiki` is the
// normalized { entries, bySlug } shape from loadBibleWiki(). Deterministic
// when given a seeded `rand`.
export function generateQuiz(wiki, count = 5, rand = Math.random) {
  const people = wiki.entries.filter((e) => e.type === 'person' && e.s !== 'god_1324');
  const pool = shuffle(people.filter((e) => (e.vc || 0) >= 5), rand);
  const questions = [];
  const usedQ = new Set();
  for (const entry of pool) {
    if (questions.length >= count) break;
    const generator = pick(GENERATORS, rand);
    const question = generator(entry, wiki, people, rand)
      || relationQuestion(entry, wiki, people, rand)
      || firstBookQuestion(entry, wiki, people, rand);
    if (question && !usedQ.has(question.q)) {
      usedQ.add(question.q);
      questions.push(question);
    }
  }
  return questions;
}
