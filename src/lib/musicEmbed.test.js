import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  musicEmbedFor,
  autoplaySrc,
  queueItem,
  playInMiniPlayer,
  playQueueInMiniPlayer,
  isPreviewLimited,
  youtubeQueueItem,
} from './musicEmbed';

function captureQueueEvents() {
  const events = [];
  const handler = (e) => events.push(e.detail);
  window.addEventListener('miniplayer:queue', handler);
  return {
    events,
    stop: () => window.removeEventListener('miniplayer:queue', handler),
  };
}

describe('musicEmbed queue', () => {
  let capture;

  beforeEach(() => { capture = captureQueueEvents(); });
  afterEach(() => capture.stop());

  const spotify = musicEmbedFor('https://open.spotify.com/track/abc123');
  const youtube = musicEmbedFor('https://www.youtube.com/watch?v=vid123');

  describe('queueItem', () => {
    it('carries the spotify uri so the dock can build a controller', () => {
      const item = queueItem(spotify, 'https://open.spotify.com/track/abc123');
      expect(item.provider).toBe('Spotify');
      expect(item.spotifyUri).toBe('spotify:track:abc123');
    });

    it('uses the autoplay src so a queued song starts on its own', () => {
      const item = queueItem(youtube, 'https://www.youtube.com/watch?v=vid123');
      expect(item.src).toContain('autoplay=1');
      expect(item.src).toContain('enablejsapi=1');
    });
  });

  describe('playInMiniPlayer', () => {
    it('sends a single song as a one-item queue, so nothing follows it', () => {
      playInMiniPlayer(youtube, 'https://www.youtube.com/watch?v=vid123');
      expect(capture.events).toHaveLength(1);
      expect(capture.events[0].items).toHaveLength(1);
      expect(capture.events[0].startIndex).toBe(0);
    });
  });

  describe('playQueueInMiniPlayer', () => {
    const items = [
      queueItem(youtube, 'a'),
      queueItem(youtube, 'b'),
      queueItem(youtube, 'c'),
    ];

    it('starts at the requested index', () => {
      playQueueInMiniPlayer(items, 1);
      expect(capture.events[0].startIndex).toBe(1);
      expect(capture.events[0].items).toHaveLength(3);
    });

    it('clamps an out-of-range start rather than docking nothing', () => {
      playQueueInMiniPlayer(items, 99);
      playQueueInMiniPlayer(items, -4);
      expect(capture.events[0].startIndex).toBe(2);
      expect(capture.events[1].startIndex).toBe(0);
    });

    it('ignores an empty queue', () => {
      playQueueInMiniPlayer([], 0);
      playQueueInMiniPlayer(undefined, 0);
      expect(capture.events).toHaveLength(0);
    });
  });

  describe('isPreviewLimited', () => {
    // Spotify and Apple Music only play 30s to a listener who isn't signed in
    // to that service, so those are the ones worth resolving to YouTube.
    it('flags the DRM-limited providers only', () => {
      expect(isPreviewLimited('Spotify')).toBe(true);
      expect(isPreviewLimited('Apple Music')).toBe(true);
      expect(isPreviewLimited('YouTube')).toBe(false);
      expect(isPreviewLimited('SoundCloud')).toBe(false);
    });
  });

  describe('youtubeQueueItem', () => {
    it('keeps the original url and notes what it stood in for', () => {
      const item = youtubeQueueItem('vid456', {
        url: 'https://open.spotify.com/track/abc123',
        title: 'Anchor',
        resolvedFrom: 'Spotify',
      });
      expect(item.provider).toBe('YouTube');
      expect(item.videoId).toBe('vid456');
      expect(item.resolvedFrom).toBe('Spotify');
      // The source url is preserved so the dock still looks up the real song
      // title and "open in Spotify" keeps working.
      expect(item.url).toBe('https://open.spotify.com/track/abc123');
    });

    it('builds a js-api-enabled src the dock can drive', () => {
      const item = youtubeQueueItem('vid456', { url: 'x' });
      expect(item.src).toContain('/embed/vid456');
      expect(item.src).toContain('enablejsapi=1');
    });
  });

  describe('autoplaySrc', () => {
    it('flips SoundCloud auto_play on', () => {
      const sc = musicEmbedFor('https://soundcloud.com/artist/song');
      expect(autoplaySrc(sc)).toContain('auto_play=true');
      expect(autoplaySrc(sc)).not.toContain('auto_play=false');
    });

    it('leaves Spotify untouched — its controller starts playback instead', () => {
      expect(autoplaySrc(spotify)).toBe(spotify.src);
    });
  });
});
