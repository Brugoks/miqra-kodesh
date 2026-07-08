// Global, automatic Bible Wiki / Church History entity linking — the sibling
// of scriptureLinker.js. Scans the DOM for names of biblical people/places and
// church-history teachers, wraps each match in a clickable <a class="wiki-entity-link">.
// Clicking dispatches a global 'wiki-entity:open' event that WikiEntityPeek
// listens for to show a small preview popover.
//
// Matching is exact-case, whole-word/phrase (case-sensitive so common lowercase
// words like "job" or "so" never collide with proper nouns "Job"/"So"), built
// from the same foundation data as the Bible Wiki and Church History pages.
// Longer names win over shorter ones at the same position (e.g. "John the
// Baptist" over bare "John") since patterns are tried longest-first.

import { loadBibleWiki, loadChurchTeachers, MATCH_EXCLUDED } from './bibleWiki';

const MIN_NAME_LENGTH = 3;

// Shared with LinkedText.jsx, which renders its own clickable spans (inside
// panels the DOM scanner skips) instead of scanning for them.
export function dispatchWikiEntityOpen(el, slug, entryType) {
  if (!slug) return;
  const rect = el.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent('wiki-entity:open', {
    detail: { slug, entryType, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } },
  }));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let indexPromise = null;

// { bySlug: Map<slug, entry>, regex: RegExp|null, patternToSlug: Map<string, string> }
export function loadEntityLinkIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all([loadBibleWiki(), loadChurchTeachers()]).then(([wiki, teachers]) => {
      const bySlug = new Map();
      const patternToSlug = new Map(); // exact matched text -> slug (case-sensitive)
      const weightOf = (e) => e.vc || (e.p ? e.p.length : 0);

      const consider = (name, entry) => {
        const trimmed = (name || '').trim();
        if (trimmed.length < MIN_NAME_LENGTH) return;
        const existingSlug = patternToSlug.get(trimmed);
        if (existingSlug) {
          const existing = bySlug.get(existingSlug);
          if (existing && weightOf(entry) <= weightOf(existing)) return; // keep the better-attested one
        }
        patternToSlug.set(trimmed, entry.s);
      };

      for (const entry of wiki.entries) {
        if (MATCH_EXCLUDED.has(entry.s)) continue;
        bySlug.set(entry.s, entry);
        consider(entry.n, entry);
        consider(entry.t, entry);
        for (const alias of entry.al || []) consider(alias, entry);
      }
      for (const teacher of teachers.teachers) {
        bySlug.set(teacher.s, teacher);
        consider(teacher.n, teacher);
      }

      const patterns = [...patternToSlug.keys()].sort((a, b) => b.length - a.length);
      const regex = patterns.length
        ? new RegExp(`\\b(?:${patterns.map(escapeRegExp).join('|')})\\b`, 'g')
        : null;

      return { bySlug, regex, patternToSlug };
    });
  }
  return indexPromise;
}

// Split plain text into alternating segments for React contexts that render
// their own clickable spans (e.g. LinkedText, for panels the DOM scanner
// skips) instead of scanning the rendered DOM.
// [{ slug: null, text } | { slug, entryType, text: matchedName }]
export function matchEntitySegments(text, index, selfSlug) {
  if (!text || !index?.regex) return text ? [{ slug: null, text }] : [];
  index.regex.lastIndex = 0;
  const segments = [];
  let lastIndex = 0;
  let match;
  while ((match = index.regex.exec(text)) !== null) {
    const raw = match[0];
    const slug = index.patternToSlug.get(raw);
    const entry = slug ? index.bySlug.get(slug) : null;
    if (!entry || slug === selfSlug) continue;
    if (match.index > lastIndex) segments.push({ slug: null, text: text.slice(lastIndex, match.index) });
    segments.push({ slug, entryType: entry.type, text: raw });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) segments.push({ slug: null, text: text.slice(lastIndex) });
  return segments;
}

// Elements whose text must never be linkified.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'A', 'BUTTON', 'SVG', 'CANVAS',
]);
const SKIP_SELECTOR = '.wiki-entity-link, .scripture-link, .bible-lookup-panel, '
  + '[contenteditable=""], [contenteditable="true"], [data-no-scripture]';

function isSkippable(el) {
  for (let n = el; n && n !== document.body.parentNode; n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    if (SKIP_TAGS.has(n.tagName)) return true;
    if (n.isContentEditable) return true;
    if (n.matches && n.matches(SKIP_SELECTOR)) return true;
  }
  return false;
}

function linkifyTextNode(textNode, index) {
  const text = textNode.nodeValue;
  if (!text || text.length < MIN_NAME_LENGTH || !/[A-Z]/.test(text) || !index.regex) return;
  index.regex.lastIndex = 0;

  const selfSlug = document.body.dataset.wikiSelfSlug || null;
  let match;
  let lastIndex = 0;
  let frag = null;

  while ((match = index.regex.exec(text)) !== null) {
    const raw = match[0];
    const slug = index.patternToSlug.get(raw);
    if (!slug || slug === selfSlug) continue;
    const entry = index.bySlug.get(slug);
    if (!entry) continue;
    if (!frag) frag = document.createDocumentFragment();
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const a = document.createElement('a');
    a.className = 'wiki-entity-link';
    a.setAttribute('data-wiki-slug', slug);
    a.setAttribute('data-wiki-type', entry.type);
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

function scanElement(root, index) {
  if (root.nodeType === 3) {
    if (root.parentElement && !isSkippable(root.parentElement)) linkifyTextNode(root, index);
    return;
  }
  if (root.nodeType !== 1) return;
  if (isSkippable(root)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/[A-Z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      if (isSkippable(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) linkifyTextNode(node, index);
}

export function initWikiEntityLinks() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  let index = null;
  let disposed = false;
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
    if (!index) return;
    const nodes = [...pending];
    pending.clear();
    observer.disconnect();
    try {
      for (const node of nodes) {
        if (node.isConnected) scanElement(node, index);
      }
    } finally {
      observe();
    }
  }

  const onClick = (e) => {
    const link = e.target.closest?.('.wiki-entity-link');
    if (!link) return;
    e.preventDefault();
    openPeek(link);
  };
  const onKeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = e.target.closest?.('.wiki-entity-link');
    if (!link) return;
    e.preventDefault();
    openPeek(link);
  };
  function openPeek(link) {
    dispatchWikiEntityOpen(link, link.getAttribute('data-wiki-slug'), link.getAttribute('data-wiki-type'));
  }

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);

  loadEntityLinkIndex().then((loaded) => {
    if (disposed) return;
    index = loaded;
    scanElement(document.body, index);
    observe();
  });

  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
  };
}
