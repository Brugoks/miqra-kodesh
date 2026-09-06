import { describe, it, expect } from 'vitest';
import { CAESAREA } from '../../lib/caesareaScene';

// Dynamic import lets the first red test report the missing behavior explicitly.
describe('Caesarea navigation', () => {
  it('provides safe standing positions for every scripture stop', async () => {
    const nav = await import('./caesareaNavigation').catch(() => null);
    expect(nav, 'Caesarea needs its own navigation model').not.toBeNull();
    for (const v of CAESAREA.vantages) {
      const p = nav.stanceAt(v.position[0], v.position[2]);
      expect(p).not.toBeNull();
      expect(p.height + 1.7).toBeCloseTo(v.position[1]);
    }
  });
  it('only accepts downward taps on solid accessible land', async () => {
    const nav = await import('./caesareaNavigation');
    expect(nav.groundPointAlongRay).toBeTypeOf('function');
    expect(nav.groundPointAlongRay({ x: 10, y: 4, z: 12 }, { x: 0, y: -1, z: 0 })?.height).toBe(2);
    expect(nav.groundPointAlongRay({ x: -20, y: 4, z: 12 }, { x: 0, y: -1, z: 0 })).toBeNull();
    expect(nav.groundPointAlongRay({ x: 10, y: 4, z: 12 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
  it('blocks water, solids and long moves while preserving connected routes', async () => {
    const nav = await import('./caesareaNavigation');
    expect(nav.move, 'movement must use Caesarea collision').toBeTypeOf('function');
    expect(nav.stanceAt(-2, 20)).toBeNull();
    expect(nav.stanceAt(40, -70)).toBeNull();
    expect(nav.move(nav.stanceAt(10, -65), 80, 0).x).toBeLessThan(24);
    expect(nav.move(nav.stanceAt(4, 82), -100, 0).x).toBeGreaterThanOrEqual(0.45);
    let p = nav.stanceAt(30, 12);
    for (const [x, z] of [[10, 12], [10, -65], [10, 45], [8, 45], [10, 60], [60, 60], [10, 60], [10, 82], [4, 82]]) {
      p = nav.move(p, x - p.x, z - p.z);
      expect(p.x).toBeCloseTo(x);
      expect(p.z).toBeCloseTo(z);
    }
  });
});
