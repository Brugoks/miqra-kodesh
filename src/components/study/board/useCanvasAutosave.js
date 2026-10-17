import { useEffect, useRef, useState } from 'react';
import { saveMoment } from '../../../lib/studyCanvas';
import { createSaveQueue } from '../../../lib/canvasSaveQueue';
import { createRecoveryJournal } from '../../../lib/canvasRecovery';

let sharedJournal = null;
/** One journal per page; created on first use so importing this costs nothing. */
export const recoveryJournal = () => { sharedJournal ||= createRecoveryJournal(); return sharedJournal; };

/**
 * Feeds every committed change to one serialized save queue. Viewport changes
 * and selection never reach it: only the document's sequence number does.
 */
export default function useCanvasAutosave({ store, userId, orgId, baseSavedAt, journal = recoveryJournal() }) {
  const [status, setStatus] = useState({ state: 'saved', message: '', code: null });
  const queue = useRef(null);
  const base = useRef(baseSavedAt);

  useEffect(() => {
    const instance = createSaveQueue({
      save: (canvas, savedAt) => saveMoment(userId, orgId, canvas, savedAt),
      journal, userId, canvasId: store.getState().canvas.id, baseSavedAt: base.current,
    });
    queue.current = instance;
    const stopStatus = instance.subscribe(setStatus);
    let last = store.getState().seq;
    const stopStore = store.subscribe(() => {
      const { seq, canvas } = store.getState();
      if (seq === last) return;
      last = seq;
      instance.enqueue({ seq, canvas });
    });
    // Leaving the page is the moment a pending edit is most at risk.
    const onHide = () => { if (document.visibilityState === 'hidden') instance.flush(); };
    const onOnline = () => instance.retry();
    const onPageHide = () => instance.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      stopStore(); stopStatus();
      instance.flush().finally(() => instance.dispose());
    };
  }, [store, userId, orgId, journal]);

  return {
    status,
    retry: () => queue.current?.retry(),
    getStatus: () => queue.current?.getStatus() ?? status,
    flush: () => queue.current?.flush() ?? Promise.resolve(),
    /** While a delete is under way: nothing is sent, and nothing may follow it and recreate the canvas. */
    hold: () => queue.current?.hold(),
    /** The delete did not happen, so saving carries on. */
    release: () => queue.current?.release(),
  };
}
