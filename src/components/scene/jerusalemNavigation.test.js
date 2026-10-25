import { describe, expect, it } from 'vitest';
import { blockerAt, move, stanceAt } from './jerusalemNavigation';
import { JERUSALEM } from '../../lib/jerusalemScene';

describe('Jerusalem navigation', () => {
  it('opens the Gospel event standpoints on walkable ground', () => {
    for (const event of JERUSALEM.events) {
      expect(stanceAt(event.position[0], event.position[2]), event.id).not.toBeNull();
    }
  });

  it('keeps the visitor outside houses and the city wall', () => {
    expect(blockerAt(-94, -78)).toBe('house');
    expect(blockerAt(112, 0)).toBe('city-wall');
    const walked = move(stanceAt(105, 0), 12, 0);
    expect(walked.x).toBeLessThan(110);
    expect(walked.blocked).toBe('city-wall');
  });
});
