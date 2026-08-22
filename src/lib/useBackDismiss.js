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

  // Read through refs so a caller passing an inline arrow doesn't re-run the
  // effects (and re-push a placeholder) on every render. Declared before the
  // effects that read them: effects fire in order, so both are already current
  // by the time the same commit can dismiss.
  const dismissRef = useRef(onDismiss);
  const activeRef = useRef(active);
  useEffect(() => {
    dismissRef.current = onDismiss;
    activeRef.current = active;
  });

  // Whether the placeholder we pushed is still the entry on top.
  const armedRef = useRef(false);
  // A pop we issued ourselves (closing the overlay) that hasn't landed yet.
  // history.go() is asynchronous, so the popstate it produces can arrive after
  // the overlay has already been reopened; without this it would read as a Back
  // press and slam the reopened overlay shut, making the user tap twice.
  const selfPopRef = useRef(false);
  const selfPopTimerRef = useRef(null);
  const armed = Boolean(location.state?.[SENTINEL]);

  // Back is detected from the real popstate event rather than inferred from the
  // sentinel disappearing out of the router's location. Inferring it was wrong
  // twice over: a replace-navigation elsewhere on the page (Sermons' tab
  // switch, the reels' ?c= sync) drops the state without any Back press, and
  // our own pending pop looks identical to one.
  useEffect(() => {
    const onPop = () => {
      if (selfPopRef.current) {
        // Ours, from closing the overlay — consume it and stay quiet.
        selfPopRef.current = false;
        clearTimeout(selfPopTimerRef.current);
        return;
      }
      if (!activeRef.current) return;
      armedRef.current = false;
      dismissRef.current?.();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Deliberately runs after EVERY render rather than on a dependency list.
  //
  // onDismiss may close only an inner layer, leaving the overlay open with no
  // placeholder on the stack; so may a replace-navigation from anywhere else on
  // the page. None of the values this effect reads change when that happens, so
  // a dependency list would never re-run it, no placeholder would go back, and
  // the NEXT Back press would leave the page.
  //
  // Running every render sidesteps that. The caller's state has settled by
  // then, so `active` already tells the truth, and the guards below make the
  // body idempotent — it is a few boolean checks on an ordinary re-render.
  useEffect(() => {
    if (!active) {
      armedRef.current = false;
      return;
    }
    if (armed) {
      armedRef.current = true;
      return;
    }
    // Open with no placeholder of ours on top: either the first render since it
    // opened, or something replaced our entry out from under us. Either way the
    // stack needs one.
    armedRef.current = true;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { ...location.state, [SENTINEL]: true } },
    );
  });

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
        selfPopRef.current = true;
        // Safety valve: if the pop is somehow never delivered, don't leave the
        // flag set to swallow the user's next genuine Back press.
        clearTimeout(selfPopTimerRef.current);
        selfPopTimerRef.current = setTimeout(() => { selfPopRef.current = false; }, 2_000);
        navigate(-1);
      }
    };
  }, [active, navigate]);

  useEffect(() => () => clearTimeout(selfPopTimerRef.current), []);
}
