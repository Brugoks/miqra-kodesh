// Theology questionnaires: data-driven "where do you stand?" systems for the
// Church History section. Each system is a JSON asset (src/assets/questionnaires/)
// describing doctrinal axes, teaching questions, and historical positions; this
// engine is content-agnostic, so adding a new questionnaire is purely a data task.
//
// Scoring model: every answer option carries a weight `w` in [-2, 2] on its
// question's axis. A user's axis score is the sum of chosen weights divided by
// the maximum possible |sum| over the questions they actually answered, giving
// a normalized position in [-1, 1]. "I'm not sure yet" is a first-class answer:
// it contributes nothing to the score but lowers that axis's confidence, and
// low-confidence axes count proportionally less when matching positions.
// Positions declare a canonical profile per axis in [-1, 1]; the nearest
// profiles (confidence-weighted distance) are ranked as the result.

const REGISTRY = [
  { id: 'soteriology', load: () => import('../assets/questionnaires/soteriology.json') },
  { id: 'covenants', load: () => import('../assets/questionnaires/covenants.json') },
];

const cache = new Map();

export function loadQuestionnaire(id) {
  if (!cache.has(id)) {
    const entry = REGISTRY.find((r) => r.id === id);
    if (!entry) return Promise.resolve(null);
    cache.set(id, entry.load().then((mod) => mod.default));
  }
  return cache.get(id);
}

export function listQuestionnaires() {
  return Promise.all(REGISTRY.map((r) => loadQuestionnaire(r.id)));
}

export const UNSURE = 'unsure';

// answers: { [questionId]: optionIndex | 'unsure' }. Unanswered === unsure.
export function scoreAnswers(system, answers) {
  const tally = {};
  for (const axis of system.axes) tally[axis.id] = { sum: 0, max: 0, answered: 0, total: 0 };

  for (const q of system.questions) {
    const t = tally[q.axis];
    if (!t) continue;
    t.total += 1;
    const ans = answers[q.id];
    const opt = ans !== UNSURE && ans !== undefined ? q.options[ans] : null;
    if (!opt) continue;
    t.answered += 1;
    t.sum += opt.w;
    t.max += Math.max(...q.options.map((o) => Math.abs(o.w)));
  }

  const axes = {};
  for (const [id, t] of Object.entries(tally)) {
    axes[id] = {
      score: t.max ? Math.max(-1, Math.min(1, t.sum / t.max)) : 0,
      confidence: t.total ? t.answered / t.total : 0,
    };
  }
  return { axes, ranked: rankPositions(system, axes) };
}

// Confidence-weighted distance from the user's axis vector to each position's
// profile, expressed as a closeness percentage. Axis range is [-1, 1], so the
// per-axis distance maxes at 2. Returns [] when every axis is unanswered.
function rankPositions(system, axes) {
  let anyConfidence = false;
  const ranked = system.positions.map((p) => {
    let num = 0;
    let den = 0;
    for (const axis of system.axes) {
      const u = axes[axis.id];
      const w = u?.confidence ?? 0;
      if (!w) continue;
      const pv = p.profile[axis.id] ?? 0;
      num += w * (u.score - pv) ** 2;
      den += w;
    }
    if (!den) return { id: p.id, closeness: 0 };
    anyConfidence = true;
    const dist = Math.sqrt(num / den); // 0..2
    return { id: p.id, closeness: Math.round((1 - dist / 2) * 100) };
  });
  if (!anyConfidence) return [];
  return ranked.sort((a, b) => b.closeness - a.closeness);
}

// ── Result history (localStorage; the app works without Supabase) ──────────

const RESULTS_KEY = 'miqra_theo_results_v1';
const HISTORY_CAP = 30;

export function loadResultHistory() {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Stamps the entry with `at` (ms epoch) if the caller didn't, persists it at
// the head of the history, and returns the stamped entry.
export function saveResult(entry) {
  const stamped = { at: Date.now(), ...entry };
  try {
    const history = [stamped, ...loadResultHistory()].slice(0, HISTORY_CAP);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(history));
  } catch {
    // Storage unavailable (private mode, quota) — the result still renders.
  }
  return stamped;
}

export function latestResult(systemId) {
  return loadResultHistory().find((r) => r.systemId === systemId) || null;
}
