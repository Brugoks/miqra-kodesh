import { describe, it, expect } from 'vitest';
import {
  SCENES,
  SCENE_DISCLAIMER,
  getScene,
  sceneForPlace,
  hasScene,
  resolveScene,
  vantageById,
  hotspotsFor,
  sceneLinkPath,
  resolveSceneLink,
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

describe('events', () => {
  const scene = getScene('capernaum');
  const hours = new Set(['dawn', 'morning', 'noon', 'dusk', 'night']);

  it('lists what happened, each with its words, its place, its hour and its passage', () => {
    expect(scene.events.length).toBeGreaterThanOrEqual(10);
    const ids = [...scene.vantages, ...scene.hotspots, ...scene.events].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const event of scene.events) {
      expect(event.label, event.id).toBeTruthy();
      expect(event.body.length, event.id).toBeGreaterThan(120);
      expect(event.place, event.id).toBeTruthy();
      expect(hours.has(event.hour), event.id).toBe(true);
      expect(event.refs.length, event.id).toBeGreaterThan(0);
      expect(event.position.every(Number.isFinite), event.id).toBe(true);
      expect(event.lookAt).not.toEqual(event.position);
    }
    expect(scene.events.some((event) => event.id === scene.defaultEvent)).toBe(true);
  });

  it('links vantages and pins only to events that exist', () => {
    const ids = new Set(scene.events.map((event) => event.id));
    for (const item of [...scene.vantages, ...scene.hotspots]) {
      for (const id of [].concat(item.event || [])) expect(ids.has(id), `${item.id} -> ${id}`).toBe(true);
    }
  });

  it('shows an event’s pins only while it is staged, and everyone else’s always', () => {
    const during = hotspotsFor(scene, 'temple-tax').map((hotspot) => hotspot.id);
    expect(during).toContain('a-shekel');
    expect(during).not.toContain('the-fringe');
    expect(during).toContain('the-lake');
    const synagogue = hotspotsFor(scene, 'bread-of-life').map((hotspot) => hotspot.id);
    expect(synagogue).toContain('the-reading');
    expect(synagogue).not.toContain('the-unclean-spirit');
    expect(hotspotsFor(scene, null).every((hotspot) => !hotspot.event)).toBe(true);
    expect(hotspotsFor(null, 'x')).toEqual([]);
  });
});

describe('scene links', () => {
  const scene = getScene('capernaum');

  it('writes a link to an event, a vantage or a pin', () => {
    expect(sceneLinkPath(scene, 'event', 'sundown')).toBe('/scene/capernaum?event=sundown');
    expect(sceneLinkPath(scene, 'vantage', 'the-shore')).toBe('/scene/capernaum?at=the-shore');
    expect(sceneLinkPath(scene, 'hotspot', 'the-lake')).toBe('/scene/capernaum?pin=the-lake');
    expect(sceneLinkPath(scene, 'nonsense', 'x')).toBe('/scene/capernaum');
    expect(sceneLinkPath(null, 'event', 'x')).toBeNull();
  });

  it('opens an event at its standpoint and its hour, staged', () => {
    const link = resolveSceneLink(scene, '?event=sundown');
    expect(link.kind).toBe('event');
    expect(link.target.id).toBe('sundown');
    expect(link.standpoint).toBe(link.target);
    expect(link.eventId).toBe('sundown');
    expect(link.hour).toBe('dusk');
  });

  it('opens a vantage with the event its blurb describes', () => {
    const link = resolveSceneLink(scene, '?at=inside-the-house');
    expect(link).toMatchObject({ kind: 'vantage', eventId: 'paralytic', hour: null });
    // A vantage with no event of its own keeps the scene's default one.
    expect(resolveSceneLink(getScene('second-temple'), '?at=solomons-portico').eventId).toBeNull();
  });

  it('opens a pin from its event if it has one, and from the nearest vantage if not', () => {
    const own = resolveSceneLink(scene, '?pin=the-fringe');
    expect(own).toMatchObject({ kind: 'hotspot', eventId: 'the-woman', hour: 'morning' });
    expect(own.standpoint.id).toBe('the-woman');
    const loose = resolveSceneLink(scene, '?pin=the-house');
    expect(scene.vantages).toContain(loose.standpoint);
    expect(loose.standpoint.id).toBe('inside-the-house');
  });

  it('ignores a link to nothing', () => {
    expect(resolveSceneLink(scene, '')).toBeNull();
    expect(resolveSceneLink(scene, '?event=no-such-event')).toBeNull();
    expect(resolveSceneLink(null, '?event=sundown')).toBeNull();
  });
});
