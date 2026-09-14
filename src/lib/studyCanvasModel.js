// The Living Study Canvas model: shape validation, the step tree, the
// conversation context sent with a question, and export. Pure — no Supabase,
// no React — so the owner's page, the shared view and the tests all use it.
//
// A canvas is { id, title, passages, steps, pins, share, savedAt }.
// - passages: up to four Workspaces ({ reference, chapterId, translation, sources }).
// - steps: every question asked and the explanation it produced. Each step
//   names the step it was asked from (parentId), so asking from an earlier
//   step starts a branch rather than rewriting the path.
// - pins: cards set aside on the pinboard, as { id, stepId, cardId }.

export const MAX_STEPS = 60;
export const MAX_PASSAGES = 4;
export const MAX_PINS = 24;
export const NOTE_MAX = 4000;
const TURN_MAX = 3000;
const ANSWER_MAX = 2000;
const CONTEXT_STEPS = 5;
export const DEFAULT_FOCUS = 'Help me understand this passage.';

const isString = (value) => typeof value === 'string';

const validExplanation = (e) => isString(e?.title)
  && Array.isArray(e.cards) && e.cards.every((c) => isString(c?.id) && isString(c.title) && isString(c.body) && Array.isArray(c.sourceIds))
  && Array.isArray(e.questions) && e.questions.every(isString);

const validWorkspace = (w) => isString(w?.reference) && isString(w.chapterId)
  && Array.isArray(w.sources) && w.sources.every((s) => isString(s?.id) && isString(s.text) && isString(s.title)
    && (s.kind === 'verse' ? isString(s.ref) : ['person', 'place'].includes(s.kind) && isString(s.slug)));

function cleanCardNotes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, note]) => isString(note) && note.trim()).map(([id, note]) => [id, note.slice(0, NOTE_MAX)]));
}

/**
 * Validates a stored canvas and upgrades older shapes: a single `workspace`
 * becomes one passage, a single `explanation` becomes one step, and steps from
 * before branching (no parentId) become a straight line. Returns null when damaged.
 */
export function normalizeCanvas(item) {
  if (!isString(item?.id)) return null;
  const passages = Array.isArray(item.passages) ? item.passages : item.workspace ? [item.workspace] : [];
  if (!passages.length || passages.length > MAX_PASSAGES || !passages.every(validWorkspace)) return null;
  const rawSteps = Array.isArray(item.steps) ? item.steps
    : item.explanation ? [{ id: `${item.id}-1`, focus: item.resultFocus || '', explanation: item.explanation, createdAt: item.savedAt || null }] : [];
  if (!rawSteps.length || !rawSteps.every((s) => isString(s?.id) && isString(s.focus) && validExplanation(s.explanation))) return null;
  const ids = new Set(rawSteps.map((s) => s.id));
  const steps = rawSteps.map((s, index) => ({
    id: s.id,
    parentId: s.parentId === undefined ? (index > 0 ? rawSteps[index - 1].id : null) : (ids.has(s.parentId) && s.parentId !== s.id ? s.parentId : null),
    focus: s.focus,
    explanation: s.explanation,
    createdAt: isString(s.createdAt) ? s.createdAt : null,
    note: isString(s.note) ? s.note.slice(0, NOTE_MAX) : '',
    cardNotes: cleanCardNotes(s.cardNotes),
  }));
  const seenPins = new Set();
  const pins = (Array.isArray(item.pins) ? item.pins : [])
    .filter((p) => isString(p?.stepId) && isString(p.cardId) && steps.some((s) => s.id === p.stepId && s.explanation.cards.some((c) => c.id === p.cardId)))
    .map((p) => ({ id: `${p.stepId}:${p.cardId}`, stepId: p.stepId, cardId: p.cardId }))
    .filter((p) => !seenPins.has(p.id) && seenPins.add(p.id))
    .slice(0, MAX_PINS);
  const title = isString(item.title) && item.title.trim() ? item.title.trim() : steps[0].explanation.title;
  return {
    id: item.id, title, passages, steps, pins,
    share: { token: isString(item.share_token) ? item.share_token : null, includeNotes: item.share_includes_notes === true },
    savedAt: item.updated_at || item.updatedAt || item.savedAt || null,
  };
}

export const canvasReference = (passages) => passages.map((p) => p.reference).join(' · ');

/** Every source across the passages, first occurrence wins (overlapping chapters share Wiki entries). */
export function combinedSources(passages) {
  const seen = new Set();
  return passages.flatMap((p) => p.sources).filter((s) => !seen.has(s.id) && seen.add(s.id));
}

export const citedSourceIds = (steps) => new Set(steps.flatMap((s) => s.explanation.cards.flatMap((c) => c.sourceIds)));

/** The steps from the root down to `stepId`, inclusive. Tolerates cycles in damaged data. */
export function lineage(steps, stepId) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const chain = [];
  const seen = new Set();
  for (let step = byId.get(stepId); step && !seen.has(step.id); step = step.parentId ? byId.get(step.parentId) : null) {
    seen.add(step.id);
    chain.unshift(step);
  }
  return chain;
}

/** The student's own words on a step: the reflection, then any card notes. */
export function reflectionFor(step) {
  if (!step) return '';
  const parts = step.note?.trim() ? [step.note.trim()] : [];
  for (const card of step.explanation.cards) {
    const note = step.cardNotes?.[card.id]?.trim();
    if (note) parts.push(`On "${card.title}": ${note}`);
  }
  return parts.join('\n');
}

function withReflection(text, step) {
  const reflection = reflectionFor(step);
  const room = TURN_MAX - text.length - 40;
  if (!reflection || room < 80) return text.slice(0, TURN_MAX);
  return `My reflection so far: ${reflection.slice(0, room)}\n\nMy question: ${text}`;
}

const answerText = (explanation) => explanation.cards.map((c) => `${c.title}: ${c.body}`).join('\n').slice(0, ANSWER_MAX);

/**
 * The conversation sent with a question asked from `parentId`: that step's
 * line of ancestry only (not sibling branches), the most recent few steps, with
 * each reflection folded into the question that followed it so the guide can
 * respond to what the student actually thinks.
 */
export function buildTurns(steps, parentId, question) {
  const chain = parentId ? lineage(steps, parentId).slice(-CONTEXT_STEPS) : [];
  const turns = [];
  chain.forEach((step, index) => {
    turns.push({ role: 'user', content: withReflection(step.focus || DEFAULT_FOCUS, chain[index - 1]) });
    turns.push({ role: 'assistant', content: answerText(step.explanation) });
  });
  turns.push({ role: 'user', content: withReflection(question, chain.at(-1)) });
  return turns;
}

/**
 * Depth-first order for drawing the path. `number` is creation order (stable
 * as the tree grows). A step's first child continues its line; later children
 * are branches, indented one level and labelled with the step they left from.
 */
export function orderTree(steps) {
  const ids = new Set(steps.map((s) => s.id));
  const numbers = new Map(steps.map((s, i) => [s.id, i + 1]));
  const children = new Map();
  const roots = [];
  for (const step of steps) {
    if (step.parentId && ids.has(step.parentId)) {
      if (!children.has(step.parentId)) children.set(step.parentId, []);
      children.get(step.parentId).push(step);
    } else roots.push(step);
  }
  const out = [];
  const seen = new Set();
  const visit = (step, depth, branchFrom) => {
    if (seen.has(step.id)) return;
    seen.add(step.id);
    out.push({ step, number: numbers.get(step.id), depth, branchFrom });
    (children.get(step.id) || []).forEach((child, i) => visit(child, i === 0 ? depth : depth + 1, i === 0 ? null : numbers.get(step.id)));
  };
  roots.forEach((root) => visit(root, 0, null));
  steps.forEach((step) => visit(step, 0, null)); // only reached by cyclic parents
  return out;
}

export const KIND_LABELS = { observation: 'Text observation', interpretation: 'Interpretation' };

export const canvasFileName = (title) => `${(title || 'study-canvas').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'study-canvas'}.md`;

/** A study handout in Markdown: the path, every step, pins, then the Scripture itself. */
export function canvasToMarkdown(canvas, { includeNotes = true, exportedAt = new Date() } = {}) {
  const sources = new Map(combinedSources(canvas.passages).map((s) => [s.id, s]));
  const tree = orderTree(canvas.steps);
  const numbers = new Map(canvas.steps.map((s, i) => [s.id, i + 1]));
  const quote = (text) => text.trim().replace(/\n/g, '\n> ');
  const lines = [`# ${canvas.title}`, '', `**Passages:** ${canvasReference(canvas.passages)}`, '', `_Living Study Canvas · exported ${exportedAt.toISOString().slice(0, 10)}_`];

  if (tree.length > 1) {
    lines.push('', '## Study path', '');
    for (const { step, number, depth, branchFrom } of tree) {
      lines.push(`${'  '.repeat(depth)}- Step ${number}: ${step.explanation.title}${branchFrom ? ` _(branches from step ${branchFrom})_` : ''}`);
    }
  }
  for (const { step, number, branchFrom } of tree) {
    lines.push('', `## Step ${number}: ${step.explanation.title}`, '');
    if (branchFrom) lines.push(`_Branches from step ${branchFrom}_`, '');
    if (step.focus) lines.push(`**Question:** ${step.focus}`, '');
    for (const card of step.explanation.cards) {
      const cited = card.sourceIds.map((id) => sources.get(id)?.title).filter(Boolean);
      lines.push(`### ${card.title}`, '', `_${KIND_LABELS[card.kind] || 'Insight'}_`, '', card.body);
      if (cited.length) lines.push('', `Sources: ${cited.join(', ')}`);
      if (includeNotes && step.cardNotes[card.id]) lines.push('', `> **My note:** ${quote(step.cardNotes[card.id])}`);
      lines.push('');
    }
    if (includeNotes && step.note.trim()) lines.push(`**My reflection:** ${step.note.trim()}`, '');
  }
  const pinned = canvas.pins.map((pin) => {
    const step = canvas.steps.find((s) => s.id === pin.stepId);
    const card = step?.explanation.cards.find((c) => c.id === pin.cardId);
    return card && `- **${card.title}** (step ${numbers.get(step.id)}): ${card.body}`;
  }).filter(Boolean);
  if (pinned.length) lines.push('## Pinned insights', '', ...pinned, '');
  lines.push('## Scripture (Berean Standard Bible)');
  for (const passage of canvas.passages) {
    lines.push('', `### ${passage.reference}`, '');
    for (const verse of passage.sources.filter((s) => s.kind === 'verse')) lines.push(`**${verse.ref.split(':').at(-1)}** ${verse.text}`);
  }
  lines.push('', '---', '', 'Scripture: Berean Standard Bible (public domain). Explanations are AI-generated interpretations; weigh them against the text.', '');
  return lines.join('\n');
}
