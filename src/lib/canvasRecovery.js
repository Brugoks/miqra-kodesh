// A recovery journal for edits that are committed but not yet acknowledged by
// the account. It lives in IndexedDB (a whole canvas outgrows localStorage's
// comfortable size), is scoped by user and canvas, and is cleared the moment
// the account has the same edits. It never leaves the device.
//
// Every operation answers instead of throwing: IndexedDB can be missing, blocked
// in a private window, or full, and the page must say "only in this tab" rather
// than break.

const DB_NAME = 'miqra_canvas_recovery_v1';
const STORE = 'journal';
const keyFor = (userId, canvasId) => `${userId}\u0000${canvasId}`;

const promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Reading the property itself can throw in a locked-down browser profile.
const browserFactory = () => { try { return globalThis.indexedDB || null; } catch { return null; } };

export function createRecoveryJournal(factory = browserFactory()) {
  let opened = null;
  const open = () => {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available.'));
    if (!opened) {
      opened = new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'key' }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB is blocked.'));
      });
      opened.catch(() => { opened = null; });
    }
    return opened;
  };
  const store = async (mode) => (await open()).transaction(STORE, mode).objectStore(STORE);

  return {
    /** Whether a journal can be kept at all. A write can still fail later (quota). */
    available: Boolean(factory),
    /** Stores the unacknowledged document. Resolves false rather than throwing. */
    async write(userId, canvasId, { canvas, baseSavedAt, seq }) {
      try {
        await promisify((await store('readwrite')).put({ key: keyFor(userId, canvasId), userId, canvasId, canvas, baseSavedAt: baseSavedAt ?? null, seq, at: new Date().toISOString() }));
        return true;
      } catch { return false; }
    },
    /** The journal entry for this person's canvas, or null. Never another person's. */
    async read(userId, canvasId) {
      try {
        const record = await promisify((await store('readonly')).get(keyFor(userId, canvasId)));
        return record && record.userId === userId && record.canvasId === canvasId ? record : null;
      } catch { return null; }
    },
    async clear(userId, canvasId) {
      try { await promisify((await store('readwrite')).delete(keyFor(userId, canvasId))); return true; } catch { return false; }
    },
  };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What to do with a journal entry when a canvas is opened.
 * - none:    nothing was left behind.
 * - saved:   the account already holds exactly these edits (the acknowledgement
 *            was lost), so the entry is only clutter.
 * - restore: the account is still at the revision the edits were built on, so
 *            they replay cleanly.
 * - conflict: the account moved on. The edits are kept for download and are
 *            never merged automatically.
 */
export function classifyRecovery(server, record) {
  if (!record) return 'none';
  const edits = record.canvas;
  if (sameJson(edits.journey, server.journey) && sameJson(edits.board ?? null, server.board ?? null) && edits.title === server.title) return 'saved';
  return record.baseSavedAt && record.baseSavedAt === server.savedAt ? 'restore' : 'conflict';
}
