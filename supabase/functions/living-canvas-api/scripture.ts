import { parseReference } from '../study-canvas/core.ts';
import { flattenVerseContent } from '../../../src/lib/helloao.js';
import { IntegrationError } from './tools.js';

export async function loadScripture(reference: string, translation = 'BSB', fetcher = fetch) {
  const spec = parseReference(reference);
  if (!['BSB', 'KJV'].includes(translation)) throw new IntegrationError('invalid_translation', 'Choose BSB or KJV.');
  let chapter;
  try {
    const response = await fetcher(`https://bible.helloao.org/api/${translation === 'KJV' ? 'eng_kjv' : 'BSB'}/${spec.book}/${spec.chapter}.json`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Unavailable');
    chapter = await response.json();
    if (!Array.isArray(chapter?.chapter?.content)) throw new Error('Incomplete');
  } catch { throw new IntegrationError('scripture_unavailable', 'Scripture could not be verified. Retry later.', 502); }
  const blocks = (chapter?.chapter?.content || []).filter((v: any) => v.type === 'verse' && Number.isInteger(v.number));
  const selected = blocks.filter((v: any) => spec.from === null || (v.number >= spec.from && v.number <= spec.to!));
  if (!selected.length || (spec.from !== null && selected.length !== spec.to! - spec.from + 1)) throw new IntegrationError('invalid_reference', 'That verse range is not available in this chapter.');
  const verses = selected.map((v: any) => ({ reference: `${spec.reference.split(':')[0]}:${v.number}`, text: flattenVerseContent(v.content) }));
  if (verses.some((v: any) => !v.text || v.text.length > 4000)) throw new IntegrationError('scripture_unavailable', 'The Scripture response was incomplete.', 502);
  return { translation, reference: spec.reference, verses };
}
