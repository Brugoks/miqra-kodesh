import { describe, expect, it } from 'vitest';
import { buildTurns, canvasFileName, canvasToMarkdown, combinedSources, lineage, normalizeCanvas, orderTree, reflectionFor } from './studyCanvasModel';

const passage = (reference, chapterId, verse, wiki = 'wiki-paul_1') => ({ reference, chapterId, translation: 'BSB', sources: [
  { id: `verse-${chapterId}.${verse}`, kind: 'verse', ref: `${reference.split(':')[0]}:${verse}`, title: `${reference.split(':')[0]}:${verse}`, text: `Verse ${verse} text` },
  { id: wiki, kind: 'person', slug: wiki.slice(5), title: 'Paul', text: 'An apostle.' },
] });
const corinthians = passage('1 Corinthians 11:19', '1CO.11', 19);
const john = passage('1 John 2:19', '1JN.2', 19);
const explanation = (title, sourceId = 'verse-1CO.11.19') => ({ title, cards: [{ id: 'insight-1', title: `${title} card`, body: `${title} body`, kind: 'observation', sourceIds: [sourceId] }], questions: ['Next?'] });
const step = (id, parentId, extra = {}) => ({ id, parentId, focus: `Question ${id}`, explanation: explanation(`Title ${id}`), createdAt: null, note: '', cardNotes: {}, ...extra });

describe('normalizeCanvas', () => {
  it('upgrades the original single-workspace, single-explanation save', () => {
    const canvas = normalizeCanvas({ id: 'c', title: 'Old', workspace: corinthians, explanation: explanation('Old'), resultFocus: 'Why factions?', turns: [], savedAt: '2026-09-01T00:00:00Z' });
    expect(canvas.passages).toEqual([corinthians]);
    expect(canvas.steps).toEqual([{ id: 'c-1', parentId: null, focus: 'Why factions?', explanation: explanation('Old'), createdAt: '2026-09-01T00:00:00Z', note: '', cardNotes: {} }]);
    expect(canvas.pins).toEqual([]);
  });

  it('turns a pre-branching history into a straight line, and repairs dangling parents', () => {
    const linear = normalizeCanvas({ id: 'c', workspace: corinthians, steps: [{ id: 'a', focus: '', explanation: explanation('A') }, { id: 'b', focus: '', explanation: explanation('B') }] });
    expect(linear.steps.map((s) => s.parentId)).toEqual([null, 'a']);
    const dangling = normalizeCanvas({ id: 'c', passages: [corinthians], steps: [{ ...step('a', 'gone') }, step('b', 'b')] });
    expect(dangling.steps.map((s) => s.parentId)).toEqual([null, null]);
  });

  it('keeps only pins that point at a real card, once each', () => {
    const canvas = normalizeCanvas({ id: 'c', passages: [corinthians], steps: [step('a', null)], pins: [
      { stepId: 'a', cardId: 'insight-1' }, { stepId: 'a', cardId: 'insight-1' }, { stepId: 'a', cardId: 'missing' }, { stepId: 'nope', cardId: 'insight-1' },
    ] });
    expect(canvas.pins).toEqual([{ id: 'a:insight-1', stepId: 'a', cardId: 'insight-1' }]);
  });

  it('rejects damaged canvases', () => {
    expect(normalizeCanvas({ id: 'c', passages: [], steps: [step('a', null)] })).toBeNull();
    expect(normalizeCanvas({ id: 'c', passages: [corinthians, john, corinthians, john, corinthians], steps: [step('a', null)] })).toBeNull();
    expect(normalizeCanvas({ id: 'c', passages: [corinthians], steps: [{ id: 'a', focus: 'x', explanation: { title: 'no cards' } }] })).toBeNull();
  });
});

describe('the step tree', () => {
  // a → b → c, with d branching from a and e continuing d.
  const steps = [step('a', null), step('b', 'a'), step('c', 'b'), step('d', 'a'), step('e', 'd')];

  it('orders depth-first, keeping creation numbers and labelling branches', () => {
    expect(orderTree(steps).map(({ step: s, number, depth, branchFrom }) => [s.id, number, depth, branchFrom])).toEqual([
      ['a', 1, 0, null], ['b', 2, 0, null], ['c', 3, 0, null], ['d', 4, 1, 1], ['e', 5, 1, null],
    ]);
  });

  it('survives cyclic parents without looping or dropping steps', () => {
    const cyclic = [step('x', 'y'), step('y', 'x')];
    expect(orderTree(cyclic)).toHaveLength(2);
    expect(lineage(cyclic, 'x').map((s) => s.id)).toEqual(['y', 'x']);
  });

  it('sends only the branch being asked from as context, with reflections folded into the next question', () => {
    const noted = steps.map((s) => (s.id === 'a' ? { ...s, note: 'Division exposes hearts.' } : s.id === 'd' ? { ...s, cardNotes: { 'insight-1': 'Compare 1 John' } } : s));
    const turns = buildTurns(noted, 'e', 'What is approval?');
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
    expect(turns.map((t) => t.content).join('\n')).not.toMatch(/Title b|Title c/);
    expect(turns[2].content).toBe('My reflection so far: Division exposes hearts.\n\nMy question: Question d');
    expect(turns[4].content).toContain('On "Title d card": Compare 1 John');
    expect(turns.at(-1)).toEqual({ role: 'user', content: 'What is approval?' });
    expect(buildTurns(noted, null, 'Start')).toEqual([{ role: 'user', content: 'Start' }]);
  });

  it('keeps every turn inside the server limits', () => {
    const long = Array.from({ length: 12 }, (_, i) => step(`s${i}`, i ? `s${i - 1}` : null, { note: 'n'.repeat(4000), explanation: { ...explanation('Long'), cards: Array.from({ length: 4 }, (_, c) => ({ id: `insight-${c}`, title: 'T', body: 'b'.repeat(1800), kind: 'observation', sourceIds: ['x'] })) } }));
    const turns = buildTurns(long, 's11', 'q'.repeat(2900));
    expect(turns.length).toBeLessThanOrEqual(12);
    expect(turns.every((t) => t.content.length > 0 && t.content.length <= 3000)).toBe(true);
    expect(JSON.stringify({ turns }).length).toBeLessThan(40000);
    expect(reflectionFor(long[0])).toHaveLength(4000);
  });
});

describe('export', () => {
  const canvas = normalizeCanvas({ id: 'c', title: 'Truth by Contrast', passages: [corinthians, john],
    steps: [step('a', null, { note: 'My private thought' }), step('b', 'a'), { ...step('d', 'a'), explanation: explanation('Went out from us', 'verse-1JN.2.19'), cardNotes: { 'insight-1': 'Card note' } }],
    pins: [{ stepId: 'd', cardId: 'insight-1' }] });

  it('dedupes shared Wiki entries across passages', () => {
    expect(combinedSources(canvas.passages).filter((s) => s.kind === 'person')).toHaveLength(1);
  });

  it('writes the path, each step with its sources, pins and Scripture', () => {
    const md = canvasToMarkdown(canvas, { exportedAt: new Date('2026-09-14T12:00:00Z') });
    expect(md).toMatch(/^# Truth by Contrast\n\n\*\*Passages:\*\* 1 Corinthians 11:19 · 1 John 2:19/);
    expect(md).toContain('  - Step 3: Went out from us _(branches from step 1)_');
    expect(md).toContain('Sources: 1 John 2:19');
    expect(md).toContain('**My reflection:** My private thought');
    expect(md).toContain('> **My note:** Card note');
    expect(md).toContain('## Pinned insights\n\n- **Went out from us card** (step 3)');
    expect(md).toContain('### 1 John 2:19\n\n**19** Verse 19 text');
  });

  it('leaves notes out when asked', () => {
    const md = canvasToMarkdown(canvas, { includeNotes: false });
    expect(md).not.toMatch(/My private thought|Card note/);
  });

  it('makes a safe file name', () => {
    expect(canvasFileName('Truth by Contrast: 1 Cor 11:19!')).toBe('truth-by-contrast-1-cor-11-19.md');
    expect(canvasFileName('???')).toBe('study-canvas.md');
  });
});
