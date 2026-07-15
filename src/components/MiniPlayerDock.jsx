import { useEffect, useState } from 'react';
import { Music, X, ChevronDown, ChevronUp } from 'lucide-react';
import './MiniPlayerDock.css';

// Floating music dock mounted at the app shell (outside the routes) so
// playback survives navigation. Chat link previews dispatch
// `miniplayer:play` with { src, provider, height }; the iframe lives here
// and is never unmounted by route changes. Minimizing collapses the frame
// visually but keeps the iframe mounted so audio keeps playing.
export default function MiniPlayerDock() {
  const [track, setTrack] = useState(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const onPlay = (e) => {
      if (!e.detail?.src) return;
      setTrack(e.detail);
      setMinimized(false);
    };
    window.addEventListener('miniplayer:play', onPlay);
    return () => window.removeEventListener('miniplayer:play', onPlay);
  }, []);

  if (!track) return null;

  const height = track.height || 152;

  return (
    <div className="miniplayer" role="region" aria-label="Music mini-player">
      <div className="miniplayer-bar">
        <Music size={13} aria-hidden="true" />
        <span className="miniplayer-title">{track.provider}</span>
        <button
          type="button"
          className="miniplayer-btn"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Expand player' : 'Minimize player'}
        >
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          className="miniplayer-btn"
          onClick={() => setTrack(null)}
          aria-label="Close player"
        >
          <X size={14} />
        </button>
      </div>
      <div className="miniplayer-frame" style={{ height: minimized ? 0 : height }}>
        <iframe
          title={`${track.provider} player`}
          src={track.src}
          height={height}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      </div>
    </div>
  );
}
