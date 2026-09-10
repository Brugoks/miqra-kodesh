import wiki from '../../../src/assets/bible-wiki.json' with { type: 'json' };
import curated from '../../../src/assets/bible-wiki-curated.json' with { type: 'json' };
import { CanvasError, parseReference, type Source, type Workspace } from './core.ts';

export async function loadSources(reference: string, signal: AbortSignal): Promise<Workspace> {
  const spec = parseReference(reference);
  const response = await fetch(`https://bible.helloao.org/api/BSB/${spec.book}/${spec.chapter}.json`, { signal });
  if (!response.ok) throw new CanvasError('Scripture could not be loaded. Please try again.', 502);
  const data = await response.json();
  const verses = (data?.chapter?.content || []).filter((block: any) => block.type === 'verse' && Number.isInteger(block.number));
  if (spec.from !== null && (!verses.some((v: any) => v.number === spec.from) || !verses.some((v: any) => v.number === spec.to))) {
    throw new CanvasError('That verse range does not exist in this chapter.');
  }
  const sources: Source[] = verses.filter((v: any) => spec.from === null || (v.number >= spec.from && v.number <= spec.to!)).map((v: any) => ({
    id: `verse-${spec.chapterId}.${v.number}`, kind: 'verse', title: `${spec.reference.split(':')[0]}:${v.number}`,
    ref: `${spec.reference.split(':')[0]}:${v.number}`,
    text: (v.content || []).map((part: any) => typeof part === 'string' ? part : part?.text || '').join(' ').replace(/\s+/g, ' ').trim(),
  })).filter((v: Source) => v.text);
  if (!sources.length) throw new CanvasError('No Scripture text was returned. Please try another passage.', 502);
  for (const [kind, entries] of [['person', wiki.people], ['place', wiki.places]] as const) {
    const related = entries.filter((entry: any) => entry.s !== 'god_1324' && entry.p?.includes(spec.chapterId)).slice(0, 4);
    for (const entry of related as any[]) {
      const extra = (curated as Record<string, any>)[entry.s] || {};
      const name = extra.t || entry.t || entry.n;
      sources.push({ id: `wiki-${entry.s}`, kind, slug: entry.s, title: name,
        text: String(extra.desc || entry.desc || `${name} is indexed in this chapter by the Bible Wiki.`).slice(0, 1500) });
    }
  }
  return { reference: spec.reference, chapterId: spec.chapterId, translation: 'BSB', sources };
}
