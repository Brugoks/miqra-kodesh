import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Overlays that live in component state are invisible to the history stack, so
// the device Back button skips straight past them and pops the *route* instead:
// open the scripture reader on /studies, press Back, and Android drops you on
// the Dashboard with the reader still not dealt with. Feedback ticket
// d332b7e0 ("Back button functionality").
//
// The fix is to give the open overlay a history entry of its own. Pushing the
// same URL with an extra marker in the router's location state means the
// address bar never changes and the entry underneath stays exactly where the
// user was, so Back consumes the placeholder and we close the overlay in
// response — the page they came from is still one Back press away.

const SENTINEL = 'miqraBackDismiss';

// react-router keeps location state under history.state.usr.
function sentinelIsOnTop() {
  try {
    return Boolean(window.history.state?.usr?.[SENTINEL]);
  } catch {
    return false;
  }
}

/**
 * Close an overlay on Back instead of leaving the page it was opened from.
 *
 * @param {boolean} active   whether the overlay is currently open
 * @param {() => void} onDismiss  called when the user presses Back. Free to
 *   close just the topmost layer — a still-`active` overlay simply re-arms, so
 *   each Back press peels one layer off.
 */
export default function useBackDismiss(active, onDismiss) {
  const navigate = useNavigate();
  const location = useLocation();

  // Read through a ref so a caller passing an inline arrow doesn't re-run the
  // effect (and re-push a placeholder) on every render. Declared before the
  // effect that reads it: effects fire in order, so the callback is already
  // current by the time the same commit can dismiss.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  // Whether the placeholder we pushed is still the entry on top.
  const armedRef = useRef(false);
  const armed = Boolean(location.state?.[SENTINEL]);

  useEffect(() => {
    if (!active) {
      armedRef.current = false;
      return;
    }
    if (armed) {
      armedRef.current = true;
      return;
    }
    if (armedRef.current) {
      // We had a placeholder and it is gone: Back was pressed (or a route
      // change swallowed it, which should close the overlay just the same).
      armedRef.current = false;
      dismissRef.current?.();
      return;
    }
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { ...location.state, [SENTINEL]: true } },
    );
  }, [active, armed, location.pathname, location.search, location.hash, location.state, navigate]);

  useEffect(() => {
    if (!active) return undefined;
    return () => {
      // Closed some other way — the X, Escape, a verse action. Drop the
      // placeholder so Back doesn't need two presses to leave the page.
      //
      // The sentinelIsOnTop() guard matters: several close buttons in the
      // reader also follow a <Link>, and by the time this cleanup runs the
      // real navigation has already replaced our entry. Popping then would
      // undo the navigation the user actually asked for.
      if (armedRef.current && sentinelIsOnTop()) {
        armedRef.current = false;
        navigate(-1);
      }
    };
  }, [active, navigate]);
}
