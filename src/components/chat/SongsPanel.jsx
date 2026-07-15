import { useEffect, useState } from 'react';
import { Music, X, Play, MessageSquare } from 'lucide-react';
import { playInMiniPlayer } from '../../lib/musicEmbed';
import { fetchLinkPreviewCached } from '../../lib/linkPreviewCache';
import { hasSupabaseConfig } from '../../lib/supabaseClient';

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SongsPanel({ songs, onClose, onJumpToMessage }) {
  return (
    <aside className="chat-songs-panel" aria-label="Songs posted in this channel">
      <header className="chat-member-panel-head">
        <div>
          <strong>Songs</strong>
          <span>{songs.length} posted</span>
        </div>
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
            <SongRow key={song.url} song={song} onJumpToMessage={onJumpToMessage} />
          ))
        )}
      </div>
    </aside>
  );
}

function SongRow({ song, onJumpToMessage }) {
  const [title, setTitle] = useState(null);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;
    let cancelled = false;
    fetchLinkPreviewCached(song.url).then((preview) => {
      if (!cancelled && preview?.title) setTitle(preview.title);
    });
    return () => { cancelled = true; };
  }, [song.url]);

  return (
    <div className="chat-song-row">
      <button
        type="button"
        className="chat-song-play"
        onClick={() => playInMiniPlayer(song.embed, song.url)}
        title="Play in mini-player"
        aria-label={`Play ${title || song.provider}`}
      >
        <Play size={15} />
      </button>
      <div className="chat-song-body">
        <span className="chat-song-title" title={title || song.url}>
          {title || song.url}
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
