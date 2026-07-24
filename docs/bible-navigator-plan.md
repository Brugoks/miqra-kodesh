# Bible Navigation Menu — Work Spec & Implementation Instructions

**Feature:** A Book → Chapter → Verse navigator inside the Scripture Lookup panel. Picking a
verse loads the **entire chapter** and scrolls it so the chosen verse is centered and
highlighted, on both mobile and desktop.

**Framing:** this is a *reading* affordance layered onto the existing lookup, not a rewrite of
it. The free-text input, every existing tab, and every existing entry point (auto-linked refs
in chat/studies, focus-passage sets, history) keep working exactly as they do today. The
navigator is the only path that changes fetch behavior.

Line references are accurate as of commit `5cf75a5` and will drift as the work lands.

---

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Navigator form factor | Persistent **breadcrumb** (`John ▸ 3 ▸ 16`) under the search input; tapping a segment opens a **drill-down sheet** at that level — bottom sheet ≤700px, anchored popover above |
| 2 | Verse step | **Static verse-count table**, so the verse grid is available before the chapter loads |
| 3 | Full-chapter loading | **Navigator selections only.** Typed refs, auto-linked refs, history, and focus-passage sets keep today's narrow fetch |
| 4 | Passage-level tools | The **focused verse stays the subject** of Insights, Questions, Memorize, Image, Cross-refs, and audio. The chapter is reading context only |
| 5 | Chapter paging | **Footer arrows** labeled with the destination, crossing book boundaries. No swipe gesture |
| 6 | Focus treatment | **Persistent tint + arrival flash**, cleared when a new verse is focused |
| 7 | Book picker | **OT/NT segmented grid + type-ahead filter** matching names and `BOOK_ABBR` aliases |
| 8 | Persistence | **localStorage last position**, restores the breadcrumb but does **not** auto-load. No routing changes |

### Explicitly out of scope

- No URL route / deep link. `pageMode` stays unused.
- No change to `bible-proxy`, `helloao.js`, `sefaria.js`, or any edge function.
- No new Supabase table, migration, or RLS policy. Nothing here is org-scoped.
- No navigator in Studies, reading plans, or the Bible Wiki (which has its own book browser at
  [BibleWiki.jsx:121](../src/components/wiki/BibleWiki.jsx#L121)).
- No service worker change, so **do not bump `CACHE_VERSION`** — caching logic is untouched.

---

## Why the existing plumbing already supports this

Chapter-scoped lookups work today with zero changes to the fetch layer. Verified by reading:

| Call | Input | Result |
|------|-------|--------|
| `refToPassageIds('John 3')` | bare chapter | `['JHN.3']` — the `chapterMatch` branch, [scripture.js:57](../src/lib/scripture.js#L57) |
| `parsePassageId('JHN.3')` | bare chapter | `{ book:'JHN', chapter:3, from:null, to:null }` → whole chapter, [helloao.js:32](../src/lib/helloao.js#L32) |
| `implicitChapter` | `'JHN.3'.split('.')[1]` | `3`, so markers render as `[16]` not `[3:16]`, [BibleLookup.jsx:724](../src/components/BibleLookup.jsx#L724) |
| `getTestament('John 3')` | bare chapter | `'NT'` |
| `firstChapterOf('John 3')` | bare chapter | `3`, via the `/\s(\d{1,3})\s*$/` fallback |
| `resolveVerseRef('John 3', '[16]')` | bare-chapter base | `'John 3:16'` — per-verse commentary keeps working |

**Consequence:** the entire feature is a front-end concern in `BibleLookup.jsx` plus new
sibling files. No API surface changes.

---

## Phase 1 — Versification data

### 1.1 Generate the table

`scripts/kjv-en.json` (4.6 MB, already in the repo, used by the embeddings seeders) is an array
of 66 books in canonical order shaped `{ abbrev, chapters: [[verseText, …], …] }`. Verse counts
fall straight out of `chapters.map(c => c.length)`.

**Verified before writing this spec:** its per-book chapter counts match `BOOK_CHAPTERS` for all
66 books, exactly. Its grand total is 31,100 rather than the classic KJV 31,102 — it uses a
slightly different edition (it splits 3 John 14→15 and Revelation 12:17→18, and is short
elsewhere). **This is fine and is not worth chasing.** A verse picker needs an *upper bound*
plus a graceful fallback, not canonical totals — see §1.3.

Add `scripts/build-versification.js`, following the existing one-off-seeder convention in
`scripts/`:

```js
// Generates src/lib/versification.js from scripts/kjv-en.json.
// Run: node scripts/build-versification.js
import { readFileSync, writeFileSync } from 'node:fs';

const CANONICAL = [ /* the 66 USFM codes in canonical order — import from src/lib/scripture.js */ ];
const books = JSON.parse(readFileSync(new URL('./kjv-en.json', import.meta.url)));

const lines = books.map((book, i) => {
  const counts = book.chapters.map((ch) => ch.length);
  return `  ${/^\d/.test(CANONICAL[i]) ? `'${CANONICAL[i]}'` : CANONICAL[i]}: [${counts.join(',')}],`;
});
// …write a file with the header comment from §1.2 wrapped around `lines`.
```

### 1.2 `src/lib/versification.js` (new)

```js
// Verses per chapter, indexed by USFM book code — BOOK_VERSES.GEN[0] is Genesis 1.
// GENERATED by scripts/build-versification.js from scripts/kjv-en.json; do not hand-edit.
//
// Deliberately its own module rather than living in scripture.js: scripture.js is pulled into
// the main bundle by the app-wide scriptureLinker, while this table (~4 KB raw, ~2 KB gzipped)
// is only needed by the lazily-loaded lookup panel.
//
// Versification varies slightly between translations. This table is an upper bound used to
// build the verse grid; callers must tolerate a picked verse being absent from the loaded
// translation (see the nearest-verse fallback in BibleLookup).
export const BOOK_VERSES = { GEN: [31,25,24,26,…], … };

// Verse count for a chapter, or 0 if the book/chapter is unknown.
export function versesIn(code, chapter) {
  const counts = BOOK_VERSES[code];
  if (!counts || chapter < 1 || chapter > counts.length) return 0;
  return counts[chapter - 1];
}
```

### 1.3 Known versification hazards — handle, don't fight

Several verses present in KJV are **deliberately absent** from NASB / ESV / CSB / NLT. The grid
will offer them; the loaded chapter will not contain them.

> Matthew 17:21 · Matthew 18:11 · Matthew 23:14 · Mark 7:16 · Mark 9:44 · Mark 9:46 ·
> Mark 11:26 · Mark 15:28 · Luke 17:36 · Luke 23:17 · John 5:4 · Acts 8:37 · Acts 15:34 ·
> Acts 24:7 · Acts 28:29 · Romans 16:24

Plus: Hebrew Psalm superscriptions are verse 1 in some translations and unnumbered in others,
which shifts every subsequent verse in ~116 Psalms; 3 John and Revelation 12 vary by edition.

**Required behavior** (this is the load-bearing mitigation for choosing a static table):
when the focus verse has no matching anchor in the rendered chapter, fall back to the nearest
**lower** verse present, and if none, the top of the chapter. Never leave the reader staring at
an un-scrolled chapter with no explanation — see §4.4.

### 1.4 Tests — `src/lib/versification.test.js` (new)

- `BOOK_VERSES` has exactly 66 keys, matching `Object.keys(BOOK_CHAPTERS)`.
- For every code, `BOOK_VERSES[code].length === BOOK_CHAPTERS[code]`.
- Every entry is a positive integer.
- Spot values: `versesIn('PSA', 119) === 176`, `versesIn('JHN', 3) === 36`,
  `versesIn('PSA', 117) === 2`, `versesIn('OBA', 1) === 21`.
- `versesIn` returns `0` for `('XXX', 1)`, `('GEN', 0)`, `('GEN', 51)`.

---

## Phase 2 — Canonical book data in `src/lib/scripture.js`

`BOOK_CHAPTERS` currently lives in [readingPlans.js:8](../src/lib/readingPlans.js#L8), but
`readingPlans.js` already imports from `scripture.js` — so a `scripture.js` helper cannot import
it back without a cycle. Move the literal; keep the old name working.

**In `scripture.js`,** after `CODE_TO_NAME`:

```js
export const BOOK_CHAPTERS = { /* moved verbatim from readingPlans.js */ };

export const OT_ORDER = [ /* moved from readingPlans.js:20 */ ];
export const NT_ORDER = [ /* moved from readingPlans.js:26 */ ];
export const CANONICAL_ORDER = [...OT_ORDER, ...NT_ORDER];

// Step one chapter forward/back, rolling into the neighbouring book at a book
// edge. Returns null at Genesis 1 (dir -1) and Revelation 22 (dir +1).
export function stepChapter(code, chapter, dir) {
  const target = chapter + dir;
  if (target >= 1 && target <= (BOOK_CHAPTERS[code] ?? 0)) return { code, chapter: target };
  const i = CANONICAL_ORDER.indexOf(code);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= CANONICAL_ORDER.length) return null;
  const nextCode = CANONICAL_ORDER[j];
  return { code: nextCode, chapter: dir > 0 ? 1 : BOOK_CHAPTERS[nextCode] };
}
```

**In `readingPlans.js`:** delete the three literals, add
`import { BOOK_CHAPTERS, OT_ORDER, NT_ORDER } from './scripture';` and re-export
`export { BOOK_CHAPTERS };` so these existing importers keep compiling unchanged:

- [BibleWiki.jsx:14](../src/components/wiki/BibleWiki.jsx#L14)
- [scriptureEngagement.js:8](../src/lib/scriptureEngagement.js#L8)
- `readingPlans.test.js`, `bookIntros.test.js`

### Tests — add to `src/lib/scripture.test.js`

- `CANONICAL_ORDER` has 66 entries, no duplicates, and its set equals `Object.keys(BOOK_CHAPTERS)`.
- `stepChapter('JHN', 3, 1)` → `{ code:'JHN', chapter:4 }`
- `stepChapter('JHN', 21, 1)` → `{ code:'ACT', chapter:1 }`
- `stepChapter('MAT', 1, -1)` → `{ code:'MAL', chapter:4 }` (crosses the testament seam)
- `stepChapter('GEN', 1, -1)` → `null`; `stepChapter('REV', 22, 1)` → `null`

---

## Phase 3 — `src/components/bible/ScriptureNavigator.jsx` (new)

New subdirectory `src/components/bible/`, matching the convention that multi-file feature areas
get their own folder (`chat/`, `reading/`, `wiki/`). Files: `ScriptureNavigator.jsx`,
`ScriptureNavigator.css`, `useScripturePosition.js`.

### 3.1 Contract

```jsx
<ScriptureNavigator
  value={navSel}              // { code, chapter, verse } | null — verse may be null
  onSelect={openChapter}      // (code, chapter, verse) => void; fired on verse pick
  disabled={!isConfigured}
/>
```

`onSelect` fires **only** when a verse is chosen. Picking a book advances to chapters; picking a
chapter advances to verses. There is no "load the chapter without a verse" path from the
navigator — that keeps the interaction to a single predictable outcome. (Whole-chapter reading
is reachable via the free-text input and via chapter paging.)

### 3.2 Breadcrumb (always visible)

Rendered directly under the `<form className="bible-lookup-search">`
([BibleLookup.jsx:2203](../src/components/BibleLookup.jsx#L2203)) and **above**
`.bible-lookup-results`. Because the results div is the scroll container
([BibleLookup.css:256](../src/components/BibleLookup.css#L256)), the breadcrumb is naturally
pinned without any `position: sticky`.

```
┌─────────────────────────────────────┐
│ [ e.g. John 3:16          ] [ 🔍 ]  │
│  John ▾  ›  3 ▾  ›  16 ▾            │
└─────────────────────────────────────┘
```

- Three `<button>` segments. Empty state reads `Book ▾ › — › —` with chapter/verse disabled.
- Each: `aria-haspopup="dialog"`, `aria-expanded={openLevel === 'book'}`.
- Tapping a segment opens the sheet **at that level**, pre-scrolled to the current value.
- Chapter/verse segments are disabled until the level above has a value.

### 3.3 Drill-down sheet

One component, one DOM tree; **presentation switches in CSS, not JS** — no `window.innerWidth`
branching, which breaks on rotate and on desktop resize.

- **≤700px:** bottom sheet, `position: absolute; left/right: 0; bottom: 0`, max-height `72dvh`,
  rounded top corners, grab-handle bar, `padding-bottom: env(safe-area-inset-bottom)`.
- **>700px:** popover anchored under the breadcrumb, `max-width: 22rem`, `max-height: 60vh`.

Render it **inside `.bible-lookup-panel`**, not portalled to `<body>`. The panel is
`position: fixed` and full-screen at ≤700px; portalling would put the sheet outside the panel's
stacking context and force z-index/backdrop coordination with `.bible-lookup-backdrop`. Its own
scrim is `position: absolute; inset: 0` within the panel and closes the sheet on click.

**Header per level**

```
┌─────────────────────────────────────┐
│ ‹ Back        Choose a book     [✕] │
│ [ filter books…                   ] │
│ ( Old Testament ) ( New Testament ) │
├─────────────────────────────────────┤
│ ┌──────┬──────┬──────┬──────┐       │
│ │ Gen  │ Exo  │ Lev  │ Num  │       │
│ │ Deut │ Josh │ Judg │ Ruth │  …    │
│ └──────┴──────┴──────┴──────┘       │
└─────────────────────────────────────┘
```

- Grid: `grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr))` for books,
  `minmax(2.75rem, 1fr)` for chapter and verse numbers. Tap targets ≥44px tall.
- Chapter/verse grids are plain number buttons; the current value gets `.selected`.
- The OT/NT segmented control is hidden while a filter is active (the filter spans both).

**Type-ahead filter (books level only)**

Build the alias index once with `useMemo`:

```js
// BOOK_ABBR maps many aliases → code; invert it so "1co", "phlm", "songs" all match.
const aliasIndex = useMemo(() => {
  const byCode = new Map();
  for (const [alias, code] of Object.entries(BOOK_ABBR)) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(alias);
  }
  return byCode;
}, []);
```

Match `q = filter.trim().toLowerCase()` against the display name and every alias. **Rank
prefix matches above substring matches** so typing `jo` surfaces Job/Joel/John/Jonah before
Joshua-by-substring noise.

**Polish (include it — it is three lines and makes the sheet feel native):** if the filter text
parses via `refToPassageIds(filter)`, show a pinned "Go to *John 3:16*" row at the top of the
results that calls `onSelect` directly.

### 3.4 Accessibility

- Sheet: `role="dialog" aria-modal="true"`, `aria-label` per level.
- On open, focus the filter input (books) or the currently-selected button (chapter/verse).
- Trap Tab within the sheet; restore focus to the triggering breadcrumb segment on close.
- Roving `tabindex` + arrow-key movement inside grids is **optional**; buttons are natively
  tabbable and that is acceptable for v1. Do not ship a half-implemented roving pattern.
- Book buttons: `aria-label={`${name}, ${chapters} chapters`}`.
- `prefers-reduced-motion: reduce` disables the sheet slide-in and the smooth scroll.

---

## Phase 4 — Chapter loading, anchors, and centering (`BibleLookup.jsx`)

### 4.1 New state

```js
// Navigator state. `navSel` drives the breadcrumb and is synced from every lookup;
// `focusVerse` is set ONLY by navigator picks, which is what keeps typed and
// auto-linked refs on their existing narrow fetch.
const [navSel, setNavSel] = useState(loadLastPosition);   // { code, chapter, verse } | null
const [focusVerse, setFocusVerse] = useState(null);       // number | null
const resultsScrollRef = useRef(null);                    // → .bible-lookup-results
const centeredKeyRef = useRef(null);                      // guards repeat auto-scrolls
```

### 4.2 `lookupReference` gains a third argument

Change the signature at [BibleLookup.jsx:768](../src/components/BibleLookup.jsx#L768):

```js
const lookupReference = async (refStr, set = null, { focusVerse: focus = null } = {}) => {
```

and add `setFocusVerse(focus);` to the existing reset block alongside `setWordStudy(null)` etc.
**Every existing call site keeps working untouched** — they pass one or two arguments and get
`focus = null`, i.e. today's behavior.

Then add:

```js
// Navigator entry point: load the WHOLE chapter, focus one verse inside it.
// Note the ref is chapter-scoped ("John 3"), so refToPassageIds yields ['JHN.3'].
const openChapter = (code, chapter, verse) => {
  const ref = `${CODE_TO_NAME[code]} ${chapter}`;
  setActiveTab('read');
  setQuery(ref);
  setNavSel({ code, chapter, verse });
  lookupReference(ref, null, { focusVerse: verse });
};
```

**Do not** change `handleLookup`, the `scripture:open` listener, `navigatePassageSet`, or the
history-item handler. That is decision #3 enforced structurally rather than by convention.

### 4.3 Verse anchors in `PassageText`

`PassageText` ([BibleLookup.jsx:351](../src/components/BibleLookup.jsx#L351)) currently emits a
flat token stream, so there is nothing to scroll to or tint. Group tokens into per-verse
segments while keeping the token→render mapping identical.

Add props `focusVerse` and `chapterOfFocus`. After `tokenizePassage(content)`, chunk the tokens
at each `type === 'verse'` boundary, then render each chunk inside:

```jsx
<span
  className={`bl-verse-seg${isFocus ? ' bl-verse-focus' : ''}`}
  data-verse={verseNumber}
  data-focus-verse={isFocus ? 'true' : undefined}
>
  {/* the existing per-token rendering, unchanged */}
</span>
```

**Constraints — violating these breaks existing features:**

1. The wrapper must be an **inline** `<span>`. A block element turns flowing prose into
   one-verse-per-line and silently changes the reader's appearance.
2. Keep the existing `key={i}` scheme derived from the original token index. The word-study,
   entity-peek, ambiguous-click, and define-word handlers all close over token positions.
3. Any leading tokens before the first verse marker (rare, e.g. a section heading) render
   outside a wrapper, exactly as today.
4. `chapterOfFocus` matters because content can carry explicit `[3:16]` markers for
   multi-chapter passages. Only tint a verse when its chapter matches.

**Compare view** needs no restructuring — `compareRows`
([BibleLookup.jsx:1569](../src/components/BibleLookup.jsx#L1569)) is already per-verse. Add
`data-focus-verse` and `bl-verse-focus` to the matching `.bl-compare-row`.

### 4.4 Centering

Use a `useLayoutEffect` on the results container. **Do not use
`scrollIntoView({ block: 'center' })`** — it scrolls ancestor containers and behaves
inconsistently inside a `position: fixed` panel on iOS Safari.

```js
useLayoutEffect(() => {
  if (focusVerse == null) return;
  const container = resultsScrollRef.current;
  if (!container) return;

  // Re-center when the translation or view mode changes, but never fight a
  // re-render after the reader has scrolled away themselves.
  const key = `${results?.runId}:${viewMode}:${effectiveActiveId}:${focusVerse}`;
  if (centeredKeyRef.current === key) return;

  let el = container.querySelector('[data-focus-verse="true"]');
  if (!el) {
    // Versification gap (§1.3): the translation omits this verse. Fall back to
    // the nearest lower verse present, else leave the chapter at the top.
    const candidates = [...container.querySelectorAll('[data-verse]')]
      .filter((n) => Number(n.dataset.verse) < focusVerse);
    el = candidates[candidates.length - 1] ?? null;
  }
  if (!el) return;
  centeredKeyRef.current = key;

  // getBoundingClientRect deltas, not offsetTop — offsetTop depends on the
  // nearest positioned ancestor, which this container is not guaranteed to be.
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const top = container.scrollTop + (eRect.top - cRect.top) - cRect.height / 2 + eRect.height / 2;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}, [focusVerse, results?.runId, viewMode, effectiveActiveId, activeTranslation.status]);
```

Attach `ref={resultsScrollRef}` to the `.bible-lookup-results` div
([BibleLookup.jsx:2234](../src/components/BibleLookup.jsx#L2234)).

`activeTranslation.status` in the dependency array is what makes this fire *after* the text
renders rather than against an empty skeleton.

**Announce it.** Add a visually-hidden `aria-live="polite"` region that reads
`"John 3 loaded, verse 16 focused"` — or, on the fallback path,
`"John 3 loaded. Verse 16 is not present in NASB; showing verse 20."` A silent scroll is
invisible to screen-reader users and the fallback is invisible to everyone.

### 4.5 Focus styling — `BibleLookup.css`

```css
.bl-verse-seg { /* no layout effect by default — inline pass-through */ }

.bl-verse-focus {
  background: color-mix(in srgb, var(--accent-gold) 14%, transparent);
  border-radius: 0.25rem;
  /* Inline spans wrap across lines; clone paints the tint on every fragment
     instead of only the first. */
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0.05em 0.15em;
}

/* Left-border accents fragment badly on wrapped inline spans, so the directional
   cue rides on the verse number instead. */
.bl-verse-focus .bl-verse-num {
  background: var(--accent-gold);
  color: var(--bg-primary);
  border-radius: 0.2rem;
  padding: 0 0.25rem;
  font-weight: 700;
}

@keyframes bl-verse-flash {
  from { background: color-mix(in srgb, var(--accent-gold) 42%, transparent); }
  to   { background: color-mix(in srgb, var(--accent-gold) 14%, transparent); }
}
.bl-verse-focus { animation: bl-verse-flash 1.2s ease-out 1; }

@media (prefers-reduced-motion: reduce) {
  .bl-verse-focus { animation: none; }
}
```

Using `--accent-gold` (not a hard-coded color) is required — `App.jsx` rewrites those custom
properties per organization, so a literal would break org branding.

Compare view reuses `.bl-verse-focus` on `.bl-compare-row`; add a block-context override there
since the row is not inline.

---

## Phase 5 — Chapter paging

Rendered as the last child **inside** `.bible-lookup-results` so it scrolls to the end of the
chapter (a pinned footer would permanently eat vertical space on phones).

Show only when `results` is loaded **and** `navSel` resolves — i.e. any lookup whose ref parses
to a single book+chapter. It is fine for this to appear on typed chapter lookups too; paging
does not change fetch scope, it just changes which chapter is loaded.

```jsx
const prev = navSel && stepChapter(navSel.code, navSel.chapter, -1);
const next = navSel && stepChapter(navSel.code, navSel.chapter, 1);
```

```
├─────────────────────────────────────┤
│  ‹ John 2               John 4 ›    │
└─────────────────────────────────────┘
```

- Label each button with its destination (`CODE_TO_NAME[prev.code] + ' ' + prev.chapter`).
- `stepChapter` returning `null` (Genesis 1 back, Revelation 22 forward) → omit that button;
  do not render a disabled stub.
- Handler: `openChapter(target.code, target.chapter, null)`.
- With `verse === null`, `focusVerse` is null → no centering effect → the new chapter renders at
  its natural scroll position. **Also reset `container.scrollTop = 0`** in that case, otherwise
  the reader lands mid-chapter carrying the previous chapter's scroll offset. This is the single
  easiest bug to ship here.
- Paging **must** update `navSel` so the breadcrumb tracks and the next arrow computes correctly.

---

## Phase 6 — Persistence and breadcrumb sync

### 6.1 `src/components/bible/useScripturePosition.js` (new)

Mirror the existing preference helpers at [BibleLookup.jsx:61-88](../src/components/BibleLookup.jsx#L61)
— same `try/catch` with a `/* storage unavailable */` comment, same silent-failure posture.

```js
const POSITION_KEY = 'miqra_scripture_position';

export function loadLastPosition() {
  try {
    const raw = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
    // Validate against real book data — a stale or hand-edited entry must not
    // render a breadcrumb for a book that does not exist.
    if (raw && BOOK_CHAPTERS[raw.code] && raw.chapter >= 1 && raw.chapter <= BOOK_CHAPTERS[raw.code]) {
      return { code: raw.code, chapter: raw.chapter, verse: raw.verse ?? null };
    }
  } catch { /* storage unavailable */ }
  return null;
}

export function saveLastPosition(sel) { /* symmetric */ }
```

Persist on every `navSel` change. **Restore the breadcrumb only** — do not fetch on panel open
(decision #8).

### 6.2 Sync the breadcrumb from every lookup

So that clicking `Romans 8:28` in chat leaves the navigator sitting on Romans 8, ready to browse
onward:

```js
useEffect(() => {
  if (!results?.ref) return;
  const pid = refToPassageId(results.ref);   // already imported? add it — currently only refToPassageIds is
  if (!pid) return;                          // unparseable → leave the breadcrumb alone
  const [code, chapter, verse] = pid.split('-')[0].split('.');
  if (!BOOK_CHAPTERS[code]) return;
  setNavSel({ code, chapter: Number(chapter), verse: verse ? Number(verse) : null });
}, [results?.ref]);
```

Note `refToPassageId` (singular) is exported from `scripture.js` but is **not** currently
imported by `BibleLookup.jsx` — add it to the import at
[BibleLookup.jsx:6](../src/components/BibleLookup.jsx#L6).

For a multi-part ref like `Revelation 3:5;13:8` this lands on Revelation 3:5. That is correct:
the breadcrumb reflects where the reader is, not the full span.

### 6.3 Escape key ordering

The panel's Escape handler ([BibleLookup.jsx:683](../src/components/BibleLookup.jsx#L683)) walks
commentary → BLB entry → close panel. Insert the navigator **first** in that chain, and add its
open-state to the effect's dependency array. Getting this wrong means Escape closes the whole
panel from inside the book picker.

---

## Edge cases worth explicit handling

| Case | Required behavior |
|------|-------------------|
| Verse absent from the translation (§1.3) | Nearest-lower-verse fallback + `aria-live` explanation. **Do not** silently no-op |
| Psalm superscriptions shifting verse numbers | Same fallback path; no special-casing |
| Psalm 119 (176 verses) | Verse grid scrolls inside the sheet; chapter renders fine. In compare view this is 176 rows × 3 translations — acceptable, but re-check scroll smoothness on a mid-range phone |
| Compare view active when a verse is picked | Chapter loads for all compared translations; centering targets the `.bl-compare-row`. Works, just confirm it |
| Hebrew (Sefaria) selected, NT chapter picked | Existing fallback at [BibleLookup.jsx:634](../src/components/BibleLookup.jsx#L634) already swaps to the stored preference. Verify the centering effect keys off `effectiveActiveId`, not `activeTranslationId` |
| Translation switched after centering | Re-centers (the key includes the translation id) — intended |
| Reader scrolls away, then a re-render fires | `centeredKeyRef` suppresses it |
| Chapter fetch fails | Existing per-translation error UI + Retry renders. Centering finds no anchor and no-ops. No new error path needed |
| Signed-out / no Supabase config | `isConfigured` is false; the panel already shows "Sign in to enable inline scripture reading." Navigator should be `disabled` — do not offer a picker that cannot load |
| Panel opened by the FAB with no prior lookup | Breadcrumb shows the restored position, results area is empty. No fetch |
| `refToPassageId` returns null (search results, odd refs) | Breadcrumb keeps its previous value |

---

## Test plan

Tests are colocated, jsdom + globals, setup in `src/test/setup.js`, config in `vite.config.js`.

**Unit — new**
- `src/lib/versification.test.js` — §1.4.
- `src/components/bible/scriptureNavigator.test.js` — the pure filter/alias-ranking helper,
  exported separately from the component so it is testable without rendering.

**Unit — extend `src/lib/scripture.test.js`**
- `CANONICAL_ORDER` and `stepChapter` cases from Phase 2.

**Component — `src/components/bible/ScriptureNavigator.test.jsx` (new)**
- Renders all 66 books; OT segment shows 39, NT shows 27.
- Filter `"1co"` matches 1 Corinthians via `BOOK_ABBR`; `"jo"` ranks John/Job/Joel/Jonah above
  substring-only matches.
- Book pick advances to the chapter grid with the right count (John → 21).
- Chapter pick advances to the verse grid with the right count (John 3 → 36).
- Verse pick calls `onSelect('JHN', 3, 16)` exactly once.
- Escape at the chapter level goes back a level, not straight to closed.

**Regression — must stay green**
- `npm test` in full. `readingPlans.test.js`, `bookIntros.test.js`, and `scripture.test.js` are
  the ones the Phase 2 move can break.
- `npm run lint`.
- `npm run build`.

**Manual — device checklist**
- iOS Safari PWA standalone: bottom sheet clears the home indicator (`env(safe-area-inset-bottom)`),
  sheet does not trigger rubber-band scroll of the panel behind it.
- ≤700px full-screen panel and ≤1024px bottom-tab-bar layout.
- Rotate portrait↔landscape with the sheet open — CSS-only switching means no JS resize handling.
- Pick John 3:16 → chapter loads, v16 centered and tinted.
- Pick Matthew 17:21 in NASB → fallback to v20, `aria-live` explains it.
- Page John 3 → John 4 → scroll resets to top, breadcrumb updates.
- Page Malachi 4 → Matthew 1 (book crossing), and Genesis 1 / Revelation 22 dead ends.
- Reload the app → breadcrumb restores, nothing auto-fetches.
- Click an auto-linked ref in chat → still fetches only that verse, breadcrumb syncs.
- Verify Insights / Memorize / Image still act on the focused verse, not the chapter.

---

## Files touched

| File | Change |
|------|--------|
| `src/lib/versification.js` | **new** — generated `BOOK_VERSES` + `versesIn` |
| `src/lib/versification.test.js` | **new** |
| `scripts/build-versification.js` | **new** — generator from `scripts/kjv-en.json` |
| `src/lib/scripture.js` | `BOOK_CHAPTERS`, `OT_ORDER`, `NT_ORDER`, `CANONICAL_ORDER`, `stepChapter` |
| `src/lib/scripture.test.js` | + order and `stepChapter` cases |
| `src/lib/readingPlans.js` | literals removed, imported from `scripture.js`, `BOOK_CHAPTERS` re-exported |
| `src/components/bible/ScriptureNavigator.jsx` | **new** — breadcrumb + drill-down sheet |
| `src/components/bible/ScriptureNavigator.css` | **new** |
| `src/components/bible/useScripturePosition.js` | **new** — localStorage position |
| `src/components/bible/ScriptureNavigator.test.jsx` | **new** |
| `src/components/BibleLookup.jsx` | `openChapter`, `focusVerse`, `navSel`, `PassageText` verse wrappers, centering effect, paging footer, Escape ordering, `refToPassageId` import |
| `src/components/BibleLookup.css` | `.bl-verse-seg`, `.bl-verse-focus`, flash keyframes, paging footer |

**Not touched:** `public/sw.js` (no `CACHE_VERSION` bump), `vercel.json`, `src/App.jsx`,
`supabase/**`.

---

## Acceptance checklist

- [ ] Book → Chapter → Verse reachable in ≤3 taps from an open panel, on phone and desktop
- [ ] Selecting a verse loads the **whole chapter** and centers that verse
- [ ] Focused verse carries a persistent org-branded tint plus a one-shot arrival flash
- [ ] Verses missing from a translation degrade to the nearest lower verse, announced politely
- [ ] Chapter paging works within and across books; correct dead ends; scroll resets to top
- [ ] Typed refs, chat auto-links, history, and focus-passage sets fetch exactly as before
- [ ] Insights / Questions / Memorize / Image / Cross-refs / audio still scope to the verse
- [ ] Breadcrumb restores from localStorage on reload without fetching
- [ ] Escape closes the sheet before the panel
- [ ] `npm run lint`, `npm test`, `npm run build` all clean
