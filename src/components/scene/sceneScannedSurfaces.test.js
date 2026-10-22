import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import buildSecondTemple from './buildSecondTemple';
import buildCaesarea from './buildCaesarea';
import buildCapernaum from './buildCapernaum';
import buildTabernacle from './buildTabernacle';
import buildElah from './buildElah';
import buildOlivet from './buildOlivet';
import buildSinai from './buildSinai';
import buildBethlehem from './buildBethlehem';
import buildNehemiah from './buildNehemiah';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';
import { SCENE_MATERIAL_ASSETS } from './sceneMaterialAssets';
import { fakeScanGroup, sameBalanceAsBaseline, scannedMaterials, shaderSketch } from './scanFixtures';

// Every scene wears CC0 scans (Poly Haven, see scripts/prepare-scene-materials.mjs)
// under its own shaders. None of that can be looked at in CI, so what is checked
// is what can silently go wrong: a scene that never binds a scan it downloads, a
// binding whose role does not exist, a builder that frees a texture the asset
// session owns, and shader edits that no longer line up with three's chunks.

// The Temple's procedural canvas textures need a 2D context, which jsdom only
// has with the optional `canvas` package; a stub keeps this free of it.
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    return {
      fillStyle: '', strokeStyle: '', lineWidth: 1,
      fillRect: () => {}, strokeRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    };
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const BUILDS = {
  'second-temple': { build: () => buildSecondTemple(THREE, { quality: 'low', motionLibrary: null }), min: 5 },
  caesarea: { build: () => buildCaesarea(THREE, { quality: 'low', motionLibrary: null }), min: 4 },
  capernaum: { build: () => buildCapernaum(THREE, { quality: 'low', motionLibrary: null }), min: 7 },
  tabernacle: { build: () => buildTabernacle(THREE, { quality: 'low' }), min: 5 },
  'valley-of-elah': { build: () => buildElah(THREE, { quality: 'low' }), min: 3 },
  'mount-of-olives': { build: () => buildOlivet(THREE, { quality: 'low', motionLibrary: null }), min: 7 },
  sinai: { build: () => buildSinai(THREE, { quality: 'low', motionLibrary: null }), min: 5 },
  'nehemiahs-wall': { build: () => buildNehemiah(THREE, { quality: 'low', motionLibrary: null }), min: 5 },
};

describe('scanned surface library', () => {
  it('is indexed for every scene, from CC0 sources, with an average colour for each', () => {
    expect(Object.keys(SCENE_MATERIAL_ASSETS).sort()).toEqual(Object.keys(BUILDS).sort());
    for (const [slug, defs] of Object.entries(SCENE_MATERIAL_ASSETS)) {
      expect(defs.length, slug).toBeGreaterThan(2);
      for (const def of defs) {
        expect(def.id.startsWith(`${slug}-`), def.id).toBe(true);
        expect(def.license, def.id).toBe('CC0');
        expect(def.source, def.id).toMatch(/^https:\/\/polyhaven\.com\/a\//);
        expect(Object.keys(def.maps).sort(), def.id).toEqual(['diffuse', 'normal', 'roughness']);
        expect(def.mean, def.id).toHaveLength(3);
        // The 512px tier phones load: same maps, their own small files.
        expect(Object.keys(def.mapsLow).sort(), def.id).toEqual(['diffuse', 'normal', 'roughness']);
        for (const [map, url] of Object.entries(def.mapsLow)) {
          expect(url, def.id).toMatch(/-512-[0-9a-f]{8}\.webp$/);
          expect(def.filesLow[map].size, def.id).toBeLessThan(def.files[map].size);
        }
        // Real colour, not the pure-black diffuse maps an earlier set shipped.
        expect(Math.max(...def.mean), def.id).toBeGreaterThan(0.02);
        for (const map of Object.values(def.files)) expect(map.sourceUrl).toMatch(/^https:\/\/dl\.polyhaven\.org\//);
      }
    }
  });

  it('is the first thing each scene downloads, and each group names real materials', () => {
    for (const slug of Object.keys(BUILDS)) {
      const entry = SCENE_ASSET_MANIFEST[slug];
      const surfaces = entry.groups.surfaces;
      expect(surfaces, slug).toBeTruthy();
      expect(surfaces.priority, slug).toBe(0);
      expect(Object.values(entry.groups).filter((g) => g !== surfaces).every((g) => (g.priority ?? 99) > 0), slug).toBe(true);
      const ids = new Set(entry.materials.map((m) => m.id));
      expect(surfaces.materials.length, slug).toBeGreaterThan(0);
      for (const id of surfaces.materials) expect(ids.has(id), `${slug}: ${id}`).toBe(true);
    }
  });

  it('reuses a scan another scene already ships rather than fetching it twice', () => {
    const urls = new Map();
    for (const defs of Object.values(SCENE_MATERIAL_ASSETS))
      for (const def of defs) urls.set(def.source, new Set([...(urls.get(def.source) ?? []), def.maps.diffuse]));
    for (const [source, set] of urls) expect(set.size, source).toBe(1);
  });
});

describe.each(Object.entries(BUILDS))('%s wears its scans', (slug, { build, min }) => {
  it('binds them on arrival, with usable colour and a compilable shader', () => {
    const built = build();
    const { group, textures, disposed } = fakeScanGroup(THREE, slug);
    expect(scannedMaterials(built.root).size).toBe(0);

    built.applyAssets(group);
    const scanned = scannedMaterials(built.root);
    expect(scanned.size).toBeGreaterThanOrEqual(min);
    for (const material of scanned) {
      expect(material.map?.isTexture).toBe(true);
      expect(material.normalMap?.isTexture).toBe(true);
      expect(material.roughnessMap?.isTexture).toBe(true);
      expect([material.color.r, material.color.g, material.color.b].every(Number.isFinite)).toBe(true);
      const sketch = shaderSketch(THREE, material);
      expect(sketch.fragment).not.toContain('MISSING');
      expect(sketch.fragment).toContain('texture2D( map, scanUv )');
      expect(sketch.fragment.match(/vec2 scanUv=/g)).toHaveLength(1);
      expect(sameBalanceAsBaseline(sketch)).toBe(true);
    }

    // Nothing is downloaded for nothing: every scan the scene asks for is worn
    // by something.
    const worn = new Set([...scanned].map((material) => material.map));
    for (const [id, source] of Object.entries(group.materials)) expect(worn.has(source.map), id).toBe(true);

    // The asset session owns the textures, so tearing the scene down must not
    // free them, and a second delivery of the same group changes nothing.
    built.applyAssets(group);
    expect(scannedMaterials(built.root).size).toBe(scanned.size);
    built.dispose();
    expect(disposed.size).toBe(0);
    expect(textures.length).toBeGreaterThan(0);
  });

  it('keeps its procedural surfaces when no scans arrive', () => {
    const built = build();
    built.applyAssets(undefined);
    built.applyAssets({ groupKey: 'surfaces', materials: {}, models: {} });
    expect(scannedMaterials(built.root).size).toBe(0);
    built.dispose();
  });
});

describe('Bethlehem’s own scans still bind through the shared module', () => {
  it('scans the village surfaces', () => {
    const built = buildBethlehem(THREE, { quality: 'low', motionLibrary: null });
    const { group } = fakeScanGroup(THREE, 'bethlehem');
    built.applyAssets(group);
    expect(scannedMaterials(built.root).size).toBeGreaterThanOrEqual(5);
    built.dispose();
  });
});
