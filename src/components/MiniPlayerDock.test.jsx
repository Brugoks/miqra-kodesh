import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MiniPlayerDock from './MiniPlayerDock';
import { queueItem, musicEmbedFor } from '../lib/musicEmbed';
import { resolveToYouTube } from '../lib/musicResolve';
import { getMiniPlayerState, toggleMiniPlayer } from '../lib/miniPlayerState';

vi.mock('../lib/musicResolve', () => ({
  resolveToYouTube: vi.fn(() => Promise.resolve(null)),
  prefetchResolution: vi.fn(),
}));

// The dock looks up song titles through this; keep it quiet and predictable.
vi.mock('../lib/linkPreviewCache', () => ({
  fetchLinkPreviewCached: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: false,
  supabase: {},
}));

const yt = (id) => queueItem(musicEmbedFor(`https://www.youtube.com/watch?v=${id}`), `https://yt/${id}`);
const spotify = (id) => queueItem(musicEmbedFor(`https://open.spotify.com/track/${id}`), `https://sp/${id}`);

async function dispatchQueue(items, startIndex = 0) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('miniplayer:queue', { detail: { items, startIndex } }));
    await Promise.resolve();
  });
}

// Fake the YouTube iframe's postMessage channel so the dock's commands land
// somewhere inspectable, and so ENDED can be replayed back at it.
function stubYouTubeFrame() {
  const posted = [];
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      return { postMessage: (msg) => posted.push(typeof msg === 'string' ? JSON.parse(msg) : msg) };
    },
  });
  return posted;
}

async function sendYouTubeState(playerState) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({ info: { playerState } }),
    }));
    await Promise.resolve();
  });
}

describe('MiniPlayerDock', () => {
  beforeEach(() => {
    vi.mocked(resolveToYouTube).mockResolvedValue(null);
  });

  it('renders nothing until something is queued', () => {
    render(<MiniPlayerDock />);
    expect(screen.queryByRole('region', { name: /mini-player/i })).not.toBeInTheDocument();
  });

  it('plays the song at the requested start index', async () => {
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b'), yt('c')], 1);

    expect(screen.getByRole('region', { name: /mini-player/i })).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('hides the queue controls for a single song', async () => {
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a')]);

    expect(screen.queryByLabelText('Next song')).not.toBeInTheDocument();
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  });

  it('advances on Next and disables it at the end of the queue', async () => {
    const user = userEvent.setup();
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b')]);

    expect(screen.getByLabelText('Previous song')).toBeDisabled();

    await user.click(screen.getByLabelText('Next song'));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Next song')).toBeDisabled();
    expect(screen.getByLabelText('Previous song')).toBeEnabled();
  });

  // The whole point of the queue: a finished song moves to the next by itself.
  it('auto-advances when YouTube reports the track ended', async () => {
    stubYouTubeFrame();
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b')]);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await sendYouTubeState(0); // 0 = ENDED
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('stops at the last song instead of looping or closing', async () => {
    stubYouTubeFrame();
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b')], 1);

    await sendYouTubeState(0);
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /mini-player/i })).toBeInTheDocument();
  });

  it('resolves a Spotify song to YouTube so it plays in full', async () => {
    vi.mocked(resolveToYouTube).mockResolvedValue('resolved123');
    render(<MiniPlayerDock />);
    await dispatchQueue([spotify('abc')]);

    await waitFor(() => {
      const frame = document.querySelector('iframe');
      expect(frame).toBeTruthy();
      expect(frame.getAttribute('src')).toContain('/embed/resolved123');
    });
    expect(resolveToYouTube).toHaveBeenCalledWith('https://sp/abc');
  });

  // Resolution failing must degrade to the old preview, never to a dead player.
  it('falls back to the Spotify embed when no YouTube match exists', async () => {
    vi.mocked(resolveToYouTube).mockResolvedValue(null);
    render(<MiniPlayerDock />);
    await dispatchQueue([spotify('abc')]);

    await waitFor(() => {
      expect(document.querySelector('.miniplayer-spotify')).toBeTruthy();
    });
  });

  it('swaps a YouTube song in place rather than remounting the iframe', async () => {
    const posted = stubYouTubeFrame();
    const user = userEvent.setup();
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b')]);

    // The first frame must actually load before it can be reused.
    await act(async () => {
      document.querySelector('iframe').dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    const firstSrc = document.querySelector('iframe').getAttribute('src');

    await user.click(screen.getByLabelText('Next song'));

    const loadCommand = posted.find((m) => m?.func === 'loadVideoById');
    expect(loadCommand).toBeTruthy();
    // Same iframe, same src — swapping src would have navigated it and killed
    // the gapless handoff.
    expect(document.querySelector('iframe').getAttribute('src')).toBe(firstSrc);
  });

  it('clears the queue when closed', async () => {
    const user = userEvent.setup();
    render(<MiniPlayerDock />);
    await dispatchQueue([yt('a'), yt('b')]);

    await user.click(screen.getByLabelText('Close player'));
    expect(screen.queryByRole('region', { name: /mini-player/i })).not.toBeInTheDocument();
  });

  describe('published state', () => {
    it('reports the queue url so a list can match the link it posted', async () => {
      vi.mocked(resolveToYouTube).mockResolvedValue('resolved123');
      render(<MiniPlayerDock />);
      await dispatchQueue([spotify('abc')]);

      // The ORIGINAL Spotify url, not the YouTube stand-in actually playing.
      await waitFor(() => expect(getMiniPlayerState().url).toBe('https://sp/abc'));
    });

    it('follows the queue as it advances', async () => {
      stubYouTubeFrame();
      render(<MiniPlayerDock />);
      await dispatchQueue([yt('a'), yt('b')]);
      expect(getMiniPlayerState().url).toBe('https://yt/a');

      await sendYouTubeState(0);
      expect(getMiniPlayerState().url).toBe('https://yt/b');
    });

    it('clears on close so no row stays highlighted', async () => {
      const user = userEvent.setup();
      render(<MiniPlayerDock />);
      await dispatchQueue([yt('a')]);

      await user.click(screen.getByLabelText('Close player'));
      expect(getMiniPlayerState().url).toBeNull();
    });

    // The Songs panel covers the dock on a phone, so it must be able to pause
    // without the listener reaching the dock at all.
    it('pauses when the list asks it to', async () => {
      const posted = stubYouTubeFrame();
      render(<MiniPlayerDock />);
      await dispatchQueue([yt('a')]);
      await act(async () => {
        document.querySelector('iframe').dispatchEvent(new Event('load'));
        await Promise.resolve();
      });

      await act(async () => { toggleMiniPlayer(); await Promise.resolve(); });

      expect(posted.some((m) => m?.func === 'pauseVideo')).toBe(true);
      expect(getMiniPlayerState().isPlaying).toBe(false);
    });
  });
});
