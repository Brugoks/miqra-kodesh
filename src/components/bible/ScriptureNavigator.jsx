// Book → Chapter → Verse navigator for the Scripture Lookup panel.
//
// A persistent breadcrumb ("John ▸ 3 ▸ 16") sits under the search input; tapping
// a segment opens a drill-down sheet at that level. The sheet is portalled into
// the lookup panel element so it is positioned and clipped by the panel on both
// breakpoints (the panel is position:fixed with overflow:hidden) — presentation
// switches between bottom sheet and popover purely in CSS, so rotating or
// resizing never needs a JS resize handler.
//
// Drilling down (book ▸ chapter ▸ verse) fires onSelect only on the verse pick.
// Two shortcuts commit a chapter without one: the "Chapter" button in the
// breadcrumb (one tap from wherever the reader already is) and "Read all of …"
// above the verse grid. Either way onSelect receives a chapter plus a verse to
// focus, or null to start the chapter from the top — the parent always loads
// the whole chapter, so these differ from a verse pick only in what is centred.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import './ScriptureNavigator.css';
import {
  CODE_TO_NAME, BOOK_CHAPTERS, OT_ORDER, NT_ORDER,
  refToPassageIds, passageIdToDisplay,
} from '../../lib/scripture';
import { versesIn } from '../../lib/versification';
import { buildAliasIndex, filterBooks } from './bookFilter';

const LEVEL_LABEL = { book: 'Choose a book', chapter: 'Choose a chapter', verse: 'Choose a verse' };

export default function ScriptureNavigator({ value, onSelect, disabled = false, containerRef }) {
  // null = closed. Otherwise the level being shown.
  const [level, setLevel] = useState(null);
  // In-progress selection while drilling down; committed only on verse pick.
  const [draft, setDraft] = useState({ code: null, chapter: null });
  const [filter, setFilter] = useState('');
  const [testament, setTestament] = useState('OT');

  const sheetRef = useRef(null);
  const filterRef = useRef(null);
  const triggerRef = useRef(null); // breadcrumb button to restore focus to

  const aliasIndex = useMemo(() => buildAliasIndex(), []);

  // The portal target is read in an effect rather than during render (a ref's
  // .current is not a render-time value). Re-read on open so the first paint
  // after the panel mounts still finds it.
  const [portalHost, setPortalHost] = useState(null);
  useEffect(() => {
    setPortalHost(level ? (containerRef?.current ?? null) : null);
  }, [level, containerRef]);

  const bookName = value?.code ? (CODE_TO_NAME[value.code] || value.code) : null;

  const open = (nextLevel, event) => {
    if (disabled) return;
    triggerRef.current = event?.currentTarget ?? null;
    setDraft({ code: value?.code ?? null, chapter: value?.chapter ?? null });
    setFilter('');
    if (value?.code) setTestament(NT_ORDER.includes(value.code) ? 'NT' : 'OT');
    setLevel(nextLevel);
  };

  const close = () => {
    setLevel(null);
    // Hand focus back to the segment that opened the sheet.
    triggerRef.current?.focus?.();
  };

  const back = () => {
    if (level === 'verse') setLevel('chapter');
    else if (level === 'chapter') setLevel('book');
    else close();
  };

  const pickBook = (code) => {
    setDraft({ code, chapter: null });
    setFilter('');
    setLevel('chapter');
  };

  const pickChapter = (chapter) => {
    setDraft((prev) => ({ ...prev, chapter }));
    setLevel('verse');
  };

  // Commit a position. `focus` is the verse to centre, or null to open the
  // chapter at the top. Only restores focus to the trigger when a sheet is
  // actually open — the breadcrumb shortcut fires with the sheet closed, and
  // would otherwise yank focus to whichever segment was opened last.
  const commit = (code, chapter, focus) => {
    if (!code || !chapter) return;
    if (level) {
      setLevel(null);
      triggerRef.current?.focus?.();
    }
    onSelect(code, chapter, focus);
  };

  const pickVerse = (verse) => commit(draft.code, draft.chapter, verse);

  // Escape steps back a level rather than closing outright, and is captured here
  // so it never reaches the panel's own Escape handler (which would close the
  // whole Scripture Lookup panel from inside the picker).
  useEffect(() => {
    if (!level) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      back();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Move focus into the sheet on open / level change. Depends on portalHost so
  // it runs after the sheet is actually mounted, not the render before.
  useEffect(() => {
    if (!level || !portalHost) return;
    if (level === 'book') {
      filterRef.current?.focus();
      return;
    }
    const selected = sheetRef.current?.querySelector('.sn-cell.selected');
    (selected ?? sheetRef.current?.querySelector('.sn-cell'))?.focus();
  }, [level, portalHost]);

  // Keep Tab inside the sheet while it is open.
  const onSheetKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const booksForTestament = filter.trim() ? [...OT_ORDER, ...NT_ORDER] : (testament === 'NT' ? NT_ORDER : OT_ORDER);
  const books = filterBooks(booksForTestament, filter, aliasIndex);

  // Typing a whole reference into the filter should just work.
  const directRef = (() => {
    const raw = filter.trim();
    if (!raw) return null;
    const ids = refToPassageIds(raw);
    if (!ids.length) return null;
    const [code, chapter, verse] = ids[0].split('-')[0].split('.');
    if (!BOOK_CHAPTERS[code] || !verse) return null;
    return { code, chapter: Number(chapter), verse: Number(verse), display: passageIdToDisplay(ids[0]) };
  })();

  const chapterCount = draft.code ? BOOK_CHAPTERS[draft.code] : 0;
  const verseCount = draft.code && draft.chapter ? versesIn(draft.code, draft.chapter) : 0;
  const draftBookName = draft.code ? (CODE_TO_NAME[draft.code] || draft.code) : '';

  const sheet = level && portalHost ? createPortal(
    <div className="sn-layer">
      <div className="sn-scrim" onClick={close} />
      <div
        className="sn-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={LEVEL_LABEL[level]}
        ref={sheetRef}
        onKeyDown={onSheetKeyDown}
      >
        <div className="sn-grabber" aria-hidden="true" />
        <div className="sn-sheet-head">
          <button type="button" className="sn-head-btn" onClick={back}>
            <ChevronLeft size={16} />
            <span>{level === 'book' ? 'Close' : 'Back'}</span>
          </button>
          <span className="sn-sheet-title">
            {level === 'book' && LEVEL_LABEL.book}
            {level === 'chapter' && draftBookName}
            {level === 'verse' && `${draftBookName} ${draft.chapter}`}
          </span>
          <button type="button" className="sn-head-btn sn-head-close" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {level === 'book' && (
          <div className="sn-filter-wrap">
            <Search size={14} className="sn-filter-icon" />
            <input
              ref={filterRef}
              className="sn-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter books… (try “1co” or “John 3:16”)"
              aria-label="Filter books"
              autoComplete="off"
              spellCheck={false}
            />
            {filter && (
              <button type="button" className="sn-filter-clear" onClick={() => setFilter('')} aria-label="Clear filter">
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {level === 'book' && !filter.trim() && (
          <div className="sn-segments" role="group" aria-label="Testament">
            {[['OT', 'Old Testament'], ['NT', 'New Testament']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`sn-segment${testament === key ? ' selected' : ''}`}
                onClick={() => setTestament(key)}
                aria-pressed={testament === key}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="sn-sheet-body">
          {level === 'book' && directRef && (
            <button type="button" className="sn-direct" onClick={() => onSelect(directRef.code, directRef.chapter, directRef.verse)}>
              <span>Go to <strong>{directRef.display}</strong></span>
              <ChevronRight size={15} />
            </button>
          )}

          {level === 'book' && (
            books.length ? (
              <div className="sn-grid sn-grid-books">
                {books.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`sn-cell sn-cell-book${code === value?.code ? ' selected' : ''}`}
                    onClick={() => pickBook(code)}
                    aria-label={`${CODE_TO_NAME[code]}, ${BOOK_CHAPTERS[code]} chapters`}
                  >
                    {CODE_TO_NAME[code]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="sn-empty">No books match “{filter.trim()}”.</p>
            )
          )}

          {level === 'chapter' && (
            <div className="sn-grid sn-grid-nums">
              {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`sn-cell${n === value?.chapter && draft.code === value?.code ? ' selected' : ''}`}
                  onClick={() => pickChapter(n)}
                  aria-label={`${draftBookName} chapter ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {level === 'verse' && (
            <button
              type="button"
              className="sn-whole-chapter"
              onClick={() => commit(draft.code, draft.chapter, null)}
            >
              <BookOpen size={15} />
              <span>Read all of <strong>{draftBookName} {draft.chapter}</strong></span>
            </button>
          )}

          {level === 'verse' && (
            <div className="sn-grid sn-grid-nums">
              {Array.from({ length: verseCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`sn-cell${n === value?.verse && draft.code === value?.code && draft.chapter === value?.chapter ? ' selected' : ''}`}
                  onClick={() => pickVerse(n)}
                  aria-label={`${draftBookName} ${draft.chapter} verse ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalHost,
  ) : null;

  return (
    <div className="sn-root">
      <nav className="sn-crumbs" aria-label="Bible navigation">
        <button
          type="button"
          className={`sn-crumb${bookName ? ' filled' : ''}`}
          onClick={(e) => open('book', e)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={level === 'book'}
        >
          {bookName || 'Book'}
        </button>
        <ChevronRight size={13} className="sn-crumb-sep" aria-hidden="true" />
        <button
          type="button"
          className={`sn-crumb${value?.chapter ? ' filled' : ''}`}
          onClick={(e) => open('chapter', e)}
          disabled={disabled || !value?.code}
          aria-haspopup="dialog"
          aria-expanded={level === 'chapter'}
          aria-label={value?.chapter ? `Chapter ${value.chapter}` : 'Choose a chapter'}
        >
          {value?.chapter ?? '—'}
        </button>
        <ChevronRight size={13} className="sn-crumb-sep" aria-hidden="true" />
        <button
          type="button"
          className={`sn-crumb${value?.verse ? ' filled' : ''}`}
          onClick={(e) => open('verse', e)}
          disabled={disabled || !value?.code || !value?.chapter}
          aria-haspopup="dialog"
          aria-expanded={level === 'verse'}
          aria-label={value?.verse ? `Verse ${value.verse}` : 'Choose a verse'}
        >
          {value?.verse ?? '—'}
        </button>
        {/* One tap from a selected verse to its whole chapter, keeping the
            reader centred on the verse they were already on. */}
        <button
          type="button"
          className="sn-read-chapter"
          onClick={() => commit(value?.code, value?.chapter, value?.verse ?? null)}
          disabled={disabled || !value?.code || !value?.chapter}
          title={bookName && value?.chapter ? `Read all of ${bookName} ${value.chapter}` : 'Read the whole chapter'}
          aria-label={bookName && value?.chapter ? `Read all of ${bookName} ${value.chapter}` : 'Read the whole chapter'}
        >
          <BookOpen size={14} />
          <span>Chapter</span>
        </button>
      </nav>
      {sheet}
    </div>
  );
}
