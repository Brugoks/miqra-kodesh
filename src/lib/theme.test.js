import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemeMode,
  readStoredMode,
  resolveTheme,
  storeMode,
  systemPrefersDark,
  watchSystemTheme,
} from './theme';

/** Install a matchMedia stub; jsdom has none by default. */
function mockMatchMedia(matches) {
  const listeners = new Set();
  const query = {
    matches,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => query);
  return {
    query,
    listeners,
    flip(next) {
      query.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

describe('theme mode storage', () => {
  afterEach(() => {
    delete window.matchMedia;
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system when nothing is stored', () => {
    expect(readStoredMode()).toBe(DEFAULT_THEME_MODE);
    expect(DEFAULT_THEME_MODE).toBe('system');
  });

  it('round-trips a stored mode', () => {
    storeMode('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredMode()).toBe('dark');
  });

  it('ignores an unrecognized stored value rather than stamping it on <html>', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
    expect(readStoredMode()).toBe('system');
  });

  it('refuses to persist a mode outside the known set', () => {
    storeMode('neon');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('falls back to system when storage throws (private browsing)', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    expect(readStoredMode(broken)).toBe('system');
    expect(() => storeMode('dark', broken)).not.toThrow();
  });

  it('validates mode names', () => {
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('sepia')).toBe(false);
  });
});

describe('resolveTheme', () => {
  afterEach(() => { delete window.matchMedia; });

  it('passes explicit choices straight through', () => {
    mockMatchMedia(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('follows the OS for system mode', () => {
    mockMatchMedia(true);
    expect(resolveTheme('system')).toBe('dark');
    mockMatchMedia(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('treats a missing matchMedia as light rather than throwing', () => {
    delete window.matchMedia;
    expect(systemPrefersDark()).toBe(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#f8fafc">' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">';
  });
  afterEach(() => {
    delete window.matchMedia;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('theme-switching');
  });

  const themeColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

  it('stamps data-theme for an explicit choice', () => {
    mockMatchMedia(false);
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(themeColor()).toBe('#0b1120');
  });

  it('leaves data-theme off for system so the CSS media query decides', () => {
    mockMatchMedia(true);
    document.documentElement.setAttribute('data-theme', 'light');
    expect(applyTheme('system')).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeColor()).toBe('#0b1120');
  });

  it('lets an explicit light choice win over a dark OS', () => {
    mockMatchMedia(true);
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(themeColor()).toBe('#f8fafc');
  });

  it('switches the iOS status bar style with the theme', () => {
    mockMatchMedia(false);
    const bar = () => document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content');
    applyTheme('dark');
    expect(bar()).toBe('black-translucent');
    applyTheme('light');
    expect(bar()).toBe('default');
  });

  it('suppresses transitions for the frame the palette swaps in', () => {
    mockMatchMedia(false);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    raf.mockRestore();
  });

  it('tolerates a document without the meta tags', () => {
    mockMatchMedia(false);
    document.head.innerHTML = '';
    expect(() => applyTheme('dark')).not.toThrow();
  });
});

describe('watchSystemTheme', () => {
  afterEach(() => { delete window.matchMedia; });

  it('reports OS flips and unsubscribes cleanly', () => {
    const mm = mockMatchMedia(false);
    const seen = [];
    const stop = watchSystemTheme((theme) => seen.push(theme));
    mm.flip(true);
    mm.flip(false);
    expect(seen).toEqual(['dark', 'light']);
    stop();
    mm.flip(true);
    expect(seen).toEqual(['dark', 'light']);
  });

  it('falls back to the deprecated addListener API (older Safari)', () => {
    const listeners = new Set();
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    }));
    const seen = [];
    const stop = watchSystemTheme((t) => seen.push(t));
    listeners.forEach((fn) => fn({ matches: true }));
    expect(seen).toEqual(['dark']);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('returns a no-op when matchMedia is unavailable', () => {
    delete window.matchMedia;
    expect(() => watchSystemTheme(() => {})()).not.toThrow();
  });
});
