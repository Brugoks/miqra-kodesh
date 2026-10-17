import { useMemo, useState, useSyncExternalStore } from 'react';
import { createDocumentStore } from '../../../lib/canvasBoardCommands';
import { projectBoard } from '../../../lib/canvasBoard';

/**
 * The open canvas as React sees it. The document (words, layout, undo history)
 * lives in a plain store so a command's result is known synchronously; selection,
 * hover and drag previews are component state and never pass through here.
 */
export default function useCanvasDocument(initial) {
  const [store] = useState(() => createDocumentStore(initial));
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const projection = useMemo(() => projectBoard(state.canvas), [state.canvas]);
  return {
    store, canvas: state.canvas, view: projection.board, notices: projection.notices, notice: state.notice, seq: state.seq,
    canUndo: state.past.length > 0, canRedo: state.future.length > 0,
    dispatch: store.dispatch, undo: store.undo, redo: store.redo,
  };
}
