// Every change to a Living Canvas goes through one of these commands, so the
// board and the outline cannot disagree and undo has a single thing to undo.
// A command takes a normalized canvas and returns a new one — or an error
// message, leaving the canvas as it was. A drag is one command at pointer-up,
// never one per pointer event.
//
// Spatial commands work on the projected board (canvasBoard.projectBoard), so
// the first one on a legacy canvas writes the whole arrangement, and a canvas
// whose saved layout is damaged refuses them rather than overwrite it.

import { JOURNEY_ENTRY_MAX, isRevisitDue, normalizeJourney } from './canvasJourney';
import {
  BOARD_LIMITS, CARD_HEIGHT, CARD_WIDTH, SECTION_DEFAULT_SIZE, SECTION_HEADER, SECTION_PADDING, SECTION_COLORS,
  cardRect, clampWorld, entryNodeId, fitSection, freeSlot, membersOf, membershipAfterDrop, normalizeBoard, nudgeClear,
  projectBoard, sectionAt, sectionFrame, sectionMinimum,
} from './canvasBoard';

export const HISTORY_LIMIT = 50;
export const newEdgeId = () => `edge:${crypto.randomUUID()}`;
export const newSectionId = () => `section:${crypto.randomUUID()}`;

const LOCKED = 'This canvas’s saved layout can’t be read, so it can’t be rearranged yet. Open the menu and choose Reset layout.';
const ok = (canvas, announce) => ({ ok: true, canvas, announce });
const fail = (canvas, error) => ({ ok: false, canvas, error });
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const spatialBase = (canvas) => (canvas.boardIssue ? null : projectBoard(canvas).board);

// Validation hands back fresh copies. Keep the previous object wherever nothing changed, so
// the fifty undo steps of a full board share their untouched cards instead of each holding a copy.
const shareUnchanged = (before, after) => {
  if (!before) return after;
  const old = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const kept = new Map(before.map((item) => [item.id, item]));
  return after.map((item) => (old.get(item.id) === JSON.stringify(item) ? kept.get(item.id) : item));
};

/** Re-checks the finished board, so a bug in a command can never reach storage. */
function commit(canvas, board, announce) {
  const checked = normalizeBoard(board);
  if (!checked.ok) return fail(canvas, 'That change would make the board invalid, so it was not made.');
  const previous = canvas.board;
  const shared = { ...checked.board, nodes: shareUnchanged(previous?.nodes, checked.board.nodes), sections: shareUnchanged(previous?.sections, checked.board.sections), edges: shareUnchanged(previous?.edges, checked.board.edges) };
  return ok({ ...canvas, board: shared }, announce);
}

const updateNodes = (board, ids, change) => board.nodes.map((n) => (ids.has(n.id) ? change(n) : n));
const updateSection = (board, id, change) => board.sections.map((s) => (s.id === id ? change(s) : s));

/** Keeps the board in step with a journey whose entries changed: new entries find a slot, removed ones go. */
function reconcile(canvas, announce) {
  if (!canvas.board || canvas.boardIssue) return ok(canvas, announce);
  return commit(canvas, projectBoard(canvas).board, announce);
}

const handlers = {
  addThought(canvas, { entry, position, connectFrom }) {
    const { journey } = canvas;
    if (journey.entries.length >= JOURNEY_ENTRY_MAX) return fail(canvas, 'This canvas holds 100 later thoughts. Start a new canvas to continue.');
    if (journey.entries.some((e) => e.id === entry.id)) return fail(canvas, 'That thought is already on the canvas.');
    if (entry.scripture && journey.entries.some((e) => e.reference === entry.reference)) return fail(canvas, `${entry.reference} is already on this canvas.`);
    // A reflection completes a planned revisit. Other additions do not dismiss it.
    const revisitOn = entry.kind === 'reflection' && isRevisitDue(journey.revisitOn) ? null : journey.revisitOn;
    const nextJourney = normalizeJourney({ ...journey, revisitOn, entries: [...journey.entries, entry] });
    if (!nextJourney) return fail(canvas, 'That thought could not be added. Check its words and try again.');
    const next = { ...canvas, journey: nextJourney };
    // Without a board a legacy canvas stays unwritten; the projection places the entry.
    if (canvas.boardIssue || !(canvas.board || position || connectFrom)) return ok(next, 'Thought added');

    const board = projectBoard(canvas).board;
    const source = connectFrom && board.nodes.find((n) => n.id === connectFrom);
    const origin = source ? { x: source.x + source.width + 64, y: source.y }
      : position ? { x: position.x - CARD_WIDTH / 2, y: position.y - CARD_HEIGHT / 2 }
        : freeSlot([...board.nodes.map(cardRect), ...board.sections.map(sectionFrame)]);
    const rect = nudgeClear({ x: clampWorld(origin.x), y: clampWorld(origin.y), width: CARD_WIDTH, height: CARD_HEIGHT }, board.nodes.map(cardRect));
    const node = { id: entryNodeId(entry.id), contentRef: { type: 'entry', entryId: entry.id }, x: rect.x, y: rect.y, width: CARD_WIDTH, sectionId: membershipAfterDrop(rect, board.sections, null) };
    const edges = source ? [...board.edges, { id: newEdgeId(), source: source.id, target: node.id, label: '', direction: 'none' }] : board.edges;
    return commit(next, { ...board, nodes: [...board.nodes, node], edges }, source ? 'Branch thought added' : 'Thought added');
  },

  /**
   * Several thoughts at once (a pasted set of paragraphs), as one undoable step. They are laid out in a loose row-and-column
   * grid around `position`. All of them are added or none is.
   */
  addThoughts(canvas, { entries, position }) {
    if (!entries?.length) return fail(canvas, 'There is nothing to add.');
    if (canvas.journey.entries.length + entries.length > JOURNEY_ENTRY_MAX) return fail(canvas, `This canvas holds up to ${JOURNEY_ENTRY_MAX} later thoughts.`);
    let next = canvas;
    for (const [index, entry] of entries.entries()) {
      const at = position && { x: position.x + ((index % 3) - 1) * (CARD_WIDTH + 48), y: position.y + Math.floor(index / 3) * (CARD_HEIGHT + 48) };
      const result = handlers.addThought(next, { entry, position: at });
      if (!result.ok) return fail(canvas, result.error);
      next = result.canvas;
    }
    return ok(next, `${entries.length} thoughts added`);
  },

  replaceJourney(canvas, { journey, announce = 'Changes saved' }) {
    const normalized = normalizeJourney(journey);
    return normalized ? reconcile({ ...canvas, journey: normalized }, announce) : fail(canvas, 'Those changes could not be saved. Check the words and try again.');
  },

  deleteCard(canvas, { nodeId }) {
    const board = projectBoard(canvas).board;
    const node = board.nodes.find((n) => n.id === nodeId);
    if (!node) return fail(canvas, 'That card is no longer on the canvas.');
    if (node.contentRef.type === 'moment') return fail(canvas, 'The original glimpse stays with its canvas. Edit its words, or delete the whole canvas.');
    const next = { ...canvas, journey: { ...canvas.journey, entries: canvas.journey.entries.filter((e) => e.id !== node.contentRef.entryId) } };
    if (!canvas.board || canvas.boardIssue) return ok(next, 'Thought deleted');
    // Links go with the card, in the same undoable step.
    return commit(next, { ...board, nodes: board.nodes.filter((n) => n.id !== nodeId), edges: board.edges.filter((e) => e.source !== nodeId && e.target !== nodeId) }, 'Thought deleted');
  },

  setTitle(canvas, { title }) {
    const clean = String(title).trim().slice(0, 160);
    return clean ? ok({ ...canvas, title: clean }, 'Title changed') : fail(canvas, 'A canvas needs a name.');
  },

  /** One drag: cards and sections, each at its final world position. */
  move(canvas, { nodes = [], sections = [] }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const explicit = new Map(nodes.map((n) => [n.id, n]));
    const carried = new Map();
    const movedSections = board.sections.map((s) => {
      const to = sections.find((m) => m.id === s.id);
      if (!to) return s;
      const x = clampWorld(to.x);
      const y = clampWorld(to.y);
      carried.set(s.id, { dx: x - s.x, dy: y - s.y });
      return { ...s, x, y };
    });
    let changed = [...carried.values()].some((d) => d.dx || d.dy);
    const movedNodes = board.nodes.map((n) => {
      const to = explicit.get(n.id);
      const along = n.sectionId && carried.get(n.sectionId);
      if (!to && !along) return n;
      const x = to ? clampWorld(to.x) : clampWorld(n.x + along.dx);
      const y = to ? clampWorld(to.y) : clampWorld(n.y + along.dy);
      // Dropping adopts or releases; a card moving with its own section keeps its place in it.
      const sectionId = to && !along ? membershipAfterDrop({ x, y, width: n.width, height: CARD_HEIGHT }, movedSections, n.sectionId) : n.sectionId;
      if (x !== n.x || y !== n.y || sectionId !== n.sectionId) changed = true;
      return { ...n, x, y, sectionId };
    });
    if (!changed) return ok(canvas, '');
    return commit(canvas, { ...board, nodes: movedNodes, sections: movedSections }, nodes.length ? `Moved ${plural(nodes.length, 'thought', 'thoughts')}` : 'Section moved');
  },

  resizeCard(canvas, { nodeId, width }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const [low, high] = BOARD_LIMITS.cardWidth;
    return commit(canvas, { ...board, nodes: updateNodes(board, new Set([nodeId]), (n) => ({ ...n, width: Math.min(high, Math.max(low, Math.round(width))) })) }, 'Card resized');
  },

  createSection(canvas, { id = newSectionId(), nodeIds = [], position, title = 'New section', color = 'neutral' }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    if (board.sections.length >= BOARD_LIMITS.sections) return fail(canvas, `A canvas holds up to ${BOARD_LIMITS.sections} sections.`);
    const chosen = new Set(nodeIds);
    let members = board.nodes.filter((n) => chosen.has(n.id));
    let frame;
    if (members.length) frame = fitSection(members.map(cardRect));
    else {
      const at = position || { x: 0, y: 0 };
      frame = { x: clampWorld(at.x - SECTION_DEFAULT_SIZE.width / 2), y: clampWorld(at.y - SECTION_DEFAULT_SIZE.height / 2), ...SECTION_DEFAULT_SIZE };
      // Loose cards already under an empty section's frame belong to it.
      members = board.nodes.filter((n) => !n.sectionId && sectionAt([{ ...frame, id, collapsed: false }], { x: n.x + n.width / 2, y: n.y + CARD_HEIGHT / 2 }));
    }
    const section = { id, title: String(title).trim().slice(0, BOARD_LIMITS.sectionTitle) || 'New section', color: SECTION_COLORS.includes(color) ? color : 'neutral', ...frame, collapsed: false };
    const inside = new Set(members.map((n) => n.id));
    return commit(canvas, { ...board, sections: [...board.sections, section], nodes: updateNodes(board, inside, (n) => ({ ...n, sectionId: id })) }, 'Section created');
  },

  updateSection(canvas, { id, title, color }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    if (!board.sections.some((s) => s.id === id)) return fail(canvas, 'That section is gone.');
    return commit(canvas, { ...board, sections: updateSection(board, id, (s) => ({
      ...s, title: title === undefined ? s.title : String(title).trim().slice(0, BOARD_LIMITS.sectionTitle) || s.title,
      color: SECTION_COLORS.includes(color) ? color : s.color,
    })) }, 'Section updated');
  },

  toggleSection(canvas, { id }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const section = board.sections.find((s) => s.id === id);
    if (!section) return fail(canvas, 'That section is gone.');
    return commit(canvas, { ...board, sections: updateSection(board, id, (s) => ({ ...s, collapsed: !s.collapsed })) }, section.collapsed ? 'Section expanded' : 'Section collapsed');
  },

  /** Removes the frame, keeps every card where it is. */
  removeSection(canvas, { id }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    if (!board.sections.some((s) => s.id === id)) return fail(canvas, 'That section is gone.');
    return commit(canvas, { ...board, sections: board.sections.filter((s) => s.id !== id), nodes: board.nodes.map((n) => (n.sectionId === id ? { ...n, sectionId: null } : n)) }, 'Section removed, cards kept');
  },

  resizeSection(canvas, { id, width, height }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const section = board.sections.find((s) => s.id === id);
    if (!section) return fail(canvas, 'That section is gone.');
    const min = sectionMinimum(section, membersOf(board, id));
    const [, high] = BOARD_LIMITS.sectionSize;
    return commit(canvas, { ...board, sections: updateSection(board, id, (s) => ({ ...s, width: Math.min(high, Math.max(min.width, Math.round(width))), height: Math.min(high, Math.max(min.height, Math.round(height))) })) }, 'Section resized');
  },

  /** The menu route to what a drop does: put cards into a section (or release them), without dragging. */
  moveToSection(canvas, { nodeIds, sectionId }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const chosen = new Set(nodeIds);
    if (sectionId === null) return commit(canvas, { ...board, nodes: updateNodes(board, chosen, (n) => ({ ...n, sectionId: null })) }, `${plural(chosen.size, 'thought', 'thoughts')} taken out of the section`);
    const section = board.sections.find((s) => s.id === sectionId);
    if (!section) return fail(canvas, 'That section is gone.');
    const columns = Math.max(1, Math.floor((section.width - SECTION_PADDING * 2 + 32) / (CARD_WIDTH + 32)));
    const placed = board.nodes.filter((n) => n.sectionId === sectionId && !chosen.has(n.id)).map(cardRect);
    let grown = section;
    const nodes = board.nodes.map((n) => {
      if (!chosen.has(n.id)) return n;
      let slot = 0;
      const at = (i) => ({ x: section.x + SECTION_PADDING + (i % columns) * (CARD_WIDTH + 32), y: section.y + SECTION_HEADER + SECTION_PADDING + Math.floor(i / columns) * (CARD_HEIGHT + 32), width: n.width, height: CARD_HEIGHT });
      while (placed.some((p) => Math.abs(p.x - at(slot).x) < 16 && Math.abs(p.y - at(slot).y) < 16)) slot += 1;
      const rect = at(slot);
      placed.push(rect);
      grown = { ...grown, width: Math.min(BOARD_LIMITS.sectionSize[1], Math.max(grown.width, rect.x + rect.width - section.x + SECTION_PADDING)), height: Math.min(BOARD_LIMITS.sectionSize[1], Math.max(grown.height, rect.y + rect.height - section.y + SECTION_PADDING)) };
      return { ...n, x: clampWorld(rect.x), y: clampWorld(rect.y), sectionId };
    });
    return commit(canvas, { ...board, nodes, sections: updateSection(board, sectionId, () => grown) }, `${plural(chosen.size, 'thought', 'thoughts')} moved into ${section.title || 'the section'}`);
  },

  connect(canvas, { id = newEdgeId(), source, target, label = '', direction = 'none' }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    const ids = new Set(board.nodes.map((n) => n.id));
    if (!ids.has(source) || !ids.has(target)) return fail(canvas, 'Choose two thoughts that are on the canvas.');
    if (source === target) return fail(canvas, 'A thought can’t connect to itself. Choose a different thought.');
    if (board.edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return fail(canvas, 'These thoughts are already connected. Select the link to change its label.');
    if (board.edges.length >= BOARD_LIMITS.edges) return fail(canvas, `A canvas holds up to ${BOARD_LIMITS.edges} connections.`);
    return commit(canvas, { ...board, edges: [...board.edges, { id, source, target, label: String(label).trim().slice(0, BOARD_LIMITS.label), direction: direction === 'forward' ? 'forward' : 'none' }] }, 'Thoughts connected');
  },

  updateEdge(canvas, { id, label, direction, reverse = false }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    if (!board.edges.some((e) => e.id === id)) return fail(canvas, 'That connection is gone.');
    return commit(canvas, { ...board, edges: board.edges.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, label: label === undefined ? e.label : String(label).trim().slice(0, BOARD_LIMITS.label), direction: direction === undefined ? e.direction : direction };
      return reverse ? { ...next, source: e.target, target: e.source } : next;
    }) }, 'Connection updated');
  },

  removeEdge(canvas, { id }) {
    const board = spatialBase(canvas);
    if (!board) return fail(canvas, LOCKED);
    if (!board.edges.some((e) => e.id === id)) return fail(canvas, 'That connection is gone.');
    return commit(canvas, { ...board, edges: board.edges.filter((e) => e.id !== id) }, 'Connection removed');
  },
};

export function applyCommand(canvas, command) {
  const handler = handlers[command?.type];
  if (!handler) return fail(canvas, 'That action is not available.');
  return handler(canvas, command);
}

/**
 * The open canvas plus its undo history, outside React so a command's outcome
 * is known synchronously and the tests need no renderer. Selection, hover and
 * drag previews are not here: they are not part of the document.
 */
export function createDocumentStore(initial) {
  let state = { canvas: initial, past: [], future: [], seq: 0, notice: null };
  let noticeId = 0;
  const listeners = new Set();
  const set = (next) => { state = next; listeners.forEach((listener) => listener()); };
  const note = (kind, message) => ({ kind, message, id: (noticeId += 1) });
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(command) {
      const result = applyCommand(state.canvas, command);
      if (!result.ok) { set({ ...state, notice: note('error', result.error) }); return result; }
      if (result.canvas === state.canvas) return result;
      set({ canvas: result.canvas, past: [...state.past, { canvas: state.canvas, label: result.announce }].slice(-HISTORY_LIMIT), future: [], seq: state.seq + 1, notice: result.announce ? note('info', result.announce) : state.notice });
      return result;
    },
    undo() {
      const last = state.past.at(-1);
      if (!last) return false;
      set({ canvas: last.canvas, past: state.past.slice(0, -1), future: [...state.future, { canvas: state.canvas, label: last.label }], seq: state.seq + 1, notice: note('info', `Undid: ${last.label.toLowerCase()}`) });
      return true;
    },
    redo() {
      const next = state.future.at(-1);
      if (!next) return false;
      set({ canvas: next.canvas, past: [...state.past, { canvas: state.canvas, label: next.label }], future: state.future.slice(0, -1), seq: state.seq + 1, notice: note('info', `Redid: ${next.label.toLowerCase()}`) });
      return true;
    },
    /** A deliberate fresh start for a layout that can't be read. Not undoable: the old JSON is already downloadable. */
    resetBoard() {
      const fresh = { ...state.canvas, board: null };
      delete fresh.boardIssue;
      set({ canvas: { ...fresh, board: projectBoard(fresh).board }, past: [], future: [], seq: state.seq + 1, notice: note('info', 'Layout reset') });
    },
    /** Adopts a canvas from outside (opened, reloaded, restored). History does not carry across. */
    replace(canvas, { dirty = false } = {}) {
      set({ canvas, past: [], future: [], seq: dirty ? state.seq + 1 : state.seq, notice: null });
    },
  };
}
