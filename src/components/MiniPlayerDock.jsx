import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, X, ChevronDown, ChevronUp, Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import { hasSupabaseConfig } from '../lib/supabaseClient';
import { fetchLinkPreviewCached } from '../lib/linkPreviewCache';
import { isPreviewLimited, youtubeQueueItem } from '../lib/musicEmbed';
import { resolveToYouTube, prefetchResolution } from '../lib/musicResolve';
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

function youtubeIdOf(item) {
  if (!item) return null;
  if (item.videoId) return item.videoId;
  if (!YT_PROVIDERS.has(item.provider)) return null;
  return item.src.match(/\/embed\/([^/?#]+)/)?.[1] || null;
}

// Floating music dock mounted at the app shell (outside the routes) so playback
// survives navigation. Callers dispatch `miniplayer:queue` with { items,
// startIndex }; the player lives here and is never unmounted by route changes.
// Minimizing collapses the frame visually but keeps it mounted so audio keeps
// playing.
//
// QUEUE: the dock plays a list, not a single song, and advances on its own when
// a track ends. YouTube -> YouTube advances reuse the live iframe via
// loadVideoById rather than remounting it, which keeps playback gapless and
// keeps the media-engagement gesture that lets the next track autoplay.
//
// FULL TRACKS: Spotify and Apple Music embeds only play 30-second previews
// unless the listener is signed in to that service (Premium, for Spotify), so
// those songs are resolved to their YouTube equivalent first — see
// lib/musicResolve.js. If resolution fails we fall back to the original embed,
// so playback degrades to today's preview rather than breaking.
//
// Playback control from the title bar, per provider:
//   YouTube    — enablejsapi postMessage commands + infoDelivery state
//   SoundCloud — widget postMessage toggle + play/pause events
//   Spotify    — official iFrame Embed API controller (plain iframe fallback)
//   Apple Music — no control API; the toggle button is hidden
//
// The dock is draggable by its title bar (pointer events, so mouse and touch
// both work). Until dragged it sits centered under the topbar via CSS; once
// dragged, the position is clamped to the viewport and saved.
export default function MiniPlayerDock() {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  // The item actually playing: the queue entry, or its YouTube stand-in.
  const [track, setTrack] = useState(null);
  const [resolving, setResolving] = useState(false);
  // The mounted iframe: { src, key }. Held separately from `track` because a
  // YouTube -> YouTube advance must leave BOTH untouched — React writing a new
  // src onto the live iframe would navigate it, undoing the gapless handoff.
  const [frame, setFrame] = useState(null);
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
  // What the live iframe currently holds, so we know whether the next song can
  // reuse it. Null whenever no iframe is mounted.
  const liveProviderRef = useRef(null);

  const hasQueue = queue.length > 1;

  const go = useCallback((nextIndex) => {
    setIndex((prev) => {
      if (nextIndex < 0 || nextIndex >= queue.length) return prev;
      return nextIndex;
    });
  }, [queue.length]);

  // Advance when a track finishes. At the end of the queue we simply stop and
  // leave the last song docked rather than closing the player out from under
  // the listener.
  const handleEnded = useCallback(() => {
    setIndex((prev) => {
      if (prev + 1 >= queue.length) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [queue.length]);

  useEffect(() => {
    const onQueue = (e) => {
      const items = e.detail?.items;
      if (!items?.length) return;
      setQueue(items);
      setIndex(e.detail.startIndex || 0);
      setMinimized(false);
    };
    window.addEventListener('miniplayer:queue', onQueue);
    return () => window.removeEventListener('miniplayer:queue', onQueue);
  }, []);

  // Resolve the current queue entry, then hand it to the player. Preview-limited
  // songs (Spotify, Apple Music) are re-pointed at YouTube so they play in full;
  // anything else plays as posted.
  useEffect(() => {
    const item = queue[index];
    // Only ever empty right after close(), which clears `track` itself.
    if (!item) return undefined;

    let cancelled = false;

    const start = (resolved) => {
      if (cancelled) return;
      setTitle(item.title || null);
      setSpotifyFailed(false);
      setTrack(resolved);
      // Everything but Spotify arrives with autoplay; Spotify's controller
      // reports its real state via playback_update.
      setIsPlaying(resolved.provider !== 'Spotify');
      setResolving(false);
      // Reuse the live iframe only for YouTube -> YouTube; every other
      // transition needs a fresh frame.
      const canReuse = YT_PROVIDERS.has(resolved.provider) && liveProviderRef.current === 'YouTube';
      if (canReuse) {
        const videoId = youtubeIdOf(resolved);
        const win = iframeRef.current?.contentWindow;
        if (videoId && win) {
          win.postMessage(
            JSON.stringify({ event: 'command', func: 'loadVideoById', args: [videoId] }),
            'https://www.youtube.com',
          );
          return;
        }
      }
      setFrame((prev) => ({ src: resolved.src, key: (prev?.key || 0) + 1 }));
    };

    if (!isPreviewLimited(item.provider)) {
      // Deferred to a microtask — sync setState in an effect body trips the lint
      // rule; the resolved path is already async.
      Promise.resolve().then(() => start(item));
    } else {
      Promise.resolve().then(() => { if (!cancelled) setResolving(true); });
      resolveToYouTube(item.url).then((videoId) => {
        if (cancelled) return;
        start(
          videoId
            ? youtubeQueueItem(videoId, {
              url: item.url,
              title: item.title,
              resolvedFrom: item.provider,
            })
            // No YouTube match — fall back to the original embed. That is a
            // 30-second preview, but it is what would have played anyway.
            : item,
        );
      });
    }

    // Warm the next song's resolution so the handoff isn't a visible pause.
    const next = queue[index + 1];
    if (next && isPreviewLimited(next.provider)) prefetchResolution(next.url);

    return () => { cancelled = true; };
  }, [queue, index]);

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

  // Anything that starts its own audio (e.g. unmuting Character Reels)
  // dispatches 'miniplayer:pause' so the two soundtracks don't compete.
  useEffect(() => {
    if (!track) return undefined;
    const onPause = () => {
      if (track.provider === 'Spotify') {
        spotifyControllerRef.current?.pause?.();
        return; // playback_update drives the icon
      }
      const frame = iframeRef.current?.contentWindow;
      if (!frame) return;
      if (YT_PROVIDERS.has(track.provider)) {
        frame.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          'https://www.youtube.com',
        );
        setIsPlaying(false);
      } else if (track.provider === 'SoundCloud') {
        frame.postMessage(JSON.stringify({ method: 'pause' }), 'https://w.soundcloud.com');
      }
    };
    window.addEventListener('miniplayer:pause', onPause);
    return () => window.removeEventListener('miniplayer:pause', onPause);
  }, [track]);

  // Playback state reported back by YouTube / SoundCloud embeds. State 0 (ENDED)
  // and SoundCloud's 'finish' are what drive the queue forward.
  useEffect(() => {
    if (!track) return undefined;
    const onMessage = (e) => {
      let data = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (YT_PROVIDERS.has(track.provider) && e.origin.endsWith('youtube.com')) {
        const state = data?.info?.playerState;
        if (typeof state !== 'number') return;
        if (state === 0) handleEnded();
        else setIsPlaying(state === 1 || state === 3);
      } else if (track.provider === 'SoundCloud' && e.origin.includes('soundcloud.com')) {
        if (data?.method === 'ready') {
          for (const event of ['play', 'pause', 'finish']) {
            e.source?.postMessage(JSON.stringify({ method: 'addEventListener', value: event }), e.origin);
          }
        }
        if (data?.method === 'play') setIsPlaying(true);
        if (data?.method === 'pause') setIsPlaying(false);
        if (data?.method === 'finish') { setIsPlaying(false); handleEnded(); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [track, handleEnded]);

  // Spotify controller lifecycle — created per docked Spotify track. Only
  // reached when resolution found no YouTube match, so this is the 30-second
  // preview fallback.
  useEffect(() => {
    if (track?.provider !== 'Spotify' || !track.spotifyUri) return undefined;
    let cancelled = false;
    const fallback = setTimeout(() => setSpotifyFailed(true), 6000);
    liveProviderRef.current = null; // not an iframe we can hand the next song to
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
            controller.addListener('playback_update', (e) => {
              setIsPlaying(!e.data.isPaused);
              // Spotify has no "ended" event. A preview stops well short of the
              // reported duration, so only a genuine full play advances the
              // queue; otherwise the listener uses Next.
              const { position, duration, isPaused } = e.data;
              if (isPaused && duration > 0 && position >= duration - 1500) handleEnded();
            });
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
  }, [track, handleEnded]);

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

  const close = () => {
    setQueue([]);
    setIndex(0);
    setTrack(null);
    setFrame(null);
    liveProviderRef.current = null;
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

  const label = title || track.provider;
  const position = hasQueue ? `${index + 1} of ${queue.length}` : null;

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
        <span className="miniplayer-title" title={position ? `${label} — ${position}` : label}>
          {label}
          {position && <span className="miniplayer-pos">{position}</span>}
        </span>
        {hasQueue && (
          <button
            type="button"
            className="miniplayer-btn"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous song"
          >
            <SkipBack size={14} />
          </button>
        )}
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
        {hasQueue && (
          <button
            type="button"
            className="miniplayer-btn"
            onClick={() => go(index + 1)}
            disabled={index >= queue.length - 1}
            aria-label="Next song"
          >
            <SkipForward size={14} />
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
          onClick={close}
          aria-label="Close player"
        >
          <X size={14} />
        </button>
      </div>
      <div className="miniplayer-frame" style={{ height: minimized ? 0 : height }}>
        {resolving && (
          <div className="miniplayer-resolving">
            <Loader2 size={16} className="miniplayer-spin" />
            <span>Finding the full song…</span>
          </div>
        )}
        {isSpotify ? (
          <div ref={spotifyBoxRef} key={track.spotifyUri} className="miniplayer-spotify" />
        ) : (
          <iframe
            ref={iframeRef}
            key={frame?.key}
            title={`${track.provider} player`}
            src={frame?.src}
            height={height}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            onLoad={() => {
              liveProviderRef.current = YT_PROVIDERS.has(track.provider) ? 'YouTube' : track.provider;
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
