// Passage fetching via the existing bible-proxy function (ESV, free fallback).
// Nothing is judged against a model's memory of Scripture — cards only carry
// text fetched here.

import { CONTEXT_VERSES } from './constants.ts';
import { type ParsedRef, toPassageId } from './reference.ts';

export type FetchedPassage = { reference: string; content: string; translation: string } | null;

// Parallel fetches stay below this so we don't hammer bible-proxy / the ESV API.
const FETCH_CONCURRENCY = 6;

async function callBibleProxy(bibleId: string, passageId: string): Promise<FetchedPassage> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bible-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({ bibleId, passageId }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = data?.data?.content;
  if (!content) return null;
  return {
    reference: data.data.reference || passageId,
    content: String(content),
    translation: data.data.translation || bibleId,
  };
}

// ESV with context window → ESV exact range → free WEB text. null if all fail
// (out-of-range expansions fall through to the exact range).
export async function fetchPassage(ref: ParsedRef): Promise<FetchedPassage> {
  const expanded = toPassageId(ref, CONTEXT_VERSES);
  const exact = toPassageId(ref, 0);
  return (
    (await callBibleProxy('esv', expanded))
    ?? (expanded !== exact ? await callBibleProxy('esv', exact) : null)
    ?? (await callBibleProxy('free:web', expanded))
    ?? (expanded !== exact ? await callBibleProxy('free:web', exact) : null)
  );
}

// Fetch a set of unique references concurrently (bounded), keyed by the exact
// passage id so duplicate citations reuse one fetch.
export async function fetchPassagesByKey(refs: Map<string, ParsedRef>): Promise<Map<string, FetchedPassage>> {
  const entries = [...refs.entries()];
  const results = new Map<string, FetchedPassage>();
  let next = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, entries.length) }, async () => {
    while (next < entries.length) {
      const index = next;
      next += 1;
      const [key, ref] = entries[index];
      results.set(key, await fetchPassage(ref));
    }
  });
  await Promise.all(workers);
  return results;
}
