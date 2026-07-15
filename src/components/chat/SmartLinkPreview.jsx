import { useMemo, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import LinkPreview from '../LinkPreview';

const SPOTIFY_TYPES = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);

function parseYouTubeId(url) {
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
  if (url.hostname.endsWith('youtube.com')) {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || null;
  }
  return null;
}

function musicEmbedFor(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'open.spotify.com') {
    const [type, id] = url.pathname.split('/').filter(Boolean);
    if (SPOTIFY_TYPES.has(type) && id) {
      return {
        provider: 'Spotify',
        src: `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}`,
        height: type === 'track' || type === 'episode' ? 152 : 352,
      };
    }
  }

  if (host === 'music.apple.com') {
    url.hostname = 'embed.music.apple.com';
    return {
      provider: 'Apple Music',
      src: url.href,
      height: 175,
    };
  }

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const videoId = parseYouTubeId(url);
    if (videoId) {
      return {
        provider: host === 'music.youtube.com' ? 'YouTube Music' : 'YouTube',
        src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        height: 220,
      };
    }
  }

  if (host === 'soundcloud.com') {
    return {
      provider: 'SoundCloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`,
      height: 166,
    };
  }

  return null;
}

// Where the embed supports it, start playback immediately — the click on
// "Play" is the user gesture browsers require for audible autoplay.
function autoplaySrc(embed) {
  if (embed.provider === 'YouTube' || embed.provider === 'YouTube Music') {
    return `${embed.src}?autoplay=1`;
  }
  if (embed.provider === 'SoundCloud') {
    return embed.src.replace('auto_play=false', 'auto_play=true');
  }
  return embed.src;
}

export default function SmartLinkPreview({ url }) {
  const embed = useMemo(() => musicEmbedFor(url), [url]);
  const [sent, setSent] = useState(false);

  if (!embed) return <LinkPreview url={url} />;

  const playInDock = () => {
    window.dispatchEvent(new CustomEvent('miniplayer:play', {
      detail: { src: autoplaySrc(embed), provider: embed.provider, height: embed.height },
    }));
    setSent(true);
  };

  return (
    <div className="chat-media-preview">
      <div className="chat-media-preview-body">
        <span className="chat-media-preview-site">{embed.provider}</span>
        <strong>{sent ? 'Playing in mini-player' : 'Music player available'}</strong>
      </div>
      <button type="button" className="chat-media-load" onClick={playInDock}>
        <Play size={14} />
        Play
      </button>
      <a className="chat-media-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open in ${embed.provider}`}>
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
