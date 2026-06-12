import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const WLC_ID = '0b262f1ed7f084a6-01';

// Strongs-tagged Greek NT (Textus Receptus with Strongs on api.bible)
const TR_ID = 'f72b840c855f362c-04';

const NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
]);

function isNT(passageId: string): boolean {
  return NT_BOOKS.has(passageId.split('.')[0].toUpperCase());
}

function normalizeId(id: string): string {
  // H0430 → H430, G03056 → G3056
  return id.replace(/^([HG])0+(\d)/, '$1$2');
}

function extractWords(nodes: unknown[]): Array<{ id: string; script: string }> {
  const words: Array<{ id: string; script: string }> = [];
  for (const node of nodes as Record<string, unknown>[]) {
    if (
      node.type === 'tag' &&
      (node.attrs as Record<string, string>)?.style === 'w' &&
      (node.attrs as Record<string, string>)?.strong
    ) {
      const script = ((node.items as Record<string, unknown>[]) || [])
        .filter((i) => i.type === 'text')
        .map((i) => (i as { text: string }).text)
        .join('')
        .trim();
      const rawId = (node.attrs as Record<string, string>).strong;
      words.push({ id: normalizeId(rawId), script });
    }
    if (Array.isArray((node as Record<string, unknown>).items)) {
      words.push(...extractWords((node as { items: unknown[] }).items));
    }
  }
  return words;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { passageId } = (await request.json()) as { passageId: string };
    if (!passageId) return jsonResponse({ error: 'passageId required' }, 400);

    const apiKey = Deno.env.get('API_BIBLE_KEY');
    if (!apiKey) return jsonResponse({ error: 'API_BIBLE_KEY not configured' }, 503);

    const testament = isNT(passageId) ? 'NT' : 'OT';
    const bibleId = testament === 'OT' ? WLC_ID : TR_ID;

    // Fetch Strongs-tagged Bible in JSON format
    const bibleUrl =
      `https://api.scripture.api.bible/v1/bibles/${bibleId}/passages/` +
      `${encodeURIComponent(passageId)}?content-type=json&include-verse-numbers=false&include-titles=false`;

    const bibleRes = await fetch(bibleUrl, { headers: { 'api-key': apiKey } });
    if (!bibleRes.ok) {
      return jsonResponse({ words: [], testament, error: `Bible fetch failed: ${bibleRes.status}` });
    }

    const bibleData = await bibleRes.json();
    const content = bibleData?.data?.content;
    if (!content || !Array.isArray(content)) {
      return jsonResponse({ words: [], testament });
    }

    // Extract and deduplicate Strongs entries
    const allWords = extractWords(content);
    const seen = new Map<string, string>();
    for (const w of allWords) {
      if (w.id && !seen.has(w.id)) seen.set(w.id, w.script);
    }

    if (seen.size === 0) {
      return jsonResponse({ words: [], testament });
    }

    // Query Supabase strongs_lexicon for all unique IDs at once
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ids = Array.from(seen.keys());
    const { data: lexRows, error: dbError } = await supabase
      .from('strongs_lexicon')
      .select('id, script, xlit, pron, pos, def, kjv_def')
      .in('id', ids);

    if (dbError) {
      return jsonResponse({ words: [], testament, error: dbError.message });
    }

    // Merge Hebrew/Greek script from Bible JSON with definitions from lexicon
    const words = (lexRows || []).map((row) => ({
      id: row.id,
      script: seen.get(row.id) || row.script,  // prefer original-script word from passage
      xlit: row.xlit,
      pron: row.pron,
      pos: row.pos,
      def: row.def,
      kjvDef: row.kjv_def,
    }));

    return jsonResponse({ words, testament });

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
