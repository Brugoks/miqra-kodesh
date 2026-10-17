// The spatial half of a Living Canvas: where each thought sits, which section
// holds it, and how thoughts connect. Pure — no React, no Supabase — so the
// board, the outline, the save queue and the tests all share one definition.
//
// `journey` (canvasJourney.js) stays the source of truth for words. A board
// never copies text: a node points at the original glimpse or a journey entry
// and carries only a place. Every position is in world coordinates; the React
// Flow adapter (canvasBoardFlow.js) converts section children to parent-relative
// positions and back, so reparenting never makes a card jump.

import { JOURNEY_KINDS, journeyToMarkdown, localDate } from './canvasJourney';

export const BOARD_VERSION = 1;
export const BOARD_LIMITS = Object.freeze({
  nodes: 101, sections: 20, edges: 200, label: 120, sectionTitle: 80, id: 200,
  coordinate: 100000, cardWidth: [200, 640], sectionSize: [280, 20000],
});
export const SECTION_COLORS = Object.freeze(['neutral', 'teal', 'purple', 'amber']);
export const SECTION_COLOR_LABELS = Object.freeze({ neutral: 'Stone', teal: 'Teal', purple: 'Purple', amber: 'Amber' });
export const EDGE_DIRECTIONS = Object.freeze(['none', 'forward']);

// Cards have a fixed height: the excerpt is clamped, long notes live in the
// details panel. That keeps layout, section fitting and hit tests exact.
export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 176;
export const SECTION_HEADER = 48;
export const SECTION_PADDING = 24;
export const SECTION_COLLAPSED_HEIGHT = 56;
export const SECTION_DEFAULT_SIZE = Object.freeze({ width: 520, height: 360 });
const GRID_GAP = 48;
const GRID_COLUMNS = 3;
const ENTRY_ORIGIN_X = CARD_WIDTH + 120;
const COLLISION_MARGIN = 16;

/** Board wording for each stored entry kind. A "thought" is a stored reflection. */
export const CARD_KIND_LABELS = Object.freeze({ moment: 'Original glimpse', reflection: 'Thought', scripture: 'Scripture', prayer: 'Prayer', question: 'Open question', response: 'Small response' });
export const cardKindLabel = (kind) => CARD_KIND_LABELS[kind] || JOURNEY_KINDS[kind]?.label || 'Thought';

export const momentNodeId = (canvasId) => `moment:${canvasId}`;
export const entryNodeId = (entryId) => `entry:${entryId}`;
export const refKey = (ref) => (ref.type === 'moment' ? 'moment' : `entry:${ref.entryId}`);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const between = (value, [low, high]) => finite(value) && value >= low && value <= high;
const inWorld = (value) => finite(value) && Math.abs(value) <= BOARD_LIMITS.coordinate;
const shortText = (value, max) => typeof value === 'string' && value.length <= max;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const clampWorld = (value) => clamp(Math.round(value), -BOARD_LIMITS.coordinate, BOARD_LIMITS.coordinate);

/**
 * Validates a stored board and returns an explicit whitelisted copy. A board
 * that fails is reported, never repaired: the caller keeps the raw JSON so a
 * newer client's layout is not silently overwritten by an older one.
 */
export function normalizeBoard(value) {
  const fail = (reason) => ({ ok: false, reason });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('The saved layout is not a board.');
  if (value.version !== BOARD_VERSION) return fail('The saved layout was made by a newer version of Living Canvas.');
  if (!Array.isArray(value.nodes) || !Array.isArray(value.sections) || !Array.isArray(value.edges)) return fail('The saved layout is missing its cards, sections, or connections.');
  if (value.nodes.length > BOARD_LIMITS.nodes) return fail('The saved layout holds too many cards.');
  if (value.sections.length > BOARD_LIMITS.sections) return fail('The saved layout holds too many sections.');
  if (value.edges.length > BOARD_LIMITS.edges) return fail('The saved layout holds too many connections.');

  const ids = new Set();
  const claim = (id) => { if (!shortText(id, BOARD_LIMITS.id) || !id || ids.has(id)) return false; ids.add(id); return true; };

  const sections = [];
  for (const s of value.sections) {
    if (!s || !claim(s.id) || !shortText(s.title, BOARD_LIMITS.sectionTitle) || !SECTION_COLORS.includes(s.color)
      || !inWorld(s.x) || !inWorld(s.y) || !between(s.width, BOARD_LIMITS.sectionSize) || !between(s.height, BOARD_LIMITS.sectionSize)
      || typeof s.collapsed !== 'boolean') return fail('A section in the saved layout is damaged.');
    sections.push({ id: s.id, title: s.title, color: s.color, x: s.x, y: s.y, width: s.width, height: s.height, collapsed: s.collapsed });
  }
  const sectionIds = new Set(sections.map((s) => s.id));

  const refs = new Set();
  const nodes = [];
  for (const n of value.nodes) {
    const ref = n?.contentRef;
    const refOk = ref && (ref.type === 'moment' || (ref.type === 'entry' && shortText(ref.entryId, BOARD_LIMITS.id) && ref.entryId));
    if (!n || !claim(n.id) || !refOk || refs.has(refKey(ref)) || !inWorld(n.x) || !inWorld(n.y) || !between(n.width, BOARD_LIMITS.cardWidth)
      || !(n.sectionId === null || sectionIds.has(n.sectionId))) return fail('A card in the saved layout is damaged.');
    refs.add(refKey(ref));
    nodes.push({ id: n.id, contentRef: ref.type === 'moment' ? { type: 'moment' } : { type: 'entry', entryId: ref.entryId }, x: n.x, y: n.y, width: n.width, sectionId: n.sectionId });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));

  const pairs = new Set();
  const edges = [];
  for (const e of value.edges) {
    const pair = e && [e.source, e.target].sort().join('\u0000');
    if (!e || !claim(e.id) || !nodeIds.has(e.source) || !nodeIds.has(e.target) || e.source === e.target || pairs.has(pair)
      || !shortText(e.label, BOARD_LIMITS.label) || !EDGE_DIRECTIONS.includes(e.direction)) return fail('A connection in the saved layout is damaged.');
    pairs.add(pair);
    edges.push({ id: e.id, source: e.source, target: e.target, label: e.label, direction: e.direction });
  }
  return { ok: true, board: { version: BOARD_VERSION, nodes, sections, edges } };
}

// ---------------------------------------------------------------- geometry

export const cardRect = (node) => ({ x: node.x, y: node.y, width: node.width, height: CARD_HEIGHT });
export const sectionFrame = (section) => ({ x: section.x, y: section.y, width: section.width, height: section.collapsed ? SECTION_COLLAPSED_HEIGHT : section.height });
const overlaps = (a, b, margin = 0) => a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
const containsPoint = (rect, px, py) => px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export function boundsOf(rects) {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
}

/** The world point at the centre of the visible board, for a given pan and zoom. */
export const viewportCenter = ({ x, y, zoom }, { width, height }) => ({ x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom });
/** A screen point (relative to the board element) as a world point. */
export const screenToWorld = ({ x, y, zoom }, point) => ({ x: (point.x - x) / zoom, y: (point.y - y) / zoom });

const gridSlot = (index, width = CARD_WIDTH) => ({
  x: ENTRY_ORIGIN_X + (index % GRID_COLUMNS) * (CARD_WIDTH + GRID_GAP), y: Math.floor(index / GRID_COLUMNS) * (CARD_HEIGHT + GRID_GAP), width, height: CARD_HEIGHT,
});

/** The first slot on the arrangement grid that touches nothing already placed. */
export function freeSlot(occupied, width = CARD_WIDTH) {
  for (let index = 0; index < 4000; index += 1) {
    const rect = gridSlot(index, width);
    if (!occupied.some((other) => overlaps(rect, other, COLLISION_MARGIN))) return rect;
  }
  return gridSlot(0, width);
}

/** Slides a rectangle diagonally until it no longer sits exactly on top of another card. */
export function nudgeClear(rect, occupied, step = 32) {
  let next = rect;
  for (let tries = 0; tries < 60 && occupied.some((other) => Math.abs(other.x - next.x) < step && Math.abs(other.y - next.y) < step); tries += 1) next = { ...next, x: next.x + step, y: next.y + step };
  return next;
}

/** The topmost expanded section whose frame holds a point. Later sections draw on top. */
export function sectionAt(sections, point, ignoreId = null) {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index];
    if (section.id !== ignoreId && !section.collapsed && containsPoint(sectionFrame(section), point.x, point.y)) return section;
  }
  return null;
}

/**
 * Where a card belongs after it is dropped: the topmost section under its
 * centre adopts it; a member stays put until it is fully outside its section.
 */
export function membershipAfterDrop(rect, sections, currentSectionId) {
  const hit = sectionAt(sections, center(rect));
  if (hit) return hit.id;
  const current = currentSectionId && sections.find((s) => s.id === currentSectionId);
  return current && overlaps(rect, sectionFrame(current)) ? current.id : null;
}

export const membersOf = (board, sectionId) => board.nodes.filter((n) => n.sectionId === sectionId);

/** The smallest a section may be without cropping its cards. */
export function sectionMinimum(section, members) {
  const right = members.length ? Math.max(...members.map((m) => m.x + m.width)) - section.x + SECTION_PADDING : 0;
  const bottom = members.length ? Math.max(...members.map((m) => m.y + CARD_HEIGHT)) - section.y + SECTION_PADDING : 0;
  return { width: Math.max(BOARD_LIMITS.sectionSize[0], Math.ceil(right)), height: Math.max(BOARD_LIMITS.sectionSize[0], Math.ceil(bottom)) };
}

/** A section frame that wraps the given card rectangles with room for its title. */
export function fitSection(rects) {
  const box = boundsOf(rects);
  return {
    x: clampWorld(box.x - SECTION_PADDING), y: clampWorld(box.y - SECTION_HEADER - SECTION_PADDING),
    width: clamp(Math.ceil(box.width + SECTION_PADDING * 2), BOARD_LIMITS.sectionSize[0], BOARD_LIMITS.sectionSize[1]),
    height: clamp(Math.ceil(box.height + SECTION_HEADER + SECTION_PADDING * 2), BOARD_LIMITS.sectionSize[0], BOARD_LIMITS.sectionSize[1]),
  };
}

/** The centre for a new empty section: in a row above everything already on the board. */
export function emptySectionSpot(board) {
  const box = boundsOf([...board.nodes.map(cardRect), ...board.sections.map(sectionFrame)]);
  if (!box) return { x: 0, y: 0 };
  return { x: box.x + SECTION_DEFAULT_SIZE.width / 2 + board.sections.length * (SECTION_DEFAULT_SIZE.width + 40), y: box.y - SECTION_DEFAULT_SIZE.height / 2 - 60 };
}

// -------------------------------------------------------------- projection

/**
 * The complete board for a canvas: stored placements where they exist, and a
 * deterministic arrangement everywhere else (original at the left, later
 * entries on a spaced grid in creation order). Reading never writes — a legacy
 * canvas with no board projects the same arrangement every time until the
 * person makes a spatial edit. References to entries that no longer exist are
 * left out and counted, so the view can say so.
 */
export function projectBoard(canvas) {
  const { journey } = canvas;
  const stored = canvas.board || { version: BOARD_VERSION, nodes: [], sections: [], edges: [] };
  const byRef = new Map(stored.nodes.map((n) => [refKey(n.contentRef), n]));
  const wanted = [
    { ref: { type: 'moment' }, id: momentNodeId(canvas.id) },
    ...journey.entries.map((entry) => ({ ref: { type: 'entry', entryId: entry.id }, id: entryNodeId(entry.id) })),
  ];
  const wantedKeys = new Set(wanted.map((w) => refKey(w.ref)));
  const stale = stored.nodes.filter((n) => !wantedKeys.has(refKey(n.contentRef))).length;

  const sections = stored.sections.map((s) => ({ ...s }));
  const occupied = [...stored.nodes.filter((n) => wantedKeys.has(refKey(n.contentRef))).map(cardRect), ...sections.map(sectionFrame)];
  const sectionIds = new Set(sections.map((s) => s.id));
  let placed = 0;
  const nodes = wanted.map(({ ref, id }) => {
    const have = byRef.get(refKey(ref));
    if (have) return { ...have, contentRef: { ...have.contentRef }, sectionId: have.sectionId && sectionIds.has(have.sectionId) ? have.sectionId : null };
    placed += 1;
    const rect = ref.type === 'moment' ? { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } : freeSlot(occupied);
    occupied.push(rect);
    return { id, contentRef: ref, x: rect.x, y: rect.y, width: rect.width, sectionId: null };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = stored.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)).map((e) => ({ ...e }));
  return { board: { version: BOARD_VERSION, nodes, sections, edges }, notices: { stale, placed: stored.nodes.length ? placed : 0 } };
}

// ----------------------------------------------------------------- content

const entryFor = (journey, ref) => (ref.type === 'entry' ? journey.entries.find((e) => e.id === ref.entryId) || null : null);

/** What a node shows: its words, kind and dates, resolved from the journey. */
export function cardContent(canvas, node) {
  const { journey } = canvas;
  if (node.contentRef.type === 'moment') {
    return { id: node.id, kind: 'moment', label: CARD_KIND_LABELS.moment, text: journey.moment, reference: '', createdAt: journey.createdAt, editedAt: journey.editedAt || null, entry: null, isMoment: true };
  }
  const entry = entryFor(journey, node.contentRef);
  if (!entry) return null;
  return { id: node.id, kind: entry.kind, label: cardKindLabel(entry.kind), text: entry.text, reference: entry.reference || '', createdAt: entry.createdAt, editedAt: entry.editedAt || null, entry, isMoment: false };
}

/** A short plain-text preview for a card or a result list. */
export function excerpt(content, max = 160) {
  const base = content.text || content.entry?.scripture?.verses.map((v) => v.text).join(' ') || '';
  const flat = base.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Everything a person could search for on one card, lower-cased. */
function searchableText(content) {
  const s = content.entry?.scripture;
  return [content.text, content.reference, s?.verses.map((v) => v.text).join(' '), s?.context, s?.connection].filter(Boolean).join(' ').toLowerCase();
}

/** Text matches across cards, sections and connection labels, for the search list. */
export function searchBoard(canvas, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const { board } = projectBoard(canvas);
  const sectionTitle = new Map(board.sections.map((s) => [s.id, s.title]));
  const hits = [];
  for (const node of board.nodes) {
    const content = cardContent(canvas, node);
    if (content && searchableText(content).includes(needle)) hits.push({ type: 'card', nodeId: node.id, label: content.label, excerpt: excerpt(content, 120), sectionId: node.sectionId, sectionTitle: sectionTitle.get(node.sectionId) || '' });
  }
  for (const section of board.sections) if (section.title.toLowerCase().includes(needle)) hits.push({ type: 'section', sectionId: section.id, label: 'Section', excerpt: section.title });
  for (const edge of board.edges) if (edge.label.toLowerCase().includes(needle)) hits.push({ type: 'connection', edgeId: edge.id, nodeId: edge.source, label: 'Connection', excerpt: edge.label });
  return hits;
}

// ------------------------------------------------------------ connections

/** The connections drawn on the board. Links to a collapsed section's cards attach to its frame. */
export function renderedEdges(board) {
  const sectionOf = new Map(board.nodes.map((n) => [n.id, n.sectionId]));
  const collapsed = new Set(board.sections.filter((s) => s.collapsed).map((s) => s.id));
  const end = (id) => { const sid = sectionOf.get(id); return sid && collapsed.has(sid) ? sid : id; };
  return board.edges.flatMap((edge) => {
    const source = end(edge.source);
    const target = end(edge.target);
    return source === target ? [] : [{ ...edge, source, target, viaSection: source !== edge.source || target !== edge.target }];
  });
}

/** What a collapsed section tells the viewer: how many cards it hides and how many links leave it. */
export function sectionSummary(board, sectionId) {
  const inside = new Set(membersOf(board, sectionId).map((n) => n.id));
  return { cards: inside.size, links: board.edges.filter((e) => inside.has(e.source) !== inside.has(e.target)).length };
}

/** Cards joined to a node, for the outline and the details panel. */
export function connectionsFor(board, nodeId) {
  return board.edges.filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => ({ edgeId: e.id, otherId: e.source === nodeId ? e.target : e.source, label: e.label, direction: e.direction, outgoing: e.source === nodeId }));
}

// ----------------------------------------------------------------- outline

/** Cards grouped for the outline: by section (then loose cards), or in the order they were written. */
export function outlineGroups(canvas, order = 'section') {
  const { board } = projectBoard(canvas);
  const cards = board.nodes.map((node) => ({ node, content: cardContent(canvas, node) })).filter((c) => c.content);
  const byTime = (a, b) => (a.content.isMoment ? -1 : b.content.isMoment ? 1 : Date.parse(a.content.createdAt) - Date.parse(b.content.createdAt));
  if (order === 'chronological') return [{ section: null, cards: [...cards].sort(byTime) }];
  const groups = board.sections.map((section) => ({ section, cards: cards.filter((c) => c.node.sectionId === section.id).sort(byTime) }));
  const loose = cards.filter((c) => !c.node.sectionId).sort(byTime);
  return [...(loose.length ? [{ section: null, cards: loose }] : []), ...groups];
}

/** A person's own layout as JSON, for the recovery download. Includes a damaged board verbatim. */
export function boardRecoveryJson(canvas) {
  const raw = canvas.boardIssue ? canvas.boardIssue.raw : canvas.board || null;
  return JSON.stringify({ canvasId: canvas.id, title: canvas.title, exportedAt: new Date().toISOString(), board: raw, issue: canvas.boardIssue?.reason || null, journey: canvas.journey }, null, 2);
}

// ------------------------------------------------------------------ export

const summaryLine = (content) => `${content.label} · ${localDate(new Date(content.createdAt))}${excerpt(content, 90) ? ` — ${excerpt(content, 90)}` : ''}`;

/**
 * How the chosen cards sit together: their sections, and the links between
 * them. A link appears only when both ends are chosen, and a section only if it
 * holds a chosen card, so exporting part of a canvas never reveals the rest.
 * The original glimpse is always part of an export.
 */
export function layoutMarkdown(canvas, entries) {
  if (canvas.boardIssue) return '';
  const { board } = projectBoard(canvas);
  const chosen = new Set(['moment', ...entries.map((e) => `entry:${e.id}`)]);
  const included = board.nodes.filter((n) => chosen.has(refKey(n.contentRef)));
  const ids = new Set(included.map((n) => n.id));
  const name = (id) => { const node = board.nodes.find((n) => n.id === id); const content = node && cardContent(canvas, node); return content ? `${content.label}: ${excerpt(content, 50) || localDate(new Date(content.createdAt))}` : ''; };
  const sections = board.sections.map((s) => ({ s, cards: included.filter((n) => n.sectionId === s.id) })).filter((g) => g.cards.length);
  const links = board.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  if (!sections.length && !links.length) return '';
  return [
    ...(sections.length ? ['## Sections', '', ...sections.flatMap(({ s, cards }) => [`### ${s.title.trim() || 'Untitled section'}`, '', ...cards.map((n) => `- ${summaryLine(cardContent(canvas, n))}`), '']),] : []),
    ...(links.length ? ['## Connections', '', ...links.map((e) => `- ${name(e.source)} ${e.direction === 'forward' ? '→' : '—'} ${name(e.target)}${e.label ? ` (${e.label})` : ''}`), ''] : []),
  ].join('\n');
}

/** A personal copy of the chosen entries, with their sections and relationships. */
export function exportMarkdown(canvas, entries = canvas.journey.entries) {
  const story = journeyToMarkdown(canvas, entries);
  const layout = layoutMarkdown(canvas, entries);
  return layout ? `${story}\n${layout}` : story;
}
