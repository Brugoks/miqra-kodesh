import { useEffect, useRef, useState } from 'react';
import { Music, X, ChevronDown, ChevronUp } from 'lucide-react';
import './MiniPlayerDock.css';

const POS_KEY = 'miqra_miniplayer_pos';

function loadSavedPos() {
  try {
    const pos = JSON.parse(localStorage.getItem(POS_KEY));
    if (typeof pos?.x === 'number' && typeof pos?.y === 'number') return pos;
  } catch { /* corrupt or absent — fall back to default spot */ }
  return null;
}

// Floating music dock mounted at the app shell (outside the routes) so
// playback survives navigation. Chat link previews dispatch
// `miniplayer:play` with { src, provider, height }; the iframe lives here
// and is never unmounted by route changes. Minimizing collapses the frame
// visually but keeps the iframe mounted so audio keeps playing.
//
// The dock is draggable by its title bar (pointer events, so mouse and
// touch both work). Until dragged it sits centered under the topbar via
// CSS; once dragged, the position is clamped to the viewport and saved.
export default function MiniPlayerDock() {
  const [track, setTrack] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState(loadSavedPos);
  const dockRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const onPlay = (e) => {
      if (!e.detail?.src) return;
      setTrack(e.detail);
      setMinimized(false);
    };
    window.addEventListener('miniplayer:play', onPlay);
    return () => window.removeEventListener('miniplayer:play', onPlay);
  }, []);

  // Keep the bar reachable if the window shrinks under a saved position.
  useEffect(() => {
    if (!pos) return undefined;
    const onResize = () => setPos((p) => (p ? clampToViewport(p.x, p.y, dockRef.current) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos]);

  if (!track) return null;

  const height = track.height || 152;

  const startDrag = (e) => {
    if (e.target.closest('button')) return;
    const rect = dockRef.current.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDrag = (e) => {
    if (!dragRef.current) return;
    setPos(clampToViewport(
      e.clientX - dragRef.current.dx,
      e.clientY - dragRef.current.dy,
      dockRef.current,
    ));
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPos((p) => {
      if (p) {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* storage full/blocked */ }
      }
      return p;
    });
  };

  return (
    <div
      ref={dockRef}
      className="miniplayer"
      style={pos ? { top: pos.y, left: pos.x, transform: 'none' } : undefined}
      role="region"
      aria-label="Music mini-player"
    >
      <div
        className="miniplayer-bar"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Music size={13} aria-hidden="true" />
        <span className="miniplayer-title">{track.provider}</span>
        <button
          type="button"
          className="miniplayer-btn"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Expand player' : 'Minimize player'}
        >
          {minimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
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

function clampToViewport(x, y, el) {
  const width = el?.offsetWidth || 380;
  const barHeight = 40;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - barHeight - 8)),
  };
}
