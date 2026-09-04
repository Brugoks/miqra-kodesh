import { describe, it, expect } from 'vitest';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  contrastTextColor,
  isDarkBackground,
  applyContrastTheme,
  rgbToHsl,
  hslToRgb,
  toHex,
  ensureContrast,
} from './colorContrast';

const LIGHT = '#ffffff';
const DARK = '#0f172a';

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255 }],
    ['#2e52be', { r: 46, g: 82, b: 190 }],
    ['#2e52beff', { r: 46, g: 82, b: 190 }],
    ['rgb(46, 82, 190)', { r: 46, g: 82, b: 190 }],
    ['rgba(46, 82, 190, 0.5)', { r: 46, g: 82, b: 190 }],
    ['  #2e52be  ', { r: 46, g: 82, b: 190 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each([
    ['var(--accent-gold)'],
    ['rebeccapurple'],
    ['#12'],
    ['rgb(300, 0, 0)'],
    [''],
    [null],
    [undefined],
  ])('returns null for %s', (input) => {
    expect(parseColor(input)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('weights green heaviest per WCAG coefficients', () => {
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric and 1 for identical colors', () => {
    expect(contrastRatio('#2e52be', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#2e52be'), 5);
    expect(contrastRatio('#2e52be', '#2e52be')).toBe(1);
  });

  it('returns 1 (no signal) for unparseable input', () => {
    expect(contrastRatio('var(--x)', '#fff')).toBe(1);
  });
});

describe('contrastTextColor', () => {
  it.each([
    ['#2e52be', LIGHT], // brand accent (dark blue)
    ['#312e81', LIGHT], // developer badge
    ['#1e3a5f', LIGHT], // admin badge
    ['#d1fae5', DARK], // leader badge (pastel green)
    ['#fef3c7', DARK], // pastel amber
    ['#f3f4f6', DARK], // light gray
    ['#000000', LIGHT],
    ['#ffffff', DARK],
  ])('picks readable text on %s', (bg, expected) => {
    expect(contrastTextColor(bg)).toBe(expected);
  });

  it('handles gradients via worst-case contrast across stops', () => {
    // btn-primary gradient: dark blue → gold. White has the better minimum.
    expect(contrastTextColor(['#2e52be', '#b89222'])).toBe(LIGHT);
    // Two pastels — dark text wins on both stops.
    expect(contrastTextColor(['#d1fae5', '#ede9fe'])).toBe(DARK);
  });

  it('respects custom light/dark options', () => {
    expect(contrastTextColor('#312e81', { light: '#f8fafc' })).toBe('#f8fafc');
    expect(contrastTextColor('#d1fae5', { dark: '#065f46' })).toBe('#065f46');
  });

  it('falls back to dark for unparseable backgrounds', () => {
    expect(contrastTextColor('var(--accent-gold)')).toBe(DARK);
    expect(contrastTextColor([])).toBe(DARK);
  });
});

describe('isDarkBackground', () => {
  it('mirrors contrastTextColor', () => {
    expect(isDarkBackground('#2e52be')).toBe(true);
    expect(isDarkBackground('#f8fafc')).toBe(false);
  });
});

describe('applyContrastTheme', () => {
  it('publishes --on-accent and --on-btn-primary derived from theme vars', () => {
    const root = document.documentElement;
    root.style.setProperty('--accent-gold', '#2e52be');
    root.style.setProperty('--accent-gradient-end', '#b89222');

    applyContrastTheme(root);

    expect(root.style.getPropertyValue('--on-accent')).toBe(LIGHT);
    expect(root.style.getPropertyValue('--on-btn-primary')).toBe(LIGHT);

    // A light accent flips both to dark text.
    root.style.setProperty('--accent-gold', '#fde68a');
    root.style.setProperty('--accent-gradient-end', '#fef3c7');
    applyContrastTheme(root);
    expect(root.style.getPropertyValue('--on-accent')).toBe(DARK);
    expect(root.style.getPropertyValue('--on-btn-primary')).toBe(DARK);

    ['--accent-gold', '--accent-gradient-end', '--on-accent', '--on-btn-primary'].forEach((v) =>
      root.style.removeProperty(v)
    );
  });

  it('does nothing when the accent variable is missing', () => {
    const root = document.documentElement;
    applyContrastTheme(root);
    expect(root.style.getPropertyValue('--on-accent')).toBe('');
  });
});

describe('rgbToHsl / hslToRgb', () => {
  it('round-trips saturated colors', () => {
    for (const hex of ['#2e52be', '#d4af37', '#10b981', '#dc2626']) {
      expect(toHex(hslToRgb(rgbToHsl(parseColor(hex))))).toBe(hex);
    }
  });

  it('reports zero saturation for greys', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 }).s).toBe(0);
  });

  it('round-trips the achromatic extremes', () => {
    expect(toHex(hslToRgb(rgbToHsl(parseColor('#ffffff'))))).toBe('#ffffff');
    expect(toHex(hslToRgb(rgbToHsl(parseColor('#000000'))))).toBe('#000000');
  });

  it('clamps out-of-range channels when formatting', () => {
    expect(toHex({ r: 300, g: -20, b: 128 })).toBe('#ff0080');
  });
});

describe('ensureContrast', () => {
  const DARK_BG = '#0b1120';
  const LIGHT_BG = '#f8fafc';

  it('leaves a color alone when it already passes', () => {
    expect(ensureContrast('#2e52be', LIGHT_BG)).toBe('#2e52be');
    expect(ensureContrast('#d4af37', DARK_BG)).toBe('#d4af37');
  });

  it('lightens a brand color that is too dark for the dark theme', () => {
    const before = contrastRatio('#2e52be', DARK_BG);
    const after = ensureContrast('#2e52be', DARK_BG);
    expect(before).toBeLessThan(4.5);
    expect(contrastRatio(after, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a color that is too light for the light theme', () => {
    const adjusted = ensureContrast('#facc15', LIGHT_BG);
    expect(contrastRatio(adjusted, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue so the brand stays recognizable', () => {
    const hue = (hex) => Math.round(rgbToHsl(parseColor(hex)).h);
    expect(hue(ensureContrast('#2e52be', DARK_BG))).toBe(hue('#2e52be'));
  });

  it('honors a stricter target ratio', () => {
    const adjusted = ensureContrast('#2e52be', DARK_BG, 7);
    expect(contrastRatio(adjusted, DARK_BG)).toBeGreaterThanOrEqual(7);
  });

  it('returns the input untouched when either color is unparseable', () => {
    expect(ensureContrast('var(--accent-gold)', DARK_BG)).toBe('var(--accent-gold)');
    expect(ensureContrast('#2e52be', 'rebeccapurple')).toBe('#2e52be');
  });

  it('returns the nearest extreme when the target is unreachable', () => {
    // 21:1 against a mid grey is impossible; the walk should still terminate.
    const adjusted = ensureContrast('#808080', '#808080', 21);
    expect(parseColor(adjusted)).not.toBeNull();
  });
});
