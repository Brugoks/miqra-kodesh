import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFullscreenPreference, rememberFullscreen } from './fullscreenPreference';

beforeEach(() => localStorage.clear());

describe('opening full window', () => {
  it('is the default', () => { expect(readFullscreenPreference('me')).toBe(true); });

  it('remembers the last choice, per person on this device', () => {
    rememberFullscreen('me', false);
    expect(readFullscreenPreference('me')).toBe(false);
    expect(readFullscreenPreference('someone-else')).toBe(true);
    rememberFullscreen('me', true);
    expect(readFullscreenPreference('me')).toBe(true);
  });

  it('falls back to the default when storage is unavailable, and does not throw', () => {
    const broken = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readFullscreenPreference('me')).toBe(true);
    expect(() => rememberFullscreen('me', false)).not.toThrow();
    broken.mockRestore(); blocked.mockRestore();
  });

  it('treats anything but an explicit off as on', () => {
    localStorage.setItem('miqra_canvas_fullscreen_v1:me', 'garbage');
    expect(readFullscreenPreference('me')).toBe(true);
  });
});
