import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
const { CanvasSaveError, loadCanvas, readCanvases, saveMoment } = await import('./studyCanvas');
const { createMoment } = await import('./canvasJourney');

const board = { version: 1, nodes: [], sections: [], edges: [] };
beforeEach(() => localStorage.clear());

describe('saving a personal canvas on this device', () => {
  it('stores the layout with the words and returns a timestamp to build the next save on', async () => {
    const canvas = { ...createMoment('A glimpse'), board };
    const { savedAt } = await saveMoment('me', 'org', canvas);
    expect(Date.parse(savedAt)).not.toBeNaN();
    expect((await loadCanvas('me', 'org', canvas.id)).board).toEqual(board);
    expect(readCanvases('me', 'org')[0].savedAt).toBe(savedAt);
  });

  it('refuses a stale timestamp, a missing canvas, and an id that already exists', async () => {
    const canvas = createMoment('A glimpse');
    const { savedAt } = await saveMoment('me', 'org', canvas);
    await expect(saveMoment('me', 'org', canvas, '2020-01-01T00:00:00.000Z')).rejects.toMatchObject({ code: 'conflict' });
    await expect(saveMoment('me', 'org', canvas)).rejects.toMatchObject({ code: 'conflict' });
    await expect(saveMoment('me', 'org', createMoment('Other'), savedAt)).rejects.toMatchObject({ code: 'gone' });
    expect(readCanvases('me', 'org')).toHaveLength(1);
  });

  it('keeps ten canvases at most without discarding one', async () => {
    for (let i = 0; i < 10; i += 1) await saveMoment('me', 'org', createMoment(`Glimpse ${i}`));
    await expect(saveMoment('me', 'org', createMoment('One more'))).rejects.toBeInstanceOf(CanvasSaveError);
    expect(readCanvases('me', 'org')).toHaveLength(10);
  });

  it('carries a layout it could not read through every later save, unchanged', async () => {
    const canvas = createMoment('A glimpse');
    localStorage.setItem('miqra_canvas_v1:me:org', JSON.stringify([{ ...canvas, reference: 'Personal moment', board: { version: 9, future: true }, savedAt: '2026-10-17T10:00:00.000Z' }]));
    const [loaded] = readCanvases('me', 'org');
    expect(loaded.board).toBeNull();
    expect(loaded.boardIssue.raw).toEqual({ version: 9, future: true });
    await saveMoment('me', 'org', { ...loaded, title: 'Renamed' }, loaded.savedAt);
    const [after] = readCanvases('me', 'org');
    expect(after.title).toBe('Renamed');
    expect(after.boardIssue.raw).toEqual({ version: 9, future: true });
  });

  it('leaves a stored layout alone when a save carries none, as when the board is switched off', async () => {
    const canvas = { ...createMoment('A glimpse'), board };
    const { savedAt } = await saveMoment('me', 'org', canvas);
    const { hideBoard } = await import('./canvasFlags');
    await saveMoment('me', 'org', { ...hideBoard(canvas), title: 'Renamed in outline' }, savedAt);
    const [after] = readCanvases('me', 'org');
    expect(after.title).toBe('Renamed in outline');
    expect(after.board).toEqual(board);
  });

  it('keeps one person\'s canvases from another\'s', async () => {
    await saveMoment('me', 'org', createMoment('Mine'));
    expect(readCanvases('someone-else', 'org')).toEqual([]);
  });
});
