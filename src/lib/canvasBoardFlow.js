// The seam between the board document and React Flow. The document stores
// every position in world coordinates; React Flow wants a section's children
// positioned relative to the section, with parents listed before children.
// These pure functions convert both ways, so nothing about grouping depends on
// the library, and a card dragged between sections never jumps.

import {
  CARD_HEIGHT, SECTION_COLLAPSED_HEIGHT, cardContent, connectionsFor, excerpt, membersOf, renderedEdges, sectionMinimum, sectionSummary,
} from './canvasBoard';

const DATE = { month: 'short', day: 'numeric', year: 'numeric' };
export const formatCardDate = (value) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(undefined, DATE);

/** Keeps the previous object when nothing in it changed, so unchanged cards do not re-render. */
function reuse(cache, id, next) {
  const before = cache?.get(id);
  const same = before && Object.keys(next).length === Object.keys(before).length && Object.keys(next).every((key) => before[key] === next[key]);
  const kept = same ? before : next;
  cache?.set(id, kept);
  return kept;
}

/**
 * Cards and section frames as React Flow nodes. Sections come first (a parent
 * must precede its children); a card inside one is positioned relative to it.
 * `cache` is optional; pass the same Map each time to keep node data stable.
 */
export function toFlowNodes(canvas, board, { selected = new Set(), connectFrom = null, connecting = Boolean(connectFrom), cache = null } = {}) {
  const sectionById = new Map(board.sections.map((s) => [s.id, s]));
  const sections = board.sections.map((section) => {
    const min = sectionMinimum(section, membersOf(board, section.id));
    return {
      id: section.id, type: 'section', position: { x: section.x, y: section.y },
      width: section.width, height: section.collapsed ? SECTION_COLLAPSED_HEIGHT : section.height,
      dragHandle: '.lc-section__header', selected: selected.has(section.id), zIndex: 0,
      data: reuse(cache, section.id, {
        title: section.title, color: section.color, collapsed: section.collapsed,
        minWidth: min.width, minHeight: min.height, ...sectionSummary(board, section.id),
      }),
    };
  });
  const cards = board.nodes.flatMap((node) => {
    const content = cardContent(canvas, node);
    if (!content) return [];
    const parent = node.sectionId ? sectionById.get(node.sectionId) : null;
    return [{
      id: node.id, type: content.kind === 'scripture' ? 'scripture' : 'thought',
      position: parent ? { x: node.x - parent.x, y: node.y - parent.y } : { x: node.x, y: node.y },
      ...(parent ? { parentId: parent.id } : {}),
      width: node.width, height: CARD_HEIGHT, hidden: Boolean(parent?.collapsed), ariaLabel: `${content.label}. ${excerpt(content, 120)}`,
      dragHandle: '.lc-card__header', selected: selected.has(node.id),
      data: reuse(cache, node.id, {
        kind: content.kind, label: content.label, text: excerpt(content, 220), reference: content.reference,
        date: formatCardDate(content.createdAt), edited: Boolean(content.editedAt), links: connectionsFor(board, node.id).length,
        connectSource: connectFrom === node.id, connecting,
      }),
    }];
  });
  return [...sections, ...cards];
}

/** Connections as React Flow edges. Links to a collapsed section's cards attach to its frame. */
export function toFlowEdges(board, { selected = null } = {}) {
  return renderedEdges(board).map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, type: 'connection', selected: selected === edge.id,
    ...(edge.direction === 'forward' ? { markerEnd: { type: 'arrowclosed', width: 18, height: 18 } } : {}), interactionWidth: 28,
    data: { label: edge.label, direction: edge.direction, viaSection: edge.viaSection },
  }));
}

/** A node's position in the world: a child's position is relative to its section. */
export function worldPosition(node, byId) {
  const parent = node.parentId ? byId.get(node.parentId) : null;
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : { x: node.position.x, y: node.position.y };
}

/**
 * What a drag changed, as world positions, ready for the `move` command.
 * Anything that did not actually move is left out, so a click is not an edit.
 */
export function dragResult(dragged, allNodes, board) {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const cardsById = new Map(board.nodes.map((n) => [n.id, n]));
  const sectionsById = new Map(board.sections.map((s) => [s.id, s]));
  const nodes = [];
  const sections = [];
  for (const node of dragged) {
    const at = worldPosition(node, byId);
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    const section = sectionsById.get(node.id);
    const card = cardsById.get(node.id);
    if (section) { if (section.x !== x || section.y !== y) sections.push({ id: node.id, x, y }); }
    else if (card && (card.x !== x || card.y !== y)) nodes.push({ id: node.id, x, y });
  }
  return { nodes, sections };
}

/** The section a dragged card would join if dropped now, for the highlight while dragging. */
export function dropTargetFor(draggedNode, allNodes, board, sectionAtPoint) {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const card = board.nodes.find((n) => n.id === draggedNode.id);
  if (!card) return null;
  const at = worldPosition(draggedNode, byId);
  const hit = sectionAtPoint(board.sections, { x: at.x + card.width / 2, y: at.y + CARD_HEIGHT / 2 });
  return hit ? hit.id : null;
}

/** Fraction of the board that is far from the first screenful, so a minimap earns its place. */
export function boardNeedsMinimap(bounds) {
  return Boolean(bounds) && (bounds.width > 2400 || bounds.height > 1500);
}
