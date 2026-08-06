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

// ── Chapter cache ───────────────────────────────────────────────────────────
// Requests are overwhelmingly verse ranges inside a small set of chapters, so we
// fetch and cache the whole chapter once and slice ranges out of it. Scripture
// never changes, so a cached chapter is never stale in the usual sense; the TTL
// exists to keep this a performance cache rather than a stored replica of a
// licensed text. See 20260806010000_passage_cache.sql.
const ESV_CACHE_TTL_DAYS = Number(Deno.env.get('ESV_CACHE_TTL_DAYS') ?? '30');

type ChapterSlice = { chapterId: string; from: number | null; to: number | null };

// 'PSA.23' → whole chapter; 'JHN.3.16' → one verse; 'JHN.3.16-JHN.3.18' → range.
// Returns null for anything spanning chapters or otherwise unparseable, so the
// caller can fall back to fetching the passage directly. That matters: for
// multi-chapter passages the client expects explicit "[3:16]" markers on every
// chapter after the first, which per-chapter fetches would not reproduce.
function parseSingleChapterSpec(passageId: string): ChapterSlice | null {
  const [startId, endId] = passageId.split('-');
  const s = startId.split('.');
  if (s.length < 2 || !CODE_TO_NAME[s[0]]) return null;
  const book = s[0];
  const chapter = Number(s[1]);
  if (!Number.isFinite(chapter)) return null;
  const chapterId = `${book}.${chapter}`;

  if (s.length === 2) return endId ? null : { chapterId, from: null, to: null };

  const from = Number(s[2]);
  if (!Number.isFinite(from)) return null;
  if (!endId) return { chapterId, from, to: from };

  const e = endId.split('.');
  if (e.length !== 3 || e[0] !== book || Number(e[1]) !== chapter) return null;
  const to = Number(e[2]);
  if (!Number.isFinite(to) || to < from) return null;
  return { chapterId, from, to };
}

// Cut a verse range out of chapter text carrying "[n]" markers. Boundaries are
// the marker offsets, so the returned string is byte-identical to what the API
// returns for that range directly.
function sliceVerses(content: string, from: number | null, to: number | null): string {
  if (from == null && to == null) return content;
  const marks: Array<{ v: number; idx: number }> = [];
  const re = /\[(\d+)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) marks.push({ v: Number(m[1]), idx: m.index });
  if (!marks.length) return content;

  let startIdx = 0;
  if (from != null) {
    const start = marks.find((x) => x.v >= from);
    if (!start) return '';
    startIdx = start.idx;
  }
  let endIdx = content.length;
  if (to != null) {
    const end = marks.find((x) => x.v > to && x.idx >= startIdx);
    if (end) endIdx = end.idx;
  }
  return content.slice(startIdx, endIdx).trim();
}

function cacheEnv() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

async function cacheGet(cacheKey: string): Promise<{ content: string; reference: string | null } | null> {
  const env = cacheEnv();
  if (!env) return null;
  try {
    const params = new URLSearchParams({
      cache_key: `eq.${cacheKey}`,
      select: 'content,reference,fetched_at',
      limit: '1',
    });
    const res = await fetch(`${env.url}/rest/v1/passage_cache?${params.toString()}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return null;
    const row = (await res.json())?.[0];
    if (!row?.content) return null;
    if (ESV_CACHE_TTL_DAYS > 0) {
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      if (ageMs > ESV_CACHE_TTL_DAYS * 86_400_000) return null; // stale → re-fetch
    }
    return { content: row.content, reference: row.reference ?? null };
  } catch {
    return null; // a cache failure must never break a lookup
  }
}

async function cachePut(
  cacheKey: string,
  translation: string,
  chapterId: string,
  reference: string | null,
  content: string,
) {
  const env = cacheEnv();
  if (!env) return;
  try {
    await fetch(`${env.url}/rest/v1/passage_cache`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        translation,
        chapter_id: chapterId,
        reference,
        content,
        fetched_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Losing a cache write just means the next request re-fetches.
  }
}

// Whole-chapter ESV text, from cache when we have it. Cache hits are recorded
// under the 'esv-cache' provider so the 'esv' counter keeps meaning "calls that
// actually reached Crossway" and stays valid for quota tracking.
async function getEsvChapter(
  chapterId: string,
  request: Request,
): Promise<{ content: string; reference: string | null } | Response> {
  const cacheKey = `esv:${chapterId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    await recordUsageEvent({
      provider: 'esv-cache',
      feature: 'chapter-hit',
      status: 200,
      request,
      metadata: { chapterId },
    });
    return cached;
  }

  const fetched = await fetchEsvRaw(chapterId, request);
  if (fetched instanceof Response) return fetched;
  await cachePut(cacheKey, 'esv', chapterId, fetched.reference, fetched.content);
  return fetched;
}

async function fetchEsvBible(passageId: string, request: Request) {
  const spec = parseSingleChapterSpec(passageId);
  // Cross-chapter or unparseable → original direct path, uncached.
  if (!spec) {
    const direct = await fetchEsvRaw(passageId, request);
    if (direct instanceof Response) return direct;
    return jsonResponse({
      data: {
        id: passageId,
        reference: direct.reference || passageIdToQuery(passageId),
        content: direct.content,
        translation: 'esv',
        copyright: 'ESV',
      },
    });
  }

  const chapter = await getEsvChapter(spec.chapterId, request);
  if (chapter instanceof Response) return chapter;

  const content = sliceVerses(chapter.content, spec.from, spec.to);
  if (!content) {
    return jsonResponse({ error: 'No ESV passage returned' }, 404);
  }

  return jsonResponse({
    data: {
      id: passageId,
      // Whole-chapter requests keep Crossway's canonical string; ranges are
      // named from the request itself since the cached text covers the chapter.
      reference: (spec.from == null ? chapter.reference : null) || passageIdToQuery(passageId),
      content,
      translation: 'esv',
      copyright: 'ESV',
    },
  });
}

// Fetch ESV text through Crossway's server-side API. Keep the ESV token out of
// browser code and normalize the result to the same content shape used by the
// other passage providers.
async function fetchEsvRaw(
  passageId: string,
  request: Request,
): Promise<{ content: string; reference: string | null } | Response> {
  const apiKey = Deno.env.get('ESV_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'ESV_API_KEY not configured' }, 503);
  }

  const query = passageIdToQuery(passageId);
  if (!query) {
    return jsonResponse({ error: `Cannot map passage id ${passageId}` }, 400);
  }

  const params = new URLSearchParams({
    q: query,
    'include-passage-references': 'false',
    'include-verse-numbers': 'true',
    'include-first-verse-numbers': 'true',
    'include-footnotes': 'false',
    'include-footnote-body': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'include-copyright': 'false',
  });
  const res = await fetch(`https://api.esv.org/v3/passage/text/?${params.toString()}`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  await recordUsageEvent({
    provider: 'esv',
    feature: 'passage-text',
    status: res.status,
    request,
    metadata: { passageId, query },
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: `ESV API responded with ${res.status}`, detail: text }, res.status);
  }

  const data = await res.json();
  const passages = (data?.passages || []) as string[];
  const content = passages
    .map((passage) => String(passage || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');

  if (!content) {
    return jsonResponse({ error: 'No ESV passage returned' }, 404);
  }

  return { content, reference: data?.canonical || query };
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

    if (bibleId === 'esv') {
      return await fetchEsvBible(passageId, request);
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
