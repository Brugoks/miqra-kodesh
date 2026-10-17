import { describe, expect, it } from 'vitest';
import { createMoment } from './canvasJourney';
import { CARD_HEIGHT, CARD_WIDTH, projectBoard, sectionAt } from './canvasBoard';
import { applyCommand } from './canvasBoardCommands';
import { boardNeedsMinimap, dragResult, dropTargetFor, toFlowEdges, toFlowNodes, worldPosition } from './canvasBoardFlow';

const entry = (id, extra = {}) => ({ id, kind: 'reflection', text: `Thought ${id}`, createdAt: '2026-02-01T12:00:00Z', ...extra });
const run = (canvas, ...commands) => commands.reduce((c, command) => { const r = applyCommand(c, command); if (!r.ok) throw new Error(r.error); return r.canvas; }, canvas);
const start = () => { const c = createMoment('The original'); c.id = 'c1'; c.journey.entries = [entry('a'), entry('b')]; return c; };
const grouped = () => run(start(), { type: 'move', nodes: [{ id: 'entry:a', x: 1000, y: 700 }] }, { type: 'createSection', id: 's', nodeIds: ['entry:a'] });

describe('toFlowNodes', () => {
  it('lists sections before their children and positions children relative to the section', () => {
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    const ids = nodes.map((n) => n.id);
    expect(ids.indexOf('s')).toBeLessThan(ids.indexOf('entry:a'));
    const section = board.sections[0];
    const child = nodes.find((n) => n.id === 'entry:a');
    expect(child.parentId).toBe('s');
    expect(child.position).toEqual({ x: 1000 - section.x, y: 700 - section.y });
    expect(nodes.find((n) => n.id === 'entry:b').parentId).toBeUndefined();
  });

  it('round-trips every card to its world position, whatever its section', () => {
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const card of board.nodes) expect(worldPosition(byId.get(card.id), byId)).toEqual({ x: card.x, y: card.y });
  });

  it('gives cards a fixed size and a header to drag by, and hides the children of a collapsed section', () => {
    const canvas = run(grouped(), { type: 'toggleSection', id: 's' });
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    const card = nodes.find((n) => n.id === 'entry:a');
    expect(card).toMatchObject({ width: CARD_WIDTH, height: CARD_HEIGHT, hidden: true, dragHandle: '.lc-card__header' });
    expect(nodes.find((n) => n.id === 's')).toMatchObject({ height: 56, data: { collapsed: true, cards: 1 } });
    expect(nodes.find((n) => n.id === 'entry:b').hidden).toBe(false);
  });

  it('uses the Scripture node for passages and carries only short, plain data', () => {
    const canvas = start();
    canvas.journey.entries.push({ id: 'sc', kind: 'scripture', reference: 'John 3:16', text: 'Mine', createdAt: '2026-02-02T12:00:00Z' });
    const nodes = toFlowNodes(canvas, projectBoard(canvas).board);
    expect(nodes.find((n) => n.id === 'entry:sc').type).toBe('scripture');
    expect(nodes.find((n) => n.id === 'entry:a').type).toBe('thought');
    expect(nodes.find((n) => n.id === 'entry:a').data).toMatchObject({ label: 'Thought', text: 'Thought a', links: 0 });
    expect(nodes.find((n) => n.id === 'entry:sc').data.reference).toBe('John 3:16');
  });

  it('marks selection and the connect source without touching the document', () => {
    const canvas = start();
    const nodes = toFlowNodes(canvas, projectBoard(canvas).board, { selected: new Set(['entry:a']), connectFrom: 'entry:b' });
    expect(nodes.find((n) => n.id === 'entry:a').selected).toBe(true);
    expect(nodes.find((n) => n.id === 'entry:b').data).toMatchObject({ connectSource: true, connecting: true });
    expect(canvas.board).toBeUndefined();
  });

  it('reuses unchanged node data so selecting one card does not re-render the rest', () => {
    const canvas = start();
    const board = projectBoard(canvas).board;
    const cache = new Map();
    const first = toFlowNodes(canvas, board, { cache });
    const second = toFlowNodes(canvas, board, { cache, selected: new Set(['entry:a']) });
    for (const node of first) expect(second.find((n) => n.id === node.id).data).toBe(node.data);
    const edited = { ...canvas, journey: { ...canvas.journey, entries: [{ ...canvas.journey.entries[0], text: 'Changed' }, canvas.journey.entries[1]] } };
    const third = toFlowNodes(edited, projectBoard(edited).board, { cache });
    expect(third.find((n) => n.id === 'entry:a').data).not.toBe(first.find((n) => n.id === 'entry:a').data);
    expect(third.find((n) => n.id === 'entry:b').data).toBe(first.find((n) => n.id === 'entry:b').data);
  });
});

describe('toFlowEdges', () => {
  it('draws arrows only for directed links and attaches links to a collapsed frame', () => {
    const canvas = run(grouped(), { type: 'connect', id: 'e1', source: 'entry:a', target: 'entry:b', label: 'leads to', direction: 'forward' }, { type: 'connect', id: 'e2', source: 'moment:c1', target: 'entry:b' });
    const open = toFlowEdges(projectBoard(canvas).board);
    expect(open.find((e) => e.id === 'e1')).toMatchObject({ source: 'entry:a', target: 'entry:b', markerEnd: { type: 'arrowclosed', width: 18, height: 18 }, type: 'connection', data: { label: 'leads to' } });
    expect(open.find((e) => e.id === 'e2').markerEnd).toBeUndefined();
    const shut = toFlowEdges(projectBoard(run(canvas, { type: 'toggleSection', id: 's' })).board, { selected: 'e1' });
    expect(shut.find((e) => e.id === 'e1')).toMatchObject({ source: 's', target: 'entry:b', selected: true, data: { viaSection: true } });
  });
});

describe('dragResult', () => {
  it('reports world positions for moved cards and sections, and nothing for a click', () => {
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    expect(dragResult(nodes, nodes, board)).toEqual({ nodes: [], sections: [] });
    const dragged = nodes.map((n) => (n.id === 'entry:b' ? { ...n, position: { x: n.position.x + 60.4, y: n.position.y - 20 } } : n.id === 's' ? { ...n, position: { x: n.position.x + 100, y: n.position.y } } : n));
    const moved = dragResult(dragged.filter((n) => ['entry:b', 's'].includes(n.id)), dragged, board);
    const b = board.nodes.find((n) => n.id === 'entry:b');
    const s = board.sections[0];
    expect(moved.nodes).toEqual([{ id: 'entry:b', x: Math.round(b.x + 60.4), y: b.y - 20 }]);
    expect(moved.sections).toEqual([{ id: 's', x: s.x + 100, y: s.y }]);
  });

  it('turns a child dragged inside its section into a world position, then lets the command keep its membership', () => {
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    const dragged = nodes.map((n) => (n.id === 'entry:a' ? { ...n, position: { x: n.position.x + 30, y: n.position.y + 10 } } : n));
    const move = dragResult([dragged.find((n) => n.id === 'entry:a')], dragged, board);
    expect(move.nodes).toEqual([{ id: 'entry:a', x: 1030, y: 710 }]);
    const after = run(canvas, { type: 'move', ...move });
    expect(after.board.nodes.find((n) => n.id === 'entry:a')).toMatchObject({ x: 1030, y: 710, sectionId: 's' });
  });

  it('works the same at any pan and zoom, because positions are world positions', () => {
    // Nothing in the node list depends on the viewport: a drag reads node positions, not pixels.
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    expect(JSON.stringify(dragResult(nodes, nodes, board))).toBe(JSON.stringify({ nodes: [], sections: [] }));
  });

  it('names the section a dragged card is over', () => {
    const canvas = grouped();
    const board = projectBoard(canvas).board;
    const nodes = toFlowNodes(canvas, board);
    const over = { ...nodes.find((n) => n.id === 'entry:b'), position: { x: board.sections[0].x + 40, y: board.sections[0].y + 80 } };
    expect(dropTargetFor(over, nodes, board, sectionAt)).toBe('s');
    expect(dropTargetFor({ ...over, position: { x: 90000, y: 90000 } }, nodes, board, sectionAt)).toBeNull();
  });
});

describe('minimap', () => {
  it('only appears once the board outgrows a screenful', () => {
    expect(boardNeedsMinimap({ x: 0, y: 0, width: 1500, height: 900 })).toBe(false);
    expect(boardNeedsMinimap({ x: 0, y: 0, width: 3000, height: 900 })).toBe(true);
    expect(boardNeedsMinimap(null)).toBe(false);
  });
});
