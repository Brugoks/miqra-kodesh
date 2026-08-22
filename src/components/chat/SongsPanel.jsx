import { useCallback, useEffect, useMemo, useState } from 'react';
import { Music, X, Play, Pause, MessageSquare, ListMusic, Loader2 } from 'lucide-react';
import { playQueueInMiniPlayer, queueItem } from '../../lib/musicEmbed';
import { useMiniPlayerState, toggleMiniPlayer } from '../../lib/miniPlayerState';
import { fetchLinkPreviewCached } from '../../lib/linkPreviewCache';
import { hasSupabaseConfig } from '../../lib/supabaseClient';

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SongsPanel({ songs, onClose, onJumpToMessage }) {
  // The channel's songs ARE the playlist: oldest-first, so playing all works
  // through the channel the way it was posted rather than backwards.
  const playlist = useMemo(
    () => [...songs].reverse().map((song) => queueItem(song.embed, song.url)),
    [songs],
  );

  const player = useMiniPlayerState();

  // The list is the remote control: tapping the song that's already playing
  // pauses/resumes it, and tapping any other song starts there and continues
  // through the rest of the channel. On a phone the panel covers the screen, so
  // this has to work without reaching the dock underneath.
  const onRowPlay = useCallback(
    (url) => {
      if (player.url === url) {
        toggleMiniPlayer();
        return;
      }
      const start = playlist.findIndex((item) => item.url === url);
      playQueueInMiniPlayer(playlist, start < 0 ? 0 : start);
    },
    [playlist, player.url],
  );

  return (
    <aside className="chat-songs-panel" aria-label="Songs posted in this channel">
      <header className="chat-member-panel-head">
        <div>
          <strong>Songs</strong>
          <span>{songs.length} posted</span>
        </div>
        {songs.length > 0 && (
          <button
            type="button"
            className="chat-songs-playall"
            onClick={() => playQueueInMiniPlayer(playlist, 0)}
            title="Play every song in this channel"
          >
            <ListMusic size={14} />
            Play all
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close songs">
          <X size={18} />
        </button>
      </header>

      <div className="chat-member-panel-scroll">
        {songs.length === 0 ? (
          <div className="chat-songs-empty">
            <Music size={26} />
            <p>No songs posted yet.</p>
            <span>Share a Spotify, Apple Music, YouTube, or SoundCloud link in this channel and it&apos;ll show up here.</span>
          </div>
        ) : (
          songs.map((song) => (
            <SongRow
              key={song.url}
              song={song}
              isCurrent={player.url === song.url}
              isPlaying={player.url === song.url && player.isPlaying}
              isLoading={player.url === song.url && player.resolving}
              onPlay={onRowPlay}
              onJumpToMessage={onJumpToMessage}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function SongRow({ song, isCurrent, isPlaying, isLoading, onPlay, onJumpToMessage }) {
  const [title, setTitle] = useState(null);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;
    let cancelled = false;
    fetchLinkPreviewCached(song.url).then((preview) => {
      if (!cancelled && preview?.title) setTitle(preview.title);
    });
    return () => { cancelled = true; };
  }, [song.url]);

  // Matches the visible fallback: before the title loads the row shows its url,
  // so the accessible name must too — otherwise every row announces identically.
  const label = title || song.url;
  const action = isLoading
    ? `Loading ${label}`
    : isPlaying
      ? `Pause ${label}`
      : isCurrent
        ? `Resume ${label}`
        : `Play ${label} and everything after it`;

  return (
    <div className={`chat-song-row${isCurrent ? ' is-current' : ''}`}>
      <button
        type="button"
        className="chat-song-play"
        onClick={() => onPlay(song.url)}
        title={isPlaying ? 'Pause' : isCurrent ? 'Resume' : 'Play from here'}
        aria-label={action}
      >
        {isLoading ? (
          <Loader2 size={15} className="chat-song-spin" />
        ) : isPlaying ? (
          <Pause size={15} />
        ) : (
          <Play size={15} />
        )}
      </button>
      <div className="chat-song-body">
        <span className="chat-song-title" title={title || song.url}>
          {title || song.url}
          {isPlaying && <EqualizerBars />}
        </span>
        <span className="chat-song-meta">
          {song.provider} · {song.authorName} · {formatWhen(song.createdAt)}
        </span>
      </div>
      {onJumpToMessage && (
        <button
          type="button"
          className="chat-song-jump"
          onClick={() => onJumpToMessage(song.messageId)}
          title="Go to message"
          aria-label="Go to message"
        >
          <MessageSquare size={14} />
        </button>
      )}
    </div>
  );
}

function EqualizerBars() {
  return (
    <span className="chat-song-eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
