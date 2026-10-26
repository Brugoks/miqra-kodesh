import { describe, expect, it } from 'vitest';
import { blockerAt, move, stanceAt } from './jerusalemNavigation';
import { JERUSALEM } from '../../lib/jerusalemScene';
import { surfaceHeight } from './jerusalemTopography';

describe('Jerusalem navigation', () => {
  it('opens the Gospel event standpoints on walkable ground', () => {
    for (const event of JERUSALEM.events) {
      const stance = stanceAt(event.position[0], event.position[2]);
      expect(stance, event.id).not.toBeNull();
      expect(stance.height, event.id).toBeCloseTo(surfaceHeight(event.position[0], event.position[2]), 5);
      expect(event.position[1] - stance.height, event.id).toBeCloseTo(1.7, 5);
    }
  });

  it('keeps the visitor outside houses and the city wall', () => {
    expect(blockerAt(-96, -87)).toBe('house');
    expect(blockerAt(112, 0)).toBe('city-wall');
    const walked = move(stanceAt(105, 8), 12, 0);
    expect(walked.x).toBeLessThan(110);
    expect(walked.blocked).toBe('city-wall');
  });

  it('lets visitors climb from the street into the Temple and upper room', () => {
    const court = move(stanceAt(49, 25), 0, -24);
    expect(court.z).toBeCloseTo(1);
    expect(court.height).toBe(12);
    const stair = move(stanceAt(-60, 41), 0, -20);
    const room = move(stair, 9, 0);
    expect(room.x).toBeCloseTo(-51);
    expect(room.height).toBe(12.4);
  });

  it('keeps the gate open and stops visitors at the flanking towers', () => {
    expect(move(stanceAt(120, 28), -16, 0).x).toBeCloseTo(104);
    expect(move(stanceAt(120, 17), -16, 0).blocked).toBe('city-wall');
  });
});
