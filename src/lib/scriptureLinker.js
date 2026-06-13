// Global, automatic scripture-reference auto-linking.
//
// Scans the DOM for references (e.g. "John 3:16", "Romans 8:28-30") and wraps each
// match in a clickable <a class="scripture-link">. Clicking dispatches a global
// 'scripture:open' event that BibleLookup listens for to open + load the passage.
//
// React-safety: we never touch text inside inputs, contenteditable regions, the
// Scripture Lookup modal itself, or already-linked nodes; we disconnect the observer
// while mutating (so our own writes don't re-trigger it); and we batch on rAF. Each
// link's text lives inside the <a>, which is excluded, so nothing is re-processed.

import { SCRIPTURE_REGEX, normalizeReference } from './scripture';

// Elements whose text must never be linkified.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'A', 'BUTTON', 'SVG', 'CANVAS',
]);
// Class / attribute markers on a node or ancestor that opt out of linkifying.
const SKIP_SELECTOR = '.scripture-link, .bible-lookup-panel, [contenteditable=""], [contenteditable="true"], [data-no-scripture]';

function isSkippable(el) {
  for (let n = el; n && n !== document.body.parentNode; n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    if (SKIP_TAGS.has(n.tagName)) return true;
    if (n.isContentEditable) return true;
    if (n.matches && n.matches(SKIP_SELECTOR)) return true;
  }
  return false;
}

// Replace scripture references inside a single text node with clickable links.
function linkifyTextNode(textNode) {
  const text = textNode.nodeValue;
  if (!text || text.length < 6 || !/\d:\d/.test(text)) return; // cheap pre-filter
  SCRIPTURE_REGEX.lastIndex = 0;

  let match;
  let lastIndex = 0;
  let frag = null;

  while ((match = SCRIPTURE_REGEX.exec(text)) !== null) {
    const raw = match[0];
    if (!frag) frag = document.createDocumentFragment();
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const a = document.createElement('a');
    a.className = 'scripture-link';
    a.setAttribute('data-ref', normalizeReference(raw));
    a.setAttribute('role', 'button');
    a.setAttribute('tabindex', '0');
    a.textContent = raw;
    frag.appendChild(a);
    lastIndex = match.index + raw.length;
  }

  if (frag) {
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    try {
      textNode.parentNode?.replaceChild(frag, textNode);
    } catch {
      /* node already moved/removed by React between scan and write — safe to ignore */
    }
  }
}

// Collect candidate text nodes under a root, then linkify (collect-first so the
// tree isn't mutated mid-walk).
function scanElement(root) {
  if (root.nodeType === 3) { // text node
    if (root.parentElement && !isSkippable(root.parentElement)) linkifyTextNode(root);
    return;
  }
  if (root.nodeType !== 1) return;
  if (isSkippable(root)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/\d:\d/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      if (isSkippable(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) linkifyTextNode(node);
}

export function initScriptureLinks() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  let scheduled = false;
  const pending = new Set();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) pending.add(node);
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });

  function observe() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function flush() {
    scheduled = false;
    const nodes = [...pending];
    pending.clear();
    observer.disconnect(); // ignore our own mutations
    try {
      for (const node of nodes) {
        if (node.isConnected) scanElement(node);
      }
    } finally {
      observe();
    }
  }

  // Single delegated click handler for all current + future links.
  const onClick = (e) => {
    const link = e.target.closest?.('.scripture-link');
    if (!link) return;
    e.preventDefault();
    const ref = link.getAttribute('data-ref');
    if (ref) window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));
  };
  const onKeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = e.target.closest?.('.scripture-link');
    if (!link) return;
    e.preventDefault();
    const ref = link.getAttribute('data-ref');
    if (ref) window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);

  // Initial pass over everything already rendered.
  scanElement(document.body);
  observe();

  return () => {
    observer.disconnect();
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
  };
}
