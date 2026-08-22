import { useState, useEffect } from 'react';

// What the user can actually see while the on-screen keyboard is up.
//
// iOS ignores `interactive-widget=resizes-content`: opening the keyboard does
// not resize the layout viewport, it pans the whole page upward. A `position:
// fixed; inset: 0` overlay therefore stays at full height with its bottom third
// hidden behind the keyboard, and anything anchored to that bottom — a composer
// — ends up floating with a dead band under it. Reporting the visual viewport
// lets a caller size itself to the part that is really on screen.
//
// Android honours resizes-content, so window.innerHeight shrinks along with the
// visual viewport and the check below never trips; this is iOS-only at runtime.
//
// Generalised from components/chat/hooks/useMobileKeyboardFit, which publishes
// the same measurement as CSS variables for the chat shell. This one hands the
// numbers back to the caller instead, because the panel using it also has
// layout decisions to make in JS.

const KEYBOARD_THRESHOLD_PX = 80;

/**
 * @param {boolean} active track only while the overlay that needs this is open
 * @returns {{ keyboardOpen: boolean, height: number|null }} height is the
 *   visible height in px while the keyboard is up, and null otherwise
 */
export default function useKeyboardViewport(active = true) {
  const [state, setState] = useState({ keyboardOpen: false, height: null });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return undefined;

    const update = () => {
      const keyboardOpen = window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX;
      const height = keyboardOpen ? Math.round(viewport.height) : null;
      setState((prev) => (
        prev.keyboardOpen === keyboardOpen && prev.height === height
          ? prev
          : { keyboardOpen, height }
      ));
      // Undo the pan. Once the overlay has sized itself to the visible area
      // there is nothing left for the browser to scroll out of the way, and
      // leaving the offset in place is what pushes the header off screen.
      if (keyboardOpen && (viewport.offsetTop > 0 || window.scrollY > 0)) {
        try {
          window.scrollTo(0, 0);
        } catch { /* nothing to undo in this environment */ }
      }
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [active]);

  return state;
}
