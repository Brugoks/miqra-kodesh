import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasSaveError } from './studyCanvas';
import { createSaveQueue } from './canvasSaveQueue';

vi.mock('./supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));

const memoryJournal = ({ failWrites = false } = {}) => {
  const records = new Map();
  return {
    records,
    write: vi.fn(async (user, canvas, record) => { if (failWrites) return false; records.set(`${user}:${canvas}`, record); return true; }),
    clear: vi.fn(async (user, canvas) => { records.delete(`${user}:${canvas}`); return true; }),
  };
};
const snap = (seq) => ({ seq, canvas: { id: 'c1', title: `Edit ${seq}` } });
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const setup = (options = {}) => {
  const journal = options.journal ?? memoryJournal();
  let counter = 0;
  const save = options.save ?? vi.fn(async () => ({ savedAt: `t${(counter += 1)}` }));
  const queue = createSaveQueue({ save, journal, userId: 'me', canvasId: 'c1', baseSavedAt: 't0', ...options.queue });
  return { queue, save, journal };
};
const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the save queue', () => {
  it('coalesces a burst of edits into one save of the newest snapshot, then clears the journal', async () => {
    const { queue, save, journal } = setup();
    queue.enqueue(snap(1)); await tick(200); queue.enqueue(snap(2)); await tick(200); queue.enqueue(snap(3));
    expect(queue.getStatus().state).toBe('saving');
    await tick(499);
    expect(save).not.toHaveBeenCalled();
    await tick(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(snap(3).canvas, 't0');
    expect(queue.getStatus().state).toBe('saved');
    expect(journal.records.size).toBe(0);
  });

  it('journals each committed edit before it is acknowledged', async () => {
    const { queue, journal } = setup();
    queue.enqueue(snap(1));
    await tick(0);
    expect(journal.records.get('me:c1')).toMatchObject({ seq: 1, baseSavedAt: 't0', canvas: snap(1).canvas });
  });

  it('saves at least every two seconds of continuous edits', async () => {
    const { queue, save } = setup();
    for (let i = 1; i <= 8; i += 1) { queue.enqueue(snap(i)); await tick(400); }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(save.mock.calls[0][0].title).toMatch(/Edit [3-6]/);
  });

  it('keeps an edit made during a request dirty, and builds the next request on the returned timestamp', async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ savedAt: 't2' });
    const { queue, journal } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    expect(save).toHaveBeenCalledTimes(1);
    queue.enqueue(snap(2)); await tick(500);
    expect(save).toHaveBeenCalledTimes(1); // serialized: never two in flight
    first.resolve({ savedAt: 't1' });
    await tick(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual([snap(2).canvas, 't1']);
    expect(queue.getStatus().state).toBe('saved');
    expect(queue.getBase()).toBe('t2');
    expect(journal.records.size).toBe(0);
  });

  it('rewrites the journal on the new revision when an edit is still waiting after an acknowledgement', async () => {
    const first = deferred();
    const second = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { queue, journal } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    queue.enqueue(snap(2));
    first.resolve({ savedAt: 't1' });
    await tick(0);
    expect(journal.records.get('me:c1')).toMatchObject({ seq: 2, baseSavedAt: 't1' });
    second.resolve({ savedAt: 't2' });
    await tick(0);
    expect(journal.records.size).toBe(0);
  });

  it('survives a network failure: says it is on this device, retries on a backoff, and then saves', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue({ savedAt: 't1' });
    const { queue, journal } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    expect(queue.getStatus()).toMatchObject({ state: 'local', code: 'network' });
    expect(journal.records.size).toBe(1);
    await tick(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.getStatus().state).toBe('local');
    await tick(4000);
    expect(save).toHaveBeenCalledTimes(3);
    expect(queue.getStatus().state).toBe('saved');
    expect(journal.records.size).toBe(0);
  });

  it('says it could not save when the device cannot keep a copy either', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const { queue } = setup({ save, journal: memoryJournal({ failWrites: true }) });
    queue.enqueue(snap(1)); await tick(500);
    expect(queue.getStatus().state).toBe('error');
    const bare = setup({ save, queue: { journal: null } });
    bare.queue.enqueue(snap(1)); await tick(500);
    expect(bare.queue.getStatus().state).toBe('error');
  });

  it('stops retrying after the backoff is used up, and resumes when asked', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    const { queue } = setup({ save });
    queue.enqueue(snap(1));
    await tick(500 + 2000 + 4000 + 8000);
    expect(save).toHaveBeenCalledTimes(4);
    expect(queue.getStatus()).toMatchObject({ state: 'local', exhausted: true });
    await tick(60000);
    expect(save).toHaveBeenCalledTimes(4);
    save.mockResolvedValue({ savedAt: 't9' });
    await queue.retry();
    expect(queue.getStatus().state).toBe('saved');
    expect(queue.getBase()).toBe('t9');
  });

  it('stops dead on a conflict: no retry, no merge, nothing sent for later edits, journal kept', async () => {
    const save = vi.fn().mockRejectedValue(new CanvasSaveError('conflict', 'This canvas changed on another device.'));
    const { queue, journal } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    expect(queue.getStatus()).toMatchObject({ state: 'conflict', code: 'conflict' });
    queue.enqueue(snap(2)); await tick(60000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.getStatus().state).toBe('conflict');
    await queue.retry();
    expect(save).toHaveBeenCalledTimes(1);
    expect(journal.records.get('me:c1')).toMatchObject({ seq: 2 });
  });

  it('reports a canvas deleted elsewhere without recreating it', async () => {
    const save = vi.fn().mockRejectedValue(new CanvasSaveError('gone', 'This canvas was deleted on another device.'));
    const { queue } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    expect(queue.getStatus()).toMatchObject({ state: 'gone', code: 'gone' });
    await tick(60000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('holds on a failure retrying cannot fix, until the person retries', async () => {
    const save = vi.fn().mockRejectedValueOnce(new CanvasSaveError('local-full', 'This device holds 10 canvases.')).mockResolvedValue({ savedAt: 't1' });
    const { queue } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    expect(queue.getStatus()).toMatchObject({ state: 'error', code: 'local-full' });
    await tick(60000);
    expect(save).toHaveBeenCalledTimes(1);
    await queue.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.getStatus().state).toBe('saved');
  });

  it('flushes immediately, resolving once the newest edit is acknowledged', async () => {
    const { queue, save } = setup();
    queue.enqueue(snap(1));
    const done = queue.flush();
    await tick(0);
    await done;
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.getStatus().state).toBe('saved');
    await expect(queue.flush()).resolves.toBeUndefined();
  });

  it('does not wait for a save that will not happen when the queue is held', async () => {
    const save = vi.fn().mockRejectedValue(new CanvasSaveError('conflict', 'changed'));
    const { queue } = setup({ save });
    queue.enqueue(snap(1)); await tick(500);
    queue.enqueue(snap(2));
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('can be held for a delete: nothing is sent, edits are still journaled, and release sends them', async () => {
    const { queue, save, journal } = setup();
    queue.enqueue(snap(1)); await tick(100);
    queue.hold();
    await tick(10000);
    expect(save).not.toHaveBeenCalled();
    queue.enqueue(snap(2)); await tick(10000);
    expect(save).not.toHaveBeenCalled();
    expect(journal.records.get('me:c1')).toMatchObject({ seq: 2 });
    await expect(queue.flush()).resolves.toBeUndefined();
    queue.release();
    await tick(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(snap(2).canvas, 't0');
  });

  it('announces status changes and does nothing after it is disposed', async () => {
    const { queue, save } = setup();
    const seen = [];
    queue.subscribe((status) => seen.push(status.state));
    queue.enqueue(snap(1)); await tick(500);
    expect(seen).toEqual(['saving', 'saving', 'saved']);
    queue.dispose();
    queue.enqueue(snap(2)); await tick(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
