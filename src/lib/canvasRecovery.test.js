import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { classifyRecovery, createRecoveryJournal } from './canvasRecovery';

const canvas = (extra = {}) => ({ id: 'c1', title: 'Waiting', journey: { moment: 'A glimpse', entries: [] }, board: { version: 1, nodes: [], sections: [], edges: [] }, ...extra });
let journal;
beforeEach(() => { journal = createRecoveryJournal(new IDBFactory()); });

describe('the recovery journal', () => {
  it('keeps the unacknowledged document with the revision it builds on, and gives it back', async () => {
    expect(await journal.write('me', 'c1', { canvas: canvas(), baseSavedAt: 't1', seq: 4 })).toBe(true);
    expect(await journal.read('me', 'c1')).toMatchObject({ canvas: canvas(), baseSavedAt: 't1', seq: 4, userId: 'me', canvasId: 'c1' });
  });

  it('replaces an older entry and forgets one when cleared', async () => {
    await journal.write('me', 'c1', { canvas: canvas({ title: 'One' }), baseSavedAt: 't1', seq: 1 });
    await journal.write('me', 'c1', { canvas: canvas({ title: 'Two' }), baseSavedAt: 't1', seq: 2 });
    expect((await journal.read('me', 'c1')).canvas.title).toBe('Two');
    expect(await journal.clear('me', 'c1')).toBe(true);
    expect(await journal.read('me', 'c1')).toBeNull();
  });

  it('never gives one person\'s edits to another, even for the same canvas id', async () => {
    await journal.write('me', 'c1', { canvas: canvas(), baseSavedAt: 't1', seq: 1 });
    expect(await journal.read('someone-else', 'c1')).toBeNull();
    await journal.clear('someone-else', 'c1');
    expect(await journal.read('me', 'c1')).not.toBeNull();
  });

  it('says so, instead of throwing, when IndexedDB is missing or refuses', async () => {
    const none = createRecoveryJournal(null);
    expect(none.available).toBe(false);
    expect(await none.write('me', 'c1', { canvas: canvas(), seq: 1 })).toBe(false);
    expect(await none.read('me', 'c1')).toBeNull();
    expect(await none.clear('me', 'c1')).toBe(false);
    const broken = createRecoveryJournal({ open: () => { throw new Error('SecurityError'); } });
    expect(await broken.write('me', 'c1', { canvas: canvas(), seq: 1 })).toBe(false);
  });
});

describe('deciding what to do with a journal entry', () => {
  const server = (extra = {}) => ({ ...canvas(), savedAt: 't1', ...extra });
  const record = (extra = {}, base = 't1') => ({ canvas: canvas(extra), baseSavedAt: base });

  it('does nothing when nothing was left behind', () => { expect(classifyRecovery(server(), null)).toBe('none'); });

  it('replays edits when the account is still at the revision they were built on', () => {
    expect(classifyRecovery(server(), record({ title: 'Edited' }))).toBe('restore');
  });

  it('recognises edits the account already holds, when only the acknowledgement was lost', () => {
    expect(classifyRecovery(server({ savedAt: 't2' }), record())).toBe('saved');
  });

  it('calls it a conflict, and never merges, when the account moved on', () => {
    expect(classifyRecovery(server({ savedAt: 't9', title: 'Changed elsewhere' }), record({ title: 'Edited' }))).toBe('conflict');
    expect(classifyRecovery(server(), record({ title: 'Edited' }, null))).toBe('conflict');
  });
});
