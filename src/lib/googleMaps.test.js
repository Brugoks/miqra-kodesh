import { describe, it, expect } from 'vitest';
import {
  normaliseHeading,
  compassFromYaw,
  localToLatLon,
  satelliteMapUrl,
  streetViewUrl,
  placeMapUrl,
  sceneViewUrl,
} from './googleMaps';
import { getScene } from './scenes';

// The scenes disagree about which way their axes lie against the compass — the
// temple has +X north and +Z east, Capernaum has +X east and +Z north — so the
// transform is the part most likely to be silently wrong. A mirrored heading
// still produces a valid URL and a plausible-looking view; it just faces the
// wrong way, which nobody would notice from the code.

const TEMPLE = { lat: 31.778, lon: 35.2354, bearing: 270, xAxis: 0 };
const CAPERNAUM = { lat: 32.8806, lon: 35.5752, bearing: 180, xAxis: 90 };

const params = (url) => Object.fromEntries(new URL(url).searchParams);

describe('normaliseHeading', () => {
  it('wraps into a compass circle', () => {
    expect(normaliseHeading(0)).toBe(0);
    expect(normaliseHeading(370)).toBe(10);
    expect(normaliseHeading(-90)).toBe(270);
    expect(normaliseHeading(Number.NaN)).toBe(0);
  });
});

describe('compassFromYaw', () => {
  it('faces the sanctuary — due west — at the temple', () => {
    expect(compassFromYaw(TEMPLE, 0)).toBeCloseTo(270, 3);
  });

  it('faces the lake — due south — at Capernaum', () => {
    expect(compassFromYaw(CAPERNAUM, 0)).toBeCloseTo(180, 3);
  });

  // Turning the camera one way must turn it the same way on the map, and the
  // two scenes are mirror images of each other in this respect.
  it('turns the right way for each scene’s handedness', () => {
    // A quarter turn takes the camera toward -X in both scenes. At the temple
    // -X is south; at Capernaum -X is west.
    expect(compassFromYaw(TEMPLE, Math.PI / 2)).toBeCloseTo(180, 3);
    expect(compassFromYaw(CAPERNAUM, Math.PI / 2)).toBeCloseTo(270, 3);
  });

  it('wraps rather than running off the end of the circle', () => {
    expect(compassFromYaw(CAPERNAUM, -Math.PI)).toBeCloseTo(0, 3);
  });
});

describe('localToLatLon', () => {
  it('leaves the origin where it is', () => {
    const point = localToLatLon(TEMPLE, 0, 0);
    expect(point.lat).toBeCloseTo(TEMPLE.lat, 9);
    expect(point.lon).toBeCloseTo(TEMPLE.lon, 9);
  });

  it('moves along each scene’s axes in the right compass direction', () => {
    // Temple: +X is north, +Z is east.
    const templeX = localToLatLon(TEMPLE, 200, 0);
    expect(templeX.lat).toBeGreaterThan(TEMPLE.lat);
    expect(templeX.lon).toBeCloseTo(TEMPLE.lon, 6);
    const templeZ = localToLatLon(TEMPLE, 0, 200);
    expect(templeZ.lon).toBeGreaterThan(TEMPLE.lon);
    expect(templeZ.lat).toBeCloseTo(TEMPLE.lat, 6);

    // Capernaum: +X is east, +Z is north.
    const capX = localToLatLon(CAPERNAUM, 100, 0);
    expect(capX.lon).toBeGreaterThan(CAPERNAUM.lon);
    const capZ = localToLatLon(CAPERNAUM, 0, 100);
    expect(capZ.lat).toBeGreaterThan(CAPERNAUM.lat);
  });

  it('moves about the distance it was asked to', () => {
    // 1113.2m north is very close to a hundredth of a degree of latitude.
    const point = localToLatLon(TEMPLE, 1113.2, 0);
    expect(point.lat - TEMPLE.lat).toBeCloseTo(0.01, 5);
  });
});

describe('satelliteMapUrl', () => {
  it('centres a satellite view on the point', () => {
    const url = satelliteMapUrl(32.8806, 35.5752);
    expect(params(url)).toMatchObject({
      api: '1',
      map_action: 'map',
      center: '32.8806,35.5752',
      basemap: 'satellite',
    });
  });

  it('clamps the zoom to what Maps accepts', () => {
    expect(params(satelliteMapUrl(1, 1, { zoom: 99 })).zoom).toBe('21');
    expect(params(satelliteMapUrl(1, 1, { zoom: -5 })).zoom).toBe('0');
  });

  it('returns nothing without real coordinates', () => {
    expect(satelliteMapUrl(undefined, 35)).toBeNull();
    expect(satelliteMapUrl(Number.NaN, Number.NaN)).toBeNull();
  });
});

describe('streetViewUrl', () => {
  it('opens a panorama looking the way it was told to', () => {
    const url = streetViewUrl({ lat: 32.88, lon: 35.57, heading: 170, pitch: -4, fov: 60 });
    expect(params(url)).toMatchObject({
      map_action: 'pano',
      viewpoint: '32.88,35.57',
      heading: '170',
      pitch: '-4',
      fov: '60',
    });
  });

  it('pins a specific panorama when one has been chosen by hand', () => {
    expect(params(streetViewUrl({ lat: 1, lon: 2, panoId: 'abc123' })).pano).toBe('abc123');
  });

  it('clamps pitch and field of view into range', () => {
    const url = streetViewUrl({ lat: 1, lon: 2, pitch: -180, fov: 400 });
    expect(params(url).pitch).toBe('-90');
    expect(params(url).fov).toBe('100');
  });

  it('needs either a point or a panorama', () => {
    expect(streetViewUrl({})).toBeNull();
    expect(streetViewUrl({ panoId: 'abc' })).not.toBeNull();
  });
});

describe('placeMapUrl', () => {
  it('takes the atlas and wiki place shape directly', () => {
    expect(params(placeMapUrl({ la: 32.8806, lo: 35.5752 })).center).toBe('32.8806,35.5752');
  });

  it('returns nothing for a place with no coordinates', () => {
    expect(placeMapUrl(null)).toBeNull();
    expect(placeMapUrl({ n: 'Nowhere' })).toBeNull();
  });
});

describe('sceneViewUrl', () => {
  // Without a confirmed panorama, `viewpoint` means "nearest", and nearest can
  // be a road across a field. Satellite always has an image.
  it('falls back to satellite where no panorama has been confirmed', () => {
    const url = sceneViewUrl(CAPERNAUM, { x: 0, z: -16, yaw: 0 });
    expect(params(url).map_action).toBe('map');
  });

  it('opens Street View once a vantage is confirmed, carrying the live view', () => {
    const url = sceneViewUrl(CAPERNAUM, {
      x: 0, z: -16, yaw: Math.PI / 2, pitch: -0.1, fov: 60, now: { streetView: true },
    });
    const query = params(url);
    expect(query.map_action).toBe('pano');
    // Facing -X, which at Capernaum is west.
    expect(Number(query.heading)).toBeCloseTo(270, 0);
    expect(Number(query.pitch)).toBeCloseTo(-5.7, 0);
  });

  it('uses a hand-picked panorama when the manifest names one', () => {
    const url = sceneViewUrl(CAPERNAUM, { x: 0, z: 0, yaw: 0, now: { panoId: 'xyz' } });
    expect(params(url).pano).toBe('xyz');
  });

  it('returns nothing for a scene with no geography', () => {
    expect(sceneViewUrl(null, { x: 0, z: 0 })).toBeNull();
  });
});

// The manifests are hand-edited, and a scene whose geo block drifts away from
// its axis comments produces a mirrored or rotated view that still looks
// perfectly plausible.
describe('every scene knows where it is', () => {
  it.each([
    ['second-temple', 270, 0],
    ['caesarea', 180, 90],
    ['capernaum', 180, 90],
  ])('%s has a geo block matching its declared axes', (slug, bearing, xAxis) => {
    const scene = getScene(slug);
    expect(scene.geo, `${slug} needs a geo block`).toBeDefined();
    expect(scene.geo.bearing).toBe(bearing);
    expect(scene.geo.xAxis).toBe(xAxis);
    // Somewhere in the Levant, not off the coast of Africa at 0,0.
    expect(scene.geo.lat).toBeGreaterThan(29);
    expect(scene.geo.lat).toBeLessThan(35);
    expect(scene.geo.lon).toBeGreaterThan(33);
    expect(scene.geo.lon).toBeLessThan(37);
  });

  it('puts every vantage within a kilometre of its own site', () => {
    ['second-temple', 'caesarea', 'capernaum'].forEach((slug) => {
      const scene = getScene(slug);
      scene.vantages.forEach((vantage) => {
        const point = localToLatLon(scene.geo, vantage.position[0], vantage.position[2]);
        expect(Math.abs(point.lat - scene.geo.lat), `${slug}/${vantage.id}`).toBeLessThan(0.01);
        expect(Math.abs(point.lon - scene.geo.lon), `${slug}/${vantage.id}`).toBeLessThan(0.01);
      });
    });
  });
});
