import { describe, expect, it } from 'vitest';
import { blockerAt, move, stanceAt } from './jerusalemNavigation';
import { JERUSALEM } from '../../lib/jerusalemScene';
import { terrainHeight } from './jerusalemTopography';

describe('Jerusalem navigation', () => {
  it('opens the Gospel event standpoints on walkable ground', () => {
    for (const event of JERUSALEM.events) {
      const stance = stanceAt(event.position[0], event.position[2]);
      expect(stance, event.id).not.toBeNull();
      expect(stance.height, event.id).toBeCloseTo(terrainHeight(event.position[0], event.position[2]), 5);
      expect(event.position[1] - stance.height, event.id).toBeCloseTo(1.7, 5);
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
