// What stands inside and around the walls: the Temple, the houses Nehemiah 3
// names, the ruins of the kings' houses, the pools and the springs, the
// governor's seat, the tombs of David, the Broad Wall and the rubble of the
// fall — and the few things a staged moment brings with it, a wooden platform
// for the reading at the Water Gate and the booths of the Feast.
//
// It is a city that has not been rebuilt: "the city was wide and large, but
// the people within it were few, and no houses had been rebuilt" (Nehemiah
// 7:4). So most of what is built here is a ruin, and what is not is the
// Temple, the walls' work, and the handful of houses whose owners the text
// gives by name.
//
// Footprints are the navigation's own (nehemiahDimensions.js), so what is
// drawn solid is solid. three.js is passed in, so the module stays importable
// in jsdom.

import {
  HOUSES, RUINS, POOLS, GIHON, DRAGON_SPRING, HEZEKIAH_TUNNEL, TEMPLE, MOUNT, GOVERNOR_SEAT, TOMBS_OF_DAVID, BROAD_WALL,
  RUBBLE_FIELDS, WATER_SQUARE, streetDistance, inEventArea, groundAt, STREETS,
} from './nehemiahDimensions.js';
import { makeRandom } from './sceneLandscape.js';

const T = TEMPLE;
export const ALTAR_TOP = { x: T.altar.x, y: MOUNT.level + T.altar.height, z: T.altar.z };

// Where the reading at the Water Gate stands, and the booths of the Feast.
export const PLATFORM = { x: -17, z: -92, w: 5.2, d: 3.4, height: 1.5 };
export const BOOTHS = [
  [-262, -246, 0.3], [-252, -268, -0.4], [-238, -240, 0.9], [-232, -262, 0.2], [-272, -268, 1.2], [-246, -232, -0.7],
];

export function createNehemiahCity(THREE, options = {}) {
  const {
    quality = 'high', materials: M, shadows = true, terrainHeight = groundAt,
  } = options;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'nehemiah-city';
  const geometries = [];
  const own = (g) => { geometries.push(g); return g; };
  const occluders = [];
  const cameraColliders = [];
  const random = makeRandom(6161);
  const dummy = new THREE.Object3D();

  const add = (geometry, material, [x, y, z], {
    yaw = 0, cast = true, name, collide = true, parent = group,
  } = {}) => {
    const mesh = new THREE.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows;
    if (name) mesh.name = name;
    parent.add(mesh);
    if (collide) {
      occluders.push(mesh);
      cameraColliders.push(mesh);
    }
    return mesh;
  };
  const instanced = (geometry, material, placements, name, pose, { cast = true, parent = group } = {}) => {
    if (!placements.length) return null;
    const mesh = new THREE.InstancedMesh(own(geometry), material, placements.length);
    mesh.name = name;
    placements.forEach((p, i) => {
      pose(dummy, p, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows;
    parent.add(mesh);
    return mesh;
  };
  const corners = (x, z, w, d, yaw) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const u = a * w / 2;
      const v = b * d / 2;
      return [x + u * c + v * s, z - u * s + v * c];
    });
  };
  const heightsUnder = (x, z, w, d, yaw) => corners(x, z, w, d, yaw).map(([px, pz]) => terrainHeight(px, pz));

  // --- the houses of Nehemiah 3 ------------------------------------------------
  // Each a plastered stone box with a flat roof of beaten earth and a low
  // parapet, its door toward the nearest street.
  for (const house of HOUSES) {
    const hs = heightsUnder(house.x, house.z, house.w, house.d, house.yaw);
    const base = Math.min(...hs) - 0.5;
    const top = Math.max(...hs) + house.height;
    const body = add(new THREE.BoxGeometry(house.w, top - base, house.d), M.plaster, [house.x, (base + top) / 2, house.z], { yaw: house.yaw, name: house.id });
    body.userData.house = house.id;
    add(new THREE.BoxGeometry(house.w + 0.4, 0.3, house.d + 0.4), M.earthRoof, [house.x, top + 0.15, house.z], { yaw: house.yaw, cast: false, collide: false });
    // The door, on the side facing the nearest street.
    const street = STREETS.map((st) => st.points).flat().reduce((best, p) => {
      const d = Math.hypot(p[0] - house.x, p[1] - house.z);
      return d < best.d ? { d, p } : best;
    }, { d: Infinity, p: [house.x, house.z + 1] }).p;
    const toward = Math.atan2(street[0] - house.x, street[1] - house.z) - house.yaw;
    const side = Math.round(toward / (Math.PI / 2)) % 4;
    const faces = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const [fx, fz] = faces[((side % 4) + 4) % 4];
    const rx = fx * (house.w / 2 + 0.02);
    const rz = fz * (house.d / 2 + 0.02);
    const c = Math.cos(house.yaw);
    const s = Math.sin(house.yaw);
    const doorX = house.x + rx * c + rz * s;
    const doorZ = house.z - rx * s + rz * c;
    const doorY = terrainHeight(doorX, doorZ) + 0.95;
    add(new THREE.BoxGeometry(fx !== 0 ? 0.08 : 1.1, 1.9, fz !== 0 ? 0.08 : 1.1), M.dark, [doorX, doorY, doorZ], { yaw: house.yaw, cast: false, collide: false });
    // A little smoke-blackened lintel and a stack of firewood make a door a door.
    add(new THREE.BoxGeometry(fx !== 0 ? 0.14 : 1.5, 0.22, fz !== 0 ? 0.14 : 1.5), M.timber, [doorX, doorY + 1.0, doorZ], { yaw: house.yaw, cast: false, collide: false });
  }

  // --- ruins of a greater age ------------------------------------------------------
  {
    const pieces = [];
    for (const ruin of RUINS) {
      if (ruin.id === 'stepped-stone-structure') continue;
      const hs = heightsUnder(ruin.x, ruin.z, ruin.w, ruin.d, ruin.yaw);
      const base = Math.min(...hs) - 0.6;
      for (const [along, length, depth, sign] of [[0, ruin.w, ruin.d, 1], [0, ruin.w, ruin.d, -1], [1, ruin.d, ruin.w, 1], [1, ruin.d, ruin.w, -1]]) {
        const n = Math.max(2, Math.round(length / 3.4));
        for (let k = 0; k < n; k += 1) {
          const corner = k === 0 || k === n - 1;
          if (!corner && random() < 0.22) continue;
          const t = ((k + 0.5) / n - 0.5) * length;
          const u = along === 0 ? t : sign * (depth / 2);
          const v = along === 0 ? sign * (depth / 2) : t;
          const c = Math.cos(ruin.yaw);
          const s = Math.sin(ruin.yaw);
          const x = ruin.x + u * c + v * s;
          const z = ruin.z - u * s + v * c;
          const h = ruin.height * (0.25 + 0.75 * random() ** 1.4);
          const y1 = terrainHeight(x, z) + h;
          pieces.push({
            x, z, y0: base, y1, l: length / n + 0.15, t: 1.3 + random() * 0.5, yaw: ruin.yaw + (along ? Math.PI / 2 : 0),
          });
        }
      }
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), M.rubbleStone, pieces, 'ruin-walls', (o, p) => {
      o.position.set(p.x, (p.y0 + p.y1) / 2, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.l, p.y1 - p.y0, p.t);
    });
    // The rubble inside them, and the stepped stone structure, a tiered
    // terrace that carried houses on the slope above the Gihon and fell.
    const heaps = [];
    for (const ruin of RUINS) {
      const n = ruin.id === 'stepped-stone-structure' ? 0 : Math.round(ruin.w * ruin.d / 22);
      for (let k = 0; k < n; k += 1) {
        const x = ruin.x + (random() - 0.5) * ruin.w * 0.8;
        const z = ruin.z + (random() - 0.5) * ruin.d * 0.8;
        heaps.push({ x, z, y: terrainHeight(x, z), s: 0.5 + random() * 0.9, r: random() * 6 });
      }
    }
    instanced(new THREE.DodecahedronGeometry(1, 0), M.rubbleStone, heaps, 'ruin-heaps', (o, p) => {
      o.position.set(p.x, p.y + p.s * 0.25, p.z);
      o.rotation.set(p.r, p.r * 2, 0);
      o.scale.set(p.s, p.s * 0.6, p.s);
    }, { cast: false });
    const stepped = RUINS.find((ruin) => ruin.id === 'stepped-stone-structure');
    const sBase = Math.min(...heightsUnder(stepped.x, stepped.z, stepped.w, stepped.d, 0)) - 1;
    for (let tier = 0; tier < 4; tier += 1) {
      const shrink = 1 - tier * 0.17;
      const y1 = sBase + 1 + (tier + 1) * 1.45;
      add(new THREE.BoxGeometry(stepped.w * shrink, y1 - sBase, stepped.d * shrink), M.ashlar,
        [stepped.x - tier * 1.5, (sBase + y1) / 2, stepped.z], { name: 'stepped-stone-structure' });
    }
  }

  // --- the pools and the springs ---------------------------------------------------
  const waterSurfaces = [];
  for (const pool of POOLS) {
    const hs = heightsUnder(pool.x, pool.z, pool.w, pool.d, pool.yaw);
    const level = Math.max(...hs) + 0.5;
    const bottom = Math.min(...hs) - 1;
    const rim = 0.7;
    const top = level + 0.5;
    // Four slabs make the rim; the water sits a hand below its lip.
    const slab = (u, v, w, d) => {
      const c = Math.cos(pool.yaw);
      const s = Math.sin(pool.yaw);
      return add(new THREE.BoxGeometry(w, top - bottom, d), M.ashlar, [pool.x + u * c + v * s, (bottom + top) / 2, pool.z - u * s + v * c], { yaw: pool.yaw, name: pool.id });
    };
    slab(0, pool.d / 2 - rim / 2, pool.w, rim);
    slab(0, -pool.d / 2 + rim / 2, pool.w, rim);
    slab(pool.w / 2 - rim / 2, 0, rim, pool.d - 2 * rim);
    slab(-pool.w / 2 + rim / 2, 0, rim, pool.d - 2 * rim);
    const water = add(new THREE.BoxGeometry(pool.w - 2 * rim, 0.1, pool.d - 2 * rim), M.water, [pool.x, level + 0.12, pool.z], { yaw: pool.yaw, cast: false, collide: false, name: `${pool.id}-water` });
    water.userData.y0 = water.position.y;
    waterSurfaces.push(water);
  }
  for (const [spring, radius] of [[GIHON, 2.2], [DRAGON_SPRING, DRAGON_SPRING.radius]]) {
    const y = terrainHeight(spring.x, spring.z);
    const ring = add(new THREE.TorusGeometry(radius, 0.4, 8, 20), M.ashlar, [spring.x, y + 0.2, spring.z], { name: spring === GIHON ? 'gihon' : 'dragon-spring' });
    ring.rotation.x = Math.PI / 2;
    const pond = add(new THREE.CylinderGeometry(radius - 0.2, radius - 0.2, 0.12, 20), M.water, [spring.x, y + 0.14, spring.z], { cast: false, collide: false });
    pond.userData.y0 = pond.position.y;
    waterSurfaces.push(pond);
  }
  // The mouths of Hezekiah's tunnel: a dark opening cut in the rock at either end.
  for (const [x, z] of [HEZEKIAH_TUNNEL.from, HEZEKIAH_TUNNEL.to]) {
    add(new THREE.BoxGeometry(1.6, 1.9, 1.6), M.dark, [x, terrainHeight(x, z) + 0.6, z], { cast: false, collide: false, name: 'tunnel-mouth' });
  }

  // --- the Temple Mount's precinct: the Temple, its court, the altar -------------------
  {
    const y0 = MOUNT.level;
    const { court } = T;
    const wall = court.wall;
    const wallTop = y0 + 4.2;
    const run = (x0, x1, z0, z1) => add(new THREE.BoxGeometry(x1 - x0, wallTop - y0 + 0.6, z1 - z0), M.ashlar,
      [(x0 + x1) / 2, (y0 - 0.6 + wallTop) / 2, (z0 + z1) / 2], { name: 'temple-court' });
    run(court.x0, court.x1, court.z0, court.z0 + wall / 2);
    run(court.x0, court.x1, court.z1 - wall / 2, court.z1);
    run(court.x0, court.x0 + wall / 2, court.z0, court.z1);
    run(court.x1 - wall / 2, court.x1, court.z0, T.courtGate.z0);
    run(court.x1 - wall / 2, court.x1, T.courtGate.z1, court.z1);
    // The gate's piers stand taller than the wall.
    for (const z of [T.courtGate.z0 - 1.2, T.courtGate.z1 + 1.2]) {
      add(new THREE.BoxGeometry(wall + 1.4, 8, 2.4), M.ashlar, [court.x1 - wall / 2, y0 + 3.4, z], { name: 'temple-court-gate' });
    }
    // The house: three courses of great stones to one of timber (Ezra 6:4),
    // up to a flat roof with a parapet.
    const cx = T.x + T.length / 2;
    let y = y0;
    const band = (height, material, grow = 0) => {
      add(new THREE.BoxGeometry(T.length + grow, height, T.width + grow), material, [cx, y + height / 2, T.z], { name: 'sanctuary', cast: false });
      y += height;
    };
    for (let k = 0; k < 3; k += 1) {
      for (let c = 0; c < 3; c += 1) band(1.5, M.ashlar);
      band(0.5, M.timber, 0.12);
    }
    add(new THREE.BoxGeometry(T.length + 0.8, 0.5, T.width + 0.8), M.ashlar, [cx, y0 + T.height + 0.25, T.z], { name: 'sanctuary-roof', collide: false });
    // The porch, the doorway into it, and the two bronze pillars before it.
    const px = T.x + T.length + T.porch / 2;
    add(new THREE.BoxGeometry(T.porch, T.height, 14), M.ashlar, [px, y0 + T.height / 2, T.z], { name: 'sanctuary' });
    add(new THREE.BoxGeometry(0.2, 7, 4.2), M.dark, [T.x + T.length + T.porch + 0.02, y0 + 3.5, T.z], { cast: false, collide: false, name: 'sanctuary-door' });
    for (const dz of [-5, 5]) {
      add(new THREE.CylinderGeometry(0.85, 0.9, 9, 14), M.bronze, [T.x + T.length + T.porch + 1.3, y0 + 4.5, T.z + dz], { name: 'bronze-pillar', collide: false });
      add(new THREE.CylinderGeometry(1.3, 0.85, 1.2, 14), M.bronze, [T.x + T.length + T.porch + 1.3, y0 + 9.6, T.z + dz], { name: 'bronze-capital', collide: false });
    }
    // Three storeys of side chambers against the north and south walls.
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(T.length - 8, 7.5, 3), M.ashlar, [cx - 2, y0 + 3.75, T.z + side * (T.width / 2 + 1.5)], { name: 'sanctuary' });
    }
    // The altar of unhewn stones (Exodus 20:25; Ezra 3:2): rough courses
    // stepped in, with its ramp on the south side and the fire on top.
    const { altar } = T;
    for (let k = 0; k < 4; k += 1) {
      const shrink = 1 - k * 0.07;
      add(new THREE.BoxGeometry(altar.half * 2 * shrink, altar.height / 4, altar.half * 2 * shrink), M.rubbleStone,
        [altar.x, y0 + (k + 0.5) * (altar.height / 4), altar.z], { name: 'altar', cast: k === 3 });
    }
    const ramp = add(new THREE.BoxGeometry(altar.half * 1.1, 0.4, 7), M.rubbleStone, [altar.x, y0 + altar.height / 2 - 0.1, altar.z + altar.half + 3.3], { name: 'altar-ramp', collide: false });
    ramp.rotation.x = Math.atan2(altar.height, 6.6);
  }

  // --- the governor's seat of the province Beyond the River ---------------------------
  {
    const g = GOVERNOR_SEAT;
    const base = Math.min(terrainHeight(g.x - g.half, g.z - g.half), terrainHeight(g.x + g.half, g.z + g.half), terrainHeight(g.x - g.half, g.z + g.half), terrainHeight(g.x + g.half, g.z - g.half)) - 1;
    const floor = Math.max(terrainHeight(g.x - g.half, g.z - g.half), terrainHeight(g.x + g.half, g.z + g.half)) + 0.4;
    for (let tier = 0; tier < g.tiers; tier += 1) {
      const size = g.half * 2 * (1 - tier * 0.24);
      const y1 = floor + (tier + 1) * g.tierRise;
      add(new THREE.BoxGeometry(size, y1 - base, size), M.ashlar, [g.x, (base + y1) / 2, g.z], { name: 'governor-seat' });
    }
    const topY = floor + g.tiers * g.tierRise;
    for (const [dx, dz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) {
      add(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), M.timber, [g.x + dx, topY + 1.7, g.z + dz], { collide: false, cast: false });
    }
    add(new THREE.BoxGeometry(7.4, 0.12, 7.4), M.cloth, [g.x, topY + 3.45, g.z], { collide: false, name: 'governor-canopy' });
  }

  // --- the tombs of David: a rock face with doorways cut in it -------------------------
  {
    const t = TOMBS_OF_DAVID;
    const base = Math.min(terrainHeight(t.x - t.w / 2, t.z), terrainHeight(t.x + t.w / 2, t.z)) - 1;
    add(new THREE.BoxGeometry(t.w, t.height + (terrainHeight(t.x, t.z) - base), t.d), M.rock, [t.x, base + (t.height + (terrainHeight(t.x, t.z) - base)) / 2, t.z], { name: 'tombs-of-david' });
    for (const dz of [-2.4, 0, 2.4]) {
      add(new THREE.BoxGeometry(0.1, 1.5, 1), M.dark, [t.x - t.w / 2 - 0.03, terrainHeight(t.x - t.w / 2 - 1, t.z + dz) + 0.75, t.z + dz], { cast: false, collide: false });
    }
  }

  // --- the Broad Wall: what is left of Hezekiah's ----------------------------------------
  {
    const w = BROAD_WALL;
    const length = w.x1 - w.x0;
    const n = Math.ceil(length / 4);
    const pieces = [];
    for (let k = 0; k < n; k += 1) {
      const x = w.x0 + (k + 0.5) * (length / n);
      const base = Math.min(terrainHeight(x, w.z - w.thickness / 2), terrainHeight(x, w.z + w.thickness / 2)) - 0.8;
      const top = Math.max(terrainHeight(x, w.z - w.thickness / 2), terrainHeight(x, w.z + w.thickness / 2)) + w.height * (0.55 + 0.45 * random());
      pieces.push({ x, base, top, l: length / n + 0.1 });
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), M.rubbleStone, pieces, 'broad-wall', (o, p) => {
      o.position.set(p.x, (p.base + p.top) / 2, w.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(p.l, p.top - p.base, w.thickness);
    });
  }

  // --- the fall of the walls, and of the houses ---------------------------------------------
  {
    const stones = [];
    for (const field of RUBBLE_FIELDS) {
      const area = Math.PI * field.rx * field.rz;
      const per = field.blocks ? 0.55 : 0.0045;
      const count = Math.min(low ? 500 : 1800, Math.round(area * field.density * per));
      for (let k = 0; k < count; k += 1) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random());
        const x = field.x + Math.cos(a) * r * field.rx;
        const z = field.z + Math.sin(a) * r * field.rz;
        if (inEventArea(x, z, field.blocks ? -3 : 0) && !field.blocks) continue;
        if (streetDistance(x, z).distance < 0.8) continue;
        const size = field.blocks ? 0.35 + random() * 1.2 : 0.25 + random() * 0.7;
        stones.push({ x, z, y: terrainHeight(x, z), size, rx: random() * 6, ry: random() * 6, flat: 0.5 + random() * 0.45 });
      }
    }
    instanced(new THREE.DodecahedronGeometry(1, 0), M.rubbleStone, stones, 'rubble', (o, p) => {
      o.position.set(p.x, p.y + p.size * 0.3, p.z);
      o.rotation.set(p.rx, p.ry, 0);
      o.scale.set(p.size, p.size * p.flat, p.size);
    }, { cast: false });
    // Burned foundations on the Western Hill: the footings of houses, low
    // runs of stone in short rectangles.
    const footings = [];
    const field = RUBBLE_FIELDS.find((f) => f.id === 'western-hill');
    for (let k = 0; k < (low ? 20 : 70); k += 1) {
      const x = field.x + (random() - 0.5) * field.rx * 1.6;
      const z = field.z + (random() - 0.5) * field.rz * 1.6;
      if (Math.abs(z - BROAD_WALL.z) < 12 && x > BROAD_WALL.x0 - 10 && x < BROAD_WALL.x1 + 10) continue;
      if (inEventArea(x, z, 4)) continue;
      const yaw = random() * 3;
      for (const [u, v, l] of [[0, 3, 7], [0, -3, 7], [3.5, 0, 6], [-3.5, 0, 6]]) {
        if (random() < 0.3) continue;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const px = x + u * c + v * s;
        const pz = z - u * s + v * c;
        footings.push({ x: px, z: pz, y: terrainHeight(px, pz), l, yaw: yaw + (u === 0 ? 0 : Math.PI / 2), h: 0.3 + random() * 0.9 });
      }
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), M.rubbleStone, footings, 'burned-foundations', (o, p) => {
      o.position.set(p.x, p.y + p.h / 2 - 0.1, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.l, p.h, 0.8);
    }, { cast: false });
  }

  // --- what a staged moment brings ------------------------------------------------------
  const staged = {};
  {
    const platform = new THREE.Group();
    platform.name = 'water-gate-platform';
    const level = terrainHeight(PLATFORM.x, PLATFORM.z);
    add(new THREE.BoxGeometry(PLATFORM.d, PLATFORM.height, PLATFORM.w), M.timber, [PLATFORM.x, level + PLATFORM.height / 2, PLATFORM.z], { parent: platform, collide: false });
    for (let k = 0; k < 3; k += 1) {
      add(new THREE.BoxGeometry(1.2, 0.5 * (k + 1), 2.2), M.timber, [PLATFORM.x - PLATFORM.d / 2 - 0.6 - (2 - k) * 0.6 + 0.6, level + 0.25 * (k + 1), PLATFORM.z], { parent: platform, collide: false, cast: false });
    }
    add(new THREE.BoxGeometry(0.9, 1.2, 0.7), M.timber, [PLATFORM.x, level + PLATFORM.height + 0.6, PLATFORM.z], { parent: platform, collide: false, cast: false });
    platform.visible = false;
    group.add(platform);
    staged['water-gate'] = platform;

    // Booths of leafy branches: olive, wild olive, myrtle, palm (Nehemiah 8:15).
    const booths = new THREE.Group();
    booths.name = 'booths';
    const prism = own(new THREE.CylinderGeometry(1, 1, 1, 3, 1));
    prism.rotateX(Math.PI / 2);
    prism.rotateZ(Math.PI);
    prism.translate(0, 0.5, 0);
    const placements = BOOTHS.map(([x, z, yaw]) => ({ x, z, y: terrainHeight(x, z), yaw, s: 1 }));
    // Each family on its own roof as well (8:16).
    for (const id of ['priests-house-1', 'priests-house-2', 'zadok-house', 'azariah-house']) {
      const h = HOUSES.find((house) => house.id === id);
      const y = Math.max(...heightsUnder(h.x, h.z, h.w, h.d, h.yaw)) + h.height + 0.3;
      placements.push({ x: h.x, z: h.z, y, yaw: h.yaw, s: 0.8 });
    }
    instanced(prism, M.leafy, placements, 'booth-leaves', (o, p) => {
      o.position.set(p.x, p.y - 0.05, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1.3 * p.s, 1.9 * p.s, 2.6 * p.s);
    }, { parent: booths });
    for (const p of placements) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.045, 0.045, 1.7 * p.s, 5)), M.timber);
        post.position.set(p.x + Math.cos(p.yaw) * side * 1.1 * p.s, p.y + 0.8 * p.s, p.z - Math.sin(p.yaw) * side * 1.1 * p.s);
        booths.add(post);
      }
    }
    booths.visible = false;
    group.add(booths);
    staged.booths = booths;
  }

  function setEpisode(id) {
    for (const [key, node] of Object.entries(staged)) node.visible = key === id;
  }

  // The water takes a little life from the sky.
  function update(elapsed) {
    for (const surface of waterSurfaces) surface.position.y = surface.userData.y0 + Math.sin(elapsed * 0.8 + surface.position.x) * 0.012;
  }

  function dispose() {
    geometries.forEach((g) => g.dispose());
    group.removeFromParent();
  }

  return {
    group, occluders, cameraColliders, setEpisode, update, dispose, waterSurfaces, staged,
    // The square before the Water Gate, for the crowd to keep clear of.
    square: WATER_SQUARE,
  };
}
