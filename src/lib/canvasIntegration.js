import { normalizeCanvas } from './studyCanvasModel.js';
import { normalizeBoard, projectBoard, entryNodeId, fitSection, cardRect } from './canvasBoard.js';
import { normalizeJourney } from './canvasJourney.js';

// Pure mutations: shares the app's model, layout geometry and normalization.
export function assertIntegrationCanvas(row) {
  const canvas = normalizeCanvas(row);
  if (!canvas || canvas.boardIssue) throw new Error('This canvas format cannot be safely edited. Open it in Miqra Qodesh.');
  return canvas;
}
const fail = (message) => { throw new Error(message); };
export function applyIntegrationChange(row, action, args, { now = new Date().toISOString(), id = () => crypto.randomUUID(), scripture = null } = {}) {
  let canvas;
  if (action === 'create_canvas') {
    canvas = { id: id(), title: args.title, passages: [], steps: [], pins: [], journey: { kind: 'moment', moment: args.moment, createdAt: now, revisitOn: null, entries: [] }, board: null };
  } else {
    canvas = assertIntegrationCanvas(row);
    if (!canvas.journey) {
      // Legacy Scripture studies remain readable; never convert/overwrite one implicitly.
      if (action !== 'update_canvas' || Object.keys(args).some((key) => !['canvas_id', 'expected_updated_at', 'idempotency_key', 'title'].includes(key))) fail('Legacy Scripture studies support title updates only. Create a spatial canvas for new cards.');
      return { title: args.title || row.title };
    }
    canvas = structuredClone(canvas);
  }
  const addInsight = (input) => {
    const sourceIds = input.source_entry_ids || [];
    if (sourceIds.some((source) => !canvas.journey.entries.some((entry) => entry.id === source))) fail('An insight cites a missing entry.');
    if (input.category === 'historical_context' && !input.evidence_urls?.length) fail('Historical context needs evidence URLs; do not invent historical claims.');
    const kind = input.category === 'open_question' ? 'question' : input.category === 'application' ? 'response' : 'reflection';
    const evidence = (input.evidence_urls || []).map((url) => `Source (unverified): ${url}`).join('\n');
    const citations = sourceIds.length ? `\n\nRelated cards: ${sourceIds.join(', ')}` : '';
    const text = `${input.text}${evidence ? `\n\n${evidence}` : ''}${citations}`;
    canvas.journey.entries.push({ id: id(), kind, text, category: input.category, provenance: 'ai', createdAt: now });
  };
  const addScripture = (input, passage) => {
    if (!passage) fail('Verified Scripture is required.');
    if (canvas.journey.entries.some((e) => e.biblePassage?.reference === passage.reference && e.biblePassage?.translation === passage.translation)) fail('That passage and translation are already attached.');
    canvas.journey.entries.push({ id: id(), kind: 'scripture', category: 'scripture', text: input.note || 'Read this passage in its surrounding context.', reference: passage.reference, biblePassage: passage, provenance: 'ai', createdAt: now });
  };
  if (action === 'create_canvas') {
    (args.insights || []).forEach(addInsight);
    (args.scriptures || []).forEach((s, index) => addScripture(s, scripture[index]));
  }
  if (action === 'add_insight') addInsight(args);
  if (action === 'add_scripture') addScripture(args, scripture);
  if (action === 'update_canvas') {
    if (args.title) canvas.title = args.title;
    const seen = new Set();
    for (const change of args.entries || []) {
      const entry = canvas.journey.entries.find((e) => e.id === change.id);
      if (!entry || seen.has(change.id)) fail('Entry updates must name distinct existing entries.');
      seen.add(change.id);
      entry.text = change.text;
      entry.editedAt = now;
    }
  }
  canvas.board = projectBoard(canvas).board;
  if (action === 'update_canvas') {
    for (const change of args.placements || []) {
      const node = canvas.board.nodes.find((n) => n.id === change.node_id);
      if (!node) fail('A placement names a missing card.');
      Object.assign(node, { x: change.x, y: change.y });
    }
    for (const section of args.sections || []) {
      if (new Set(section.entry_ids).size !== section.entry_ids.length) fail('Section entries must be distinct.');
      const nodes = section.entry_ids.map((entry) => canvas.board.nodes.find((n) => n.id === entryNodeId(entry)) || fail('A section names a missing entry.'));
      if (!nodes.length) fail('Choose at least one card for a section.');
      const existing = canvas.board.sections.find((s) => s.id === section.id);
      if (existing) Object.assign(existing, { title: section.title, ...(section.color ? { color: section.color } : {}), ...fitSection(nodes.map(cardRect)) });
      else canvas.board.sections.push({ id: section.id, title: section.title, color: section.color || 'teal', collapsed: false, ...fitSection(nodes.map(cardRect)) });
      nodes.forEach((n) => { n.sectionId = section.id; });
    }
  }
  if (action === 'connect_concepts') canvas.board.edges.push({ id: id(), source: args.source, target: args.target, label: args.label, direction: args.direction || 'forward' });
  const journey = normalizeJourney(canvas.journey);
  const board = normalizeBoard(canvas.board);
  if (!journey || !board.ok) fail(board.reason || 'Canvas content exceeds the supported limits.');
  return { title: canvas.title, reference: 'Living Canvas', passages: canvas.passages, steps: canvas.steps, pins: canvas.pins, journey, board: board.board, ...(action === 'create_canvas' ? { id: canvas.id } : {}) };
}

/** Publication never includes the private glimpse, original timestamps or notes. */
export function publicationSnapshot(row, entryIds, now = new Date().toISOString()) {
  const canvas = assertIntegrationCanvas(row);
  if (!canvas.journey || !Array.isArray(entryIds) || !entryIds.length || new Set(entryIds).size !== entryIds.length) fail('Select distinct cards to publish.');
  const entries = entryIds.map((id) => {
    const e = canvas.journey.entries.find((entry) => entry.id === id);
    if (!e || e.kind === 'prayer' || !e.category || e.category === 'reflection') fail('Prayers, personal reflections and uncategorized journal entries cannot be published.');
    return { id: e.id, kind: e.kind, category: e.category, text: e.text, createdAt: now, ...(e.reference ? { reference: e.reference } : {}), ...(e.biblePassage ? { biblePassage: e.biblePassage } : {}), ...(e.provenance ? { provenance: e.provenance } : {}) };
  });
  const keep = new Set(entryIds);
  const board = projectBoard(canvas).board;
  const nodes = board.nodes.filter((n) => n.contentRef.type === 'entry' && keep.has(n.contentRef.entryId));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const sectionIds = new Set(nodes.map((n) => n.sectionId));
  // Section names are private by default; publication uses neutral names.
  const sections = board.sections.filter((s) => sectionIds.has(s.id)).map((s, i) => ({ ...s, title: `Theme ${i + 1}` }));
  return { id: canvas.id, title: canvas.title, passages: [], steps: [], pins: [], journey: { kind: 'moment', moment: canvas.title, createdAt: now, revisitOn: null, entries }, board: { version: 1, nodes, sections, edges: board.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)) } };
}
