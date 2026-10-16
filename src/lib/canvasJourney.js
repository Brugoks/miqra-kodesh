// Personal moments stay private. Only an explicit related-Scripture request
// sends the original glimpse and the user's optional focus to the study AI.
export const JOURNEY_TEXT_MAX = 4000;
export const JOURNEY_ENTRY_MAX = 100;
export const JOURNEY_KINDS = {
  reflection: { label: 'Reflection', prompt: 'What happened since? Has your understanding changed?', hint: 'What has deepened, remained difficult, or surprised you? It is okay to still be exploring.' },
  scripture: { label: 'Scripture', prompt: 'How does this passage connect to your experience?', hint: 'Read the surrounding passage. Notice what it supports, challenges, or leaves you wondering.' },
  prayer: { label: 'Prayer', prompt: 'What would you like to bring to God?', hint: 'Gratitude, questions, and uncertainty all belong here.' },
  question: { label: 'Open question', prompt: 'What are you still wondering?', hint: 'You do not need to resolve this now. Leave a question to return to.' },
  response: { label: 'Small response', prompt: 'How could you put this into practice?', hint: 'Choose one small, concrete response: listen, ask for help, forgive, serve, or wait.' },
};

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function revisitDate(days, now = new Date()) {
  if (!days) return null;
  const date = new Date(now);
  date.setDate(date.getDate() + Number(days));
  return localDate(date);
}

const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validText = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= JOURNEY_TEXT_MAX;

export function normalizeRelatedScripture(value) {
  const validVerses = (verses, max) => Array.isArray(verses) && verses.length > 0 && verses.length <= max
    && verses.every((v) => validText(v?.reference) && v.reference.length <= 100 && validText(v.text));
  if (!value || value.translation !== 'BSB' || !validVerses(value.verses, 8) || !validVerses(value.contextVerses, 12)
    || !validText(value.contextReference) || value.contextReference.length > 100 || !validText(value.context)
    || !validText(value.connection) || !validText(value.glimpse)) return null;
  const verses = (items) => items.map(({ reference, text }) => ({ reference, text }));
  return { translation: 'BSB', verses: verses(value.verses), contextVerses: verses(value.contextVerses),
    contextReference: value.contextReference, context: value.context, connection: value.connection, glimpse: value.glimpse };
}

export function normalizeJourney(value) {
  if (!value || value.kind !== 'moment' || !validText(value.moment) || !validTime(value.createdAt)
    || (value.editedAt != null && !validTime(value.editedAt))
    || (value.revisitOn != null && !validDate(value.revisitOn)) || !Array.isArray(value.entries) || value.entries.length > JOURNEY_ENTRY_MAX) return null;
  const ids = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !Object.hasOwn(JOURNEY_KINDS, entry.kind)
      || !(validText(entry.text) || (entry.kind === 'scripture' && entry.scripture && entry.text === '')) || !validTime(entry.createdAt)
      || (entry.editedAt != null && !validTime(entry.editedAt))
      || (entry.scripture != null && (entry.kind !== 'scripture' || !normalizeRelatedScripture(entry.scripture)))
      || (entry.kind === 'scripture' && (typeof entry.reference !== 'string' || !entry.reference.trim() || entry.reference.length > 100))) return null;
    ids.add(entry.id);
  }
  return {
    kind: 'moment', moment: value.moment, createdAt: value.createdAt, revisitOn: value.revisitOn || null,
    ...(value.editedAt ? { editedAt: value.editedAt } : {}),
    entries: value.entries.map(({ id, kind, text, createdAt, reference, scripture, editedAt }) => ({ id, kind, text, createdAt,
      ...(kind === 'scripture' ? { reference, ...(scripture ? { scripture: normalizeRelatedScripture(scripture) } : {}) } : {}),
      ...(editedAt ? { editedAt } : {}),
    })),
  };
}

export function createMoment(moment, days = '', now = new Date()) {
  const text = moment.trim();
  const journey = normalizeJourney({ kind: 'moment', moment: text, createdAt: now.toISOString(), revisitOn: revisitDate(days, now), entries: [] });
  if (!journey) throw new Error('Add a few words about your moment before saving.');
  const title = text.replace(/\s+/g, ' ');
  return { id: crypto.randomUUID(), title: title.length > 80 ? `${title.slice(0, 77).trimEnd()}…` : title, passages: [], steps: [], pins: [], journey };
}

export function isRevisitDue(value, today = localDate()) {
  return Boolean(value && value <= today);
}

export function journeyToMarkdown(canvas, entries = canvas.journey.entries) {
  const j = canvas.journey;
  return [`# ${canvas.title}`, '', 'Living Canvas · My personal reflections', '', '## The original glimpse', '',
    localDate(new Date(j.createdAt)), '', j.moment, '',
    ...(j.editedAt ? [`Edited ${localDate(new Date(j.editedAt))}`, ''] : []),
    ...entries.flatMap((entry) => [`## ${JOURNEY_KINDS[entry.kind].label} · ${localDate(new Date(entry.createdAt))}`, '',
      ...(entry.editedAt ? [`Edited ${localDate(new Date(entry.editedAt))}`, ''] : []),
      ...(entry.reference ? [`Passage to explore: ${entry.reference}`, ''] : []),
      ...(entry.scripture ? [
        'Berean Standard Bible (public domain)', '', ...entry.scripture.verses.map((v) => `> ${v.reference} — ${v.text}`), '',
        `### Surrounding passage · ${entry.scripture.contextReference}`, '', ...entry.scripture.contextVerses.map((v) => `> ${v.reference} — ${v.text}`), '',
        '### Passage context (AI-assisted, editable)', '', entry.scripture.context, '',
        '### Connection to my glimpse (AI-assisted, editable)', '', entry.scripture.connection, '',
        'Glimpse when this passage was added:', '', entry.scripture.glimpse, '', '### My reflection', '',
      ] : []), entry.text, ''])].join('\n');
}
