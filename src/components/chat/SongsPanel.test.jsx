import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SongsPanel from './SongsPanel';
import { musicEmbedFor } from '../../lib/musicEmbed';
import { setMiniPlayerState, clearMiniPlayerState } from '../../lib/miniPlayerState';

vi.mock('../../lib/linkPreviewCache', () => ({
  fetchLinkPreviewCached: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../lib/supabaseClient', () => ({ hasSupabaseConfig: false, supabase: {} }));

// Newest-first, the order useChannelSongs returns.
const SONGS = [
  { url: 'https://open.spotify.com/track/newest', provider: 'Spotify', authorName: 'Ann', createdAt: '2026-08-03T00:00:00Z', messageId: '3' },
  { url: 'https://open.spotify.com/track/middle', provider: 'Spotify', authorName: 'Bob', createdAt: '2026-08-02T00:00:00Z', messageId: '2' },
  { url: 'https://open.spotify.com/track/oldest', provider: 'Spotify', authorName: 'Cal', createdAt: '2026-08-01T00:00:00Z', messageId: '1' },
].map((s) => ({ ...s, embed: musicEmbedFor(s.url) }));

function renderPanel(props = {}) {
  const queued = [];
  const handler = (e) => queued.push(e.detail);
  window.addEventListener('miniplayer:queue', handler);
  const toggles = [];
  const onToggle = () => toggles.push(true);
  window.addEventListener('miniplayer:toggle', onToggle);

  const utils = render(<SongsPanel songs={SONGS} onClose={() => {}} {...props} />);
  return {
    ...utils,
    queued,
    toggles,
    cleanupEvents: () => {
      window.removeEventListener('miniplayer:queue', handler);
      window.removeEventListener('miniplayer:toggle', onToggle);
    },
  };
}

describe('SongsPanel', () => {
  let panel;

  beforeEach(() => clearMiniPlayerState());
  afterEach(() => {
    panel?.cleanupEvents();
    clearMiniPlayerState();
  });

  it('plays the whole channel oldest-first from Play all', async () => {
    const user = userEvent.setup();
    panel = renderPanel();

    await user.click(screen.getByRole('button', { name: /play all/i }));

    expect(panel.queued).toHaveLength(1);
    expect(panel.queued[0].startIndex).toBe(0);
    // The list renders newest-first; the queue must run the other way so the
    // channel plays in the order it was posted.
    expect(panel.queued[0].items.map((i) => i.url)).toEqual([
      'https://open.spotify.com/track/oldest',
      'https://open.spotify.com/track/middle',
      'https://open.spotify.com/track/newest',
    ]);
  });

  it('starts at the tapped song and continues through the rest', async () => {
    const user = userEvent.setup();
    panel = renderPanel();

    await user.click(screen.getByRole('button', { name: /Play .*newest.* and everything after it/i }));

    // "newest" is the first row but the LAST song chronologically.
    expect(panel.queued[0].startIndex).toBe(2);
  });

  it('marks the playing song and leaves the others alone', async () => {
    panel = renderPanel();
    act(() => setMiniPlayerState({ url: 'https://open.spotify.com/track/middle', isPlaying: true }));

    const rows = document.querySelectorAll('.chat-song-row');
    expect(rows[0].className).not.toContain('is-current');
    expect(rows[1].className).toContain('is-current');
    expect(rows[2].className).not.toContain('is-current');
    // One equalizer, on the playing row only.
    expect(document.querySelectorAll('.chat-song-eq')).toHaveLength(1);
    expect(rows[1].querySelector('.chat-song-eq')).toBeTruthy();
  });

  // The point of the whole change: on a phone the panel covers the dock, so the
  // row itself has to pause and resume without restarting the queue.
  it('pauses the current song instead of re-queueing it', async () => {
    const user = userEvent.setup();
    panel = renderPanel();
    act(() => setMiniPlayerState({ url: 'https://open.spotify.com/track/newest', isPlaying: true }));

    await user.click(screen.getByRole('button', { name: /^Pause/ }));

    expect(panel.toggles).toHaveLength(1);
    expect(panel.queued).toHaveLength(0); // did NOT restart the queue
  });

  it('resumes a paused current song rather than restarting it', async () => {
    const user = userEvent.setup();
    panel = renderPanel();
    act(() => setMiniPlayerState({ url: 'https://open.spotify.com/track/newest', isPlaying: false }));

    await user.click(screen.getByRole('button', { name: /^Resume/ }));

    expect(panel.toggles).toHaveLength(1);
    expect(panel.queued).toHaveLength(0);
  });

  it('shows a loading state while a song is being matched to YouTube', () => {
    panel = renderPanel();
    act(() => setMiniPlayerState({ url: 'https://open.spotify.com/track/oldest', resolving: true }));

    expect(screen.getByRole('button', { name: /^Loading/ })).toBeInTheDocument();
    expect(document.querySelector('.chat-song-spin')).toBeTruthy();
  });

  it('hides Play all when the channel has no songs', () => {
    render(<SongsPanel songs={[]} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /play all/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no songs posted yet/i)).toBeInTheDocument();
  });
});
