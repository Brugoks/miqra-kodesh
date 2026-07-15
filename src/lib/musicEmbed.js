// Music-link detection + mini-player dispatch, shared by the chat link
// previews (SmartLinkPreview) and the channel Songs panel. Recognizes
// Spotify, Apple Music, YouTube / YouTube Music, and SoundCloud URLs.

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

// Returns an embed descriptor for a music URL, or null if the URL isn't a
// recognized music link.
export function musicEmbedFor(rawUrl) {
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
        spotifyUri: `spotify:${type}:${id}`,
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

// Where the embed supports it, start playback immediately — the click that
// triggers this is the user gesture browsers require for audible autoplay.
// YouTube also gets enablejsapi + origin so the mini-player dock can
// pause/resume it via postMessage.
export function autoplaySrc(embed) {
  if (embed.provider === 'YouTube' || embed.provider === 'YouTube Music') {
    return `${embed.src}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  }
  if (embed.provider === 'SoundCloud') {
    return embed.src.replace('auto_play=false', 'auto_play=true');
  }
  return embed.src;
}

// Hand an embed off to the persistent mini-player dock (MiniPlayerDock).
export function playInMiniPlayer(embed, url) {
  window.dispatchEvent(new CustomEvent('miniplayer:play', {
    detail: {
      src: autoplaySrc(embed),
      provider: embed.provider,
      height: embed.height,
      url,
      spotifyUri: embed.spotifyUri || null,
    },
  }));
}
