// The people, the animals and the things lying about in Nehemiah's Jerusalem.
//
// What is going on depends on which wall it is. A broken one has a few families
// camped in the rubble; a half-built one has the whole city out on it, every
// family opposite its own door, half working and half watching (4:13-23); a
// finished one has gatekeepers at the gates, priests at the altar, people in
// the streets and men walking the top of the wall. So the crowd is made per
// state, the first time that state is wanted, and only the state on show is
// drawn (buildNehemiah.js).
//
// None of it stands on the ground a staged moment uses (EVENT_GROUND), and
// none in the way of a wall, a house or a pool, because it is placed by
// asking the navigation the same question a visitor would be asked.
//
// Only data and placement here: no three.js, so the tests can run it.

import {
  TEMPLE, MOUNT, STREETS, HOUSES, GIHON, POOLS, groundAt, inEventArea,
} from './nehemiahDimensions.js';
import { FEATURES, PROFILE_BY_ID, frameAt, wallTopAt } from './nehemiahWalls.js';
import { blockerAt } from './nehemiahNavigation.js';
import { makeRandom } from './sceneLandscape.js';

// What a figure stands on: the walkway, where it is on one, else the ground.
export function walkableY(x, z) {
  return wallTopAt(x, z)?.height ?? groundAt(x, z);
}

const clear = (x, z, pad = 1.5) => !inEventArea(x, z, pad) && !blockerAt(x, z);

// A point a fraction f of the way along a polyline, and the direction there.
export function pathPoint(points, f) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    lengths.push(len);
    total += len;
  }
  let at = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (at <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : Math.min(1, at / lengths[i]);
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / lengths[i], dz: (bz - az) / lengths[i] };
    }
    at -= lengths[i];
  }
  return { x: points[0][0], z: points[0][1], dx: 1, dz: 0 };
}

// The people of the Temple, whichever the wall: priests at the altar, Levites
// by the court gate. Dressed as what they are (sceneHumanDress.js `priest`).
function templeFigures(prefix, low) {
  const { altar, court } = TEMPLE;
  const y = MOUNT.level;
  const list = [
    { id: `${prefix}-priest-a`, kind: 'man', dress: 'priest', x: altar.x - 4.2, z: altar.z - 1.5, facing: Math.PI / 2, activity: 'working', phase: 1 },
    { id: `${prefix}-priest-b`, kind: 'man', dress: 'priest', x: altar.x + 0.5, z: altar.z + altar.half + 7.5, facing: Math.PI, activity: 'standing', phase: 2 },
    { id: `${prefix}-priest-c`, kind: 'man', dress: 'priest', x: altar.x - 4.8, z: altar.z + 2.5, facing: Math.PI / 2, activity: 'praying', phase: 4 },
    { id: `${prefix}-levite-a`, kind: 'man', dress: 'priest', x: court.x1 - 6, z: TEMPLE.courtGate.z0 - 3, facing: Math.PI / 2, activity: 'standing', phase: 3 },
    { id: `${prefix}-levite-b`, kind: 'man', dress: 'priest', x: court.x1 - 6, z: TEMPLE.courtGate.z1 + 3, facing: Math.PI / 2, activity: 'standing', phase: 5 },
    { id: `${prefix}-worshipper`, kind: 'man', x: court.x1 - 20, z: TEMPLE.z + 12, facing: -Math.PI / 2, activity: 'kneeling', phase: 6 },
  ];
  return list.slice(0, low ? 4 : list.length).map((figure) => ({ ...figure, y }));
}

const kindAt = (n) => (n % 4 === 1 ? 'woman' : n % 9 === 5 ? 'child' : 'man');

// Walkers along a street: stretches of it clear of every staged moment.
function streetWalkers(prefix, streetId, count, random, startN = 0) {
  const street = STREETS.find((s) => s.id === streetId);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const f0 = (i + random() * 0.4) / count;
    const f1 = Math.min(1, f0 + 0.22 + random() * 0.1);
    const a = pathPoint(street.points, f0);
    const b = pathPoint(street.points, f1);
    const side = (i % 2 ? 1 : -1) * 0.7;
    const nx = -a.dz;
    const nz = a.dx;
    const p0 = [a.x + nx * side, a.z + nz * side];
    const p1 = [b.x + nx * side, b.z + nz * side];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    if (![p0, mid, p1].every(([x, z]) => clear(x, z, 2))) continue;
    const n = startN + i;
    const kind = kindAt(n);
    out.push({
      id: `${prefix}-${streetId}-${i}`,
      kind,
      route: i % 2 ? [p1, p0] : [p0, p1],
      speed: 0.9 + random() * 0.3,
      phase: random(),
      activity: n % 4 === 2 ? 'carrying' : 'walking',
      scale: kind === 'child' ? 0.6 : 0.95 + random() * 0.1,
    });
  }
  return out;
}

// --- the finished wall --------------------------------------------------------------
function builtFigures({ low, high }) {
  const random = makeRandom(7101);
  const out = [];
  out.push(...streetWalkers('built', 'ridge-street', low ? 5 : high ? 12 : 8, random));
  out.push(...streetWalkers('built', 'ophel-street', low ? 2 : 4, random, 20));
  out.push(...streetWalkers('built', 'gihon-track', low ? 1 : 3, random, 40).map((f) => ({ ...f, activity: 'carrying', kind: 'woman' })));
  out.push(...templeFigures('built', low));

  // Gatekeepers: "let not the gates of Jerusalem be opened until the sun is
  // hot" (7:3). One inside each gate of the city's wall, facing out.
  const gates = FEATURES.filter((f) => f.kind === 'gate' && f.wall === 'city');
  gates.slice(0, low ? 4 : gates.length).forEach((gate, i) => {
    const x = gate.x - gate.nx * 4.2 + gate.tx * 2.2;
    const z = gate.z - gate.nz * 4.2 + gate.tz * 2.2;
    if (!clear(x, z)) return;
    out.push({
      id: `built-gatekeeper-${gate.id}`, kind: 'man', x, z, facing: Math.atan2(gate.nx, gate.nz), activity: 'standing', phase: i * 1.7,
    });
  });

  // Men walking the top of the wall, in pairs, a stretch each.
  const city = PROFILE_BY_ID.city;
  const count = low ? 2 : high ? 7 : 5;
  for (let i = 0; i < count; i += 1) {
    const s = (i + 0.35) * (city.length / count);
    const a = frameAt(city, s);
    const b = frameAt(city, s + 26);
    if (FEATURES.some((f) => f.wall === 'city' && f.kind !== 'bend' && Math.abs(f.s - s) < 12)) continue;
    if (inEventArea(a.x, a.z, 2) || inEventArea(b.x, b.z, 2)) continue;
    out.push({
      id: `built-watch-${i}`, kind: 'man', route: i % 2 ? [[b.x, b.z], [a.x, a.z]] : [[a.x, a.z], [b.x, b.z]], speed: 0.8, phase: i / count, activity: 'walking',
    });
  }

  // At the houses: a woman at her work by the door, a man sitting in the sun.
  HOUSES.filter((h) => h.owner).slice(0, low ? 3 : 7).forEach((house, i) => {
    const x = house.x + Math.sin(house.yaw) * (house.d / 2 + 1.6) * (i % 2 ? 1 : -1);
    const z = house.z + Math.cos(house.yaw) * (house.d / 2 + 1.6) * (i % 2 ? 1 : -1);
    if (!clear(x, z)) return;
    out.push({
      id: `built-house-${house.id}`, kind: i % 2 ? 'man' : 'woman', x, z, facing: random() * 6, activity: i % 2 ? 'sitting' : 'working', phase: random() * 12,
    });
  });

  // The king's garden is watered, and so worked.
  if (!low) {
    [[-124, 412], [-110, 428]].forEach(([x, z], i) => {
      if (clear(x, z)) out.push({ id: `built-gardener-${i}`, kind: 'man', dress: 'labourer', x, z, facing: i * 2, activity: 'working', phase: i * 4 });
    });
  }
  out.push({ id: 'built-shepherd', kind: 'man', dress: 'shepherd', x: 124, z: -30, facing: 2.4, activity: 'standing', phase: 3 });
  return out;
}

// --- the half wall -------------------------------------------------------------------
function halfFigures({ low, high }) {
  const random = makeRandom(7202);
  const out = [];
  const city = PROFILE_BY_ID.city;
  const half = city.wall.thickness / 2;
  const crews = low ? 5 : high ? 15 : 10;
  let placed = 0;
  for (let i = 0; i < crews * 3 && placed < crews; i += 1) {
    const s = 30 + ((i * 163.7) % (city.length - 60));
    if (FEATURES.some((f) => f.wall === 'city' && f.kind !== 'bend' && Math.abs(f.s - s) < 14)) continue;
    const frame = frameAt(city, s);
    const x = frame.x - frame.nx * (half + 2.2);
    const z = frame.z - frame.nz * (half + 2.2);
    if (!clear(x, z, 3)) continue;
    // Each family opposite its own door: one at the work, one carrying stone
    // along the foot of the wall, one directing, one a child with water.
    const facing = Math.atan2(frame.nx, frame.nz);
    out.push({ id: `half-crew-${placed}-mason`, kind: 'man', dress: 'labourer', x, z, facing, activity: 'working', phase: random() * 12 });
    const carryFrom = frameAt(city, s + 3);
    const carryTo = frameAt(city, s + 17);
    const route = [[carryFrom.x - carryFrom.nx * (half + 3.4), carryFrom.z - carryFrom.nz * (half + 3.4)], [carryTo.x - carryTo.nx * (half + 3.4), carryTo.z - carryTo.nz * (half + 3.4)]];
    if (route.every(([rx, rz]) => clear(rx, rz, 2))) {
      out.push({ id: `half-crew-${placed}-carrier`, kind: 'man', dress: 'labourer', route: placed % 2 ? route : [route[1], route[0]], speed: 0.85, phase: random(), activity: 'carrying' });
    }
    const fx = x + frame.tx * 2.6;
    const fz = z + frame.tz * 2.6;
    if (clear(fx, fz)) out.push({ id: `half-crew-${placed}-foreman`, kind: 'man', x: fx, z: fz, facing: facing + 0.5, activity: 'talking', phase: random() * 12 });
    if (!low && placed % 2 === 0) {
      const cx = x - frame.tx * 2;
      const cz = z - frame.tz * 2;
      if (clear(cx, cz)) out.push({ id: `half-crew-${placed}-child`, kind: 'child', route: [[cx, cz], [cx + frame.nx * -6, cz + frame.nz * -6]], speed: 1.6, phase: random(), activity: 'walking', scale: 0.6 });
    }
    placed += 1;
  }
  // Women bring water up the ridge street from the Gihon.
  out.push(...streetWalkers('half', 'gihon-track', low ? 1 : 3, random, 40).map((f) => ({ ...f, activity: 'carrying', kind: 'woman' })));
  out.push(...streetWalkers('half', 'ridge-street', low ? 2 : 5, random, 60));
  // "The other half held the spears, shields, bows and coats of mail": watchers
  // stationed behind the lowest places of the wall, where it was open (4:13).
  const lowest = [...Array(18).keys()].map((k) => k * (city.length / 18)).map((s) => frameAt(city, s)).sort((a, b) => a.top - b.top).slice(0, low ? 2 : 6);
  lowest.forEach((frame, i) => {
    const x = frame.x - frame.nx * (half + 4);
    const z = frame.z - frame.nz * (half + 4);
    if (clear(x, z, 3)) out.push({ id: `half-watch-${i}`, kind: 'man', x, z, facing: Math.atan2(frame.nx, frame.nz), activity: 'attending', phase: i * 2 });
  });
  out.push(...templeFigures('half', low));
  return out;
}

// --- the broken wall ---------------------------------------------------------------------
function ruinFigures({ low }) {
  const random = makeRandom(7303);
  const out = [];
  // A few families who live in what is left, the people "few" of 7:4, in the
  // lee of the ruins: sitting, a woman at a fire, someone standing watching.
  const spots = [[-140, 120, 'sitting'], [-130, 260, 'standing'], [-110, 330, 'sitting'], [-78, 66, 'working'], [-300, 60, 'standing'], [-210, -20, 'sitting']];
  spots.slice(0, low ? 3 : spots.length).forEach(([x, z, activity], i) => {
    if (!clear(x, z, 3)) return;
    out.push({ id: `ruin-family-${i}`, kind: i % 3 === 1 ? 'woman' : 'man', x, z, facing: random() * 6, activity, phase: random() * 12 });
  });
  out.push(...templeFigures('ruin', low));
  return out;
}

export function figuresFor(state, options = {}) {
  const figures = state === 'ruin' ? ruinFigures(options) : state === 'half' ? halfFigures(options) : builtFigures(options);
  // Every figure stands on what is under it, and a route's first point says so.
  return figures.map((figure) => ({
    ...figure,
    y: figure.y ?? walkableY(figure.x ?? figure.route[0][0], figure.z ?? figure.route[0][1]),
  }));
}

// The animals: a flock on the Kidron's bank, donkeys at the Fountain Gate and
// the Dung Gate, a dog; doves on the houses and swallows over the brook.
export function animalsFor(state, { low }) {
  const random = makeRandom(7404);
  const animals = [];
  const flockAt = (cx, cz, n, spread) => {
    for (let i = 0; i < n; i += 1) {
      const x = cx + (random() - 0.5) * spread;
      const z = cz + (random() - 0.5) * spread;
      if (!clear(x, z, 2)) continue;
      animals.push({
        species: i % 5 === 4 ? 'goat' : 'sheep',
        pose: i % 4 === 3 ? 'lie' : 'graze',
        wander: i % 4 === 3 ? null : { cx: x, cz: z, r: 0.8 + random() * 1.2, speed: 0.07 },
        x, z, facing: random() * 6, phase: random() * 10, scale: 0.85 + random() * 0.2,
      });
    }
  };
  flockAt(128, -34, low ? 5 : 11, 14);
  flockAt(-230, 460, low ? 3 : 7, 12);
  const donkeyAt = (x, z, facing, panniers) => {
    if (clear(x, z, 1)) animals.push({ species: 'donkey', pose: 'stand', x, z, facing, phase: random() * 6, panniers });
  };
  const fountain = FEATURES.find((f) => f.id === 'fountain-gate');
  donkeyAt(fountain.x + fountain.nx * 9 + fountain.tx * 3, fountain.z + fountain.nz * 9 + fountain.tz * 3, 1.2, true);
  const dung = FEATURES.find((f) => f.id === 'dung-gate');
  donkeyAt(dung.x + dung.nx * 8, dung.z + dung.nz * 8, 0.4, false);
  if (state === 'half') {
    // Donkeys bringing stone.
    [[-146, 130, 0.2], [-120, -20, 1.9]].forEach(([x, z, f]) => donkeyAt(x, z, f, true));
  }
  if (clear(120, -26, 1)) animals.push({ species: 'dog', pose: 'lie', x: 120, z: -26, facing: 0.8, phase: 1 });
  return animals;
}

export function birdsFor({ low }) {
  const random = makeRandom(7505);
  const birds = [];
  for (let i = 0; i < (low ? 4 : 10); i += 1) {
    const cx = -60 + random() * 200;
    const cz = -200 + random() * 500;
    birds.push({ kind: 'swallow', mode: 'dart', cx, cz, r: 10 + random() * 14, y: groundAt(cx, cz) + 7 + random() * 7, speed: 9 + random() * 3, phase: random() * 10 });
  }
  HOUSES.slice(0, low ? 2 : 6).forEach((house, i) => {
    birds.push({ kind: 'dove', mode: 'perch', x: house.x, z: house.z, y: groundAt(house.x, house.z) + house.height + 0.5, facing: random() * 6, phase: i * 3.1 });
  });
  return birds;
}

// Things lying about: jars at the pools, baskets and blocks of stone where the
// work is, jars at the doors.
export function itemsFor(state, { low }) {
  const random = makeRandom(7606);
  const items = [];
  const put = (kind, x, z, extra = {}) => {
    if (clear(x, z, 0.5)) items.push({ kind, x, z, y: groundAt(x, z), rotation: random() * 6, scale: 0.9 + random() * 0.2, ...extra });
  };
  for (const pool of POOLS) {
    for (let i = 0; i < (low ? 2 : 4); i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      put(i % 2 ? 'waterJar' : 'jar', pool.x + Math.cos(a) * (Math.max(pool.w, pool.d) / 2 + 1.6), pool.z + Math.sin(a) * (Math.max(pool.w, pool.d) / 2 + 1.6));
    }
  }
  for (let i = 0; i < 4; i += 1) put(i % 2 ? 'waterJar' : 'jar', GIHON.x + 2.6 + i * 0.5, GIHON.z - 1.6 + i * 0.4);
  if (state !== 'ruin') {
    for (const house of HOUSES.filter((h) => h.owner)) {
      put('jar', house.x + house.w / 2 + 1.2, house.z + house.d / 2 + 0.8);
      if (!low) put('basket', house.x - house.w / 2 - 1.2, house.z - house.d / 2 - 0.6);
    }
  }
  if (state === 'half') {
    // Dressed stone stacked at the foot of the wall, a rope, baskets.
    const city = PROFILE_BY_ID.city;
    const half = city.wall.thickness / 2;
    for (let s = 40; s < city.length - 20; s += low ? 90 : 46) {
      if (FEATURES.some((f) => f.wall === 'city' && f.kind !== 'bend' && Math.abs(f.s - s) < 12)) continue;
      const frame = frameAt(city, s);
      const bx = frame.x - frame.nx * (half + 1.6);
      const bz = frame.z - frame.nz * (half + 1.6);
      put('block', bx, bz, { scale: 1 });
      put('block', bx + frame.tx * 1.1, bz + frame.tz * 1.1, { scale: 1 });
      put('basket', bx + frame.tx * -1.6, bz + frame.tz * -1.6);
      if (!low) put('ropeCoil', bx - frame.nx * 1.2, bz - frame.nz * 1.2);
    }
  }
  if (state === 'built') {
    // The braziers at the Water Gate square, lit for the evening.
    put('brazier', -22, -80);
    put('brazier', -22, -104);
  }
  return items;
}

// Where smoke rises from: the altar, which never went out; the ovens of the
// few houses with a family in them; and the camps' cooking in the ruin.
export function smokeSourcesFor(altarTop) {
  const sources = [{ ...altarTop, strength: 2.2, scale: 5 }];
  for (const house of HOUSES.filter((h) => h.owner).slice(0, 6)) {
    sources.push({ x: house.x, y: groundAt(house.x, house.z) + house.height + 0.4, z: house.z, strength: 0.5, scale: 2 });
  }
  return sources;
}
