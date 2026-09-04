import { describe, it, expect, afterEach } from 'vitest';
import { applyOrgBranding } from './branding';
import { contrastRatio, parseColor, rgbToHsl } from './colorContrast';

const root = () => document.documentElement;
const prop = (name) => root().style.getPropertyValue(name);

const ORG = { id: 'o1', name: 'First Church', primary_color: '#2e52be', secondary_color: '#ffffff' };

afterEach(() => {
  root().removeAttribute('style');
});

describe('applyOrgBranding', () => {
  it('never writes surface tokens, so the theme keeps ownership of them', () => {
    // Regression: secondary_color used to be pushed into --bg-secondary as an
    // inline style, which outranks [data-theme="dark"] and left orgs storing
    // #ffffff with white cards in dark mode.
    applyOrgBranding(ORG, 'dark');
    for (const surface of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
      expect(prop(surface)).toBe('');
    }
  });

  it('applies the brand color as-is when it reads well on the light page', () => {
    applyOrgBranding(ORG, 'light');
    expect(prop('--accent-gold')).toBe('#2e52be');
  });

  it('lightens a too-dark brand color for the dark theme', () => {
    applyOrgBranding(ORG, 'dark');
    const accent = prop('--accent-gold');
    expect(accent).not.toBe('#2e52be');
    expect(contrastRatio(accent, '#0b1120')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brand hue when it adjusts', () => {
    applyOrgBranding(ORG, 'dark');
    const hue = (hex) => Math.round(rgbToHsl(parseColor(hex)).h);
    expect(hue(prop('--accent-gold'))).toBe(hue('#2e52be'));
  });

  it('derives the tint and glow from the adjusted accent, not the raw brand', () => {
    applyOrgBranding(ORG, 'dark');
    const accent = prop('--accent-gold');
    expect(prop('--accent-gold-light')).toBe(`${accent}1a`);
    expect(prop('--accent-gold-glow')).toBe(`${accent}40`);
  });

  it('pushes hover further from the page rather than always darker', () => {
    applyOrgBranding(ORG, 'dark');
    expect(contrastRatio(prop('--accent-gold-hover'), '#0b1120')).toBeGreaterThanOrEqual(7);
  });

  it('falls back to the default brand when the org has no color', () => {
    applyOrgBranding({ id: 'o2', name: 'No Brand' }, 'light');
    expect(prop('--accent-gold')).toBe('#2e52be');
  });

  it('clears the brand overrides when there is no organization', () => {
    applyOrgBranding(ORG, 'light');
    expect(prop('--accent-gold')).not.toBe('');
    applyOrgBranding(null, 'light');
    expect(prop('--accent-gold')).toBe('');
    expect(prop('--accent-gold-glow')).toBe('');
  });

  it('treats an unknown theme name as the light surface', () => {
    applyOrgBranding(ORG, undefined);
    expect(prop('--accent-gold')).toBe('#2e52be');
  });
});
