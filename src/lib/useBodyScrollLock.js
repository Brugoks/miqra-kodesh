import { useLayoutEffect } from 'react';

// Freeze the page behind a modal overlay.
//
// `overflow: hidden` on <body> alone is not enough on iOS Safari — it keeps
// scrolling the document underneath, so a full-screen overlay shows the page
// sliding past behind it and rubber-banding at the edges. Pinning the body at a
// negative offset takes the scroll away entirely, and the offset is what makes
// the page come back exactly where it was on close instead of jumping to the
// top.
//
// The count is what makes nesting safe: the reader and a sheet opened inside it
// can both hold a lock, and the page has to stay frozen until the last one
// lets go.

let lockCount = 0;
let previous = null;

function engage() {
  const { body } = document;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    scrollY,
  };
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
}

function release() {
  if (!previous) return;
  const { body } = document;
  body.style.position = previous.position;
  body.style.top = previous.top;
  body.style.left = previous.left;
  body.style.right = previous.right;
  body.style.width = previous.width;
  body.style.overflow = previous.overflow;
  const { scrollY } = previous;
  previous = null;
  // Nothing to put back if the page was already at the top, and skipping the
  // call keeps environments that do not implement scrollTo quiet.
  if (!scrollY) return;
  try {
    window.scrollTo(0, scrollY);
  } catch {
    // The styles are already back; the offset is the only thing lost.
  }
}

/**
 * @param {boolean} active whether this caller currently wants the page frozen
 */
export default function useBodyScrollLock(active) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    if (lockCount === 0) engage();
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) release();
    };
  }, [active]);
}
