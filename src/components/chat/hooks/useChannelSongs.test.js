import { describe, expect, it } from 'vitest';
import { songsChangeAffectsList } from './useChannelSongs';

describe('songsChangeAffectsList', () => {
  const listed = new Set(['song-msg']);

  it('ignores an ordinary message', () => {
    expect(songsChangeAffectsList({ eventType: 'INSERT', new: { id: 'm1', body: 'see you thursday' } }, listed)).toBe(false);
  });

  it('reloads for a new message that mentions a music host', () => {
    expect(songsChangeAffectsList({ eventType: 'INSERT', new: { id: 'm2', body: 'https://youtu.be/abc' } }, listed)).toBe(true);
    expect(songsChangeAffectsList({ eventType: 'INSERT', new: { id: 'm3', body: 'open.SPOTIFY.com/track/x' } }, listed)).toBe(true);
  });

  it('reloads when a listed song message is edited away or deleted', () => {
    expect(songsChangeAffectsList({ eventType: 'UPDATE', new: { id: 'song-msg', body: 'link removed' } }, listed)).toBe(true);
    expect(songsChangeAffectsList({ eventType: 'DELETE', new: {}, old: { id: 'song-msg' } }, listed)).toBe(true);
  });

  it('ignores deleting a message that was never listed', () => {
    expect(songsChangeAffectsList({ eventType: 'DELETE', new: {}, old: { id: 'm1' } }, listed)).toBe(false);
  });
});
