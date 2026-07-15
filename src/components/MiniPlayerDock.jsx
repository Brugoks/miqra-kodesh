import { useEffect, useRef, useState } from 'react';
import { Music, X, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react';
import { hasSupabaseConfig } from '../lib/supabaseClient';
import { fetchLinkPreviewCached } from '../lib/linkPreviewCache';
import './MiniPlayerDock.css';

const POS_KEY = 'miqra_miniplayer_pos';

function loadSavedPos() {
  try {
    const pos = JSON.parse(localStorage.getItem(POS_KEY));
    if (typeof pos?.x === 'number' && typeof pos?.y === 'number') return pos;
  } catch { /* corrupt or absent — fall back to default spot */ }
  return null;
}

// Spotify's iFrame Embed API script resolves a controller factory. Loaded
// lazily, once, and only when a Spotify track is actually docked.
let spotifyApiPromise = null;
function getSpotifyIframeApi() {
  if (!spotifyApiPromise) {
    spotifyApiPromise = new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = (api) => resolve(api);
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.onerror = () => reject(new Error('Spotify embed API failed to load'));
      document.body.appendChild(script);
    });
  }
  return spotifyApiPromise;
}

const YT_PROVIDERS = new Set(['YouTube', 'YouTube Music']);

// Floating music dock mounted at the app shell (outside the routes) so
// playback survives navigation. Chat link previews dispatch
// `miniplayer:play` with { src, provider, height, url, spotifyUri }; the
// player lives here and is never unmounted by route changes. Minimizing
// collapses the frame visually but keeps it mounted so audio keeps playing.
//
// Playback control from the title bar, per provider:
//   YouTube    — enablejsapi postMessage commands + infoDelivery state
//   SoundCloud — widget postMessage toggle + play/pause events
//   Spotify    — official iFrame Embed API controller (plain iframe fallback)
//   Apple Music — no control API; the toggle button is hidden
//
// The dock is draggable by its title bar (pointer events, so mouse and
// touch both work). Until dragged it sits centered under the topbar via
// CSS; once dragged, the position is clamped to the viewport and saved.
export default function MiniPlayerDock() {
  const [track, setTrack] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState(loadSavedPos);
  const [title, setTitle] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [spotifyFailed, setSpotifyFailed] = useState(false);
  const dockRef = useRef(null);
  const dragRef = useRef(null);
  const iframeRef = useRef(null);
  const spotifyBoxRef = useRef(null);
  const spotifyControllerRef = useRef(null);

  useEffect(() => {
    const onPlay = (e) => {
      if (!e.detail?.src) return;
      setTrack(e.detail);
      setMinimized(false);
      setTitle(null);
      setSpotifyFailed(false);
      // Everything but Spotify arrives with autoplay; Spotify's controller
      // reports its real state via playback_update.
      setIsPlaying(e.detail.provider !== 'Spotify');
    };
    window.addEventListener('miniplayer:play', onPlay);
    return () => window.removeEventListener('miniplayer:play', onPlay);
  }, []);

  // Song title from the shared link's Open Graph metadata, via the same
  // session-cached lookup the chat preview cards use.
  useEffect(() => {
    if (!track?.url || !hasSupabaseConfig) return undefined;
    let cancelled = false;
    fetchLinkPreviewCached(track.url).then((preview) => {
      if (!cancelled && preview?.title) setTitle(preview.title);
    });
    return () => { cancelled = true; };
  }, [track?.url]);

  // Playback state reported back by YouTube / SoundCloud embeds.
  useEffect(() => {
    if (!track) return undefined;
    const onMessage = (e) => {
      let data = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (YT_PROVIDERS.has(track.provider) && e.origin.endsWith('youtube.com')) {
        const state = data?.info?.playerState;
        if (typeof state === 'number') setIsPlaying(state === 1 || state === 3);
      } else if (track.provider === 'SoundCloud' && e.origin.includes('soundcloud.com')) {
        if (data?.method === 'ready') {
          for (const event of ['play', 'pause', 'finish']) {
            e.source?.postMessage(JSON.stringify({ method: 'addEventListener', value: event }), e.origin);
          }
        }
        if (data?.method === 'play') setIsPlaying(true);
        if (data?.method === 'pause' || data?.method === 'finish') setIsPlaying(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [track]);

  // Spotify controller lifecycle — created per docked Spotify track.
  useEffect(() => {
    if (track?.provider !== 'Spotify' || !track.spotifyUri) return undefined;
    let cancelled = false;
    const fallback = setTimeout(() => setSpotifyFailed(true), 6000);
    getSpotifyIframeApi()
      .then((api) => {
        if (cancelled || !spotifyBoxRef.current) return;
        const mount = document.createElement('div');
        spotifyBoxRef.current.appendChild(mount);
        api.createController(
          mount,
          { uri: track.spotifyUri, width: '100%', height: track.height || 152 },
          (controller) => {
            if (cancelled) { controller.destroy(); return; }
            clearTimeout(fallback);
            spotifyControllerRef.current = controller;
            controller.addListener('playback_update', (e) => setIsPlaying(!e.data.isPaused));
            controller.play(); // best effort — browsers may still require a tap
          },
        );
      })
      .catch(() => setSpotifyFailed(true));
    const box = spotifyBoxRef.current;
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      spotifyControllerRef.current?.destroy();
      spotifyControllerRef.current = null;
      if (box) box.innerHTML = '';
    };
  }, [track]);

  // Keep the bar reachable if the window shrinks under a saved position.
  useEffect(() => {
    if (!pos) return undefined;
    const onResize = () => setPos((p) => (p ? clampToViewport(p.x, p.y, dockRef.current) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos]);

  if (!track) return null;

  const height = track.height || 152;
  const isSpotify = track.provider === 'Spotify' && track.spotifyUri && !spotifyFailed;
  const controllable = track.provider !== 'Apple Music' && !(track.provider === 'Spotify' && !isSpotify);

  const togglePlayback = () => {
    if (isSpotify) {
      spotifyControllerRef.current?.togglePlay();
      return; // playback_update drives the icon
    }
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    if (YT_PROVIDERS.has(track.provider)) {
      frame.postMessage(
        JSON.stringify({ event: 'command', func: isPlaying ? 'pauseVideo' : 'playVideo', args: [] }),
        'https://www.youtube.com',
      );
    } else if (track.provider === 'SoundCloud') {
      frame.postMessage(JSON.stringify({ method: 'toggle' }), 'https://w.soundcloud.com');
    }
    setIsPlaying((p) => !p);
  };

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
        <span className="miniplayer-title" title={title || track.provider}>
          {title || track.provider}
        </span>
        {controllable && (
          <button
            type="button"
            className="miniplayer-btn"
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}
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
        {isSpotify ? (
          <div ref={spotifyBoxRef} key={track.spotifyUri} className="miniplayer-spotify" />
        ) : (
          <iframe
            ref={iframeRef}
            key={track.src}
            title={`${track.provider} player`}
            src={track.src}
            height={height}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            onLoad={() => {
              // YouTube only streams state after a listening handshake.
              if (YT_PROVIDERS.has(track.provider)) {
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'listening', id: 'miniplayer', channel: 'widget' }),
                  'https://www.youtube.com',
                );
              }
            }}
          />
        )}
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
