import { describe, it, expect } from 'vitest';
import tribesAsset from './atlas-tribes.json';
import atlasAsset from './bible-atlas.json';
import { politiesForYear, ringCentroid } from '../lib/atlas';

// Guards for the hand-authored tribal allotments (Joshua 13-19). The shapes
// themselves are coarse teaching outlines by design — what these tests hold
// is the structure, the theology the asset encodes, and the geography being
// at least in the right country.
describe('atlas-tribes.json', () => {
  const bySlug = new Map(tribesAsset.features.map((f) => [f.properties.s, f]));

  it('documents itself as coarse teaching outlines', () => {
    expect(typeof tribesAsset.note).toBe('string');
    expect(tribesAsset.note.length).toBeGreaterThan(20);
  });

  it('is a valid FeatureCollection sharing the polity feature shape', () => {
    expect(tribesAsset.type).toBe('FeatureCollection');
    for (const feature of tribesAsset.features) {
      const { s, n, from, to, color } = feature.properties;
      expect(typeof s).toBe('string');
      expect(typeof n).toBe('string');
      expect(from).toBeLessThan(to);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);

      expect(feature.geometry.type).toBe('Polygon');
      const [ring] = feature.geometry.coordinates;
      expect(ring.length).toBeGreaterThanOrEqual(8);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });

  // Levi received no territorial inheritance (Josh 13:14, 33). Drawing it
  // would teach the opposite of the text, so its absence is a fixture, not
  // an oversight — this is the test that keeps a well-meaning future edit
  // from "completing" the set.
  it('gives no territory to Levi', () => {
    const names = tribesAsset.features.map((f) => f.properties.n.toLowerCase());
    expect(names).not.toContain('levi');
    expect(tribesAsset.note).toMatch(/levi/i);
  });

  // Joshua 13:29-31 / 17:7-11: one tribe, split by the Jordan.
  it('splits Manasseh into two features that share a colour', () => {
    const west = bySlug.get('manasseh-west');
    const east = bySlug.get('manasseh-east');
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    expect(west.properties.color).toBe(east.properties.color);
    expect(ringCentroid(east.geometry.coordinates[0]).lo)
      .toBeGreaterThan(ringCentroid(west.geometry.coordinates[0]).lo);
  });

  it('covers the twelve landed tribes, Manasseh counted once', () => {
    const tribes = new Set(
      tribesAsset.features.map((f) => f.properties.s.replace(/-(west|east)$/, '')),
    );
    expect(tribes.size).toBe(12);
  });

  it('places every allotment inside the land, and each one where Joshua puts it', () => {
    for (const feature of tribesAsset.features) {
      for (const [lon, lat] of feature.geometry.coordinates[0]) {
        expect(lon, `${feature.properties.n} runs outside the land`).toBeGreaterThan(34);
        expect(lon, `${feature.properties.n} runs outside the land`).toBeLessThan(37);
        expect(lat, `${feature.properties.n} runs outside the land`).toBeGreaterThan(30.5);
        expect(lat, `${feature.properties.n} runs outside the land`).toBeLessThan(33.6);
      }
    }
    // North-to-south ordering of a few unmistakable anchors: Asher on the
    // northern coast, Judah in the south, Simeon south of Judah again.
    const lat = (slug) => ringCentroid(bySlug.get(slug).geometry.coordinates[0]).la;
    expect(lat('asher')).toBeGreaterThan(lat('issachar'));
    expect(lat('issachar')).toBeGreaterThan(lat('benjamin'));
    expect(lat('benjamin')).toBeGreaterThan(lat('judah'));
    expect(lat('judah')).toBeGreaterThan(lat('simeon'));
    // Transjordan really is across the river from its western neighbours.
    const lon = (slug) => ringCentroid(bySlug.get(slug).geometry.coordinates[0]).lo;
    expect(lon('reuben')).toBeGreaterThan(lon('judah'));
    expect(lon('gad')).toBeGreaterThan(lon('ephraim'));
  });

  // The span is pinned to the atlas's own chronology rather than a number
  // typed in by hand — see the asset note.
  it('runs from the dividing of the land to the fall of the northern kingdom', () => {
    const divide = atlasAsset.events.find((e) => e.n === 'Dividing the land');
    expect(divide).toBeDefined();
    for (const feature of tribesAsset.features) {
      expect(feature.properties.from).toBe(divide.y);
      expect(feature.properties.to).toBe(-722);
    }
  });

  it('is visible across the Judges and monarchy years, and gone either side', () => {
    expect(politiesForYear(tribesAsset.features, -1400)).toHaveLength(13);
    expect(politiesForYear(tribesAsset.features, -1000)).toHaveLength(13);
    expect(politiesForYear(tribesAsset.features, -1500)).toHaveLength(0);
    expect(politiesForYear(tribesAsset.features, -586)).toHaveLength(0);
  });
});
