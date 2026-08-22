import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../lib/supabaseClient';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  chaptersCoveredBy,
  indexByVerseId,
  isValidColor,
  parseVerseId,
} from '../../lib/highlights';

const EMPTY = new Map();

// Personal verse highlights for whatever passage the reader is showing.
//
// Loads by (book, chapter) rather than by verse id: one filter per chapter
// covers ranges and bare-chapter lookups alike, and it matches the
// (user_id, book_code, chapter) index. Writes are optimistic — marking a verse
// has to feel instant — and roll back if the round trip fails.
export function useVerseHighlights(userId, passageIds) {
  // Loaded rows are stored with the key they belong to, so what the reader sees
  // is derived rather than assigned. That keeps the effect free of synchronous
  // setState and means a passage change cannot briefly show the previous
  // passage's highlights while the new ones are in flight.
  const [loaded, setLoaded] = useState({ key: null, map: EMPTY });
  const [error, setError] = useState('');
  // Guards against a slow response for a previous passage overwriting a newer one.
  const runIdRef = useRef(0);

  const enabled = Boolean(hasSupabaseConfig && userId);

  // Stable identity so the effect does not re-run on every parent render.
  const chapterKey = useMemo(() => (
    chaptersCoveredBy(passageIds)
      .map((c) => `${c.bookCode}.${c.chapter}`)
      .sort()
      .join(',')
  ), [passageIds]);

  const ready = loaded.key === chapterKey;
  const highlights = enabled && ready ? loaded.map : EMPTY;
  const loading = enabled && Boolean(chapterKey) && !ready;

  const setHighlights = useCallback((updater) => {
    setLoaded((current) => ({
      key: current.key,
      map: typeof updater === 'function' ? updater(current.map) : updater,
    }));
  }, []);

  useEffect(() => {
    if (!enabled || !chapterKey) return undefined;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let active = true;

    (async () => {
      const chapters = chapterKey.split(',').map((key) => {
        const [bookCode, chapter] = key.split('.');
        return { bookCode, chapter: Number(chapter) };
      });

      try {
        let query = supabase.from('verse_highlights').select('*').eq('user_id', userId);
        if (chapters.length === 1) {
          query = query.eq('book_code', chapters[0].bookCode).eq('chapter', chapters[0].chapter);
        } else {
          // Book codes are canonical ([A-Z0-9]{3}) and chapters are numbers, so
          // there is nothing user-controlled to escape in this filter string.
          query = query.or(chapters
            .map((c) => `and(book_code.eq.${c.bookCode},chapter.eq.${c.chapter})`)
            .join(','));
        }

        const { data, error: queryError } = await query;
        if (!active || runIdRef.current !== runId) return;

        setError(queryError ? (queryError.message || 'Could not load highlights.') : '');
        setLoaded({ key: chapterKey, map: queryError ? EMPTY : indexByVerseId(data) });
      } catch {
        // Highlights are an enhancement to the reader, never a prerequisite for
        // it. Mark the key as loaded-but-empty so the passage still renders.
        if (!active || runIdRef.current !== runId) return;
        setError('Could not load highlights.');
        setLoaded({ key: chapterKey, map: EMPTY });
      }
    })();

    return () => { active = false; };
  }, [enabled, userId, chapterKey]);

  // Apply, recolor, or clear one verse. Passing the color already on the verse
  // clears it, so the same tap that marks also unmarks.
  const toggleHighlight = useCallback(async (verseId, color = DEFAULT_HIGHLIGHT_COLOR, meta = {}) => {
    if (!enabled) return;
    const parsed = parseVerseId(verseId);
    if (!parsed) return;
    const nextColor = isValidColor(color) ? color : DEFAULT_HIGHLIGHT_COLOR;

    const existing = highlights.get(verseId);
    const clearing = existing && existing.color === nextColor;
    const previous = highlights;

    setHighlights((current) => {
      const next = new Map(current);
      if (clearing) next.delete(verseId);
      else {
        next.set(verseId, {
          ...(existing || {}),
          verseId,
          bookCode: parsed.bookCode,
          chapter: parsed.chapter,
          verse: parsed.verse,
          color: nextColor,
          note: existing?.note || '',
          verseText: meta.verseText ?? existing?.verseText ?? '',
          translation: meta.translation ?? existing?.translation ?? null,
        });
      }
      return next;
    });

    const { error: writeError } = clearing
      ? await supabase.from('verse_highlights').delete().eq('user_id', userId).eq('verse_id', verseId)
      : await supabase.from('verse_highlights').upsert({
        user_id: userId,
        verse_id: verseId,
        book_code: parsed.bookCode,
        chapter: parsed.chapter,
        verse: parsed.verse,
        color: nextColor,
        // Snapshot the text so a highlights list renders without re-fetching
        // every verse from the passage API.
        verse_text: meta.verseText ?? existing?.verseText ?? null,
        translation: meta.translation ?? existing?.translation ?? null,
        source: meta.source || 'reader',
      }, { onConflict: 'user_id,verse_id' });

    if (writeError) {
      setHighlights(previous); // roll back
      setError(writeError.message || 'Could not save highlight.');
    }
  }, [enabled, highlights, userId, setHighlights]);

  const saveNote = useCallback(async (verseId, note) => {
    if (!enabled) return;
    const existing = highlights.get(verseId);
    if (!existing) return;
    const previous = highlights;
    const trimmed = (note || '').trim();

    setHighlights((current) => {
      const next = new Map(current);
      next.set(verseId, { ...existing, note: trimmed });
      return next;
    });

    const { error: writeError } = await supabase
      .from('verse_highlights')
      .update({ note: trimmed || null })
      .eq('user_id', userId)
      .eq('verse_id', verseId);

    if (writeError) {
      setHighlights(previous);
      setError(writeError.message || 'Could not save note.');
    }
  }, [enabled, highlights, userId, setHighlights]);

  return { highlights, loading, error, enabled, toggleHighlight, saveNote };
}

export default useVerseHighlights;
