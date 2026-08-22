import { useCallback, useEffect, useMemo, useState } from 'react';
import { Highlighter, Search, BookOpen, StickyNote, Trash2, Loader2, X } from 'lucide-react';
import './Highlights.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { CODE_TO_NAME } from '../lib/scripture';
import {
  HIGHLIGHT_COLORS,
  colorLabel,
  compareCanonical,
  toHighlight,
  verseIdToDisplay,
} from '../lib/highlights';

// Everything a user has marked, in one place. Marking without reviewing is half
// a feature: this is where highlights become a record of what God has been
// teaching someone rather than decoration they never see again.
//
// Rows carry a verse_text snapshot, so this page renders with a single query and
// spends nothing against the passage API no matter how many highlights it shows.

// A ceiling high enough that nobody realistic hits it, low enough that a runaway
// account cannot pull an unbounded result set into the browser.
const MAX_ROWS = 2000;

export default function Highlights({ session }) {
  const userId = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(hasSupabaseConfig && userId));
  const [error, setError] = useState('');
  const [colorFilter, setColorFilter] = useState(null);
  const [bookFilter, setBookFilter] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('canonical'); // 'canonical' | 'recent'
  const [editing, setEditing] = useState(null); // verseId being annotated
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyVerseId, setBusyVerseId] = useState(null);

  useEffect(() => {
    // Initial state already covers the signed-out case (rows [], loading false),
    // and the component returns early before rendering the list, so there is
    // nothing to reset here.
    if (!hasSupabaseConfig || !userId) return undefined;
    let active = true;
    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('verse_highlights')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS);
        if (!active) return;
        if (queryError) {
          setError(queryError.message || 'Could not load your highlights.');
          setRows([]);
        } else {
          setRows((data || []).map(toHighlight).filter(Boolean));
        }
      } catch {
        if (active) setError('Could not load your highlights.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  // Only books the user has actually marked — a 66-entry dropdown would be
  // mostly empty options.
  const booksPresent = useMemo(() => {
    const seen = new Map();
    for (const h of rows) {
      if (!seen.has(h.bookCode)) seen.set(h.bookCode, { code: h.bookCode, name: CODE_TO_NAME[h.bookCode] || h.bookCode, count: 0 });
      seen.get(h.bookCode).count += 1;
    }
    return [...seen.values()].sort((a, b) => compareCanonical(
      { bookCode: a.code, chapter: 0, verse: 0 },
      { bookCode: b.code, chapter: 0, verse: 0 },
    ));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((h) => {
      if (colorFilter && h.color !== colorFilter) return false;
      if (bookFilter && h.bookCode !== bookFilter) return false;
      if (!needle) return true;
      return `${h.note} ${h.verseText} ${verseIdToDisplay(h.verseId) || ''}`.toLowerCase().includes(needle);
    });
    return sortMode === 'canonical'
      ? filtered.slice().sort(compareCanonical)
      : filtered; // already newest-first from the query
  }, [rows, colorFilter, bookFilter, query, sortMode]);

  // Group into book sections so the list reads like a Bible, not a feed.
  const groups = useMemo(() => {
    if (sortMode !== 'canonical') return [{ key: '__recent', label: null, items: visible }];
    const out = [];
    let current = null;
    for (const h of visible) {
      if (!current || current.key !== h.bookCode) {
        current = { key: h.bookCode, label: CODE_TO_NAME[h.bookCode] || h.bookCode, items: [] };
        out.push(current);
      }
      current.items.push(h);
    }
    return out;
  }, [visible, sortMode]);

  const stats = useMemo(() => ({
    total: rows.length,
    books: booksPresent.length,
    notes: rows.filter((h) => h.note).length,
  }), [rows, booksPresent]);

  const openInReader = useCallback((verseId) => {
    const ref = verseIdToDisplay(verseId);
    if (ref) window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));
  }, []);

  const startEditing = (h) => {
    setEditing(h.verseId);
    setNoteDraft(h.note || '');
  };

  const saveNote = async () => {
    if (!editing) return;
    const verseId = editing;
    const trimmed = noteDraft.trim();
    const previous = rows;
    setBusyVerseId(verseId);
    setRows((current) => current.map((h) => (h.verseId === verseId ? { ...h, note: trimmed } : h)));
    const { error: writeError } = await supabase
      .from('verse_highlights')
      .update({ note: trimmed || null })
      .eq('user_id', userId)
      .eq('verse_id', verseId);
    setBusyVerseId(null);
    if (writeError) {
      setRows(previous);
      setError(writeError.message || 'Could not save your note.');
      return;
    }
    setEditing(null);
    setNoteDraft('');
  };

  const removeHighlight = async (verseId) => {
    const previous = rows;
    setBusyVerseId(verseId);
    setRows((current) => current.filter((h) => h.verseId !== verseId));
    const { error: writeError } = await supabase
      .from('verse_highlights')
      .delete()
      .eq('user_id', userId)
      .eq('verse_id', verseId);
    setBusyVerseId(null);
    setConfirmDelete(null);
    if (writeError) {
      setRows(previous);
      setError(writeError.message || 'Could not remove that highlight.');
    }
  };

  if (!hasSupabaseConfig || !userId) {
    return (
      <div className="hl-page">
        <p className="hl-empty">Sign in to see the verses you have highlighted.</p>
      </div>
    );
  }

  return (
    <div className="hl-page">
      <header className="hl-header">
        <div className="hl-title">
          <Highlighter size={20} />
          <h1>My Highlights</h1>
        </div>
        {!loading && stats.total > 0 && (
          <p className="hl-stats">
            <strong>{stats.total}</strong> {stats.total === 1 ? 'verse' : 'verses'}
            {' · '}<strong>{stats.books}</strong> {stats.books === 1 ? 'book' : 'books'}
            {stats.notes > 0 && <>{' · '}<strong>{stats.notes}</strong> with notes</>}
          </p>
        )}
      </header>

      {error && <p className="hl-error">{error}</p>}

      {loading ? (
        <p className="hl-empty"><Loader2 size={15} className="hl-spin" /> Loading your highlights…</p>
      ) : rows.length === 0 ? (
        <div className="hl-onboard">
          <Highlighter size={28} />
          <h2>Nothing highlighted yet</h2>
          <p>
            Open any passage, tap <strong>Highlight</strong> above the text, then tap a verse to mark it.
            Pick a colour for what it is — a promise, a command, something that convicts — and add a note
            if you want to remember why it stood out.
          </p>
          <p className="hl-onboard-note">
            Scripture references anywhere in the app open the reader, so you can highlight from a sermon,
            a reading plan, or a chat message.
          </p>
        </div>
      ) : (
        <>
          <div className="hl-controls">
            <div className="hl-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes and verses"
                aria-label="Search your highlights"
              />
            </div>

            <div className="hl-filter-row">
              <div className="hl-colors" role="group" aria-label="Filter by colour">
                <button
                  type="button"
                  className={`hl-color-chip${colorFilter === null ? ' selected' : ''}`}
                  onClick={() => setColorFilter(null)}
                  aria-pressed={colorFilter === null}
                >
                  All
                </button>
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`hl-color-chip bl-hl-${c.key}${colorFilter === c.key ? ' selected' : ''}`}
                    onClick={() => setColorFilter(colorFilter === c.key ? null : c.key)}
                    aria-pressed={colorFilter === c.key}
                    title={c.hint}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="hl-selects">
                <select
                  value={bookFilter}
                  onChange={(e) => setBookFilter(e.target.value)}
                  aria-label="Filter by book"
                >
                  <option value="">All books</option>
                  {booksPresent.map((b) => (
                    <option key={b.code} value={b.code}>{b.name} ({b.count})</option>
                  ))}
                </select>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  aria-label="Sort order"
                >
                  <option value="canonical">Genesis → Revelation</option>
                  <option value="recent">Most recent</option>
                </select>
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="hl-empty">Nothing matches those filters.</p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="hl-group">
                {group.label && <h2 className="hl-group-label">{group.label}</h2>}
                {group.items.map((h) => (
                  <article key={h.verseId} className={`hl-card bl-hl-${h.color}`}>
                    <div className="hl-card-head">
                      <button
                        type="button"
                        className="hl-ref"
                        onClick={() => openInReader(h.verseId)}
                        title="Open in the reader"
                        aria-label={`Open ${verseIdToDisplay(h.verseId)} in the reader`}
                      >
                        <BookOpen size={13} />
                        {verseIdToDisplay(h.verseId)}
                      </button>
                      <span className="hl-color-tag">{colorLabel(h.color)}</span>
                      <div className="hl-card-actions">
                        <button
                          type="button"
                          className={`hl-icon-btn${h.note ? ' has-note' : ''}`}
                          onClick={() => startEditing(h)}
                          title={h.note ? 'Edit your note' : 'Add a note'}
                          aria-label={`${h.note ? 'Edit' : 'Add'} note on ${verseIdToDisplay(h.verseId)}`}
                        >
                          <StickyNote size={14} />
                        </button>
                        {confirmDelete === h.verseId ? (
                          <span className="hl-confirm">
                            <button type="button" className="hl-confirm-yes" onClick={() => removeHighlight(h.verseId)}>
                              {busyVerseId === h.verseId ? <Loader2 size={12} className="hl-spin" /> : 'Remove'}
                            </button>
                            <button type="button" className="hl-icon-btn" onClick={() => setConfirmDelete(null)} aria-label="Keep highlight">
                              <X size={14} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="hl-icon-btn"
                            onClick={() => setConfirmDelete(h.verseId)}
                            title="Remove highlight"
                            aria-label={`Remove highlight on ${verseIdToDisplay(h.verseId)}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {h.verseText && <p className="hl-verse-text">{h.verseText}</p>}

                    {editing === h.verseId ? (
                      <div className="hl-note-edit">
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="What is this verse saying to you?"
                          rows={3}
                          autoFocus
                        />
                        <div className="hl-note-actions">
                          <button type="button" className="hl-btn-ghost" onClick={() => { setEditing(null); setNoteDraft(''); }}>
                            Cancel
                          </button>
                          <button type="button" className="hl-btn-primary" onClick={saveNote} disabled={busyVerseId === h.verseId}>
                            {busyVerseId === h.verseId ? 'Saving…' : 'Save note'}
                          </button>
                        </div>
                      </div>
                    ) : h.note ? (
                      <button type="button" className="hl-note" onClick={() => startEditing(h)}>
                        {h.note}
                      </button>
                    ) : null}
                  </article>
                ))}
              </section>
            ))
          )}

          {rows.length >= MAX_ROWS && (
            <p className="hl-empty">Showing your {MAX_ROWS} most recent highlights.</p>
          )}
        </>
      )}
    </div>
  );
}
