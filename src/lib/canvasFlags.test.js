import { beforeEach, describe, expect, it } from 'vitest';
import { applyBoardOverrideFromUrl, boardEnabled, hideBoard } from './canvasFlags';

beforeEach(() => localStorage.clear());

describe('the spatial canvas switch', () => {
  it('is on in tests and development, and a device can override it either way', () => {
    expect(boardEnabled()).toBe(true);
    localStorage.setItem('miqra_living_canvas_board', 'off');
    expect(boardEnabled()).toBe(false);
    localStorage.setItem('miqra_living_canvas_board', 'on');
    expect(boardEnabled()).toBe(true);
  });

  it('takes ?canvasBoard=on|off from the address and ignores anything else', () => {
    applyBoardOverrideFromUrl('?canvasBoard=off');
    expect(boardEnabled()).toBe(false);
    applyBoardOverrideFromUrl('?canvasBoard=on');
    expect(boardEnabled()).toBe(true);
    applyBoardOverrideFromUrl('?canvasBoard=banana');
    expect(localStorage.getItem('miqra_living_canvas_board')).toBe('on');
  });

  it('hides the layout without changing the words', () => {
    const canvas = { id: 'c', journey: { moment: 'x' }, board: { version: 1 }, boardIssue: { reason: 'r', raw: {} } };
    expect(hideBoard(canvas)).toEqual({ id: 'c', journey: { moment: 'x' }, board: null });
  });
});
