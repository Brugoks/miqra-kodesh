// Client for the Free Use Bible API (bible.helloao.org) — keyless, no rate
// limits, CORS-open, so it is called directly from the browser (no edge
// function needed). Serves extra translations (BSB, KJV, Reina Valera) and
// the Tyndale Open Study Notes commentary (CC BY-SA 4.0).

const HELLOAO_BASE = 'https://bible.helloao.org/api';

// Flatten one verse's content array (strings mixed with { text }, { noteId },
// poem objects) into a plain text string.
export function flattenVerseContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item.text === 'string') return item.text;
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse a passage id ('JHN.3.16', 'JHN.3.16-JHN.3.18', 'PSA.23') into
// { book, chapter, from, to } where from/to are null for a bare chapter.
export function parsePassageId(passageId) {
  const [startId, endId] = String(passageId).split('-');
  const start = startId.split('.');
  if (start.length < 2) return null;
  const book = start[0];
  const chapter = Number(start[1]);
  if (!Number.isFinite(chapter)) return null;
  if (start.length === 2) return { book, chapter, from: null, to: null };
  const from = Number(start[2]);
  const end = endId ? endId.split('.') : null;
  const to = end && end.length === 3 && end[0] === book && Number(end[1]) === chapter
    ? Number(end[2])
    : from;
  return { book, chapter, from, to };
}

// Build inline-marker passage text ("[16] For God…") from a fetched chapter,
// matching the format bible-proxy content uses so the whole existing render /
// compare / commentary pipeline works unchanged. Markers stay verse-only when
// the chapter matches the lookup's first chapter, explicit "[c:v]" otherwise.
export function buildPassageContent(chapterJson, passageId, implicitChapter) {
  const parsed = parsePassageId(passageId);
  const blocks = chapterJson?.chapter?.content;
  if (!parsed || !Array.isArray(blocks)) return '';
  const pieces = [];
  for (const block of blocks) {
    if (block?.type !== 'verse' || !Number.isFinite(block.number)) continue;
    if (parsed.from != null && (block.number < parsed.from || block.number > parsed.to)) continue;
    const text = flattenVerseContent(block.content);
    if (!text) continue;
    const marker = parsed.chapter === implicitChapter ? `[${block.number}]` : `[${parsed.chapter}:${block.number}]`;
    pieces.push(`${marker} ${text}`);
  }
  return pieces.join(' ');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HelloAO request failed (${res.status})`);
  return res.json();
}

// Fetch one passage id's text for a translation (e.g. 'BSB', 'eng_kjv').
export async function fetchHelloaoPassage(translation, passageId, implicitChapter) {
  const parsed = parsePassageId(passageId);
  if (!parsed) throw new Error('Bad passage id');
  const json = await fetchJson(`${HELLOAO_BASE}/${encodeURIComponent(translation)}/${parsed.book}/${parsed.chapter}.json`);
  const content = buildPassageContent(json, passageId, implicitChapter);
  if (!content) throw new Error('No content');
  return content;
}

// Fetch the Tyndale Open Study Notes for a chapter → [{ verse, text }].
// Cached per book+chapter for the session (notes are static).
const tyndaleCache = new Map();
export async function fetchTyndaleNotes(bookCode, chapter) {
  const cacheKey = `${bookCode}.${chapter}`;
  if (tyndaleCache.has(cacheKey)) return tyndaleCache.get(cacheKey);
  const promise = fetchJson(`${HELLOAO_BASE}/c/tyndale/${bookCode}/${chapter}.json`)
    .then((json) => (json?.chapter?.content || [])
      .filter((block) => block?.type === 'verse' && Number.isFinite(block.number))
      .map((block) => ({ verse: block.number, text: flattenVerseContent(block.content) }))
      .filter((note) => note.text))
    .catch((err) => {
      tyndaleCache.delete(cacheKey); // let a later open retry
      throw err;
    });
  tyndaleCache.set(cacheKey, promise);
  return promise;
}
