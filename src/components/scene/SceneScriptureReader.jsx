import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2, MapPin, RefreshCw, X,
} from 'lucide-react';
import { fetchHelloaoPassage } from '../../lib/helloao';
import { splitContentVerses } from '../../lib/scripture';
import { readerLocationForRef, scenePlacesForVerse } from '../../lib/sceneScriptureJourney';
import './SceneScriptureReader.css';

const TRANSLATIONS = [
  { id: 'BSB', label: 'BSB' },
  { id: 'eng_kjv', label: 'KJV' },
];
const TRANSLATION_KEY = 'sceneScriptureTranslation';

function storedTranslation() {
  try {
    const saved = localStorage.getItem(TRANSLATION_KEY);
    return TRANSLATIONS.some((translation) => translation.id === saved) ? saved : TRANSLATIONS[0].id;
  } catch {
    return TRANSLATIONS[0].id;
  }
}

export default function SceneScriptureReader({ scene, focus, initialRef, onFocus, onClear, onClose }) {
  const journey = scene.scriptureJourney;
  const entry = readerLocationForRef(initialRef, journey.bookCode);
  const entryChapter = journey.chapters.some((item) => item.number === entry?.chapter)
    ? entry.chapter
    : null;
  const [chapter, setChapter] = useState(entryChapter || journey.defaultChapter || journey.chapters[0].number);
  const [translation, setTranslation] = useState(storedTranslation);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('loading');
  const [reload, setReload] = useState(0);
  const [activeVerse, setActiveVerse] = useState(entryChapter ? entry?.verse : null);
  const activeRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(TRANSLATION_KEY, translation); } catch { /* storage is optional */ }
  }, [translation]);

  // A second Scripture Lookup jump can happen while the visitor is already in
  // this same scene. Resume the newly selected passage without remounting the
  // WebGL world or making them reopen the reading rail.
  useEffect(() => {
    const next = readerLocationForRef(initialRef, journey.bookCode);
    if (!next || !journey.chapters.some((item) => item.number === next.chapter)) return;
    Promise.resolve().then(() => {
      setChapter(next.chapter);
      setActiveVerse(next.verse);
    });
  }, [initialRef, journey.bookCode, journey.chapters]);

  useEffect(() => {
    let cancelled = false;
    // Defer the state transition so changing a chapter paints once, then the
    // async load owns the reader state rather than cascading inside the effect.
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setStatus('loading');
      setContent('');
      try {
        const text = await fetchHelloaoPassage(
          translation,
          `${journey.bookCode}.${chapter}`,
          chapter,
        );
        if (cancelled) return;
        setContent(text);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    });
    return () => { cancelled = true; };
  }, [chapter, journey.bookCode, reload, translation]);

  const verses = useMemo(() => splitContentVerses(content, chapter).map((verse) => ({
    ...verse,
    places: scenePlacesForVerse(scene.slug, `${journey.bookCode}.${chapter}.${verse.verse}`),
  })), [chapter, content, journey.bookCode, scene.slug]);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeVerse, content]);

  const activate = useCallback((verse, place = verse.places[0]) => {
    setActiveVerse(verse.verse);
    if (place) onFocus(place, verse.verse);
  }, [onFocus]);

  const step = (direction) => {
    if (!verses.length) return;
    const current = verses.findIndex((verse) => verse.verse === activeVerse);
    const index = current < 0
      ? (direction > 0 ? 0 : verses.length - 1)
      : Math.min(verses.length - 1, Math.max(0, current + direction));
    activate(verses[index]);
  };

  const chapterMeta = journey.chapters.find((item) => item.number === chapter);
  const activeIndex = verses.findIndex((verse) => verse.verse === activeVerse);

  return (
    <aside className="scene-scripture" aria-label="Read Scripture in the scene">
      <header className="scene-scripture-header">
        <div>
          <p className="scene-scripture-kicker"><BookOpen size={13} /> Scripture journey</p>
          <h2>{journey.title}</h2>
        </div>
        <button type="button" className="scene-scripture-close" aria-label="Close Scripture" onClick={onClose}>
          <X size={17} />
        </button>
      </header>

      <div className="scene-scripture-chapters" role="group" aria-label="Choose a chapter">
        {journey.chapters.map((item) => (
          <button
            key={item.number}
            type="button"
            className={item.number === chapter ? 'active' : ''}
            aria-pressed={item.number === chapter}
            title={item.label}
            onClick={() => {
              onClear();
              setActiveVerse(null);
              setChapter(item.number);
            }}
          >
            {item.number}
          </button>
        ))}
      </div>

      <div className="scene-scripture-context">
        <div>
          <strong>{journey.bookName} {chapter}</strong>
          <span>{chapterMeta?.label}</span>
        </div>
        <label>
          <span className="sr-only">Translation</span>
          <select value={translation} onChange={(event) => setTranslation(event.target.value)}>
            {TRANSLATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <p className="scene-scripture-guide">
        <MapPin size={13} /> Tap a verse with a gold place marker and the scene will take you there.
      </p>

      <div className="scene-scripture-body" aria-live="polite">
        {status === 'loading' && (
          <div className="scene-scripture-state"><Loader2 className="scene-spin" size={20} /> Opening the scroll…</div>
        )}
        {status === 'error' && (
          <div className="scene-scripture-state">
            <p>The passage could not be loaded.</p>
            <button type="button" onClick={() => setReload((value) => value + 1)}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}
        {status === 'ready' && verses.map((verse) => {
          const active = verse.verse === activeVerse;
          return (
            <article
              key={verse.verse}
              ref={active ? activeRef : null}
              className={`scene-scripture-verse${active ? ' active' : ''}`}
            >
              <button type="button" className="scene-scripture-verse-text" onClick={() => activate(verse)}>
                <sup>{verse.verse}</sup>
                <span>{verse.text}</span>
              </button>
              {verse.places.length > 0 && (
                <div className="scene-scripture-places" aria-label={`Places in verse ${verse.verse}`}>
                  {verse.places.map((place) => {
                    const selected = focus?.kind === place.kind && focus?.id === place.id;
                    return (
                      <button
                        key={place.path}
                        type="button"
                        className={selected ? 'active' : ''}
                        aria-pressed={selected}
                        onClick={() => activate(verse, place)}
                      >
                        <MapPin size={12} /> {place.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <footer className="scene-scripture-footer">
        <button type="button" disabled={activeIndex <= 0} onClick={() => step(-1)}>
          <ChevronLeft size={15} /> Previous
        </button>
        <span>{activeVerse ? `Verse ${activeVerse}` : 'Choose a verse'}</span>
        <button type="button" disabled={activeIndex === verses.length - 1} onClick={() => step(1)}>
          Next <ChevronRight size={15} />
        </button>
      </footer>
    </aside>
  );
}
