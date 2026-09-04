// Light / dark theme resolution and persistence.
//
// The user picks one of three modes; only two of them stamp an attribute:
//
//   'light'  -> <html data-theme="light">
//   'dark'   -> <html data-theme="dark">
//   'system' -> no attribute, so the prefers-color-scheme media query in
//               index.css decides and keeps following the OS live.
//
// Keeping "system" attribute-less is what makes the CSS work with a single
// media block instead of a JS-driven re-render on every OS change.

export const THEME_STORAGE_KEY = 'miqra_theme';
export const THEME_MODES = ['system', 'light', 'dark'];
export const DEFAULT_THEME_MODE = 'system';

/** Background painted behind the browser/PWA chrome, per resolved theme. */
const THEME_COLORS = { light: '#f8fafc', dark: '#0b1120' };

export function isThemeMode(value) {
  return THEME_MODES.includes(value);
}

/** The mode saved by a previous session, or 'system' when absent/invalid. */
export function readStoredMode(storage = safeStorage()) {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function storeMode(mode, storage = safeStorage()) {
  if (!isThemeMode(mode)) return;
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private browsing / quota — the theme just won't persist.
  }
}

/** True when the OS is currently asking for a dark UI. */
export function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Collapse a mode into the theme actually being shown: 'light' or 'dark'. */
export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemPrefersDark() ? 'dark' : 'light';
}

/**
 * Point the browser/PWA chrome at the resolved theme's background so the
 * iOS status bar and Android address bar don't stay white over a dark app.
 */
function syncThemeColorMeta(resolved, doc) {
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved] || THEME_COLORS.light);
  const statusBar = doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusBar) statusBar.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
}

/**
 * Apply a mode to the document. Returns the resolved theme ('light'|'dark').
 *
 * Color transitions are suppressed for one frame: --transition-fast is
 * `all 0.2s`, so without this every surface, border and shadow in the app
 * would crossfade at once and the switch reads as a slow smear.
 */
export function applyTheme(mode, doc = typeof document !== 'undefined' ? document : null) {
  const resolved = resolveTheme(mode);
  if (!doc?.documentElement) return resolved;

  const root = doc.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);

  root.classList.add('theme-switching');
  syncThemeColorMeta(resolved, doc);

  const clear = () => root.classList.remove('theme-switching');
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(clear));
  } else {
    clear();
  }
  return resolved;
}

/**
 * Call `onChange` whenever the OS light/dark preference flips. Returns an
 * unsubscribe function. Only meaningful while the mode is 'system'; callers
 * still want it wired up so switching back to 'system' is instantly correct.
 */
export function watchSystemTheme(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event) => onChange(event.matches ? 'dark' : 'light');
  // Safari < 14 only has the deprecated add/removeListener pair.
  if (query.addEventListener) {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  query.addListener(handler);
  return () => query.removeListener(handler);
}

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
