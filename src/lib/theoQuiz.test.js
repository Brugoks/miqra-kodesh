import { describe, it, expect, beforeEach } from 'vitest';
import {
  listQuestionnaires,
  loadQuestionnaire,
  scoreAnswers,
  loadResultHistory,
  saveResult,
  latestResult,
  UNSURE,
} from './theoQuiz';
import { loadChurchTeachers } from './bibleWiki';

// For a position, pick each question's option whose normalized weight (w/2)
// sits closest to the position's profile on that axis — the answers a textbook
// holder of that view would give.
function canonicalAnswers(system, position) {
  const answers = {};
  for (const q of system.questions) {
    const target = position.profile[q.axis] ?? 0;
    let best = 0;
    q.options.forEach((opt, i) => {
      if (Math.abs(opt.w / 2 - target) < Math.abs(q.options[best].w / 2 - target)) best = i;
    });
    answers[q.id] = best;
  }
  return answers;
}

describe('questionnaire content integrity', async () => {
  const systems = await listQuestionnaires();
  const teachers = await loadChurchTeachers();

  it('loads every registered system', () => {
    expect(systems.length).toBeGreaterThan(0);
    for (const s of systems) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.axes.length).toBeGreaterThan(0);
      expect(s.questions.length).toBeGreaterThan(0);
      expect(s.positions.length).toBeGreaterThanOrEqual(2);
    }
  });

  for (const system of systems) {
    describe(system.id, () => {
      const axisIds = new Set(system.axes.map((a) => a.id));

      it('has unique axis ids with two pole labels each', () => {
        expect(axisIds.size).toBe(system.axes.length);
        for (const a of system.axes) expect(a.poles).toHaveLength(2);
      });

      it('every question maps to a real axis with sane options', () => {
        const qIds = new Set();
        for (const q of system.questions) {
          qIds.add(q.id);
          expect(axisIds.has(q.axis), `question ${q.id} axis ${q.axis}`).toBe(true);
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.teaching?.context).toBeTruthy();
          expect(q.teaching?.scriptures?.length).toBeGreaterThan(0);
          for (const opt of q.options) {
            expect(opt.text).toBeTruthy();
            expect(Math.abs(opt.w)).toBeLessThanOrEqual(2);
          }
          // Options must not all sit on one side, or the question can't distinguish.
          const ws = q.options.map((o) => o.w);
          expect(Math.min(...ws)).toBeLessThan(Math.max(...ws));
        }
        expect(qIds.size).toBe(system.questions.length);
      });

      it('every axis is exercised by at least one question', () => {
        const used = new Set(system.questions.map((q) => q.axis));
        for (const id of axisIds) expect(used.has(id), `axis ${id} has no questions`).toBe(true);
      });

      it('positions have complete profiles within [-1, 1]', () => {
        for (const p of system.positions) {
          for (const id of axisIds) {
            const v = p.profile[id];
            expect(typeof v, `${p.id} profile.${id}`).toBe('number');
            expect(Math.abs(v)).toBeLessThanOrEqual(1);
          }
          expect(p.summary).toBeTruthy();
          expect(p.lived).toBeTruthy();
          expect(p.reflect?.length).toBeGreaterThan(0);
          // Every position must offer dialogue prompts, not just self-reflection —
          // this feature exists to foster understanding across differences, not to
          // sort people into camps, so a position with nothing but self-facing
          // reflection questions is missing half its purpose.
          expect(p.dialogue?.length, `${p.id} has no dialogue prompts`).toBeGreaterThan(0);
        }
      });

      it('every voice and figure slug resolves to a Church History page', () => {
        for (const q of system.questions) {
          for (const opt of q.options) {
            if (opt.voice) expect(teachers.bySlug.has(opt.voice), `voice ${opt.voice}`).toBe(true);
          }
        }
        for (const p of system.positions) {
          for (const f of p.figures || []) {
            expect(teachers.bySlug.has(f.s), `${p.id} figure ${f.s}`).toBe(true);
          }
        }
      });

      it('each position wins under its own canonical answers', () => {
        for (const p of system.positions) {
          const { ranked } = scoreAnswers(system, canonicalAnswers(system, p));
          expect(ranked[0].id, `${p.id} lost to ${ranked[0].id}`).toBe(p.id);
          expect(ranked[0].closeness).toBeGreaterThan(80);
        }
      });
    });
  }
});

describe('scoreAnswers', async () => {
  const system = await loadQuestionnaire('soteriology');

  it('returns empty ranking and zero confidence when everything is unsure', () => {
    const answers = Object.fromEntries(system.questions.map((q) => [q.id, UNSURE]));
    const { axes, ranked } = scoreAnswers(system, answers);
    expect(ranked).toEqual([]);
    for (const a of Object.values(axes)) expect(a.confidence).toBe(0);
  });

  it('treats unanswered questions as unsure', () => {
    const { axes, ranked } = scoreAnswers(system, {});
    expect(ranked).toEqual([]);
    for (const a of Object.values(axes)) expect(a.confidence).toBe(0);
  });

  it('tracks per-axis confidence and still ranks on partial answers', () => {
    // Answer only the election questions, both toward sovereign choice.
    const answers = {};
    for (const q of system.questions.filter((q) => q.axis === 'election')) {
      answers[q.id] = q.options.findIndex((o) => o.w === 2);
    }
    const { axes, ranked } = scoreAnswers(system, answers);
    expect(axes.election.confidence).toBe(1);
    expect(axes.election.score).toBe(1);
    expect(axes.extent.confidence).toBe(0);
    // Reformed and Amyraldian share election: 1 — both should sit on top.
    const top = new Set(ranked.slice(0, 2).map((r) => r.id));
    expect(top).toEqual(new Set(['reformed', 'amyraldian']));
    expect(ranked[0].closeness).toBe(100);
  });

  it('unsure answers dilute confidence but not the direction of the score', () => {
    const [e1, e2] = system.questions.filter((q) => q.axis === 'election');
    const strong = scoreAnswers(system, {
      [e1.id]: e1.options.findIndex((o) => o.w === 2),
      [e2.id]: e2.options.findIndex((o) => o.w === 2),
    });
    const hesitant = scoreAnswers(system, {
      [e1.id]: e1.options.findIndex((o) => o.w === 2),
      [e2.id]: UNSURE,
    });
    expect(strong.axes.election.score).toBe(1);
    expect(hesitant.axes.election.score).toBe(1);
    expect(hesitant.axes.election.confidence).toBe(0.5);
  });
});

describe('result history', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips results and returns the latest per system', () => {
    expect(loadResultHistory()).toEqual([]);
    saveResult({ at: 1, systemId: 'soteriology', positionId: 'reformed', closeness: 90 });
    saveResult({ at: 2, systemId: 'soteriology', positionId: 'lutheran', closeness: 84 });
    expect(loadResultHistory()).toHaveLength(2);
    expect(latestResult('soteriology').positionId).toBe('lutheran');
    expect(latestResult('nope')).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('miqra_theo_results_v1', '{not json');
    expect(loadResultHistory()).toEqual([]);
  });
});
