// Color contrast helpers (WCAG 2.x relative luminance / contrast ratio).
// Used to pick readable text colors for arbitrary backgrounds — theme accents,
// role badges, category chips — instead of hardcoding light or dark text.

const DEFAULT_LIGHT = '#ffffff';
const DEFAULT_DARK = '#0f172a'; // matches --text-primary

/**
 * Parse a CSS color string into { r, g, b } (0–255 channels).
 * Supports #rgb, #rrggbb, #rrggbbaa, rgb(...) and rgba(...).
 * Returns null for anything it can't parse (e.g. var() refs, named colors).
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = digits.split('').map((d) => d + d).join('');
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }

  return null;
}

/** WCAG relative luminance of an { r, g, b } color. 0 = black, 1 = white. */
export function relativeLuminance({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio (1–21) between two CSS color strings. */
export function contrastRatio(colorA, colorB) {
  const a = parseColor(colorA);
  const b = parseColor(colorB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when light text reads better than dark text on the given background. */
export function isDarkBackground(background) {
  return contrastTextColor(background) === DEFAULT_LIGHT;
}

/**
 * Pick the more readable text color for a background.
 *
 * `background` may be a single CSS color or an array of colors (e.g. gradient
 * stops) — for arrays, the candidate with the better *worst-case* contrast
 * across all stops wins, so text stays legible over the whole gradient.
 * Unparseable input falls back to the dark option (app surfaces are light).
 */
export function contrastTextColor(background, { light = DEFAULT_LIGHT, dark = DEFAULT_DARK } = {}) {
  const stops = (Array.isArray(background) ? background : [background])
    .map(parseColor)
    .filter(Boolean);
  if (stops.length === 0) return dark;

  const lightColor = parseColor(light);
  const darkColor = parseColor(dark);
  if (!lightColor || !darkColor) return dark;

  const minContrast = (candidate) =>
    Math.min(
      ...stops.map((stop) => {
        const ls = relativeLuminance(stop);
        const lc = relativeLuminance(candidate);
        const [hi, lo] = ls >= lc ? [ls, lc] : [lc, ls];
        return (hi + 0.05) / (lo + 0.05);
      })
    );

  return minContrast(lightColor) >= minContrast(darkColor) ? light : dark;
}

/**
 * Derive theme-level text colors from the CSS custom properties on :root and
 * publish them back as CSS variables:
 *   --on-accent      text for solid var(--accent-gold) backgrounds
 *   --on-btn-primary text for the .btn-primary gradient
 * Call once at startup; safe to re-call if the theme variables change.
 */
export function applyContrastTheme(root = document.documentElement) {
  const styles = getComputedStyle(root);
  const accent = styles.getPropertyValue('--accent-gold').trim();
  const gradientEnd = styles.getPropertyValue('--accent-gradient-end').trim();
  if (!parseColor(accent)) return;

  root.style.setProperty('--on-accent', contrastTextColor(accent));
  root.style.setProperty(
    '--on-btn-primary',
    contrastTextColor(parseColor(gradientEnd) ? [accent, gradientEnd] : accent)
  );
}

/** Convert { r, g, b } (0–255) to { h, s, l } with h in degrees, s/l in 0–1. */
export function rgbToHsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** Inverse of rgbToHsl. Returns { r, g, b } with 0–255 channels. */
export function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Format { r, g, b } as a #rrggbb string. */
export function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Nudge a color's lightness — keeping its hue and saturation — until it reaches
 * `target` contrast against `background`.
 *
 * An organization's brand color is chosen against a white page, so on the dark
 * theme's near-black surfaces it can fall to 2:1 or worse. Rather than drop the
 * brand entirely we walk lightness toward whichever end of the scale gains
 * contrast, which keeps the color recognizably the same hue.
 *
 * Returns the original string unchanged when it already passes, or when either
 * input can't be parsed.
 */
export function ensureContrast(color, background, target = 4.5) {
  const rgb = parseColor(color);
  const bg = parseColor(background);
  if (!rgb || !bg) return color;
  if (contrastRatio(color, background) >= target) return color;

  const { h, s } = rgbToHsl(rgb);
  // Lighten against a dark background, darken against a light one.
  const towardLight = relativeLuminance(bg) < 0.5;
  const start = rgbToHsl(rgb).l;

  for (let step = 1; step <= 100; step += 1) {
    const l = towardLight
      ? Math.min(1, start + (step / 100) * (1 - start))
      : Math.max(0, start - (step / 100) * start);
    const candidate = toHex(hslToRgb({ h, s, l }));
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  // Ran out of headroom (e.g. target unreachable): return the extreme we found.
  return toHex(hslToRgb({ h, s, l: towardLight ? 1 : 0 }));
}
