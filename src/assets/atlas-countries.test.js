import { describe, it, expect } from 'vitest';
import countriesAsset from './atlas-countries.json';
import { countriesForZoom } from '../lib/atlas';

// Schema guards for the hand-authored modern-country label anchors. These
// are orientation labels, not geometry (the asset's own `note` says so), but
// a typo'd coordinate would silently park a country name in the wrong
// hemisphere — so the ranges below are the real point of this file.
//
// The map is centred on the biblical world (see AtlasMap.jsx's map options),
// so every anchor should fall inside a generous box around it rather than
// merely being a valid point on Earth: north Africa/Arabia up to the
// Caucasus, and Algeria/Italy across to Iran.
const REGION = { minLat: 5, maxLat: 50, minLon: -10, maxLon: 60 };

describe('atlas-countries.json', () => {
  it('documents itself as labels-only orientation, not boundaries', () => {
    expect(typeof countriesAsset.note).toBe('string');
    expect(countriesAsset.note.length).toBeGreaterThan(20);
  });

  it('is a non-empty list', () => {
    expect(Array.isArray(countriesAsset.countries)).toBe(true);
    expect(countriesAsset.countries.length).toBeGreaterThan(0);
  });

  it('gives every country a unique name, an in-region anchor, and a usable minZoom', () => {
    const seen = new Set();
    for (const country of countriesAsset.countries) {
      const { n, la, lo, minZoom } = country;
      expect(typeof n, `country name must be a string, got ${typeof n}`).toBe('string');
      expect(n.length).toBeGreaterThan(1);
      expect(seen.has(n), `duplicate country "${n}"`).toBe(false);
      seen.add(n);

      expect(Number.isFinite(la), `${n} has a non-numeric latitude`).toBe(true);
      expect(Number.isFinite(lo), `${n} has a non-numeric longitude`).toBe(true);
      expect(la, `${n} latitude is outside the atlas region`).toBeGreaterThanOrEqual(REGION.minLat);
      expect(la, `${n} latitude is outside the atlas region`).toBeLessThanOrEqual(REGION.maxLat);
      expect(lo, `${n} longitude is outside the atlas region`).toBeGreaterThanOrEqual(REGION.minLon);
      expect(lo, `${n} longitude is outside the atlas region`).toBeLessThanOrEqual(REGION.maxLon);

      // Outside the map's own zoom range a country could never be shown at
      // all (minZoom 3) or never hidden (above maxZoom 12) — see the L.map
      // options in AtlasMap.jsx.
      expect(Number.isInteger(minZoom), `${n} minZoom must be an integer`).toBe(true);
      expect(minZoom, `${n} minZoom is below the map's own minZoom`).toBeGreaterThanOrEqual(3);
      expect(minZoom, `${n} minZoom is above the map's own maxZoom`).toBeLessThanOrEqual(12);
    }
  });

  // The layer is useless if nothing shows at the default view, and unusable
  // if everything does — this pins both ends of the tiering.
  it('reveals a readable handful at the map default zoom and the full set when zoomed in', () => {
    const atDefault = countriesForZoom(countriesAsset.countries, 5);
    expect(atDefault.length).toBeGreaterThan(3);
    expect(atDefault.length).toBeLessThan(countriesAsset.countries.length);
    expect(countriesForZoom(countriesAsset.countries, 12)).toHaveLength(countriesAsset.countries.length);
  });

  it('includes the modern homes of the places the atlas is mostly about', () => {
    const names = new Set(countriesAsset.countries.map((c) => c.n));
    for (const expected of ['Israel', 'Egypt', 'Iraq', 'Jordan', 'Turkey', 'Greece', 'Italy']) {
      expect(names.has(expected), `missing "${expected}"`).toBe(true);
    }
  });
});
