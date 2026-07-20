import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { loadBibleWiki } from '../../lib/bibleWiki';
import ReelsExplore from './ReelsExplore';
import ReelsQuiz from './ReelsQuiz';
import './CharacterReels.css';

// Character Reels shell: an immersive full-screen route (Layout hides its
// chrome) with two modes — Explore (the scroll feed) and Play (the quiz).
// The Exit chip and mode toggle live here; each mode renders inside.
export default function CharacterReels() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [wiki, setWiki] = useState(null);
  const [mode, setMode] = useState(() => (searchParams.get('mode') === 'play' ? 'play' : 'explore'));

  useEffect(() => {
    let cancelled = false;
    loadBibleWiki().then((w) => { if (!cancelled) setWiki(w); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="reels-page">
      <button type="button" className="reels-back" onClick={() => navigate('/wiki')}>
        <X size={16} /> Exit
      </button>

      <div className="reels-mode" role="tablist" aria-label="Reels mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'explore'}
          className={mode === 'explore' ? 'active' : ''}
          onClick={() => setMode('explore')}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'play'}
          className={mode === 'play' ? 'active' : ''}
          onClick={() => setMode('play')}
        >
          Play
        </button>
      </div>

      {!wiki ? (
        <p className="reels-empty">Loading…</p>
      ) : mode === 'explore' ? (
        <ReelsExplore wiki={wiki} />
      ) : (
        <ReelsQuiz wiki={wiki} />
      )}
    </div>
  );
}
