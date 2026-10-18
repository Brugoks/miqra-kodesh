import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { canvasModelByKey } from '../../lib/canvasModels';

// Which AI model a developer account has picked for Living Canvas. Everyone
// else gets the inert default: no picker, no `modelChoice` in any request. The
// server makes the real decision (study-canvas/models.ts honours a choice only
// for the developer role), so this is a convenience, never the gate.
export const CanvasModelContext = createContext({ canChoose: false, choice: '', setChoice: () => {} });
export const useCanvasModel = () => useContext(CanvasModelContext);

const storageKey = (userId) => `miqra_canvas_model_v1:${userId}`;

function readChoice(userId) {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    return canvasModelByKey(stored) ? stored : '';
  } catch { return ''; }
}

/** The context value for one signed-in account. The pick is remembered per account on this device. */
export function useCanvasModelState(userId, canChoose) {
  const [stored, setStored] = useState(() => (canChoose ? readChoice(userId) : ''));
  const setChoice = useCallback((next) => {
    const choice = canvasModelByKey(next) ? next : '';
    setStored(choice);
    try { if (choice) localStorage.setItem(storageKey(userId), choice); else localStorage.removeItem(storageKey(userId)); } catch { /* the pick still applies for this visit */ }
  }, [userId]);
  return useMemo(() => ({ canChoose, choice: canChoose ? stored : '', setChoice }), [canChoose, stored, setChoice]);
}

/** The request field for the current pick: nothing at all unless a developer chose a model. */
export const modelChoiceField = ({ canChoose, choice }) => (canChoose && choice ? { modelChoice: choice } : {});
