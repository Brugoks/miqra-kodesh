import { describe, it, expect } from 'vitest';
import {
  SCENES,
  SCENE_DISCLAIMER,
  getScene,
  sceneForPlace,
  hasScene,
  resolveScene,
  vantageById,
  defaultVantage,
  scenePath,
} from './scenes';
import atlas from '../assets/bible-atlas.json';

describe('scene lookup', () => {
  it('finds a scene by its own slug', () => {
    expect(getScene('second-temple')?.title).toBe('Herod’s Temple');
  });

  it('finds a scene by the place it stands on', () => {
    expect(sceneForPlace('jerusalem')?.slug).toBe('second-temple');
  });

  it('resolves either identifier through the route helper', () => {
    expect(resolveScene('second-temple')?.slug).toBe('second-temple');
    expect(resolveScene('jerusalem')?.slug).toBe('second-temple');
  });

  it('returns null rather than throwing for places and slugs with no scene', () => {
    expect(getScene('nineveh')).toBeNull();
    expect(sceneForPlace('nineveh')).toBeNull();
    expect(resolveScene('nineveh')).toBeNull();
    expect(resolveScene(undefined)).toBeNull();
    expect(hasScene('nineveh')).toBe(false);
    expect(hasScene('jerusalem')).toBe(true);
  });

  it('builds the route path for a scene', () => {
    expect(scenePath(getScene('second-temple'))).toBe('/scene/second-temple');
    expect(scenePath(null)).toBeNull();
  });
});

describe('Caesarea lookup', () => {
  it('registers the coastal Acts scene without replacing the Temple', () => {
    const scene = getScene('caesarea');
    expect(scene?.title).toBe('Caesarea Maritima');
    expect(sceneForPlace('caesarea')).toBe(scene);
    expect(scenePath(scene)).toBe('/scene/caesarea');
    expect(scene?.disclaimer).toMatch(/illustrative/i);
    expect(scene?.disclaimer).not.toMatch(/Middot/);
    expect(getScene('second-temple')?.title).toBe('Herod’s Temple');
  });
});

describe('vantages', () => {
  const scene = getScene('second-temple');

  it('opens on the declared default vantage', () => {
    expect(defaultVantage(scene).id).toBe(scene.defaultVantage);
  });

  // The manifest is hand-edited data, so the fallback matters: a typo'd
  // `defaultVantage` must still land the camera somewhere rather than crash
  // the route with a null start position.
  it('falls back to the first vantage when the default id is stale', () => {
    const broken = { ...scene, defaultVantage: 'no-such-vantage' };
    expect(defaultVantage(broken).id).toBe(scene.vantages[0].id);
  });

  it('returns null for an unknown vantage or a missing scene', () => {
    expect(vantageById(scene, 'no-such-vantage')).toBeNull();
    expect(vantageById(null, 'court-of-women')).toBeNull();
    expect(defaultVantage(null)).toBeNull();
  });
});

// These guard the data itself. The 3D route reads every field below without
// defending against a malformed entry, on the grounds that a bad manifest
// should fail here rather than as a blank screen with a console error.
describe('scene manifest integrity', () => {
  const coordinate = (value) => {
    expect(Array.isArray(value)).toBe(true);
    expect(value).toHaveLength(3);
    value.forEach((n) => expect(Number.isFinite(n)).toBe(true));
  };

  it.each(SCENES.map((scene) => [scene.slug, scene]))('%s is well formed', (_slug, scene) => {
    expect(scene.title).toBeTruthy();
    expect(scene.subtitle).toBeTruthy();
    expect(scene.blurb.length).toBeGreaterThan(80);
    expect(scene.vantages.length).toBeGreaterThan(0);
    expect(scene.hotspots.length).toBeGreaterThan(0);

    const ids = [...scene.vantages, ...scene.hotspots].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    scene.vantages.forEach((vantage) => {
      coordinate(vantage.position);
      coordinate(vantage.lookAt);
      expect(vantage.label).toBeTruthy();
      expect(vantage.blurb).toBeTruthy();
      expect(vantage.refs.length).toBeGreaterThan(0);
      // A vantage that looks at its own eye point gives atan2(0, 0) and a
      // camera pointing nowhere in particular.
      expect(vantage.lookAt).not.toEqual(vantage.position);
    });

    scene.hotspots.forEach((hotspot) => {
      coordinate(hotspot.position);
      expect(hotspot.label).toBeTruthy();
      expect(hotspot.body).toBeTruthy();
      expect(hotspot.refs.length).toBeGreaterThan(0);
      expect(hotspot.maxDistance).toBeGreaterThan(0);
    });
  });

  // The atlas sheet's "Step inside" button sits next to "Open wiki page", so a
  // scene hung on a slug the atlas doesn't carry would render a button on a pin
  // that never appears.
  it.each(SCENES.map((scene) => [scene.slug, scene.placeSlug]))(
    '%s stands on a real wiki-backed atlas place',
    (_slug, placeSlug) => {
      const place = atlas.places.find((p) => p.s === placeSlug);
      expect(place).toBeDefined();
      expect(place.w).toBe(true);
    },
  );

  it('states plainly that the scenes are reconstructions', () => {
    expect(SCENE_DISCLAIMER).toMatch(/reconstruction/i);
  });
});
