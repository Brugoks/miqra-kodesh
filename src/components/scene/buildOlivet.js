// The Mount of Olives at Passover, c. AD 30 (/scene/mount-of-olives).
//
// The builder composes:
//   olivetLandscape.js  the real ground, the groves, spring, the far skyline
//   olivetCity.js       the Temple, the Antonia, the walls and the city across
//                       the Kidron — the view the gospels come here for
//   sceneAir.js         clouds, haze, mist pooled in the Kidron at dawn, and
//                       smoke: the altar's column, the camps' fires
// and adds what stands on the Mount itself: Gethsemane's wall, its old trees,
// the rock and the press; the tombs in the Kidron; a farmhouse on the road
// over the top; the pilgrims' camps; flocks for the feast; and people — on the
// road, at the camps, in the groves — as the real instanced crowd with
// captured motion, the nearest few as full actors. The gospels' events are
// staged one at a time (olivetEvents.js, sceneEpisodes.js).
//
// Axes: +X east, -Z north (olivetDimensions.js). THREE is passed in, so the
// module stays importable in jsdom.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { createCrowd } from './sceneFigures';
import { createProps } from './sceneProps';
import { createSceneHumans } from './sceneHumans';
import { createInstancedCrowd } from './sceneInstancedHumans';
import { loadMotionLibrary, assignCrowdMotion } from './sceneMixamo';
import { createHerd, createBirds } from './sceneAnimals';
import { createEpisodes } from './sceneEpisodes';
import { createSceneAir, makeFogFor } from './sceneAir';
import { makeRandom } from './sceneLandscape';
import { createOlivetLandscape, WIND } from './olivetLandscape';
import { createOlivetCity, ALTAR_TOP } from './olivetCity';
import { OLIVET_EVENT_STAGES, inOlivetEventArea } from './olivetEvents';
import {
  ROAD, GARDEN, PRAYER_ROCK, PRESS, TOMBS, HILLSIDE_TOMBS, FARMSTEAD, CAMPS, WALK,
  groundAt, campTents, roadDistance,
} from './olivetDimensions';
import {
  PRESS_LEVEL, TOMB_LEVELS, floorAt, blockerAt, gardenWallSegments,
} from './olivetNavigation';

// Spring weather: mostly fair, cumulus building over the hills to the west in
// the afternoon, a clear cold night under the Passover moon, mist lying in the
// Kidron at first light. Thin haze: the city is the point of the view.
export const WEATHER = {
  dawn: { cover: 0.28, fog: 0.0007, mist: 1, smoke: 0.9 },
  morning: { cover: 0.32, fog: 0.00055, mist: 0.3, smoke: 0.8 },
  noon: { cover: 0.4, fog: 0.0005, mist: 0, smoke: 0.65 },
  dusk: { cover: 0.42, fog: 0.00065, mist: 0.05, smoke: 1 },
  night: { cover: 0.14, fog: 0.0006, mist: 0.35, smoke: 0.7 },
};
export const fogFor = makeFogFor(WEATHER);

// Where smoke rises from: the altar, which never went out (a column visible
// across the valley), the camps' fires, and ovens in the lower city.
export function smokeSources() {
  return [
    { ...ALTAR_TOP, strength: 2.2, scale: 5 },
    ...CAMPS.map((camp) => ({ x: camp.x, y: groundAt(camp.x, camp.z) + 0.3, z: camp.z, strength: 0.55 })),
    { x: -300, y: 20, z: 520, strength: 0.6, scale: 2.2 },
    { x: -420, y: 26, z: 470, strength: 0.5, scale: 2.2 },
    { x: -680, y: 45, z: 520, strength: 0.5, scale: 2.4 },
  ];
}

export default function buildOlivet(THREE, options = {}) {
  const { quality = 'high', timeOfDay, reducedMotion = false } = options;
  const low = quality === 'low';
  const high = quality === 'high';
  const motionLibrary = 'motionLibrary' in options
    ? options.motionLibrary
    : loadMotionLibrary().catch(() => null);

  const root = new THREE.Group();
  root.name = 'mount-of-olives';
  const random = makeRandom(3301);
  const geometries = [];
  const materials = [];
  const own = {
    g: (g) => { geometries.push(g); return g; },
    m: (m) => { materials.push(m); return m; },
  };

  // --- sky and light ---
  const lighting = applyLighting(THREE, root, {
    slug: 'mount-of-olives',
    timeOfDay,
    skyRadius: 2200,
    low,
  });
  const { sun } = lighting;
  // The sky is a backdrop, never a surface for contact shadows. Its sphere
  // encloses the skyline even when the visitor climbs to the summit.
  lighting.sky.userData.excludeFromAO = true;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 480;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.08;
  }

  // --- the air ---
  const air = createSceneAir(THREE, {
    quality,
    lighting,
    name: 'olivet-air',
    weather: WEATHER,
    wind: WIND,
    // Cloud builds over the hills toward the sea.
    land: { x: -1, z: 0 },
    smokeSources: smokeSources(),
    // Pooled in the Kidron and the valleys south of it at dawn.
    mist: { level: -12, heights: [0, 2, 4], heightsLow: [1.5], centre: [-160, 260], size: [700, 1400], reach: [-140, 280, 320] },
  });
  root.add(air.group);

  // --- the land, and the city across the valley ---
  const landscape = createOlivetLandscape(THREE, { quality, lighting });
  root.add(landscape.group);
  const city = createOlivetCity(THREE, { quality, terrainHeight: landscape.terrainHeight });
  root.add(city.group);

  // --- what stands on the Mount ---
  const M = {
    limestone: own.m(new THREE.MeshStandardMaterial({ color: 0xbdb29a, roughness: 0.95 })),
    rock: own.m(new THREE.MeshStandardMaterial({ color: 0xa89f8b, roughness: 1, flatShading: true })),
    field: own.m(new THREE.MeshStandardMaterial({ color: 0xb2a78e, roughness: 1, flatShading: true })),
    dark: own.m(new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 1 })),
    timber: own.m(new THREE.MeshStandardMaterial({ color: 0x5f4731, roughness: 0.9 })),
    reed: own.m(new THREE.MeshStandardMaterial({ color: 0xa4905f, roughness: 1 })),
    goatHair: own.m(new THREE.MeshStandardMaterial({ color: 0x2c2723, roughness: 1, side: THREE.DoubleSide })),
    flame: own.m(new THREE.MeshBasicMaterial({ color: 0xffb257, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })),
  };
  const shadows = !low;
  const cameraColliders = [...landscape.cameraColliders];
  const occluders = [];
  const solidMaterials = new Set([M.limestone, M.rock, M.field, M.dark]);
  const add = (geometry, material, [x, y, z], { yaw = 0, cast = true, name, collide = solidMaterials.has(material) } = {}) => {
    const mesh = new THREE.Mesh(own.g(geometry), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows;
    if (name) mesh.name = name;
    root.add(mesh);
    if (collide) {
      cameraColliders.push(mesh);
      occluders.push(mesh);
    }
    return mesh;
  };
  // A box by its extents in a frame turned `yaw` about (cx, cz).
  const block = (material, cx, cz, yaw, u0, u1, y0, y1, v0, v1, opts = {}) => {
    const u = (u0 + u1) / 2;
    const v = (v0 + v1) / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // u runs along (cos yaw, -sin yaw) and v along (sin yaw, cos yaw): the
    // same frame as a rotation.y of `yaw`.
    return add(new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0), material,
      [cx + u * c + v * s, (y0 + y1) / 2, cz - u * s + v * c], { yaw, ...opts });
  };
  const dummy = new THREE.Object3D();
  const instances = (geometry, material, placements, name, pose, { cast = true, collide = false } = {}) => {
    const mesh = new THREE.InstancedMesh(own.g(geometry), material, Math.max(1, placements.length));
    mesh.count = placements.length;
    mesh.name = name;
    placements.forEach((p, i) => {
      pose(dummy, p, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows;
    root.add(mesh);
    if (collide) {
      cameraColliders.push(mesh);
      occluders.push(mesh);
    }
    return mesh;
  };

  // Gethsemane's wall: field stones, dry-laid, knee to waist high.
  {
    const pieces = [];
    for (const [ax, az, bx, bz] of gardenWallSegments()) {
      const length = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(length / 1.15));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        pieces.push({ x, z, y: groundAt(x, z), yaw: -Math.atan2(bz - az, bx - ax), l: length / n + 0.08, h: GARDEN.wallHeight * (0.9 + random() * 0.2) });
      }
    }
    instances(new THREE.BoxGeometry(1, 1, 1), M.field, pieces, 'garden-wall', (o, p) => {
      o.position.set(p.x, p.y + (p.h - 0.35) / 2, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.l, p.h + 0.35, GARDEN.wallThickness);
    }, { collide: true });
  }
  // The rock of the agony, a shelf of bedrock with a flat top.
  {
    const { x, z, halfX, halfZ, rise, angle } = PRAYER_ROCK;
    const g = new THREE.DodecahedronGeometry(1, 1);
    const rock = add(g, M.rock, [x, groundAt(x, z) + rise - 0.55, z], { yaw: -angle, name: 'prayer-rock' });
    rock.scale.set(halfX * 1.05, 0.55, halfZ * 1.05);
  }

  // The press yard: paved level, the rock face behind, the basin and wheel,
  // the beam press with its baskets and weights.
  {
    const { x, z, halfX, halfZ, angle, basin, beam } = PRESS;
    const yaw = -angle;
    const lowGround = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => groundAt(x + a * halfX * Math.cos(angle) - b * halfZ * Math.sin(angle), z + a * halfX * Math.sin(angle) + b * halfZ * Math.cos(angle))));
    block(M.limestone, x, z, yaw, -halfX, halfX, lowGround - 1, PRESS_LEVEL, -halfZ, halfZ, { cast: false, name: 'press-yard' });
    block(M.rock, x, z, yaw, halfX - 0.6, halfX + 2.4, lowGround - 1, PRESS_LEVEL + 3.4, -halfZ - 1.5, halfZ + 1.5, { name: 'press-rock' });
    const local = (u, v) => [x + u * Math.cos(angle) - v * Math.sin(angle), z + u * Math.sin(angle) + v * Math.cos(angle)];
    const [bx, bz] = local(basin.dx, basin.dz);
    add(new THREE.CylinderGeometry(basin.radius, basin.radius * 1.05, basin.height, 20), M.limestone, [bx, PRESS_LEVEL + basin.height / 2, bz], { name: 'press-basin' });
    add(new THREE.CylinderGeometry(basin.radius * 0.8, basin.radius * 0.8, 0.02, 20), M.dark, [bx, PRESS_LEVEL + basin.height + 0.005, bz], { cast: false });
    add(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), M.timber, [bx, PRESS_LEVEL + basin.height + 0.4, bz]);
    const wheel = add(new THREE.CylinderGeometry(0.62, 0.62, 0.32, 18), M.limestone, [bx + 0.42, PRESS_LEVEL + basin.height + 0.62, bz], { name: 'press-wheel' });
    wheel.rotation.set(0, 0, Math.PI / 2);
    const axle = add(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), M.timber, [bx + 0.5, PRESS_LEVEL + basin.height + 0.62, bz]);
    axle.rotation.set(0, 0, Math.PI / 2);
    // The beam, rising a little toward its socket in the rock.
    const u0 = beam.dx - beam.length / 2;
    const u1 = beam.dx + beam.length / 2;
    const [cx, cz] = local((u0 + u1) / 2, beam.dz);
    const beamMesh = add(new THREE.BoxGeometry(beam.length, 0.36, 0.42), M.timber, [cx, PRESS_LEVEL + 1.15, cz], { yaw, name: 'press-beam', collide: true });
    beamMesh.rotation.z = 0.04;
    const [fx, fz] = local(beam.frails, beam.dz);
    for (let i = 0; i < 6; i += 1) add(new THREE.CylinderGeometry(0.46, 0.48, 0.1, 14), M.reed, [fx, PRESS_LEVEL + 0.12 + i * 0.12, fz]);
    // The vat the oil runs into, cut in the paving beside the baskets.
    const [vx, vz] = local(beam.frails, beam.dz - 1.3);
    add(new THREE.BoxGeometry(0.9, 0.02, 0.9), M.dark, [vx, PRESS_LEVEL + 0.01, vz], { yaw, cast: false });
    const [wx, wz] = local(u0 + 0.35, beam.dz);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), M.reed, [wx, PRESS_LEVEL + 0.72, wz]);
    add(new THREE.CylinderGeometry(0.32, 0.34, 0.5, 12), M.limestone, [wx, PRESS_LEVEL + 0.25, wz]);
  }

  // The tombs in the Kidron.
  {
    // Each monolith's court, and the quarried rock round three sides of it.
    const court = (tomb, level, half) => {
      const r = half;
      add(new THREE.BoxGeometry(2 * r, 1, 2 * r), M.limestone, [tomb.x, level - 0.5, tomb.z], { cast: false });
      const top = Math.max(groundAt(tomb.x + r + 2, tomb.z), groundAt(tomb.x, tomb.z - r - 2), groundAt(tomb.x, tomb.z + r + 2)) + 1.2;
      block(M.rock, tomb.x, tomb.z, 0, r, r + 3.5, level - 1, top, -r - 3.5, r + 3.5);
      block(M.rock, tomb.x, tomb.z, 0, -r, r + 3.5, level - 1, top, -r - 3.5, -r);
      block(M.rock, tomb.x, tomb.z, 0, -r, r + 3.5, level - 1, top, r, r + 3.5);
    };
    // Engaged columns on each face of a cube.
    const facade = (tomb, level, half, height, count) => {
      const shafts = [];
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 0; k < count; k += 1) {
          const t = -1 + (2 * (k + 0.5)) / count;
          shafts.push({ x: tomb.x + nx * half + nz * t * half * 0.8, z: tomb.z + nz * half + nx * t * half * 0.8 });
        }
      }
      instances(new THREE.CylinderGeometry(0.26, 0.28, 1, 10), M.limestone, shafts, 'tomb-columns', (o, p) => {
        o.position.set(p.x, level + height * 0.45, p.z);
        o.rotation.set(0, 0, 0);
        o.scale.set(1, height * 0.82, 1);
      }, { collide: true });
    };
    const a = TOMBS.absalom;
    const al = TOMB_LEVELS.absalom;
    court(a, al, a.half + a.court);
    add(new THREE.BoxGeometry(2 * a.half, a.cube, 2 * a.half), M.limestone, [a.x, al + a.cube / 2, a.z], { name: 'absaloms-pillar' });
    facade(a, al, a.half, a.cube, 3);
    add(new THREE.BoxGeometry(2 * a.half + 0.5, 0.9, 2 * a.half + 0.5), M.limestone, [a.x, al + a.cube + 0.45, a.z]);
    add(new THREE.BoxGeometry(2 * a.half - 1.2, 1.6, 2 * a.half - 1.2), M.limestone, [a.x, al + a.cube + 1.7, a.z]);
    add(new THREE.CylinderGeometry(2.4, 2.6, a.drum, 24), M.limestone, [a.x, al + a.cube + 2.5 + a.drum / 2, a.z]);
    // The concave cone: a lathe of a curve drawn in toward the top.
    const cone = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      cone.push(new THREE.Vector2(2.3 * (1 - t) ** 1.8 + 0.12, t * a.cone));
    }
    add(new THREE.LatheGeometry(cone, 24), M.limestone, [a.x, al + a.cube + 2.5 + a.drum, a.z], { name: 'absalom-cone' });

    const zc = TOMBS.zechariah;
    const zl = TOMB_LEVELS.zechariah;
    court(zc, zl, zc.half + zc.court);
    add(new THREE.BoxGeometry(2 * zc.half, zc.cube, 2 * zc.half), M.limestone, [zc.x, zl + zc.cube / 2, zc.z], { name: 'zechariahs-tomb' });
    facade(zc, zl, zc.half, zc.cube, 2);
    add(new THREE.BoxGeometry(2 * zc.half + 0.7, 0.7, 2 * zc.half + 0.7), M.limestone, [zc.x, zl + zc.cube + 0.35, zc.z]);
    const pyramid = add(new THREE.ConeGeometry((zc.half + 0.2) * Math.SQRT2, zc.pyramid, 4), M.limestone, [zc.x, zl + zc.cube + 0.7 + zc.pyramid / 2, zc.z], { name: 'zechariah-pyramid' });
    pyramid.rotation.y = Math.PI / 4;

    // Bene Hezir: a Doric porch cut into the cliff, facing west.
    const h = TOMBS.hezir;
    const hl = TOMB_LEVELS.hezir;
    const top = groundAt(h.x + 8, h.z) + 1.5;
    const half = h.width / 2;
    block(M.rock, h.x, h.z, 0, 0, h.depth + 6, hl - 1, top, -half - 4, -half);
    block(M.rock, h.x, h.z, 0, 0, h.depth + 6, hl - 1, top, half, half + 4);
    block(M.rock, h.x, h.z, 0, 0, h.depth + 6, hl + h.height, top, -half, half);
    block(M.dark, h.x, h.z, 0, h.depth, h.depth + 0.3, hl, hl + h.height, -half, half, { cast: false });
    add(new THREE.BoxGeometry(h.depth + 1, 0.6, h.width), M.limestone, [h.x + (h.depth + 1) / 2 - 0.5, hl - 0.3, h.z], { cast: false });
    for (const dz of [-1.35, 1.35]) add(new THREE.CylinderGeometry(0.34, 0.38, h.height - 1.2, 12), M.limestone, [h.x + 0.4, hl + (h.height - 1.2) / 2, h.z + dz]);
    for (const dz of [-half + 0.4, half - 0.4]) add(new THREE.BoxGeometry(0.8, h.height - 1.2, 0.8), M.limestone, [h.x + 0.4, hl + (h.height - 1.2) / 2, h.z + dz]);
    add(new THREE.BoxGeometry(0.9, 1.2, h.width), M.limestone, [h.x + 0.35, hl + h.height - 0.6, h.z], { name: 'bene-hezir' });

    // Family tombs on the slope, doorways closed with square stones.
    for (const [x, z, facing] of HILLSIDE_TOMBS) {
      const y = groundAt(x, z);
      const face = block(M.rock, x, z, facing, -1.8, 1.8, y - 1, y + 2.6, 0, 2.2);
      face.name = 'hillside-tomb';
      block(M.dark, x, z, facing, -0.36, 0.36, y, y + 0.9, -0.02, 0.02, { cast: false });
      block(M.limestone, x, z, facing, 0.5, 1.3, y, y + 0.95, -0.35, -0.1);
    }
  }

  // The farmhouse by the road over the top.
  {
    const f = FARMSTEAD;
    const base = Math.min(groundAt(f.x0, f.z0), groundAt(f.x1, f.z0), groundAt(f.x0, f.z1), groundAt(f.x1, f.z1)) - 0.5;
    const top = Math.max(groundAt(f.x0, f.z0), groundAt(f.x0, f.z1)) + f.height;
    const wall = (x0, x1, z0, z1, y0 = base, y1 = top) => add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), M.limestone, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], { name: 'farmstead' });
    wall(f.x0, f.x0 + 0.6, f.z0, f.door.z0);
    wall(f.x0, f.x0 + 0.6, f.door.z1, f.z1);
    wall(f.x0, f.x0 + 0.6, f.door.z0, f.door.z1, groundAt(f.x0, f.door.z0) + 2.1);
    wall(f.x1 - 0.6, f.x1, f.z0, f.z1);
    wall(f.x0, f.x1, f.z0, f.z0 + 0.6);
    wall(f.x0, f.x1, f.z1 - 0.6, f.z1);
    add(new THREE.BoxGeometry(f.x1 - f.x0 + 0.3, 0.3, f.z1 - f.z0 + 0.3), M.field, [(f.x0 + f.x1) / 2, top + 0.15, (f.z0 + f.z1) / 2]);
    add(new THREE.BoxGeometry(0.05, 2.1, f.door.z1 - f.door.z0), M.dark, [f.x0 + 0.62, groundAt(f.x0, f.door.z0) + 1.05, (f.door.z0 + f.door.z1) / 2], { cast: false });
  }

  // The pilgrims' camps: goat-hair tents round a fire.
  const tents = campTents();
  const tentShape = (() => {
    // A ridge tent: a triangular prism, its length along local Z.
    const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    g.rotateX(Math.PI / 2);
    // Rotated so its apex is up and its two eaves at the ground.
    g.rotateZ(Math.PI);
    g.translate(0, 0.5, 0);
    return g;
  })();
  instances(tentShape, M.goatHair, tents, 'camp-tents', (o, p) => {
    o.position.set(p.x, groundAt(p.x, p.z) - 0.1, p.z);
    o.rotation.set(0, p.facing, 0);
    o.scale.set(p.width / 1.732, p.height / 1.5, p.length);
  }, { collide: true });
  const flames = [];
  const ringStones = CAMPS.flatMap((camp) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const x = camp.x + Math.cos(a) * 0.55;
    const z = camp.z + Math.sin(a) * 0.55;
    return { x, z, y: groundAt(x, z), a };
  }));
  instances(new THREE.DodecahedronGeometry(0.14, 0), M.field, ringStones, 'camp-fire-stones', (o, p) => {
    o.position.set(p.x, p.y + 0.05, p.z);
    o.rotation.set(p.a, p.a * 2, 0);
    o.scale.setScalar(1);
  }, { cast: false });
  for (const camp of CAMPS) {
    const y = groundAt(camp.x, camp.z);
    const flame = add(new THREE.ConeGeometry(0.2, 0.55, 8), M.flame, [camp.x, y + 0.3, camp.z], { cast: false, name: 'camp-fire' });
    flame.userData.phase = flames.length * 1.9;
    flames.push(flame);
  }

  // --- animals: flocks for the feast, donkeys at the camps, birds ---
  const animals = [];
  const flockAt = (cx, cz, n, spread) => {
    for (let i = 0; i < n; i += 1) {
      const x = cx + (random() - 0.5) * spread;
      const z = cz + (random() - 0.5) * spread;
      if (blockerAt(x, z) || inOlivetEventArea(x, z)) continue;
      animals.push({
        species: i % 5 === 4 ? 'goat' : 'sheep',
        pose: i % 4 === 3 ? 'lie' : 'graze',
        wander: i % 4 === 3 ? null : { cx: x, cz: z, r: 0.8 + random() * 1.2, speed: 0.07 },
        x, z, facing: random() * 6, phase: random() * 10, scale: 0.85 + random() * 0.2,
      });
    }
  };
  flockAt(236, -128, low ? 6 : 14, 14);
  flockAt(126, 360, low ? 4 : 9, 10);
  for (const camp of CAMPS) flockAt(camp.x + camp.radius + 4, camp.z + 3, low ? 2 : 4, 5);
  for (const [i, camp] of CAMPS.entries()) {
    const x = camp.x - camp.radius - 3;
    const z = camp.z - 2;
    if (!blockerAt(x, z)) animals.push({ species: 'donkey', pose: 'stand', x, z, facing: i * 1.3, phase: i * 2, panniers: i % 2 === 0 });
  }
  animals.push({ species: 'dog', pose: 'lie', x: 152, z: -176, facing: 0.8, phase: 1 });
  const herd = createHerd(THREE, { animals, quality, groundAt, name: 'olivet-animals' });
  root.add(herd.group);
  const birds = [];
  for (let i = 0; i < (low ? 4 : 10); i += 1) {
    const cx = -40 + random() * 400;
    const cz = -120 + random() * 360;
    birds.push({ kind: 'swallow', mode: 'dart', cx, cz, r: 10 + random() * 14, y: groundAt(cx, cz) + 5 + random() * 5, speed: 9 + random() * 3, phase: random() * 10 });
  }
  // Doves along the garden wall.
  gardenWallSegments().slice(0, low ? 2 : 5).forEach(([ax, az, bx, bz], i) => {
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    birds.push({ kind: 'dove', mode: 'perch', x, z, y: groundAt(x, z) + GARDEN.wallHeight, facing: random() * 6, phase: i * 3.1 });
  });
  const flock = createBirds(THREE, { birds, quality, name: 'olivet-birds' });
  root.add(flock.group);

  // --- people ---
  // Pilgrims on the road up and down, the camps, workers in the groves, a
  // shepherd with the flock — never on the ground a staged moment stands on.
  const figures = [];
  const clearOf = (x, z) => !inOlivetEventArea(x, z) && !blockerAt(x, z);
  // Walkers: stretches of the road clear of every event, one segment at a
  // time so each route is a straight line along it.
  {
    const pts = ROAD.points;
    let n = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      let run = null;
      const runs = [];
      const nx = -(bz - az) / length;
      const nz = (bx - ax) / length;
      for (let d = 0; d <= length; d += 1) {
        const x = ax + ((bx - ax) * d) / length;
        const z = az + ((bz - az) * d) / length;
        // Clear of every event either side of the way, not just on its line.
        const ok = x > WALK.x0 + 2 && x < WALK.x1 - 2
          && !inOlivetEventArea(x + nx * 1.5, z + nz * 1.5) && !inOlivetEventArea(x - nx * 1.5, z - nz * 1.5);
        if (ok && !run) run = { from: d };
        if (ok) run.to = d;
        if (!ok && run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      for (const { from, to } of runs) {
        if (to - from < 18) continue;
        const per = (to - from) / 45;
        const count = Math.max(1, Math.round(per * (low ? 0.6 : high ? 1.6 : 1)));
        for (let k = 0; k < count; k += 1) {
          const side = (k % 2 ? 1 : -1) * 0.7;
          const p0 = [ax + ((bx - ax) * from) / length + nx * side, az + ((bz - az) * from) / length + nz * side];
          const p1 = [ax + ((bx - ax) * to) / length + nx * side, az + ((bz - az) * to) / length + nz * side];
          const woman = n % 4 === 1;
          figures.push({
            id: `olivet-walker-${n}`,
            kind: woman ? 'woman' : 'man',
            route: k % 2 ? [p1, p0] : [p0, p1],
            speed: 0.95 + random() * 0.3,
            phase: random(),
            activity: n % 5 === 2 ? 'carrying' : 'walking',
            scale: 0.95 + random() * 0.1,
          });
          n += 1;
        }
      }
    }
  }
  // The camps.
  for (const [ci, camp] of CAMPS.entries()) {
    const around = [
      [1.6, 0.2, 'sitting'], [-1.4, 1.1, 'sitting'], [0.3, -1.7, 'kneeling'], [2.6, 2.1, 'talking'],
      [3.2, 1.2, 'attending'], [-2.8, -1.6, 'working'], [-0.6, 2.8, 'standing'],
    ].slice(0, low ? 3 : 7);
    around.forEach(([dx, dz, activity], i) => {
      const x = camp.x + dx;
      const z = camp.z + dz;
      if (!clearOf(x, z)) return;
      figures.push({
        id: `olivet-camp-${ci}-${i}`,
        kind: i === 5 || i === 2 ? 'woman' : 'man',
        x, z, facing: Math.atan2(camp.x - x, camp.z - z) + (random() - 0.5) * 0.6,
        activity, phase: random() * 12, scale: 0.94 + random() * 0.12,
      });
    });
    if (!low) {
      const x = camp.x - 4;
      const z = camp.z + 5;
      if (clearOf(x, z)) figures.push({ id: `olivet-camp-${ci}-child`, kind: 'child', route: [[x, z], [x + 7, z - 2]], speed: 1.8, phase: random(), activity: 'walking', scale: 0.6 });
    }
  }
  // Workers in the groves: hoeing round the trees, carrying baskets.
  const groveSpots = [[120, -40], [200, 40], [260, -60], [60, 220], [300, 250], [420, -120], [160, 280], [40, -170]];
  groveSpots.slice(0, low ? 3 : groveSpots.length).forEach(([x, z], i) => {
    if (!clearOf(x, z) || roadDistance(x, z).distance < 4) return;
    figures.push({ id: `olivet-grove-${i}`, kind: 'man', x, z, facing: random() * 6, activity: i % 3 === 2 ? 'carrying' : 'working', phase: random() * 12 });
  });
  // The shepherd with the flock on the north slope, and one at the tombs.
  figures.push({ id: 'olivet-shepherd', kind: 'man', x: 228, z: -118, facing: 2.2, activity: 'standing', phase: 3 });
  if (clearOf(-100, 330)) figures.push({ id: 'olivet-mourner', kind: 'woman', x: -100, z: 330, facing: Math.PI / 2, activity: 'praying', phase: 5 });

  const kept = figures.filter((figure) => (figure.route ? true : clearOf(figure.x, figure.z)));
  kept.forEach((figure) => { figure.y = groundAt(figure.x ?? figure.route[0][0], figure.z ?? figure.route[0][1]); });
  kept.forEach(assignCrowdMotion);

  const ground = (x, z) => groundAt(x, z);
  const crowd = createCrowd(THREE, { figures: kept, quality, name: 'olivet-crowd', groundAt: ground });
  root.add(crowd.group);
  const nearActor = new Set();
  const realCrowd = createInstancedCrowd(THREE, {
    figures: kept,
    quality,
    name: 'olivet-crowd-real',
    groundAt: ground,
    onReach: (id, inReach) => crowd.suppress(id, inReach || nearActor.has(id)),
    motionLibrary,
    onBuilt: () => {
      if (!Number.isFinite(realCrowd.reach)) crowd.group.visible = false;
    },
  });
  root.add(realCrowd.group);
  const humans = createSceneHumans({
    sceneSlug: 'mount-of-olives',
    THREE,
    root,
    groundAt: ground,
    floorAt: (x, z) => floorAt(x, z)?.height ?? groundAt(x, z),
    crowdFigures: kept,
    qualityProfile: quality,
    reducedMotion,
    actorLimits: { low: 3, balanced: 5, high: 8 },
    actorRange: { low: 10, balanced: 12, high: 15 },
    motionLibrary,
    onFallbackSuppressed: (id, isSuppressed) => {
      if (isSuppressed) nearActor.add(id);
      else nearActor.delete(id);
      realCrowd.suppress(id, isSuppressed);
      crowd.suppress(id, isSuppressed || realCrowd.inReach(id));
    },
  });

  // --- what happened here ---
  const episodes = createEpisodes(Object.fromEntries(Object.entries(OLIVET_EVENT_STAGES)
    .map(([id, stage]) => [id, stage.create(THREE, { root, active: false, motionLibrary })])));
  const updateHumans = humans.update;
  const acceptHumanAssets = humans.acceptAssets;
  const humanClearance = humans.queryClearance;
  humans.update = (updateOptions) => {
    updateHumans(updateOptions);
    episodes.update(updateOptions);
  };
  humans.acceptAssets = (assets) => {
    acceptHumanAssets(assets);
    episodes.acceptAssets(assets);
    if (realCrowd.acceptAssets(assets) && !Number.isFinite(realCrowd.reach)) crowd.group.visible = false;
  };
  humans.queryClearance = (...args) => {
    const clearance = episodes.queryClearance(...args);
    if (clearance.collides) return clearance;
    return humanClearance(...args);
  };

  // The staged moments' firelight — torches in the garden, the fire the
  // twelve lodged round — from a fixed pool of lights moved onto the anchors
  // the staged moment carries (olivetEvents.js lightAnchor). A fixed count,
  // because a light appearing makes three.js recompile every material in the
  // scene; on lighter settings the flames' own glow stands alone.
  const glow = high ? [0, 1, 2].map((i) => {
    const light = new THREE.PointLight(0xff9a48, 0, 12, 1.6);
    light.name = `firelight-${i}`;
    root.add(light);
    return light;
  }) : [];
  let anchors = [];
  let anchoredTo = undefined;
  const findAnchors = () => {
    const id = episodes.getEpisode();
    const stage = id ? episodes.getStage(id) : null;
    if (id === anchoredTo && (anchors.length || !stage?.isReady?.())) return;
    anchoredTo = id;
    anchors = [];
    stage?.group.traverse((node) => { if (node.userData.light) anchors.push(node); });
  };
  const anchorAt = new THREE.Vector3();
  const light = (elapsed) => {
    if (!glow.length) return;
    findAnchors();
    glow.forEach((lamp, i) => {
      const anchor = anchors[i];
      if (!anchor) { lamp.intensity = 0; return; }
      const spec = anchor.userData.light;
      anchor.getWorldPosition(anchorAt);
      lamp.position.copy(anchorAt);
      lamp.color.setHex(spec.colour);
      lamp.distance = spec.distance;
      lamp.intensity = spec.intensity * (0.88 + Math.sin(elapsed * 11 + i * 2.3) * 0.08 + Math.sin(elapsed * 29 + i) * 0.04);
    });
  };

  // --- what the camps and the press leave lying about ---
  const items = [];
  for (const camp of CAMPS) {
    const kinds = ['waterJar', 'jar', 'basket', 'sack', 'bundle'];
    for (let i = 0; i < (low ? 3 : 6); i += 1) {
      const a = random() * Math.PI * 2;
      const r = 2.2 + random() * 1.2;
      const x = camp.x + Math.cos(a) * r;
      const z = camp.z + Math.sin(a) * r;
      if (!clearOf(x, z)) continue;
      items.push({ kind: kinds[i % kinds.length], x, z, y: groundAt(x, z), rotation: random() * 6, scale: 0.9 + random() * 0.2 });
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const u = -PRESS.halfX + 1 + i * 0.7;
    const v = PRESS.halfZ - 0.6;
    items.push({ kind: i % 2 ? 'waterJar' : 'jar', x: PRESS.x + u * Math.cos(PRESS.angle) - v * Math.sin(PRESS.angle), z: PRESS.z + u * Math.sin(PRESS.angle) + v * Math.cos(PRESS.angle), y: PRESS_LEVEL, rotation: i, scale: 1 });
  }
  const props = createProps(THREE, { items, quality });
  root.add(props.group);

  // --- the hour ---
  let hour = resolveTimeOfDay(timeOfDay);
  const applyHour = (time) => {
    hour = time;
    landscape.onTimeOfDay(time);
    air.onTimeOfDay(time);
  };
  applyHour(lighting.current || hour);

  function update(elapsed, dt, frame) {
    if (frame?.camera) lighting.sky.position.copy(frame.camera.position);
    air.update(elapsed);
    landscape.update(elapsed, dt, frame);
    realCrowd.update(elapsed, frame?.camera?.position ?? null);
    if (!realCrowd.ready || Number.isFinite(realCrowd.reach)) crowd.update(elapsed);
    herd.update(elapsed);
    flock.update(elapsed);
    light(elapsed);
    // Camp fires: brighter after dark, and never still.
    const night = hour?.id === 'night' ? 1 : hour?.id === 'dusk' ? 0.8 : hour?.id === 'dawn' ? 0.6 : 0.35;
    for (const flame of flames) {
      const f = 0.85 + Math.sin(elapsed * 9 + flame.userData.phase) * 0.1 + Math.sin(elapsed * 23 + flame.userData.phase * 2) * 0.05;
      flame.scale.set(f, f * (0.9 + night * 0.3), f);
      flame.material.opacity = 0.55 + night * 0.4;
    }
  }

  function dispose() {
    episodes.dispose();
    realCrowd.dispose();
    humans.dispose();
    crowd.dispose();
    props.dispose();
    herd.dispose();
    flock.dispose();
    air.dispose();
    landscape.dispose();
    city.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    // And whatever else hangs off the root — the sky dome and its light —
    // now that the shared character meshes have been detached above.
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
  }

  const time = resolveTimeOfDay(timeOfDay);
  // The opening follow-camera pose is resolved before the first render.
  root.updateMatrixWorld(true);
  return {
    root,
    sun,
    lighting,
    humans,
    landscape,
    city,
    figures: kept,
    update: (elapsed, dt, frame) => update(elapsed, dt, frame),
    episodes: episodes.ids,
    setEpisode: episodes.setEpisode,
    getEpisode: episodes.getEpisode,
    getEpisodeStage: episodes.getStage,
    firelight: glow,
    realCrowd,
    dispose,
    fog: time.fog,
    exposure: time.exposure,
    fogFor: (t) => air.fogFor(t),
    onTimeOfDay: applyHour,
    prepareRenderer: (renderer, world) => air.prepareRenderer(renderer, world),
    shadowFollow: low ? null : { extent: 50 },
    cameraColliders,
    occluders,
    applyAssets: (group) => humans.acceptAssets(group),
    applyQuality: (profile) => humans.setQuality(profile),
  };
}
