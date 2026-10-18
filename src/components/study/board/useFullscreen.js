import { useCallback, useEffect, useRef, useState } from 'react';
import useBackDismiss from '../../../lib/useBackDismiss';

// Full screen for the workspace, in two layers.
//
//  1. Always: the workspace is laid over the whole browser window (CSS: .lc-workspace--fullscreen), covering the
//     app's sidebar, header and tab bar. This is the part that works everywhere — iPhone Safari allows the
//     browser's Fullscreen API only on video — and it is what `fullscreen` reports.
//  2. On touch devices where the browser allows it (Android Chrome, iPad): also real full screen, which hides the
//     browser's own toolbars. With a mouse we do not: the person asked for the window, F11 already does the
//     screen, and the rest of their desktop should stay where it is. If they leave real full screen with a system
//     gesture or Escape, they leave ours too.
//
// Back closes it like any overlay (useBackDismiss), so the device Back button does not walk out of the page —
// when the person opened it. When it opened by itself, because they like it that way, Back leaves the page.

const LOCK = 'lc-fullscreen-lock';
const noop = () => {};
const nativeElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
const requestNative = (element) => (element.requestFullscreen || element.webkitRequestFullscreen)?.call(element, { navigationUI: 'hide' });
// A touch screen is the primary input: a phone or tablet, where hiding the browser's bars is worth having.
const isTouchFirst = () => { try { return Boolean(window.matchMedia?.('(pointer: coarse)').matches); } catch { return false; } };
const exitNative = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);

export default function useFullscreen(rootRef, { initial = false } = {}) {
  const [fullscreen, setFullscreen] = useState(initial);
  // Opened by the person (the button) rather than by their saved preference. Only that is an overlay with a Back
  // entry of its own; a canvas that simply opens full window is the page, and Back leaves it like any page.
  const [opened, setOpened] = useState(false);
  const native = useRef(false); // the browser agreed to real full screen
  const leaving = useRef(false); // we are leaving real full screen on purpose, so its change event is ours
  const active = useRef(initial); // our layer is on (a slow browser may grant real full screen after we have already left)

  const leaveNative = useCallback(() => {
    if (!native.current) return;
    native.current = false;
    if (!nativeElement()) return;
    leaving.current = true;
    Promise.resolve(exitNative()).catch(noop).finally(() => { leaving.current = false; });
  }, []);

  // Called from a tap, because browsers only grant real full screen to a user gesture.
  const enter = useCallback(() => {
    const element = rootRef.current;
    if (element && isTouchFirst() && (element.requestFullscreen || element.webkitRequestFullscreen)) {
      try {
        const asked = requestNative(element);
        if (asked?.then) asked.then(() => { native.current = true; if (!active.current) leaveNative(); }, noop); // refused: stay in the CSS layer
        else native.current = true; // the prefixed API answers with nothing; its change event tells us if it failed
      } catch { /* no real full screen here: the CSS layer is still full screen */ }
    }
    active.current = true;
    setOpened(true);
    setFullscreen(true);
  }, [rootRef, leaveNative]);

  const exit = useCallback(() => { setOpened(false); setFullscreen(false); }, []);

  // While it is on, the page behind does not scroll. The cleanup also covers unmounting mid-way.
  useEffect(() => {
    if (!fullscreen) return undefined;
    document.documentElement.classList.add(LOCK);
    document.body.classList.add(LOCK);
    return () => {
      active.current = false;
      document.documentElement.classList.remove(LOCK);
      document.body.classList.remove(LOCK);
      leaveNative();
    };
  }, [fullscreen, leaveNative]);

  // The person left real full screen themselves (a swipe, Escape): leave ours as well.
  useEffect(() => {
    const onChange = () => {
      if (!native.current || leaving.current || nativeElement()) return;
      native.current = false;
      setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange); };
  }, []);

  // Real full screen would hide the Scripture reader (it lives outside this element), so give it up for the
  // reader. The CSS layer stays: the reader draws above it, and closing the reader returns to the canvas.
  useEffect(() => {
    window.addEventListener('scripture:open', leaveNative);
    return () => window.removeEventListener('scripture:open', leaveNative);
  }, [leaveNative]);

  useBackDismiss(fullscreen && opened, exit);

  return { fullscreen, enter, exit };
}
