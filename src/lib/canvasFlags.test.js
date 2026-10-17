import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBoardOverrideFromUrl, boardEnabled, hideBoard } from './canvasFlags';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe('the spatial canvas switch', () => {
  it('is on by default, and a device can override it either way', () => {
    expect(boardEnabled()).toBe(true);
    localStorage.setItem('miqra_living_canvas_board', 'off');
    expect(boardEnabled()).toBe(false);
    localStorage.setItem('miqra_living_canvas_board', 'on');
    expect(boardEnabled()).toBe(true);
  });

  it('can be turned off for a whole build, and a device that opted in still wins', () => {
    vi.stubEnv('VITE_LIVING_CANVAS_BOARD', 'off');
    expect(boardEnabled()).toBe(false);
    localStorage.setItem('miqra_living_canvas_board', 'on');
    expect(boardEnabled()).toBe(true);
    localStorage.clear();
    vi.stubEnv('VITE_LIVING_CANVAS_BOARD', 'on');
    expect(boardEnabled()).toBe(true);
    vi.stubEnv('VITE_LIVING_CANVAS_BOARD', '');
    expect(boardEnabled()).toBe(true);
  });

  it('takes ?canvasBoard=on|off from the address and ignores anything else', () => {
    applyBoardOverrideFromUrl('?canvasBoard=off');
    expect(boardEnabled()).toBe(false);
    applyBoardOverrideFromUrl('?canvasBoard=on');
    expect(localStorage.getItem('miqra_living_canvas_board')).toBe('on');
    expect(boardEnabled()).toBe(true);
    applyBoardOverrideFromUrl('?canvasBoard=banana');
    expect(localStorage.getItem('miqra_living_canvas_board')).toBe('on');
  });

  it('hides the layout without changing the words', () => {
    const canvas = { id: 'c', journey: { moment: 'x' }, board: { version: 1 }, boardIssue: { reason: 'r', raw: {} } };
    expect(hideBoard(canvas)).toEqual({ id: 'c', journey: { moment: 'x' }, board: null });
  });
});
