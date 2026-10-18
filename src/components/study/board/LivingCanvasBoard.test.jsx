import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, createDocumentStore } from '../../../lib/canvasBoardCommands';
import { projectBoard } from '../../../lib/canvasBoard';
import { createMoment } from '../../../lib/canvasJourney';
import LivingCanvasBoard from './LivingCanvasBoard';

const entry = (id, text, extra = {}) => ({ id, kind: 'reflection', text, createdAt: '2026-02-01T12:00:00Z', ...extra });
const canvasWith = (entries = []) => {
  const canvas = createMoment('The original glimpse');
  canvas.id = 'c1';
  canvas.journey.entries = entries;
  return canvas;
};

// A stand-in for the workspace: the board only ever sees the document through props.
function Harness({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return <LivingCanvasBoard canvas={state.canvas} view={projectBoard(state.canvas).board} userId="u1" dispatch={store.dispatch} undo={store.undo} redo={store.redo}
    canUndo={state.past.length > 0} canRedo={state.future.length > 0} />;
}
const mount = (canvas = canvasWith([entry('a', 'Waiting is hard'), entry('b', 'God is near')])) => {
  const store = createDocumentStore(canvas);
  const view = render(<div style={{ width: 1000, height: 700 }}><Harness store={store} /></div>);
  return { store, ...view };
};
const node = (text) => screen.getByText(text).closest('.react-flow__node');
const click = (text, init) => fireEvent.click(node(text), init);
const doc = (store) => store.getState().canvas;
const boardNode = (store, id) => projectBoard(doc(store)).board.nodes.find((n) => n.id === id);

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the board', () => {
  it('draws every card from the document, with a gentle hint while there is only the original', () => {
    const { unmount } = mount();
    expect(screen.getByText('Waiting is hard')).toBeInTheDocument();
    expect(screen.getByText('God is near')).toBeInTheDocument();
    expect(screen.getByText('The original glimpse')).toBeInTheDocument();
    expect(screen.queryByText('Add another thought, connect ideas, or create a section.')).not.toBeInTheDocument();
    unmount();
    mount(canvasWith());
    expect(screen.getByText('Add another thought, connect ideas, or create a section.')).toBeInTheDocument();
  });

  it('offers the three creating actions and the navigation as named controls', () => {
    mount();
    const tools = screen.getByRole('toolbar', { name: 'Canvas tools' });
    for (const name of ['Add thought', 'Connect', 'Section']) expect(within(tools).getByRole('button', { name })).toBeInTheDocument();
    expect(within(tools).getByRole('button', { name: 'Undo' })).toBeDisabled();
    const nav = screen.getByRole('group', { name: 'Move around the canvas' });
    for (const name of ['Fit all', 'Zoom in', 'Zoom out', 'Search']) expect(within(nav).getByRole('button', { name })).toBeInTheDocument();
    expect(within(nav).getByLabelText('Zoom level')).toHaveTextContent('%');
  });

  it('restores the last viewport on this device, and never writes the canvas for it', () => {
    localStorage.setItem('miqra_canvas_viewport_v1:u1:c1', JSON.stringify({ x: 40, y: 25, zoom: 1.5 }));
    const { store } = mount();
    expect(document.querySelector('.react-flow__viewport').style.transform).toBe('translate(40px,25px) scale(1.5)');
    expect(store.getState().seq).toBe(0);
  });

  it('shows a minimap only once the board outgrows a screenful', () => {
    mount();
    expect(document.querySelector('.react-flow__minimap')).toBeNull();
    const wide = canvasWith([entry('a', 'Far away')]);
    wide.board = { version: 1, nodes: [
      { id: 'moment:c1', contentRef: { type: 'moment' }, x: 0, y: 0, width: 320, sectionId: null },
      { id: 'entry:a', contentRef: { type: 'entry', entryId: 'a' }, x: 5000, y: 0, width: 320, sectionId: null }], sections: [], edges: [] };
    mount(wide);
    expect(document.querySelector('.react-flow__minimap')).not.toBeNull();
  });
});

describe('adding thoughts', () => {
  it('opens a panel, keeps what is typed if it is closed, and puts the new thought on the board when added', async () => {
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add thought' }));
    const panel = screen.getByRole('complementary', { name: 'New thought' });
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Half a thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close new thought' }));
    expect(screen.queryByRole('complementary', { name: 'New thought' })).not.toBeInTheDocument();
    expect(doc(store).journey.entries).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Add thought' }));
    const again = screen.getByRole('complementary', { name: 'New thought' });
    expect(within(again).getByRole('textbox')).toHaveValue('Half a thought');
    fireEvent.change(within(again).getByRole('textbox'), { target: { value: 'A new thought' } });
    fireEvent.click(within(again).getByRole('button', { name: 'Add to canvas' }));
    await screen.findByText('A new thought');
    const added = doc(store).journey.entries.at(-1);
    expect(added).toMatchObject({ kind: 'reflection', text: 'A new thought' });
    expect(boardNode(store, `entry:${added.id}`)).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: 320 });
    expect(screen.queryByRole('complementary', { name: 'New thought' })).not.toBeInTheDocument();
    expect(node('A new thought')).toHaveClass('selected');
  });

  it('starts on the kind chosen from the Add menu', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a type of thought' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Prayer' }));
    expect(within(screen.getByRole('complementary', { name: 'New thought' })).getByRole('radio', { name: 'Prayer' })).toBeChecked();
  });

  it('adds at the double-clicked spot on empty space', () => {
    mount();
    fireEvent.doubleClick(document.querySelector('.react-flow__pane'), { clientX: 300, clientY: 200 });
    expect(screen.getByRole('complementary', { name: 'New thought' })).toBeInTheDocument();
  });
});

describe('adding several thoughts from one paste', () => {
  it('splits pasted paragraphs into cards laid out around the point, and selects them all', async () => {
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add thought' }));
    const panel = screen.getByRole('complementary', { name: 'New thought' });
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Alpha thought\n\nBeta thought\n\nGamma thought' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Split into 3 thoughts' }));
    await screen.findByText('Gamma thought');
    const added = doc(store).journey.entries.slice(-3);
    expect(added.map((e) => e.text)).toEqual(['Alpha thought', 'Beta thought', 'Gamma thought']);
    const spots = added.map((e) => boardNode(store, `entry:${e.id}`));
    expect(new Set(spots.map((n) => `${n.x},${n.y}`)).size).toBe(3);
    expect(store.getState().past).toHaveLength(1);
    expect(screen.queryByRole('complementary', { name: 'New thought' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.lc-card.is-selected')).toHaveLength(3));
  });
});

describe('selecting and editing', () => {
  it('shows Edit, Connect and More for a selected card, and edits its words in the details panel', async () => {
    const { store } = mount();
    click('Waiting is hard');
    const actions = await screen.findByRole('toolbar', { name: 'Thought actions' });
    expect(within(actions).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Connect/ })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /More/ })).toBeInTheDocument();
    fireEvent.click(within(actions).getByRole('button', { name: /Edit/ }));
    const panel = screen.getByRole('complementary', { name: 'Thought' });
    fireEvent.change(within(panel).getByLabelText('Entry text'), { target: { value: 'Waiting is hard, and good' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(doc(store).journey.entries[0]).toMatchObject({ id: 'a', text: 'Waiting is hard, and good', editedAt: expect.any(String) });
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="entry:a"]')).toHaveTextContent('Waiting is hard, and good'));
  });

  it('opens the editor from the keyboard with Enter, and closes it with Escape', async () => {
    mount();
    click('God is near');
    fireEvent.keyDown(node('God is near'), { key: 'Enter' });
    const panel = await screen.findByRole('complementary', { name: 'Thought' });
    expect(within(panel).getByLabelText('Entry text')).toBeInTheDocument();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Thought' })).not.toBeInTheDocument();
  });

  it('clears the selection with Escape, and says it used the key (so it does not also leave full screen)', async () => {
    mount();
    click('God is near');
    await screen.findByRole('toolbar', { name: 'Thought actions' });
    expect(fireEvent.keyDown(node('God is near'), { key: 'Escape' })).toBe(false); // false: preventDefault was called
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Thought actions' })).not.toBeInTheDocument());
    // With nothing left to cancel, the key is not claimed, and the workspace may use it.
    expect(fireEvent.keyDown(node('God is near'), { key: 'Escape' })).toBe(true);
  });

  it('nudges a selected card from the keyboard, as one undoable step', async () => {
    const { store } = mount();
    click('God is near');
    await screen.findByRole('toolbar', { name: 'Thought actions' });
    const start = projectBoard(doc(store)).board.nodes.find((n) => n.id === 'entry:b');
    fireEvent.keyDown(node('God is near'), { key: 'ArrowRight' });
    fireEvent.keyDown(node('God is near'), { key: 'ArrowDown', shiftKey: true });
    expect(boardNode(store, 'entry:b')).toMatchObject({ x: start.x + 16, y: start.y + 64 });
    expect(store.getState().past).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(boardNode(store, 'entry:b')).toMatchObject({ x: start.x + 16, y: start.y });
  });

  it('asks before deleting a thought, and the delete is undoable', async () => {
    const { store } = mount();
    click('Waiting is hard');
    fireEvent.keyDown(node('Waiting is hard'), { key: 'Delete' });
    const group = await screen.findByRole('group', { name: 'Confirm delete' });
    expect(doc(store).journey.entries).toHaveLength(2);
    fireEvent.click(within(group).getByRole('button', { name: 'Delete thought' }));
    expect(doc(store).journey.entries.map((e) => e.id)).toEqual(['b']);
    await waitFor(() => expect(screen.queryByText('Waiting is hard')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Waiting is hard')).toBeInTheDocument();
  });

  it('explains why the original glimpse cannot be deleted alone', async () => {
    mount();
    click('The original glimpse');
    fireEvent.click(await screen.findByRole('button', { name: /More/ }));
    expect(screen.getByText(/original glimpse stays with its canvas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete thought' })).not.toBeInTheDocument();
  });
});

describe('connecting', () => {
  it('connects two cards in two taps, then names the link', async () => {
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText('Connect: choose the first thought.')).toBeInTheDocument();
    click('Waiting is hard');
    expect(await screen.findByText(/Connecting from/)).toHaveTextContent('Waiting is hard');
    click('God is near');
    const panel = await screen.findByRole('complementary', { name: 'Connection' });
    expect(doc(store).board.edges).toEqual([{ id: expect.any(String), source: 'entry:a', target: 'entry:b', label: '', direction: 'none' }]);
    fireEvent.change(within(panel).getByLabelText(/How are they related/), { target: { value: 'leads to' } });
    fireEvent.click(within(panel).getByRole('checkbox'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Save label' }));
    expect(doc(store).board.edges[0]).toMatchObject({ label: 'leads to', direction: 'forward' });
    expect(screen.queryByText('Connect: choose the first thought.')).not.toBeInTheDocument();
  });

  it('starts from the selected card, refuses a link to itself or a repeat, and cancels with Escape', async () => {
    const { store } = mount();
    click('Waiting is hard');
    await screen.findByRole('toolbar', { name: 'Thought actions' });
    const connect = () => fireEvent.click(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name: 'Connect' }));
    connect();
    click('Waiting is hard'); // itself
    expect(store.getState().notice).toMatchObject({ kind: 'error', message: expect.stringMatching(/itself/) });
    expect(doc(store).board?.edges ?? []).toEqual([]);
    click('God is near');
    fireEvent.click(await screen.findByRole('button', { name: 'Close connection' }));
    connect();
    click('Waiting is hard');
    click('God is near'); // already connected
    expect(store.getState().notice.message).toMatch(/already connected/);
    expect(doc(store).board.edges).toHaveLength(1);
    fireEvent.keyDown(node('God is near'), { key: 'Escape' });
    expect(screen.queryByText(/Connecting from/)).not.toBeInTheDocument();
  });

  it('connects from the details panel by name, with no dragging', async () => {
    const { store } = mount();
    click('Waiting is hard');
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const panel = screen.getByRole('complementary', { name: 'Thought' });
    fireEvent.change(within(panel).getByLabelText('Find a thought to connect'), { target: { value: 'near' } });
    fireEvent.change(within(panel).getByLabelText(/How are they related/), { target: { value: 'answers' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Connect' }));
    expect(doc(store).board.edges).toEqual([expect.objectContaining({ source: 'entry:a', target: 'entry:b', label: 'answers' })]);
    expect(within(panel).getByRole('list', { name: 'Connections' })).toHaveTextContent('God is near');
    fireEvent.click(within(panel).getByRole('button', { name: /Remove connection with/ }));
    expect(doc(store).board.edges).toEqual([]);
  });

  it('branches a thought: a nearby card and its connection together', async () => {
    const { store } = mount();
    click('Waiting is hard');
    fireEvent.click(await screen.findByRole('button', { name: /More/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Branch thought' }));
    const panel = screen.getByRole('complementary', { name: 'New thought' });
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'What I learned' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add and connect' }));
    await screen.findByText('What I learned');
    const branch = doc(store).journey.entries.at(-1);
    expect(doc(store).board.edges).toEqual([expect.objectContaining({ source: 'entry:a', target: `entry:${branch.id}` })]);
    expect(boardNode(store, `entry:${branch.id}`).x).toBeGreaterThan(boardNode(store, 'entry:a').x);
  });
});

describe('sections', () => {
  // A touch screen: jsdom has no matchMedia, so give it one that reports a coarse pointer.
  const coarse = () => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query) => ({ matches: query.includes('coarse'), media: query, addEventListener() {}, removeEventListener() {} }) });
  afterEach(() => { delete window.matchMedia; });

  it('wraps selected cards in a named section, and moves them back out without losing their place', async () => {
    coarse();
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Select several' }));
    click('Waiting is hard');
    click('God is near');
    const bar = await screen.findByRole('toolbar', { name: 'Selection actions' });
    expect(bar).toHaveTextContent('2 thoughts selected');
    fireEvent.click(within(bar).getByRole('button', { name: /Create section/ }));
    const panel = await screen.findByRole('complementary', { name: 'Section' });
    const section = doc(store).board.sections[0];
    expect(boardNode(store, 'entry:a').sectionId).toBe(section.id);
    expect(boardNode(store, 'entry:b').sectionId).toBe(section.id);
    fireEvent.change(within(panel).getByLabelText('Section name'), { target: { value: 'What I am noticing' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save name' }));
    expect(doc(store).board.sections[0].title).toBe('What I am noticing');
    fireEvent.click(within(panel).getByRole('radio', { name: 'Purple' }));
    expect(doc(store).board.sections[0].color).toBe('purple');
    const before = boardNode(store, 'entry:a');
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove section, keep thoughts' }));
    expect(doc(store).board.sections).toEqual([]);
    expect(boardNode(store, 'entry:a')).toMatchObject({ x: before.x, y: before.y, sectionId: null });
    expect(screen.getByText('Waiting is hard')).toBeInTheDocument();
  });

  it('makes an empty section from the toolbar and opens it to be named', async () => {
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Section' }));
    await screen.findByRole('complementary', { name: 'Section' });
    expect(doc(store).board.sections).toHaveLength(1);
    expect(doc(store).board.sections[0]).toMatchObject({ title: 'New section', collapsed: false });
  });

  it('collapses and expands a section from its header, hiding and showing its cards', async () => {
    const { store } = mount();
    store.dispatch({ type: 'createSection', id: 's1', title: 'Questions', nodeIds: ['entry:a'] });
    const toggle = await screen.findByRole('button', { name: 'Collapse section Questions' });
    fireEvent.click(toggle);
    expect(doc(store).board.sections[0].collapsed).toBe(true);
    await waitFor(() => expect(screen.queryByText('Waiting is hard')).not.toBeInTheDocument());
    expect(await screen.findByText(/1 thought/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand section Questions' }));
    expect(await screen.findByText('Waiting is hard')).toBeInTheDocument();
  });

  it('moves a card into a section from its details, with no dragging', async () => {
    const { store } = mount();
    store.dispatch({ type: 'createSection', id: 's1', title: 'Questions', position: { x: 4000, y: 4000 } });
    click('God is near');
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const panel = screen.getByRole('complementary', { name: 'Thought' });
    fireEvent.change(within(panel).getByLabelText('Section'), { target: { value: 's1' } });
    expect(boardNode(store, 'entry:b').sectionId).toBe('s1');
  });
});

describe('finding things', () => {
  it('searches words and lands on the card, expanding a collapsed section that hides it', async () => {
    const { store } = mount();
    store.dispatch({ type: 'createSection', id: 's1', title: 'Questions', nodeIds: ['entry:a'] });
    store.dispatch({ type: 'toggleSection', id: 's1' });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search this canvas' }), { target: { value: 'waiting' } });
    expect(await screen.findByText('1 result')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('list', { name: 'Search results' })).getByRole('button'));
    expect(doc(store).board.sections[0].collapsed).toBe(false);
    expect(await screen.findByText('Waiting is hard')).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('opens search from the keyboard inside the board and closes it with Escape', () => {
    mount();
    fireEvent.keyDown(node('God is near'), { key: 'f', ctrlKey: true });
    expect(screen.getByRole('search')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });
});

describe('dragging, through the library\'s own pointer handling', () => {
  // d3-drag reads event.view, which jsdom will not accept in a MouseEvent's init.
  const mouse = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1 });
    Object.defineProperty(event, 'view', { value: window });
    act(() => { target.dispatchEvent(event); });
  };
  // The library measures a drag from where the pointer first passes its small threshold, so the
  // first step is just past it and the last lands exactly (dx, dy) further on.
  const dragBy = (el, dx, dy) => {
    mouse('mousedown', el, 100, 100); mouse('mousemove', window, 105, 100);
    mouse('mousemove', window, 105 + dx, 100 + dy); mouse('mouseup', window, 105 + dx, 100 + dy);
  };

  it('commits one move at the end of a drag, in world coordinates, and only the header drags', async () => {
    localStorage.setItem('miqra_canvas_viewport_v1:u1:c1', JSON.stringify({ x: 0, y: 0, zoom: 1 }));
    const { store } = mount();
    const start = boardNode(store, 'entry:b');
    dragBy(node('God is near').querySelector('.lc-card__text'), 120, 60);
    expect(store.getState().past).toHaveLength(0); // the body is for reading and selecting text
    dragBy(node('God is near').querySelector('.lc-card__header'), 120, 60);
    await waitFor(() => expect(store.getState().past).toHaveLength(1));
    expect(boardNode(store, 'entry:b')).toMatchObject({ x: start.x + 120, y: start.y + 60 });
    expect(store.getState().notice.message).toBe('Moved 1 thought');
  });

  it('moves a section with everything in it, and adopts a card dropped inside', async () => {
    localStorage.setItem('miqra_canvas_viewport_v1:u1:c1', JSON.stringify({ x: 0, y: 0, zoom: 1 }));
    const { store } = mount();
    store.dispatch({ type: 'createSection', id: 's1', title: 'Questions', nodeIds: ['entry:a'] });
    const section = doc(store).board.sections[0];
    const cardBefore = boardNode(store, 'entry:a');
    await screen.findByRole('button', { name: 'Collapse section Questions' });
    dragBy(document.querySelector('.react-flow__node-section .lc-section__header'), 200, 100);
    await waitFor(() => expect(doc(store).board.sections[0].x).toBe(section.x + 200));
    expect(doc(store).board.sections[0].y).toBe(section.y + 100);
    expect(boardNode(store, 'entry:a')).toMatchObject({ x: cardBefore.x + 200, y: cardBefore.y + 100, sectionId: 's1' });
    const frame = doc(store).board.sections[0];
    const loose = boardNode(store, 'entry:b');
    dragBy(node('God is near').querySelector('.lc-card__header'), frame.x + 40 - loose.x, frame.y + 90 - loose.y);
    await waitFor(() => expect(boardNode(store, 'entry:b').sectionId).toBe('s1'));
  });
});

describe('at the stated limits', () => {
  it('draws 101 cards, 20 sections and 200 connections, and a selection change does not rebuild the cards', () => {
    let canvas = canvasWith(Array.from({ length: 100 }, (_, i) => entry(`e${i}`, `Thought number ${i}`)));
    const run = (command) => { const r = applyCommand(canvas, command); if (!r.ok) throw new Error(r.error); canvas = r.canvas; };
    for (let i = 0; i < 20; i += 1) run({ type: 'createSection', id: `s${i}`, title: `Section ${i}`, nodeIds: [`entry:e${i * 5}`, `entry:e${i * 5 + 1}`] });
    const ids = ['moment:c1', ...Array.from({ length: 100 }, (_, i) => `entry:e${i}`)];
    let links = 0;
    for (const hop of [1, 7, 13]) for (let i = 0; i < ids.length && links < 200; i += 1) { run({ type: 'connect', source: ids[i], target: ids[(i + hop) % ids.length] }); links += 1; }
    const { store } = mount(canvas);
    expect(document.querySelectorAll('.react-flow__node-thought, .react-flow__node-scripture')).toHaveLength(101);
    expect(document.querySelectorAll('.react-flow__node-section')).toHaveLength(20);
    expect(store.getState().canvas.board.edges).toHaveLength(200);
    expect(document.querySelector('.react-flow__minimap')).toBeTruthy();
  });
});
