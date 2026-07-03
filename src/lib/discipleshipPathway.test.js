import { describe, it, expect } from 'vitest';
import { PATHWAY_SESSIONS, PATHWAY_STAGES, getSession, nextSession, sessionNumber } from './discipleshipPathway';

describe('discipleship pathway', () => {
  it('has 15 sessions across 5 stages, 3 each, with unique ids', () => {
    expect(PATHWAY_SESSIONS).toHaveLength(15);
    expect(new Set(PATHWAY_SESSIONS.map((s) => s.id)).size).toBe(15);
    for (const stage of PATHWAY_STAGES) {
      expect(PATHWAY_SESSIONS.filter((s) => s.stage === stage.key)).toHaveLength(3);
    }
  });

  it('every session references a valid stage and has content fields', () => {
    const stageKeys = new Set(PATHWAY_STAGES.map((s) => s.key));
    for (const session of PATHWAY_SESSIONS) {
      expect(stageKeys.has(session.stage)).toBe(true);
      expect(session.title).toBeTruthy();
      expect(session.passage).toMatch(/\d/);
      expect(session.focus).toBeTruthy();
    }
  });

  it('walks the pathway in order via nextSession', () => {
    expect(nextSession([]).id).toBe('rooted-loved');
    expect(nextSession(['rooted-loved']).id).toBe('rooted-new');
    // Out-of-order completion still returns the earliest gap
    expect(nextSession(['rooted-loved', 'rhythms-word']).id).toBe('rooted-new');
    expect(nextSession(PATHWAY_SESSIONS.map((s) => s.id))).toBeNull();
  });

  it('numbers sessions 1-15', () => {
    expect(sessionNumber('rooted-loved')).toBe(1);
    expect(sessionNumber('multiplying-go')).toBe(15);
    expect(sessionNumber('nope')).toBeNull();
  });

  it('getSession resolves ids', () => {
    expect(getSession('serving-towel').passage).toBe('John 13:1-17');
    expect(getSession('missing')).toBeNull();
  });
});
