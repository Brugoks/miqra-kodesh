// One serialized save queue for a canvas's words and layout together.
//
// Edits are immutable snapshots tagged with a local sequence number. Only the
// newest snapshot is ever worth sending (each is the whole document), so a burst
// of drags coalesces into one request; a request in flight is never joined by a
// second; and an acknowledgement records which snapshot it covered and returns
// a timestamp — it never replaces the document, so an edit made while the
// request was in the air is still dirty afterwards. Each request builds on the
// timestamp the previous one returned.
//
// Before a snapshot can be called "saved on this device" it is written to the
// recovery journal. A refused write (changed or deleted elsewhere) stops the
// queue: nothing is retried and nothing is merged. A network failure retries on
// a short backoff and is resumed by retry().

export const SAVE_DEBOUNCE_MS = 500;
export const SAVE_MAX_WAIT_MS = 2000;
export const RETRY_DELAYS_MS = [2000, 4000, 8000];

const STOPPING = new Set(['conflict', 'gone']);
const FATAL = new Set(['invalid', 'local-full', 'signed-out']);

export function createSaveQueue({
  save, journal = null, userId, canvasId, baseSavedAt = null,
  debounceMs = SAVE_DEBOUNCE_MS, maxWaitMs = SAVE_MAX_WAIT_MS, retryDelays = RETRY_DELAYS_MS,
  now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
}) {
  let base = baseSavedAt;
  let latest = null;
  let ackedSeq = -1;
  let timer = null;
  let firstPendingAt = null;
  let inFlight = null;
  let retries = 0;
  let disposed = false;
  let journaled = false;
  let paused = false;
  let status = { state: 'saved', message: '', code: null };
  const listeners = new Set();
  const idleWaiters = new Set();

  const dirty = () => Boolean(latest) && latest.seq > ackedSeq;
  // Held: nothing more is sent until the person acts (a refusal, or a failure retrying cannot fix).
  const held = () => paused || STOPPING.has(status.code) || Boolean(status.fatalHold);
  const stuck = () => held() || status.state === 'error' || status.state === 'local';
  const publish = (next) => { status = next; listeners.forEach((listener) => listener(status)); };
  const settle = () => { if (!inFlight && (!dirty() || stuck())) { idleWaiters.forEach((resolve) => resolve()); idleWaiters.clear(); } };
  const stopTimer = () => { if (timer !== null) { clearTimer(timer); timer = null; } };

  async function remember(snapshot) {
    if (!journal) { journaled = false; return false; }
    journaled = await journal.write(userId, canvasId, { canvas: snapshot.canvas, baseSavedAt: base, seq: snapshot.seq });
    return journaled;
  }

  async function drain() {
    if (inFlight || disposed || !dirty() || held()) return;
    inFlight = (async () => {
      while (dirty() && !disposed) {
        const snapshot = latest;
        publish({ state: 'saving', message: '', code: null });
        try {
          const result = await save(snapshot.canvas, base);
          base = result.savedAt;
          ackedSeq = Math.max(ackedSeq, snapshot.seq);
          retries = 0;
          if (dirty()) await remember(latest); // later edits now build on the new revision
          else { journaled = false; if (journal) await journal.clear(userId, canvasId); }
        } catch (error) {
          if (disposed) return;
          const code = error?.code;
          if (STOPPING.has(code)) { publish({ state: code === 'gone' ? 'gone' : 'conflict', message: error.message, code }); return; }
          if (FATAL.has(code)) { publish({ state: 'error', message: error.message, code, fatalHold: true }); return; }
          const kept = journaled || await remember(snapshot);
          const message = error?.message || 'Check your connection.';
          if (retries < retryDelays.length) {
            publish({ state: kept ? 'local' : 'error', message, code: 'network' });
            const delay = retryDelays[retries];
            retries += 1;
            timer = setTimer(() => { timer = null; drain(); }, delay);
          } else publish({ state: kept ? 'local' : 'error', message, code: 'network', exhausted: true });
          return;
        }
      }
      if (!disposed && !dirty()) publish({ state: 'saved', message: '', code: null });
    })().finally(() => { inFlight = null; settle(); });
    await inFlight;
  }

  return {
    getStatus: () => status,
    getBase: () => base,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },

    /** A committed change. The newest snapshot supersedes any waiting one. */
    enqueue(snapshot) {
      if (disposed) return;
      latest = snapshot;
      remember(snapshot);
      if (held()) return;
      if (!inFlight && status.state !== 'saving') publish({ state: 'saving', message: '', code: null });
      stopTimer();
      retries = 0;
      const t = now();
      if (firstPendingAt === null) firstPendingAt = t;
      const wait = Math.max(0, Math.min(debounceMs, maxWaitMs - (t - firstPendingAt)));
      timer = setTimer(() => { timer = null; firstPendingAt = null; drain(); }, wait);
    },

    /** Sends whatever is waiting now. Resolves when nothing more can be sent. */
    flush() {
      stopTimer();
      firstPendingAt = null;
      if (!dirty() && !inFlight) return Promise.resolve();
      const done = new Promise((resolve) => idleWaiters.add(resolve));
      drain();
      settle(); // nothing was started when the queue is held: do not wait for a save that will not happen
      return done;
    },

    /**
     * Sends nothing more until released, while still journaling every edit. For the moment a
     * canvas is being deleted: a save must not race the delete, and must not follow it.
     */
    hold() { paused = true; stopTimer(); },
    /** Lets saving continue, and sends anything that was waiting (the delete did not happen). */
    release() { paused = false; if (dirty()) { retries = 0; this.flush(); } },

    /** Resumes after a network failure or a fatal hold the person has addressed. */
    retry() {
      if (STOPPING.has(status.code)) return Promise.resolve();
      stopTimer();
      retries = 0;
      if (status.fatalHold) publish({ state: 'saving', message: '', code: null });
      return this.flush();
    },

    dispose() { disposed = true; stopTimer(); idleWaiters.forEach((resolve) => resolve()); idleWaiters.clear(); listeners.clear(); },
  };
}
