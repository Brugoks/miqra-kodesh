import { describe, expect, it } from 'vitest';
import { borderPoint, floatingEdge, sideOf } from './canvasEdgeGeometry';

const box = (x, y, width = 320, height = 176) => ({ x, y, width, height });

describe('connection geometry', () => {
  it('leaves a card by the side that faces the other card', () => {
    const left = box(0, 0);
    const right = box(600, 0);
    expect(borderPoint(left, right)).toEqual({ x: 320, y: 88 });
    expect(borderPoint(right, left)).toEqual({ x: 600, y: 88 });
    const below = box(0, 400);
    expect(borderPoint(left, below)).toEqual({ x: 160, y: 176 });
    expect(borderPoint(below, left)).toEqual({ x: 160, y: 400 });
  });

  it('meets a diagonal neighbour on the border, not inside the card or beyond it', () => {
    const point = borderPoint(box(0, 0), box(800, 600));
    const onBorder = point.x === 320 || point.y === 176;
    expect(onBorder).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(320);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(176);
  });

  it('follows a card when it moves', () => {
    const a = box(0, 0);
    const near = floatingEdge(a, box(600, 0));
    const moved = floatingEdge(a, box(0, 600));
    expect(near.sourcePosition).toBe('right');
    expect(near.targetPosition).toBe('left');
    expect(moved.sourcePosition).toBe('bottom');
    expect(moved.targetPosition).toBe('top');
  });

  it('names the side a point is on, and stays defined for cards that overlap exactly', () => {
    expect(sideOf(box(0, 0), { x: 0, y: 50 })).toBe('left');
    expect(sideOf(box(0, 0), { x: 320, y: 50 })).toBe('right');
    expect(sideOf(box(0, 0), { x: 50, y: 0 })).toBe('top');
    expect(sideOf(box(0, 0), { x: 50, y: 176 })).toBe('bottom');
    const same = floatingEdge(box(0, 0), box(0, 0));
    for (const value of Object.values(same)) expect(value).not.toBeNaN();
  });
});
