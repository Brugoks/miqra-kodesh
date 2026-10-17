import { describe, expect, it } from 'vitest';
import { createMoment } from './canvasJourney';
import { CARD_HEIGHT, CARD_WIDTH, normalizeBoard, projectBoard } from './canvasBoard';
import { HISTORY_LIMIT, applyCommand, createDocumentStore } from './canvasBoardCommands';

const entry = (id, extra = {}) => ({ id, kind: 'reflection', text: `Thought ${id}`, createdAt: '2026-02-01T12:00:00Z', ...extra });
const base = (entries = []) => {
  const canvas = createMoment('The original glimpse');
  canvas.id = 'c1';
  canvas.journey.entries = entries;
  return canvas;
};
const run = (canvas, ...commands) => commands.reduce((current, command) => {
  const result = applyCommand(current, command);
  if (!result.ok) throw new Error(result.error);
  return result.canvas;
}, canvas);
const view = (canvas) => projectBoard(canvas).board;
const byEntry = (canvas, id) => view(canvas).nodes.find((n) => n.contentRef.entryId === id);

describe('adding thoughts', () => {
  it('leaves a legacy canvas unwritten when a thought is added without a place', () => {
    const next = run(base(), { type: 'addThought', entry: entry('a') });
    expect(next.board).toBeUndefined();
    expect(next.journey.entries).toHaveLength(1);
  });

  it('places a thought on its centre point, materialising the arrangement for the first time', () => {
    const next = run(base([entry('a')]), { type: 'addThought', entry: entry('b'), position: { x: 2000, y: 1000 } });
    expect(normalizeBoard(next.board).ok).toBe(true);
    expect(next.board.nodes).toHaveLength(3);
    expect(byEntry(next, 'b')).toMatchObject({ x: 2000 - CARD_WIDTH / 2, y: 1000 - CARD_HEIGHT / 2 });
    expect(byEntry(next, 'a')).toBeTruthy();
  });

  it('does not stack a second thought exactly on the first', () => {
    const next = run(base(), { type: 'addThought', entry: entry('a'), position: { x: 800, y: 400 } }, { type: 'addThought', entry: entry('b'), position: { x: 800, y: 400 } });
    const a = byEntry(next, 'a');
    const b = byEntry(next, 'b');
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(0);
  });

  it('branches: a nearby card and its connection in one step, undone together', () => {
    const store = createDocumentStore(run(base([entry('a')]), { type: 'addThought', entry: entry('seed'), position: { x: 0, y: 600 } }));
    const source = byEntry(store.getState().canvas, 'a');
    expect(store.dispatch({ type: 'addThought', entry: entry('b'), connectFrom: source.id }).ok).toBe(true);
    const { canvas } = store.getState();
    expect(canvas.board.edges).toEqual([{ id: expect.any(String), source: source.id, target: byEntry(canvas, 'b').id, label: '', direction: 'none' }]);
    expect(byEntry(canvas, 'b').x).toBeGreaterThan(source.x);
    expect(store.getState().past).toHaveLength(1);
    store.undo();
    expect(store.getState().canvas.board.edges).toEqual([]);
    expect(store.getState().canvas.journey.entries.map((e) => e.id)).toEqual(['a', 'seed']);
  });

  it('refuses a 101st thought, a duplicate id, and a repeated suggested passage', () => {
    const full = base(Array.from({ length: 100 }, (_, i) => entry(`e${i}`)));
    expect(applyCommand(full, { type: 'addThought', entry: entry('more') }).ok).toBe(false);
    expect(applyCommand(base([entry('a')]), { type: 'addThought', entry: entry('a') }).ok).toBe(false);
    const scripture = { id: 's1', kind: 'scripture', reference: 'John 3:16', text: '', createdAt: entry('x').createdAt, scripture: {
      translation: 'BSB', verses: [{ reference: 'John 3:16', text: 'For God so loved' }], contextReference: 'John 3', contextVerses: [{ reference: 'John 3:15', text: 'that everyone' }], context: 'c', connection: 'k', glimpse: 'The original glimpse' } };
    const once = run(base(), { type: 'addThought', entry: scripture });
    expect(applyCommand(once, { type: 'addThought', entry: { ...scripture, id: 's2' } }).error).toMatch(/already on this canvas/);
  });

  it('clears a due revisit when a reflection is added, but not for other kinds', () => {
    const due = base(); due.journey.revisitOn = '2020-01-01';
    expect(run(due, { type: 'addThought', entry: entry('a') }).journey.revisitOn).toBeNull();
    expect(run(due, { type: 'addThought', entry: entry('a', { kind: 'prayer' }) }).journey.revisitOn).toBe('2020-01-01');
  });
});

describe('moving and grouping', () => {
  const three = () => run(base([entry('a'), entry('b')]), { type: 'move', nodes: [] }, { type: 'addThought', entry: entry('c'), position: { x: 3000, y: 3000 } });

  it('moves a gesture\'s cards in one command', () => {
    const start = three();
    const a = byEntry(start, 'a'); const b = byEntry(start, 'b');
    const next = run(start, { type: 'move', nodes: [{ id: a.id, x: 11.4, y: 22.6 }, { id: b.id, x: 700, y: 800 }] });
    expect(byEntry(next, 'a')).toMatchObject({ x: 11, y: 23 });
    expect(byEntry(next, 'b')).toMatchObject({ x: 700, y: 800 });
  });

  it('creates a section that fits the chosen cards and adopts them, leaving the words alone', () => {
    const start = three();
    const ids = [byEntry(start, 'a').id, byEntry(start, 'b').id];
    const next = run(start, { type: 'createSection', id: 'section:1', nodeIds: ids, title: 'What I\'m noticing' });
    const section = next.board.sections[0];
    expect(section).toMatchObject({ id: 'section:1', title: 'What I\'m noticing', collapsed: false });
    for (const id of ids) {
      const n = next.board.nodes.find((x) => x.id === id);
      expect(n.sectionId).toBe('section:1');
      expect(n.x).toBeGreaterThanOrEqual(section.x);
      expect(n.x + n.width).toBeLessThanOrEqual(section.x + section.width);
      expect(n.y).toBeGreaterThanOrEqual(section.y);
      expect(n.y + CARD_HEIGHT).toBeLessThanOrEqual(section.y + section.height);
    }
    expect(next.journey).toBe(start.journey);
  });

  it('carries members when a section moves, and keeps their membership', () => {
    const start = three();
    const ids = [byEntry(start, 'a').id];
    const made = run(start, { type: 'createSection', id: 's', nodeIds: ids });
    const before = byEntry(made, 'a');
    const frame = made.board.sections[0];
    const next = run(made, { type: 'move', sections: [{ id: 's', x: frame.x + 100, y: frame.y - 50 }] });
    expect(byEntry(next, 'a')).toMatchObject({ x: before.x + 100, y: before.y - 50, sectionId: 's' });
  });

  it('does not double-move a member that is dragged together with its section', () => {
    const made = run(three(), { type: 'createSection', id: 's', nodeIds: [byEntry(three(), 'a').id] });
    const a = byEntry(made, 'a'); const frame = made.board.sections[0];
    const next = run(made, { type: 'move', sections: [{ id: 's', x: frame.x + 100, y: frame.y }], nodes: [{ id: a.id, x: a.x + 100, y: a.y }] });
    expect(byEntry(next, 'a')).toMatchObject({ x: a.x + 100, sectionId: 's' });
  });

  it('adopts a card dropped into a section and releases it when dragged fully out, keeping its world position', () => {
    const made = run(three(), { type: 'createSection', id: 's', position: { x: 5000, y: 5000 } });
    const frame = made.board.sections[0];
    const c = byEntry(made, 'c');
    const into = run(made, { type: 'move', nodes: [{ id: c.id, x: frame.x + 60, y: frame.y + 80 }] });
    expect(byEntry(into, 'c').sectionId).toBe('s');
    const out = run(into, { type: 'move', nodes: [{ id: c.id, x: frame.x + frame.width + 400, y: frame.y }] });
    expect(byEntry(out, 'c')).toMatchObject({ sectionId: null, x: frame.x + frame.width + 400, y: frame.y });
  });

  it('moves cards into a section from a menu, growing the frame rather than cropping', () => {
    const made = run(three(), { type: 'createSection', id: 's', position: { x: 9000, y: 9000 } });
    const ids = ['a', 'b', 'c'].map((id) => byEntry(made, id).id);
    const next = run(made, { type: 'moveToSection', nodeIds: ids, sectionId: 's' });
    const frame = next.board.sections[0];
    for (const id of ids) {
      const n = next.board.nodes.find((x) => x.id === id);
      expect(n.sectionId).toBe('s');
      expect(n.x + n.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(n.y + CARD_HEIGHT).toBeLessThanOrEqual(frame.y + frame.height);
    }
    const spots = new Set(ids.map((id) => { const n = next.board.nodes.find((x) => x.id === id); return `${n.x},${n.y}`; }));
    expect(spots.size).toBe(3);
    const released = run(next, { type: 'moveToSection', nodeIds: [ids[0]], sectionId: null });
    expect(released.board.nodes.find((n) => n.id === ids[0])).toMatchObject({ sectionId: null, x: next.board.nodes.find((n) => n.id === ids[0]).x });
  });

  it('removes a section but keeps its cards, and resizes without cropping members', () => {
    const start = three();
    const made = run(start, { type: 'createSection', id: 's', nodeIds: [byEntry(start, 'a').id] });
    const frame = made.board.sections[0];
    const small = run(made, { type: 'resizeSection', id: 's', width: 280, height: 280 });
    const a = byEntry(small, 'a');
    expect(small.board.sections[0].x + small.board.sections[0].width).toBeGreaterThanOrEqual(a.x + a.width);
    expect(small.board.sections[0].y + small.board.sections[0].height).toBeGreaterThanOrEqual(a.y + CARD_HEIGHT);
    const bigger = run(made, { type: 'resizeSection', id: 's', width: frame.width + 500, height: frame.height + 300 });
    expect(bigger.board.sections[0]).toMatchObject({ width: frame.width + 500, height: frame.height + 300 });
    const gone = run(made, { type: 'removeSection', id: 's' });
    expect(gone.board.sections).toEqual([]);
    expect(byEntry(gone, 'a')).toMatchObject({ sectionId: null, x: byEntry(made, 'a').x, y: byEntry(made, 'a').y });
  });

  it('collapses and expands as its own step, and caps sections at twenty', () => {
    let canvas = base([entry('a')]);
    canvas = run(canvas, { type: 'createSection', id: 's0', position: { x: 0, y: 0 } });
    expect(run(canvas, { type: 'toggleSection', id: 's0' }).board.sections[0].collapsed).toBe(true);
    for (let i = 1; i < 20; i += 1) canvas = run(canvas, { type: 'createSection', id: `s${i}`, position: { x: i * 700, y: 0 } });
    expect(applyCommand(canvas, { type: 'createSection', id: 'one-too-many' }).error).toMatch(/up to 20 sections/);
  });

  it('adopts loose cards already under an empty section\'s frame', () => {
    const start = run(base([entry('a')]), { type: 'addThought', entry: entry('b'), position: { x: 4000, y: 4000 } });
    const b = byEntry(start, 'b');
    const next = run(start, { type: 'createSection', id: 's', position: { x: b.x + CARD_WIDTH / 2, y: b.y + CARD_HEIGHT / 2 } });
    expect(byEntry(next, 'b').sectionId).toBe('s');
    expect(byEntry(next, 'a').sectionId).toBeNull();
  });

  it('renames and recolours a section, ignoring an unknown colour', () => {
    const made = run(base(), { type: 'createSection', id: 's', position: { x: 0, y: 0 } });
    const next = run(made, { type: 'updateSection', id: 's', title: '  Questions  ', color: 'purple' });
    expect(next.board.sections[0]).toMatchObject({ title: 'Questions', color: 'purple' });
    expect(run(next, { type: 'updateSection', id: 's', color: 'nope' }).board.sections[0].color).toBe('purple');
  });
});

describe('connections', () => {
  const pair = () => {
    const canvas = run(base([entry('a'), entry('b')]), { type: 'move', nodes: [] });
    return { canvas: run(canvas, { type: 'addThought', entry: entry('c'), position: { x: 0, y: 900 } }), a: 'entry:a', b: 'entry:b', c: 'entry:c' };
  };

  it('connects two cards with an optional label and direction', () => {
    const { canvas, a, b } = pair();
    const next = run(canvas, { type: 'connect', id: 'e', source: a, target: b, label: '  leads to  ', direction: 'forward' });
    expect(next.board.edges).toEqual([{ id: 'e', source: a, target: b, label: 'leads to', direction: 'forward' }]);
  });

  it('rejects a self link and a second link between the same pair, in either direction', () => {
    const { canvas, a, b } = pair();
    expect(applyCommand(canvas, { type: 'connect', source: a, target: a }).error).toMatch(/itself/);
    const linked = run(canvas, { type: 'connect', source: a, target: b });
    expect(applyCommand(linked, { type: 'connect', source: b, target: a }).error).toMatch(/already connected/);
    expect(applyCommand(canvas, { type: 'connect', source: a, target: 'entry:ghost' }).ok).toBe(false);
  });

  it('allows cycles', () => {
    const { canvas, a, b, c } = pair();
    const ring = run(canvas, { type: 'connect', source: a, target: b }, { type: 'connect', source: b, target: c }, { type: 'connect', source: c, target: a });
    expect(ring.board.edges).toHaveLength(3);
  });

  it('caps a label at 120 characters and stops at 200 connections', () => {
    const { canvas, a, b } = pair();
    expect(run(canvas, { type: 'connect', source: a, target: b, label: 'x'.repeat(300) }).board.edges[0].label).toHaveLength(120);
    let big = base(Array.from({ length: 100 }, (_, i) => entry(`e${i}`)));
    big = run(big, { type: 'createSection', id: 's', position: { x: 0, y: 0 } });
    const ids = ['moment:c1', ...Array.from({ length: 100 }, (_, i) => `entry:e${i}`)];
    let count = 0;
    for (let i = 0; i < ids.length && count < 200; i += 1) for (let j = i + 1; j < ids.length && count < 200; j += 1) { big = run(big, { type: 'connect', source: ids[i], target: ids[j] }); count += 1; }
    expect(big.board.edges).toHaveLength(200);
    expect(applyCommand(big, { type: 'connect', source: ids[50], target: ids[99] }).error).toMatch(/up to 200 connections/);
  });

  it('edits, reverses and removes a link', () => {
    const { canvas, a, b } = pair();
    const linked = run(canvas, { type: 'connect', id: 'e', source: a, target: b });
    const edited = run(linked, { type: 'updateEdge', id: 'e', label: 'questions', direction: 'forward' });
    expect(edited.board.edges[0]).toMatchObject({ label: 'questions', direction: 'forward' });
    expect(run(edited, { type: 'updateEdge', id: 'e', reverse: true }).board.edges[0]).toMatchObject({ source: b, target: a });
    expect(run(edited, { type: 'removeEdge', id: 'e' }).board.edges).toEqual([]);
  });
});

describe('deleting and editing content', () => {
  it('deletes a card with its links in one transaction, and undo restores content and links together', () => {
    const store = createDocumentStore(run(base([entry('a'), entry('b')]), { type: 'move', nodes: [] }, { type: 'createSection', id: 's', position: { x: 0, y: 0 } }));
    store.dispatch({ type: 'connect', source: 'entry:a', target: 'entry:b', label: 'leads to' });
    store.dispatch({ type: 'connect', source: 'moment:c1', target: 'entry:a' });
    const before = store.getState().canvas;
    expect(store.dispatch({ type: 'deleteCard', nodeId: 'entry:a' }).ok).toBe(true);
    const after = store.getState().canvas;
    expect(after.journey.entries.map((e) => e.id)).toEqual(['b']);
    expect(after.board.nodes.map((n) => n.id)).not.toContain('entry:a');
    expect(after.board.edges).toEqual([]);
    store.undo();
    expect(store.getState().canvas).toBe(before);
    expect(store.getState().canvas.board.edges).toHaveLength(2);
    store.redo();
    expect(store.getState().canvas).toBe(after);
  });

  it('will not delete the original glimpse on its own', () => {
    const result = applyCommand(base([entry('a')]), { type: 'deleteCard', nodeId: 'moment:c1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/original glimpse/);
  });

  it('replaces the journey for an edit without moving anything, and places entries an edit introduced', () => {
    const start = run(base([entry('a')]), { type: 'addThought', entry: entry('b'), position: { x: 1500, y: 500 } });
    const edited = run(start, { type: 'replaceJourney', journey: { ...start.journey, moment: 'A deeper glimpse', editedAt: '2026-03-01T00:00:00Z' } });
    expect(edited.journey.moment).toBe('A deeper glimpse');
    expect(edited.board.nodes).toEqual(start.board.nodes);
    expect(applyCommand(start, { type: 'replaceJourney', journey: { kind: 'moment' } }).ok).toBe(false);
  });

  it('keeps a legacy canvas unwritten across content edits', () => {
    const edited = run(base([entry('a')]), { type: 'replaceJourney', journey: { ...base([entry('a')]).journey, moment: 'Changed' } });
    expect(edited.board).toBeUndefined();
  });

  it('renames the canvas but never to nothing', () => {
    expect(run(base(), { type: 'setTitle', title: '  Waiting  ' }).title).toBe('Waiting');
    expect(applyCommand(base(), { type: 'setTitle', title: '   ' }).ok).toBe(false);
  });

  it('never changes Scripture evidence or the words of any card while arranging', () => {
    const scripture = { id: 's1', kind: 'scripture', reference: 'John 3:16', text: 'mine', createdAt: entry('x').createdAt, scripture: {
      translation: 'BSB', verses: [{ reference: 'John 3:16', text: 'For God so loved' }], contextReference: 'John 3', contextVerses: [{ reference: 'John 3:15', text: 'that everyone' }], context: 'c', connection: 'k', glimpse: 'The original glimpse' } };
    const start = base([entry('a'), scripture]);
    const moved = run(start, { type: 'move', nodes: [{ id: 'entry:s1', x: 900, y: 900 }] }, { type: 'createSection', id: 'fixed', nodeIds: ['entry:s1'] },
      { type: 'connect', source: 'entry:a', target: 'entry:s1' }, { type: 'toggleSection', id: 'fixed' }, { type: 'resizeSection', id: 'fixed', width: 900, height: 700 });
    expect(moved.journey).toBe(start.journey);
    expect(moved.journey.entries[1].scripture.verses[0].text).toBe('For God so loved');
  });
});

describe('a damaged layout', () => {
  const damaged = () => ({ ...base([entry('a')]), board: null, boardIssue: { reason: 'The saved layout was made by a newer version of Living Canvas.', raw: { version: 9 } } });

  it('refuses to rearrange, so the raw layout is not overwritten, while content edits still work', () => {
    for (const command of [{ type: 'move', nodes: [] }, { type: 'createSection' }, { type: 'connect', source: 'a', target: 'b' }, { type: 'toggleSection', id: 'x' }]) {
      expect(applyCommand(damaged(), command).error).toMatch(/Reset layout/);
    }
    const edited = applyCommand(damaged(), { type: 'addThought', entry: entry('b'), position: { x: 5, y: 5 } });
    expect(edited.ok).toBe(true);
    expect(edited.canvas.board).toBeNull();
    expect(edited.canvas.boardIssue.raw).toEqual({ version: 9 });
  });

  it('resets deliberately to a fresh arrangement and clears the issue', () => {
    const store = createDocumentStore(damaged());
    store.resetBoard();
    const { canvas, past } = store.getState();
    expect(canvas.boardIssue).toBeUndefined();
    expect(normalizeBoard(canvas.board).ok).toBe(true);
    expect(canvas.board.nodes.map((n) => n.id)).toEqual(['moment:c1', 'entry:a']);
    expect(past).toEqual([]);
  });
});

describe('the document store', () => {
  it('counts each change once, so the autosave has a sequence to follow', () => {
    const store = createDocumentStore(base([entry('a')]));
    expect(store.getState().seq).toBe(0);
    store.dispatch({ type: 'addThought', entry: entry('b'), position: { x: 0, y: 0 } });
    store.dispatch({ type: 'move', nodes: [{ id: 'entry:b', x: 40, y: 40 }] });
    store.dispatch({ type: 'move', nodes: [] }); // nothing moved: not a change
    expect(store.getState().seq).toBe(2);
    store.undo();
    expect(store.getState().seq).toBe(3);
  });

  it('keeps only the last fifty steps, and a new change drops the redo trail', () => {
    const store = createDocumentStore(base());
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) store.dispatch({ type: 'setTitle', title: `Title ${i}` });
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
    store.undo(); store.undo();
    expect(store.getState().future).toHaveLength(2);
    store.dispatch({ type: 'setTitle', title: 'Branch' });
    expect(store.getState().future).toEqual([]);
  });

  it('reports a refused command as a notice and leaves history alone', () => {
    const store = createDocumentStore(base([entry('a')]));
    const result = store.dispatch({ type: 'connect', source: 'entry:a', target: 'entry:a' });
    expect(result.ok).toBe(false);
    expect(store.getState().notice).toMatchObject({ kind: 'error' });
    expect(store.getState().past).toEqual([]);
    expect(store.getState().seq).toBe(0);
  });

  it('notifies subscribers, and replace adopts an outside canvas without counting it as an edit', () => {
    const store = createDocumentStore(base());
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    store.dispatch({ type: 'setTitle', title: 'Changed' });
    store.replace(base([entry('z')]));
    expect(calls).toBe(2);
    expect(store.getState()).toMatchObject({ seq: 1, past: [], future: [] });
    off();
    store.undo();
    expect(calls).toBe(2);
  });

  it('answers an unknown command with an error rather than throwing', () => {
    expect(applyCommand(base(), { type: 'explode' }).ok).toBe(false);
  });
});

describe('at the stated limits', () => {
  // 101 cards, 20 sections, 200 connections: the most a canvas may hold.
  const full = () => {
    let canvas = base(Array.from({ length: 100 }, (_, i) => entry(`e${i}`)));
    for (let i = 0; i < 20; i += 1) canvas = run(canvas, { type: 'createSection', id: `s${i}`, title: `Section ${i}`, nodeIds: [`entry:e${i * 5}`, `entry:e${i * 5 + 1}`] });
    const ids = ['moment:c1', ...Array.from({ length: 100 }, (_, i) => `entry:e${i}`)];
    let count = 0;
    for (let i = 0; i < ids.length && count < 200; i += 1) { canvas = run(canvas, { type: 'connect', source: ids[i], target: ids[(i + 1) % ids.length] }); count += 1; }
    for (let i = 0; i < ids.length && count < 200; i += 1) { canvas = run(canvas, { type: 'connect', source: ids[i], target: ids[(i + 7) % ids.length] }); count += 1; }
    for (let i = 0; i < ids.length && count < 200; i += 1) { canvas = run(canvas, { type: 'connect', source: ids[i], target: ids[(i + 13) % ids.length] }); count += 1; }
    return canvas;
  };

  it('holds, validates, and stays well inside the row limit', () => {
    const canvas = full();
    expect(canvas.board.nodes).toHaveLength(101);
    expect(canvas.board.sections).toHaveLength(20);
    expect(canvas.board.edges).toHaveLength(200);
    expect(normalizeBoard(canvas.board).ok).toBe(true);
    expect(JSON.stringify(canvas.board).length).toBeLessThan(150000);
    expect(applyCommand(canvas, { type: 'createSection', id: 'x' }).ok).toBe(false);
    expect(applyCommand(canvas, { type: 'connect', source: 'entry:e2', target: 'entry:e40' }).ok).toBe(false);
  });

  it('applies commands quickly enough that a drag never waits on the document', () => {
    let canvas = full();
    const started = performance.now();
    for (let i = 0; i < 100; i += 1) canvas = run(canvas, { type: 'move', nodes: [{ id: `entry:e${i}`, x: i * 10, y: i * 5 }] });
    const perCommand = (performance.now() - started) / 100;
    // A frame is 16 ms; the whole command, including validating the board again, uses a small part of one.
    expect(perCommand).toBeLessThan(8);
  });

  it('keeps ten undo steps of a full board cheap to hold: history shares structure', () => {
    const store = createDocumentStore(full());
    for (let i = 0; i < 10; i += 1) store.dispatch({ type: 'move', nodes: [{ id: 'entry:e3', x: i * 10, y: 0 }] });
    const { past } = store.getState();
    expect(past).toHaveLength(10);
    // Untouched cards are the same objects in every step, not copies.
    expect(past[0].canvas.board.nodes.find((n) => n.id === 'entry:e50')).toBe(store.getState().canvas.board.nodes.find((n) => n.id === 'entry:e50'));
  });
});

describe('adding several thoughts at once', () => {
  const many = (n, kind = 'reflection') => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, kind, text: `Paragraph ${i}`, createdAt: '2026-02-02T12:00:00Z' }));

  it('adds them all in one undoable step, laid out around the point asked for without sitting on each other', () => {
    const store = createDocumentStore(base([entry('a')]));
    expect(store.dispatch({ type: 'addThoughts', entries: many(4), position: { x: 2000, y: 1000 } }).ok).toBe(true);
    const { canvas, past, notice } = store.getState();
    expect(canvas.journey.entries.map((e) => e.id)).toEqual(['a', 'm0', 'm1', 'm2', 'm3']);
    expect(past).toHaveLength(1);
    expect(notice.message).toBe('4 thoughts added');
    const placed = many(4).map((e) => canvas.board.nodes.find((n) => n.id === `entry:${e.id}`));
    expect(new Set(placed.map((n) => `${n.x},${n.y}`)).size).toBe(4);
    expect(placed[1].x).toBeGreaterThan(placed[0].x);
    expect(placed[3].y).toBeGreaterThan(placed[0].y);
    store.undo();
    expect(store.getState().canvas.journey.entries.map((e) => e.id)).toEqual(['a']);
    expect(store.getState().canvas.board).toBeUndefined();
  });

  it('keeps a legacy canvas unwritten when no place is given, and puts the thoughts in order', () => {
    const next = run(base(), { type: 'addThoughts', entries: many(3) });
    expect(next.board).toBeUndefined();
    expect(next.journey.entries.map((e) => e.text)).toEqual(['Paragraph 0', 'Paragraph 1', 'Paragraph 2']);
    expect(projectBoard(next).board.nodes).toHaveLength(4);
  });

  it('adds all or none: over capacity changes nothing, and a bad piece fails the lot', () => {
    const nearlyFull = base(Array.from({ length: 98 }, (_, i) => entry(`e${i}`)));
    expect(applyCommand(nearlyFull, { type: 'addThoughts', entries: many(3) }).error).toMatch(/up to 100/);
    expect(applyCommand(nearlyFull, { type: 'addThoughts', entries: many(2) }).ok).toBe(true);
    const bad = [...many(2), { id: 'bad', kind: 'reflection', text: '   ', createdAt: '2026-02-02T12:00:00Z' }];
    const result = applyCommand(base(), { type: 'addThoughts', entries: bad });
    expect(result.ok).toBe(false);
    expect(result.canvas.journey.entries).toEqual([]);
    expect(applyCommand(base(), { type: 'addThoughts', entries: [] }).ok).toBe(false);
  });

  it('clears a due revisit once, because the reflections complete it', () => {
    const due = base(); due.journey.revisitOn = '2020-01-01';
    expect(run(due, { type: 'addThoughts', entries: many(2) }).journey.revisitOn).toBeNull();
  });
});
