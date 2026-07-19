import { describe, it, expect } from 'vitest';
import { buildReelsRoster } from './reels';

const person = (s, name, over = {}) => ({ s, type: 'person', name, desc: `${name} desc`, ...over });

describe('buildReelsRoster', () => {
  const entries = [
    person('god_1324', 'God'),
    person('moses_2108', 'Moses', { y: [-1571, -1452], kv: ['Exodus 3:14'] }),
    person('david_921', 'David'),
    { s: 'egypt_1', type: 'place', name: 'Egypt', desc: 'a place' },
    person('tamar_2821', 'Tamar'),
  ];

  it('keeps people only, excludes divine figures, preserves rank order', () => {
    const roster = buildReelsRoster(entries, {});
    expect(roster.map((r) => r.slug)).toEqual(['moses_2108', 'david_921', 'tamar_2821']);
  });

  it('puts animated characters first and includes animated ones beyond the limit', () => {
    const roster = buildReelsRoster(entries, { tamar_2821: 'abc123', david_921: 'def456' }, 2);
    expect(roster.map((r) => r.slug)).toEqual(['david_921', 'tamar_2821', 'moses_2108']);
    expect(roster[0].animHash).toBe('def456');
    expect(roster[2].animHash).toBeNull();
  });

  it('carries the display fields a card needs', () => {
    const [moses] = buildReelsRoster(entries, { moses_2108: 'e6cad1da' });
    expect(moses).toMatchObject({
      name: 'Moses',
      era: '1571 BC – 1452 BC',
      keyVerse: 'Exodus 3:14',
      animHash: 'e6cad1da',
    });
  });

  it('drops entries without a description', () => {
    const roster = buildReelsRoster([{ s: 'x_1', type: 'person', name: 'X' }], {});
    expect(roster).toEqual([]);
  });
});
