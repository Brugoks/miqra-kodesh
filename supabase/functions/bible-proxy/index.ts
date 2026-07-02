import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type BibleRequest = {
  bibleId: string;
  passageId: string;
};

// USFM book code → name bible-api.com understands.
const CODE_TO_NAME: Record<string, string> = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs',
  ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations',
  EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah',
  JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai',
  ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John',
  ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians',
  EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians',
  '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
  '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John', '3JN': '3 John',
  JUD: 'Jude', REV: 'Revelation',
};

// 'JHN.3.16-JHN.3.18' → 'John 3:16-18'; 'PSA.23' → 'Psalms 23'. null if unmappable.
function passageIdToQuery(passageId: string): string | null {
  const [startId, endId] = passageId.split('-');
  const start = startId.split('.');
  const name = CODE_TO_NAME[start[0]];
  if (!name) return null;
  if (start.length === 2) return `${name} ${start[1]}`;
  const base = `${name} ${start[1]}:${start[2]}`;
  if (!endId) return base;
  const end = endId.split('.');
  if (end[0] !== start[0]) return null;
  return end[1] === start[1] ? `${base}-${end[2]}` : `${base}-${end[1]}:${end[2]}`;
}

// Fetch from bible-api.com (free, public domain translations, no key) and
// normalize into the same { data: { content } } shape as api.bible, including
// the "[n]" verse markers the client's verse parser expects.
async function fetchFreeBible(translation: string, passageId: string, request: Request) {
  const query = passageIdToQuery(passageId);
  if (!query) {
    return jsonResponse({ error: `Cannot map passage id ${passageId}` }, 400);
  }

  const url = `https://bible-api.com/${encodeURIComponent(query)}?translation=${encodeURIComponent(translation)}`;
  const res = await fetch(url);
  await recordUsageEvent({
    provider: 'bible-api.com',
    feature: 'passage',
    status: res.status,
    request,
    metadata: { translation, passageId },
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: `bible-api.com responded with ${res.status}`, detail: text }, res.status);
  }

  const data = await res.json();
  const verses = (data?.verses || []) as Array<{ verse: number; text: string }>;
  if (!verses.length) {
    return jsonResponse({ error: 'No verses returned' }, 404);
  }

  const content = verses
    .map((v) => `[${v.verse}] ${String(v.text || '').replace(/\s+/g, ' ').trim()}`)
    .join(' ');

  return jsonResponse({
    data: {
      id: passageId,
      reference: data.reference,
      content,
      translation: data.translation_id,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { bibleId, passageId } = (await request.json()) as BibleRequest;

    if (!bibleId || !passageId) {
      return jsonResponse({ error: 'bibleId and passageId are required' }, 400);
    }

    // Pseudo ids like 'free:web' / 'free:kjv' / 'free:asv' route straight to
    // bible-api.com — no key, no quota against api.bible.
    if (bibleId.startsWith('free:')) {
      return await fetchFreeBible(bibleId.slice('free:'.length), passageId, request);
    }

    const apiKey = Deno.env.get('API_BIBLE_KEY');
    if (!apiKey) {
      // Degrade to the free public-domain WEB text rather than failing outright.
      return await fetchFreeBible('web', passageId, request);
    }

    // A chapter ID (like "MAT.1") has only book and chapter segments, and no range dash.
    const isChapter = passageId.split('.').length === 2 && !passageId.includes('-');

    const url = isChapter
      ? `https://api.scripture.api.bible/v1/bibles/${bibleId}/chapters/${encodeURIComponent(passageId)}` +
        `?content-type=text&include-verse-numbers=true&include-titles=false`
      : `https://api.scripture.api.bible/v1/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}` +
        `?content-type=text&include-verse-numbers=true&include-titles=false`;

    const res = await fetch(url, { headers: { 'api-key': apiKey } });
    await recordUsageEvent({
      provider: 'api-bible',
      feature: isChapter ? 'chapter' : 'passage',
      status: res.status,
      request,
      metadata: { bibleId, passageId, type: isChapter ? 'chapter' : 'passage' },
    });

    if (!res.ok) {
      // Quota exhausted or upstream trouble — fall back to the free WEB text
      // so lookups keep working (the column is still labeled by the client).
      if (res.status === 429 || res.status >= 500) {
        return await fetchFreeBible('web', passageId, request);
      }
      const text = await res.text();
      return jsonResponse({ error: `api.bible responded with ${res.status}`, detail: text }, res.status);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
