import { useEffect, useRef, useState } from 'react';
import { useNavigationType } from 'react-router-dom';

// The app wraps each route in <ErrorBoundary key={pathname}> (App.jsx), so
// navigating a list → detail → back fully remounts the list and wipes its
// useState. These helpers persist list UI state (search, filters, pagination,
// scroll) to sessionStorage so it survives that remount and the user lands
// back where they were. sessionStorage keeps it per-tab and clears when the
// tab closes.

// useState whose value is saved to sessionStorage under `key` and restored on
// remount. API matches useState (initial may be a value or a lazy function).
export function useRetainedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* corrupt/unavailable — fall back to initial */ }
    return typeof initial === 'function' ? initial() : initial;
  });

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/blocked */ }
  }, [key, value]);

  return [value, setValue];
}

// Restores window scroll for `key` once `ready` is true (the list has rendered
// tall enough for the saved offset to be valid), and records the latest
// position so returning to this view lands in place. Saves on unmount — which
// is exactly when the list navigates away to a detail.
// Detail pages (wiki entries, teachers): fresh forward navigation starts at
// the top as before, but arriving via the browser's back/forward (POP)
// restores where the user left that page — so entry → related entry → back
// lands mid-page instead of resetting to the top.
export function useDetailScroll(key) {
  const navType = useNavigationType();
  const yRef = useRef(0);

  useEffect(() => {
    const onScroll = () => { yRef.current = Math.round(window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      try { sessionStorage.setItem(key, String(yRef.current)); } catch { /* ignore */ }
    };
  }, [key]);

  useEffect(() => {
    let y = 0;
    if (navType === 'POP') {
      try { y = parseInt(sessionStorage.getItem(key) || '0', 10) || 0; } catch { /* ignore */ }
    }
    yRef.current = y;
    if (y > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    } else {
      window.scrollTo(0, 0);
    }
  }, [key, navType]);
}

export function useRetainedScroll(key, ready) {
  const yRef = useRef(0);
  const restored = useRef(false);

  useEffect(() => {
    const onScroll = () => { yRef.current = Math.round(window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      try { sessionStorage.setItem(key, String(yRef.current)); } catch { /* ignore */ }
    };
  }, [key]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    let y = 0;
    try { y = parseInt(sessionStorage.getItem(key) || '0', 10) || 0; } catch { /* ignore */ }
    if (y > 0) {
      yRef.current = y;
      // Two frames so the restored list has laid out before we jump.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    }
  }, [key, ready]);
}
