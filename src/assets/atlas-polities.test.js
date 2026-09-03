import { describe, it, expect } from 'vitest';
import politiesAsset from './atlas-polities.json';
import atlasOverrides from './atlas-overrides.json';
import { politiesForYear } from '../lib/atlas';

// Schema and cross-reference guards for the hand-authored polity outlines —
// see docs/ancient-atlas-plan.md §Phase 4. These are deliberately coarse
// teaching shapes (the `note` field says so), but the structure itself
// (valid ranges, valid geometry, no dangling battle references) must hold.
describe('atlas-polities.json', () => {
  it('documents itself as a coarse, non-authoritative outline', () => {
    expect(typeof politiesAsset.note).toBe('string');
    expect(politiesAsset.note.length).toBeGreaterThan(20);
  });

  it('is a valid, non-empty FeatureCollection', () => {
    expect(politiesAsset.type).toBe('FeatureCollection');
    expect(politiesAsset.features.length).toBeGreaterThan(0);
  });

  it('gives every feature a unique slug, a sane date range, and a closed polygon ring', () => {
    const seen = new Set();
    for (const feature of politiesAsset.features) {
      const { s, n, from, to } = feature.properties;
      expect(seen.has(s), `duplicate polity slug "${s}"`).toBe(false);
      seen.add(s);
      expect(typeof n).toBe('string');
      expect(from).toBeLessThan(to);

      expect(feature.geometry.type).toBe('Polygon');
      const [ring] = feature.geometry.coordinates;
      expect(ring.length).toBeGreaterThanOrEqual(4);
      const [firstLon, firstLat] = ring[0];
      const [lastLon, lastLat] = ring[ring.length - 1];
      expect(firstLon).toBe(lastLon);
      expect(firstLat).toBe(lastLat);
      for (const [lon, lat] of ring) {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });

  it('every battle override references a polity slug that actually exists', () => {
    const slugs = new Set(politiesAsset.features.map((f) => f.properties.s));
    for (const [eventSlug, override] of Object.entries(atlasOverrides)) {
      for (const key of ['att', 'def']) {
        if (override[key]) {
          expect(slugs.has(override[key]), `${eventSlug}.${key} -> unknown polity "${override[key]}"`).toBe(true);
        }
      }
    }
  });
});

describe('politiesForYear', () => {
  it('includes a polity for the entire span it covers, not just a single year', () => {
    const babylon = politiesAsset.features.find((f) => f.properties.s === 'babylon');
    const { from, to } = babylon.properties;
    expect(politiesForYear(politiesAsset.features, from).map((f) => f.properties.s)).toContain('babylon');
    expect(politiesForYear(politiesAsset.features, to).map((f) => f.properties.s)).toContain('babylon');
    expect(politiesForYear(politiesAsset.features, from - 1).map((f) => f.properties.s)).not.toContain('babylon');
    expect(politiesForYear(politiesAsset.features, to + 1).map((f) => f.properties.s)).not.toContain('babylon');
  });
});
