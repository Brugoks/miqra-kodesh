import { describe, expect, it } from 'vitest';
import { createMoment } from './canvasJourney';
import {
  BOARD_LIMITS, BOARD_VERSION, CARD_HEIGHT, CARD_WIDTH, boardRecoveryJson, cardContent, connectionsFor, excerpt, fitSection, freeSlot, membershipAfterDrop,
  normalizeBoard, outlineGroups, projectBoard, renderedEdges, screenToWorld, searchBoard, sectionAt, sectionMinimum, sectionSummary, viewportCenter,
} from './canvasBoard';

const entry = (id, text = `Thought ${id}`, extra = {}) => ({ id, kind: 'reflection', text, createdAt: `2026-02-0${id.length}T12:00:00Z`, ...extra });
const make = (entries = [], board = null) => {
  const canvas = createMoment('The original glimpse');
  canvas.id = 'c1';
  canvas.journey.entries = entries;
  return board ? { ...canvas, board } : canvas;
};
const node = (id, ref, x = 0, y = 0, extra = {}) => ({ id, contentRef: ref, x, y, width: CARD_WIDTH, sectionId: null, ...extra });
const section = (id, extra = {}) => ({ id, title: 'Questions', color: 'teal', x: 0, y: 0, width: 600, height: 400, collapsed: false, ...extra });
const board = (parts = {}) => ({ version: BOARD_VERSION, nodes: [], sections: [], edges: [], ...parts });
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + CARD_HEIGHT && a.y + CARD_HEIGHT > b.y;

describe('normalizeBoard', () => {
  it('accepts a complete board and returns an explicit copy', () => {
    const raw = board({
      nodes: [node('moment:c1', { type: 'moment' }, 10, 20), node('entry:a', { type: 'entry', entryId: 'a' }, 500, 20, { sectionId: 's1' })],
      sections: [section('s1')], edges: [{ id: 'e1', source: 'moment:c1', target: 'entry:a', label: 'leads to', direction: 'forward', stray: 1 }],
    });
    const result = normalizeBoard(raw);
    expect(result.ok).toBe(true);
    expect(result.board.edges[0]).toEqual({ id: 'e1', source: 'moment:c1', target: 'entry:a', label: 'leads to', direction: 'forward' });
    expect(result.board).not.toBe(raw);
  });

  it.each([
    ['null', null], ['an array', []], ['a newer version', { ...board(), version: 2 }], ['a missing list', { version: 1, nodes: [], sections: [] }],
  ])('refuses %s without throwing', (_name, value) => { expect(normalizeBoard(value).ok).toBe(false); });

  it('names a newer version rather than calling it corrupt', () => {
    expect(normalizeBoard({ ...board(), version: 2 }).reason).toMatch(/newer version/);
  });

  it.each([
    ['a duplicate id', board({ nodes: [node('a', { type: 'moment' }), node('a', { type: 'entry', entryId: 'x' })] })],
    ['one id shared by a card and a section', board({ nodes: [node('a', { type: 'moment' })], sections: [section('a')] })],
    ['two cards for one entry', board({ nodes: [node('a', { type: 'entry', entryId: 'x' }), node('b', { type: 'entry', entryId: 'x' })] })],
    ['a position past the world limit', board({ nodes: [node('a', { type: 'moment' }, BOARD_LIMITS.coordinate + 1)] })],
    ['a non-finite position', board({ nodes: [node('a', { type: 'moment' }, Number.NaN)] })],
    ['a card too narrow', board({ nodes: [{ ...node('a', { type: 'moment' }), width: 199 }] })],
    ['a card too wide', board({ nodes: [{ ...node('a', { type: 'moment' }), width: 641 }] })],
    ['a section that does not exist', board({ nodes: [node('a', { type: 'moment' }, 0, 0, { sectionId: 'missing' })] })],
    ['an unknown color', board({ sections: [section('s', { color: 'hotpink' })] })],
    ['a section too small', board({ sections: [section('s', { width: 100 })] })],
    ['a section too large', board({ sections: [section('s', { height: 20001 })] })],
    ['an edge to nowhere', board({ nodes: [node('a', { type: 'moment' })], edges: [{ id: 'e', source: 'a', target: 'zz', label: '', direction: 'none' }] })],
    ['a self link', board({ nodes: [node('a', { type: 'moment' })], edges: [{ id: 'e', source: 'a', target: 'a', label: '', direction: 'none' }] })],
    ['a label over 120 characters', board({ nodes: [node('a', { type: 'moment' }), node('b', { type: 'entry', entryId: 'x' })], edges: [{ id: 'e', source: 'a', target: 'b', label: 'x'.repeat(121), direction: 'none' }] })],
    ['an unknown direction', board({ nodes: [node('a', { type: 'moment' }), node('b', { type: 'entry', entryId: 'x' })], edges: [{ id: 'e', source: 'a', target: 'b', label: '', direction: 'both' }] })],
    ['a duplicate pair in either direction', board({ nodes: [node('a', { type: 'moment' }), node('b', { type: 'entry', entryId: 'x' })], edges: [
      { id: 'e1', source: 'a', target: 'b', label: '', direction: 'none' }, { id: 'e2', source: 'b', target: 'a', label: '', direction: 'none' }] })],
  ])('rejects %s', (_name, value) => { expect(normalizeBoard(value).ok).toBe(false); });

  it('enforces the card, section and connection caps', () => {
    const many = (n, make1) => Array.from({ length: n }, (_, i) => make1(i));
    expect(normalizeBoard(board({ nodes: many(102, (i) => node(`n${i}`, { type: 'entry', entryId: `e${i}` })) })).ok).toBe(false);
    expect(normalizeBoard(board({ sections: many(21, (i) => section(`s${i}`)) })).ok).toBe(false);
    expect(normalizeBoard(board({ sections: many(20, (i) => section(`s${i}`)) })).ok).toBe(true);
  });
});

describe('projectBoard', () => {
  it('lays a legacy canvas out the same way every time, original first, entries in order, nothing overlapping', () => {
    const canvas = make(Array.from({ length: 12 }, (_, i) => entry(`id-${i}`)));
    const first = projectBoard(canvas).board;
    const again = projectBoard(JSON.parse(JSON.stringify(canvas))).board;
    expect(again).toEqual(first);
    expect(first.nodes[0]).toMatchObject({ id: 'moment:c1', x: 0, y: 0 });
    expect(first.nodes.map((n) => n.contentRef.entryId).slice(1)).toEqual(canvas.journey.entries.map((e) => e.id));
    for (let i = 0; i < first.nodes.length; i += 1) for (let j = i + 1; j < first.nodes.length; j += 1) expect(overlap(first.nodes[i], first.nodes[j])).toBe(false);
    expect(first.sections).toEqual([]);
    expect(first.edges).toEqual([]);
  });

  it('does not write: the canvas it reads is untouched', () => {
    const canvas = make([entry('a')]);
    const copy = JSON.stringify(canvas);
    projectBoard(canvas);
    expect(JSON.stringify(canvas)).toBe(copy);
    expect(canvas.board).toBeUndefined();
  });

  it('keeps stored placements and puts a new entry in a free slot', () => {
    const stored = board({ nodes: [node('moment:c1', { type: 'moment' }, 1000, 1000), node('entry:a', { type: 'entry', entryId: 'a' }, 440, 0)] });
    const { board: view, notices } = projectBoard(make([entry('a'), entry('b')], stored));
    expect(view.nodes[0]).toMatchObject({ x: 1000, y: 1000 });
    const placed = view.nodes[2];
    expect(placed.contentRef.entryId).toBe('b');
    expect(overlap(placed, view.nodes[1])).toBe(false);
    expect(notices).toMatchObject({ placed: 1, stale: 0 });
  });

  it('avoids sections when choosing a free slot', () => {
    const stored = board({ nodes: [node('moment:c1', { type: 'moment' })], sections: [section('s', { x: 400, y: -20, width: 1200, height: 500 })] });
    const { board: view } = projectBoard(make([entry('a')], stored));
    const placed = view.nodes[1];
    expect(placed.x < 400 || placed.x > 1600 || placed.y > 480 || placed.y + CARD_HEIGHT < -20).toBe(true);
  });

  it('omits references to entries that no longer exist, with their links, and says how many', () => {
    const stored = board({
      nodes: [node('moment:c1', { type: 'moment' }), node('entry:gone', { type: 'entry', entryId: 'gone' }, 500, 0), node('entry:a', { type: 'entry', entryId: 'a' }, 900, 0)],
      edges: [{ id: 'e1', source: 'moment:c1', target: 'entry:gone', label: '', direction: 'none' }, { id: 'e2', source: 'moment:c1', target: 'entry:a', label: '', direction: 'none' }],
    });
    const { board: view, notices } = projectBoard(make([entry('a')], stored));
    expect(view.nodes.map((n) => n.id)).toEqual(['moment:c1', 'entry:a']);
    expect(view.edges.map((e) => e.id)).toEqual(['e2']);
    expect(notices.stale).toBe(1);
  });

  it('lets a card claim membership only in a section that exists', () => {
    const stored = board({ nodes: [node('moment:c1', { type: 'moment' }, 0, 0, { sectionId: 's' })], sections: [section('s')] });
    expect(projectBoard(make([], stored)).board.nodes[0].sectionId).toBe('s');
  });
});

describe('geometry', () => {
  it('finds the visible centre at any pan and zoom', () => {
    expect(viewportCenter({ x: 0, y: 0, zoom: 1 }, { width: 1000, height: 600 })).toEqual({ x: 500, y: 300 });
    expect(viewportCenter({ x: -200, y: 100, zoom: 2 }, { width: 1000, height: 600 })).toEqual({ x: 350, y: 100 });
    expect(viewportCenter({ x: 300, y: -50, zoom: 0.5 }, { width: 800, height: 400 })).toEqual({ x: 200, y: 500 });
  });

  it('turns a screen point into a world point and back through the viewport', () => {
    const vp = { x: -120, y: 80, zoom: 1.5 };
    const world = screenToWorld(vp, { x: 330, y: 230 });
    expect(world).toEqual({ x: 300, y: 100 });
    expect({ x: world.x * vp.zoom + vp.x, y: world.y * vp.zoom + vp.y }).toEqual({ x: 330, y: 230 });
  });

  it('picks the topmost expanded section under a point, and skips collapsed ones', () => {
    const sections = [section('under', { width: 800, height: 800 }), section('over', { x: 100, y: 100, width: 300, height: 300 }), section('shut', { x: 0, y: 0, width: 800, height: 800, collapsed: true })];
    expect(sectionAt(sections, { x: 200, y: 200 }).id).toBe('over');
    expect(sectionAt(sections, { x: 700, y: 700 }).id).toBe('under');
    expect(sectionAt(sections, { x: 5000, y: 5000 })).toBeNull();
  });

  it('adopts by the centre, keeps a member until it is fully outside, and releases beyond that', () => {
    const sections = [section('s', { x: 0, y: 0, width: 600, height: 400 })];
    const rect = (x, y) => ({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
    expect(membershipAfterDrop(rect(100, 100), sections, null)).toBe('s');
    expect(membershipAfterDrop(rect(500, 100), sections, null)).toBeNull(); // centre outside: not adopted
    expect(membershipAfterDrop(rect(500, 100), sections, 's')).toBe('s'); // member, still overlapping: kept
    expect(membershipAfterDrop(rect(700, 100), sections, 's')).toBeNull(); // fully outside: released
  });

  it('fits a section around cards with room for its title, and never below the minimum size', () => {
    const frame = fitSection([{ x: 100, y: 200, width: 320, height: CARD_HEIGHT }]);
    expect(frame.x).toBeLessThan(100);
    expect(frame.y).toBeLessThan(200);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(420);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(200 + CARD_HEIGHT);
    expect(frame.width).toBeGreaterThanOrEqual(BOARD_LIMITS.sectionSize[0]);
    const min = sectionMinimum(section('s'), [{ x: 500, y: 300, width: 320, sectionId: 's' }]);
    expect(min.width).toBeGreaterThanOrEqual(820);
    expect(min.height).toBeGreaterThanOrEqual(300 + CARD_HEIGHT);
  });

  it('finds the first free slot on the grid', () => {
    const first = freeSlot([]);
    expect(freeSlot([first])).not.toEqual(first);
  });
});

describe('content, search and connections', () => {
  const scripture = { id: 'sc', kind: 'scripture', reference: 'Galatians 6:2', text: 'My reflection', createdAt: '2026-02-03T12:00:00Z', scripture: {
    translation: 'BSB', verses: [{ reference: 'Galatians 6:2', text: 'Carry one another’s burdens' }], contextReference: 'Galatians 6:1–4', contextVerses: [{ reference: 'Galatians 6:1', text: 'Brothers, if someone is caught' }],
    context: 'Paul writes about restoring gently.', connection: 'Receiving help is sharing a burden.', glimpse: 'The original glimpse' } };

  it('resolves cards to words, kind labels and dates from the journey', () => {
    const canvas = make([entry('a', 'A thought'), scripture]);
    const nodes = projectBoard(canvas).board.nodes;
    expect(cardContent(canvas, nodes[0])).toMatchObject({ label: 'Original glimpse', isMoment: true, text: 'The original glimpse' });
    expect(cardContent(canvas, nodes[1])).toMatchObject({ label: 'Thought', kind: 'reflection', text: 'A thought' });
    expect(cardContent(canvas, nodes[2])).toMatchObject({ label: 'Scripture', reference: 'Galatians 6:2' });
    expect(cardContent(canvas, { contentRef: { type: 'entry', entryId: 'nope' } })).toBeNull();
  });

  it('abbreviates long text with an ellipsis and falls back to the verse for a card with no note', () => {
    expect(excerpt({ text: 'word '.repeat(100) }, 40)).toHaveLength(40);
    expect(excerpt({ text: 'word '.repeat(100) }, 40).endsWith('…')).toBe(true);
    expect(excerpt({ text: '', entry: scripture })).toContain('Carry one another');
  });

  it('searches words, references, verses, section titles and connection labels', () => {
    const stored = board({
      nodes: [node('moment:c1', { type: 'moment' }, 0, 0, { sectionId: 's' }), node('entry:a', { type: 'entry', entryId: 'a' }, 500, 0), node('entry:sc', { type: 'entry', entryId: 'sc' }, 900, 0)],
      sections: [section('s', { title: 'Noticing' })], edges: [{ id: 'e', source: 'moment:c1', target: 'entry:a', label: 'tension', direction: 'none' }],
    });
    const canvas = make([entry('a', 'Waiting is hard'), scripture], stored);
    expect(searchBoard(canvas, 'waiting').map((h) => h.nodeId)).toEqual(['entry:a']);
    expect(searchBoard(canvas, 'burdens').map((h) => h.nodeId)).toEqual(['entry:sc']);
    expect(searchBoard(canvas, 'galatians').map((h) => h.nodeId)).toEqual(['entry:sc']);
    expect(searchBoard(canvas, 'glimpse')[0]).toMatchObject({ nodeId: 'moment:c1', sectionTitle: 'Noticing' });
    expect(searchBoard(canvas, 'noticing').some((h) => h.type === 'section')).toBe(true);
    expect(searchBoard(canvas, 'tension')[0]).toMatchObject({ type: 'connection', edgeId: 'e' });
    expect(searchBoard(canvas, '   ')).toEqual([]);
  });

  it('attaches links to a collapsed section\'s frame and hides links inside it', () => {
    const b = board({
      nodes: [node('a', { type: 'moment' }, 0, 0, { sectionId: 's' }), node('b', { type: 'entry', entryId: 'b' }, 400, 0, { sectionId: 's' }), node('c', { type: 'entry', entryId: 'c' }, 2000, 0)],
      sections: [section('s', { collapsed: true })],
      edges: [{ id: 'in', source: 'a', target: 'b', label: '', direction: 'none' }, { id: 'out', source: 'b', target: 'c', label: 'x', direction: 'forward' }],
    });
    expect(renderedEdges(b)).toEqual([{ id: 'out', source: 's', target: 'c', label: 'x', direction: 'forward', viaSection: true }]);
    expect(sectionSummary(b, 's')).toEqual({ cards: 2, links: 1 });
    expect(renderedEdges({ ...b, sections: [section('s')] }).map((e) => e.id)).toEqual(['in', 'out']);
  });

  it('lists a card\'s connections with direction', () => {
    const b = board({ nodes: [node('a', { type: 'moment' }), node('b', { type: 'entry', entryId: 'b' })], edges: [{ id: 'e', source: 'a', target: 'b', label: 'leads to', direction: 'forward' }] });
    expect(connectionsFor(b, 'b')).toEqual([{ edgeId: 'e', otherId: 'a', label: 'leads to', direction: 'forward', outgoing: false }]);
  });
});

describe('outline groups and recovery', () => {
  it('groups by section with loose cards first, or lists chronologically with the original first', () => {
    const stored = board({
      nodes: [node('moment:c1', { type: 'moment' }), node('entry:a', { type: 'entry', entryId: 'a' }, 500, 0, { sectionId: 's' }), node('entry:bb', { type: 'entry', entryId: 'bb' }, 900, 0)],
      sections: [section('s', { title: 'Questions' })],
    });
    const canvas = make([entry('a', 'In a section'), entry('bb', 'Loose')], stored);
    const groups = outlineGroups(canvas, 'section');
    expect(groups.map((g) => g.section?.title || null)).toEqual([null, 'Questions']);
    expect(groups[0].cards.map((c) => c.content.text)).toEqual(['The original glimpse', 'Loose']);
    expect(outlineGroups(canvas, 'chronological')[0].cards[0].content.isMoment).toBe(true);
  });

  it('exports a damaged layout verbatim for recovery', () => {
    const raw = { version: 9, whatever: true };
    const json = JSON.parse(boardRecoveryJson({ ...make(), boardIssue: { reason: 'newer', raw } }));
    expect(json.board).toEqual(raw);
    expect(json.issue).toBe('newer');
    expect(json.journey.moment).toBe('The original glimpse');
  });
});

describe('exporting a canvas with its layout', async () => {
  const { exportMarkdown } = await import('./canvasBoard');
  const stored = () => board({
    nodes: [node('moment:c1', { type: 'moment' }, 0, 0, { sectionId: 's' }), node('entry:a', { type: 'entry', entryId: 'a' }, 500, 0, { sectionId: 's' }), node('entry:b', { type: 'entry', entryId: 'b' }, 900, 0)],
    sections: [section('s', { title: 'Noticing' })],
    edges: [{ id: 'e1', source: 'moment:c1', target: 'entry:a', label: 'leads to', direction: 'forward' }, { id: 'e2', source: 'entry:a', target: 'entry:b', label: 'secret', direction: 'none' }],
  });
  const canvas = () => make([entry('a', 'Waiting is hard'), entry('bb', 'Private')].map((e, i) => ({ ...e, id: ['a', 'b'][i] })), stored());

  it('adds sections and the links between chosen cards to the story', () => {
    const c = canvas();
    const md = exportMarkdown(c, c.journey.entries);
    expect(md).toContain('## The original glimpse');
    expect(md).toContain('## Sections\n\n### Noticing');
    expect(md).toContain('- Thought');
    expect(md).toMatch(/## Connections\n\n- Original glimpse: The original glimpse → Thought: Waiting is hard \(leads to\)/);
  });

  it('includes a link only when both of its ends are chosen, and never names an unchosen card', () => {
    const c = canvas();
    const md = exportMarkdown(c, [c.journey.entries[0]]);
    expect(md).toContain('leads to');
    expect(md).not.toContain('secret');
    expect(md).not.toContain('Private');
    expect(exportMarkdown(c, [])).not.toContain('leads to');
  });

  it('is the plain story when nothing was arranged, or the layout could not be read', () => {
    const plain = make([entry('a', 'Only words')]);
    expect(exportMarkdown(plain)).not.toContain('## Sections');
    expect(exportMarkdown(plain)).not.toContain('## Connections');
    expect(exportMarkdown({ ...canvas(), board: null, boardIssue: { reason: 'x', raw: {} } })).not.toContain('## Sections');
  });
});

describe('placing a new empty section', async () => {
  const { emptySectionSpot } = await import('./canvasBoard');
  it('goes above everything already on the board, and each new one beside the last', () => {
    expect(emptySectionSpot(board())).toEqual({ x: 0, y: 0 });
    const b = board({ nodes: [node('a', { type: 'moment' }, 100, 300)] });
    const first = emptySectionSpot(b);
    expect(first.y).toBeLessThan(300);
    const second = emptySectionSpot({ ...b, sections: [section('s')] });
    expect(second.x).toBeGreaterThan(first.x);
  });
});
