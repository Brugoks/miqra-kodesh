// The spatial Living Canvas ships behind a switch, so it can be enabled for a
// small group first and turned back off without touching anyone's layout.
//
// Off means Outline only: the story, composer and Scripture tools as before,
// with the saved layout left exactly as it is (see hideBoard).
//
//   - Build default: VITE_LIVING_CANVAS_BOARD=on enables it for everyone.
//   - One device: open any page with ?canvasBoard=on (or off). It is remembered
//     on that device under miqra_living_canvas_board.
//   - Development and tests always have it on.

const KEY = 'miqra_living_canvas_board';

export function boardEnabled() {
  try {
    const override = localStorage.getItem(KEY);
    if (override === 'on') return true;
    if (override === 'off') return false;
  } catch { /* storage unavailable: use the build default */ }
  return import.meta.env.DEV || import.meta.env.MODE === 'test' || import.meta.env.VITE_LIVING_CANVAS_BOARD === 'on';
}

/** Applies ?canvasBoard=on|off from the address, once, and remembers it on this device. */
export function applyBoardOverrideFromUrl(search = globalThis.location?.search || '') {
  const value = new URLSearchParams(search).get('canvasBoard');
  if (value !== 'on' && value !== 'off') return;
  try { localStorage.setItem(KEY, value); } catch { /* the switch just won't stick */ }
}

/**
 * The canvas as the outline-only experience sees it: no layout. Saving it
 * leaves the stored layout untouched, and new entries are simply placed by the
 * projection when the board returns.
 */
export const hideBoard = (canvas) => {
  const hidden = { ...canvas, board: null };
  delete hidden.boardIssue;
  return hidden;
};
