// Organization brand colors -> theme custom properties.
import { applyContrastTheme, ensureContrast } from './colorContrast';

// Page backgrounds per theme, mirroring --bg-primary in index.css. Used only to
// measure the accent's contrast, never written back to the document.
const SURFACE = { light: '#f8fafc', dark: '#0b1120' };
const DEFAULT_BRAND = '#2e52be';

const BRAND_PROPS = ['--accent-gold', '--accent-gold-hover', '--accent-gold-light', '--accent-gold-glow'];

// Paint an organization's brand colors onto the theme's CSS custom properties.
//
// Two things to know here:
//
//   * These land as inline styles on <html>, which outrank the [data-theme]
//     rules in index.css. So the *only* tokens we may touch are ones that are
//     genuinely brand-owned. --bg-secondary used to be set from the org's
//     secondary_color, which meant every org storing #ffffff kept white cards
//     in dark mode; surfaces now belong to the theme alone.
//   * A brand color is chosen against a white page. On the dark theme's
//     near-black surfaces the same color can fall below 3:1, so it is lightened
//     toward legibility first — same hue, enough contrast to read as a link.
export function applyOrgBranding(organization, resolvedTheme) {
  const root = document.documentElement;

  if (!organization) {
    BRAND_PROPS.forEach((prop) => root.style.removeProperty(prop));
    applyContrastTheme();
    return;
  }

  const brand = organization.primary_color || DEFAULT_BRAND;
  const surface = SURFACE[resolvedTheme] || SURFACE.light;
  const accent = ensureContrast(brand, surface, 4.5);

  root.style.setProperty('--accent-gold', accent);
  // Hover shifts further from the page background rather than always darker,
  // which would be invisible against a dark surface.
  root.style.setProperty('--accent-gold-hover', ensureContrast(accent, surface, 7));
  root.style.setProperty('--accent-gold-light', accent + '1a');
  root.style.setProperty('--accent-gold-glow', accent + '40');

  // --on-accent / --on-btn-primary are derived from whatever we just set.
  applyContrastTheme();
}

