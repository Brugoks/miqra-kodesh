// The walls of Nehemiah's Jerusalem, drawn.
//
// What nehemiahWalls.js knows as numbers this module makes into meshes, in the
// three states the text gives the wall: a ruin (1:3; 2:13-17), half a wall
// (4:6), and finished (6:15). Each state is built the first time it is wanted
// and kept; `setState` only shows one and hides the others, so nobody pays for
// a moment they never visit.
//
// The ribbon is the wall itself: one non-indexed mesh per wall and state, flat
// shaded, outer face, inner face, top. It is cut at exactly the places the
// navigation opens — the gate passages — because the arithmetic is the same
// arithmetic (GATE in nehemiahDimensions.js, gateAt in nehemiahWalls.js).
// A gate is a passage with its lintel over it, flanking towers outside, and,
// in the finished wall only, its doors hung (6:1 says they were hung last).
//
// Everything else — merlons, towers, stairs, ladders, rubble — is instanced or
// boxed from the same profile, so what stands on the wall stands on it.
//
// three.js is passed in, so the module stays importable in jsdom.

import {
  GATE, STAIR, TOWER_INFO, groundAt,
} from './nehemiahDimensions.js';
import {
  PROFILES, FEATURES, STAIR_FLIGHTS, frameAt, topAt, ruinHeight, SAMPLE,
} from './nehemiahWalls.js';
import { makeRandom, mergeSimple } from './sceneLandscape.js';

const FOOT = 0.9; // how far below the ground a face is carried, so no seam shows

// A cheap normal from three points, to put a quad's winding the right way
// round without reasoning about which way each wall happens to run.
function pushQuad(out, a, b, c, d, toward) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const flip = nx * toward[0] + ny * toward[1] + nz * toward[2] < 0;
  const tri = flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
  for (const p of tri) out.push(p[0], p[1], p[2]);
}

// How long a stretch of the wall keeps one height in each state (nehemiahWalls
// ruinHeight and halfFactor change at these), so the ribbon is cut at them and
// a stump is as tall as the navigation says it is.
const SLOT = { ruin: 7, half: 24, built: 0 };

// The arc positions the ribbon is cut at: every SAMPLE metres, each height
// slot's edge, and the two edges of every gate passage, exactly — wrapped
// round the seam of a closed wall, because the Sheep Gate stands on it.
function breakpoints(profile, state) {
  const set = new Set();
  const { length, step, closed, count } = profile;
  for (let k = 0; k <= (closed ? count : count - 1); k += 1) set.add(Math.min(length, k * step));
  if (SLOT[state]) for (let s = SLOT[state]; s < length; s += SLOT[state]) set.add(s);
  for (const feature of FEATURES) {
    if (feature.kind !== 'gate' || feature.wall !== profile.wall.id) continue;
    for (const edge of [-GATE.width / 2, GATE.width / 2, 0]) {
      let s = feature.s + edge;
      if (closed) s = ((s % length) + length) % length;
      if (s > 0 && s < length) set.add(s);
    }
  }
  return [...set].sort((a, b) => a - b);
}

// The distance between two arc positions, the short way round a closed wall.
function arcGap(profile, a, b) {
  const d = Math.abs(a - b);
  return profile.closed ? Math.min(d, profile.length - d) : d;
}

function inPassage(profile, s) {
  for (const feature of FEATURES) {
    if (feature.kind !== 'gate' || feature.wall !== profile.wall.id) continue;
    if (arcGap(profile, s, feature.s) < GATE.width / 2 - 1e-6) return feature;
  }
  return null;
}

// How long a stretch of wall is one mesh. Short enough that a ray or the camera
// need only look at the stretch near it, long enough that a circuit is not
// thousands of draws.
export const CHUNK = 90;

// The wall in one state, as a BufferGeometry (or null if there is none) — all
// of it, or the intervals whose middle falls in `range` = [from, to).
export function buildWallGeometry(THREE, profile, state, range = null) {
  const { wall, closed } = profile;
  const half = wall.thickness / 2;
  const ss = breakpoints(profile, state);
  const n = ss.length - 1; // intervals
  const positions = [];

  // A point on the wall at arc s, its height taken from the slot `slotAt`
  // belongs to (both ends of an interval use the interval's own).
  const point = (s, slotAt) => {
    const frame = frameAt(profile, s);
    const out = [frame.x + frame.nx * half, 0, frame.z + frame.nz * half];
    const inn = [frame.x - frame.nx * half, 0, frame.z - frame.nz * half];
    return {
      frame,
      out,
      inn,
      gOut: groundAt(out[0], out[2]),
      gIn: groundAt(inn[0], inn[2]),
      top: topAt(profile, { ...frame, s: slotAt }, state),
    };
  };
  const mids = ss.slice(0, n).map((s, i) => (s + ss[i + 1]) / 2);
  const gates = mids.map((mid) => inPassage(profile, mid));
  // Which intervals have a wall in them: all of them, in a finished or half
  // wall, less the passages; in a ruin only where something still stands.
  const solid = mids.map((mid, i) => !gates[i] && (state !== 'ruin' || ruinHeight(profile, mid) > 0));
  const neighbour = (i, d) => {
    const j = i + d;
    if (j >= 0 && j < n) return j;
    return closed ? (j + n) % n : -1;
  };

  // A passage is a tunnel under a lintel only in the finished wall: in half a
  // wall there is nothing over the opening yet (6:1: the doors were last), and
  // in a ruin nothing at all.
  const lintelled = state === 'built';
  for (let i = 0; i < n; i += 1) {
    if (!solid[i] && !(gates[i] && lintelled)) continue;
    if (range && (mids[i] < range[0] || mids[i] >= range[1])) continue;
    const a = point(ss[i], mids[i]);
    const b = point(ss[i + 1], mids[i]);
    const t = frameAt(profile, mids[i]);
    const nOut = [t.nx, 0, t.nz];
    const nIn = [-t.nx, 0, -t.nz];
    const tangent = [t.tx, 0, t.tz];
    const gate = gates[i];
    // A lintel's faces begin at the head of the opening, not the ground.
    const opening = gate ? gate.ground + GATE.height : -Infinity;
    const yb = (g) => Math.max(g - FOOT, opening);
    pushQuad(positions, [a.out[0], yb(a.gOut), a.out[2]], [b.out[0], yb(b.gOut), b.out[2]], [b.out[0], b.top, b.out[2]], [a.out[0], a.top, a.out[2]], nOut);
    pushQuad(positions, [a.inn[0], yb(a.gIn), a.inn[2]], [b.inn[0], yb(b.gIn), b.inn[2]], [b.inn[0], b.top, b.inn[2]], [a.inn[0], a.top, a.inn[2]], nIn);
    pushQuad(positions, [a.out[0], a.top, a.out[2]], [b.out[0], b.top, b.out[2]], [b.inn[0], b.top, b.inn[2]], [a.inn[0], a.top, a.inn[2]], [0, 1, 0]);
    if (gate) {
      // The underside of the lintel closes the passage overhead.
      pushQuad(positions, [a.out[0], opening, a.out[2]], [b.out[0], opening, b.out[2]], [b.inn[0], opening, b.inn[2]], [a.inn[0], opening, a.inn[2]], [0, -1, 0]);
      continue;
    }
    // Where the wall meets a gap, a cap closes it: the jamb of a passage, or
    // the broken end of a stump.
    for (const [d, p, toward] of [[-1, a, [-tangent[0], 0, -tangent[2]]], [1, b, tangent]]) {
      const j = neighbour(i, d);
      if (j < 0 || solid[j]) continue;
      const g = gates[j];
      const hi = g && lintelled ? g.ground + GATE.height : p.top;
      const lo = Math.min(p.gOut, p.gIn) - FOOT;
      pushQuad(positions, [p.out[0], lo, p.out[2]], [p.inn[0], lo, p.inn[2]], [p.inn[0], hi, p.inn[2]], [p.out[0], hi, p.out[2]], toward);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// The wall in one state as chunks of CHUNK metres, each its own geometry.
export function buildWallChunks(THREE, profile, state) {
  const chunks = [];
  for (let from = 0; from < profile.length; from += CHUNK) {
    const geometry = buildWallGeometry(THREE, profile, state, [from, from + CHUNK]);
    if (geometry) chunks.push(geometry);
  }
  return chunks;
}

// A box in a feature's own frame: x along the wall, z outward from the wall's
// centre line, y up from the ground it stands on.
const yawOf = (feature) => Math.atan2(feature.nx, feature.nz);

export function createNehemiahWalls(THREE, options = {}) {
  const {
    quality = 'high', materials: M, own = {}, shadows = true, lighting = null,
  } = options;
  const low = quality === 'low';
  const holdG = own.g || ((g) => g);
  const geometries = [];
  const keepGeometry = (g) => { geometries.push(g); return holdG(g); };
  const root = new THREE.Group();
  root.name = 'nehemiah-walls';
  // What can hide a pin: per state, because only the state on show is there
  // to hide anything (a raycaster does not look at `visible`).
  const stateOccluders = { ruin: [], half: [], built: [] };
  let sink = null;
  const groups = {};
  const random = makeRandom(5551);
  const dummy = new THREE.Object3D();

  const mesh = (geometry, material, parent, { cast = true, name, occlude = false } = {}) => {
    const m = new THREE.Mesh(keepGeometry(geometry), material);
    m.castShadow = shadows && cast;
    m.receiveShadow = shadows;
    if (name) m.name = name;
    parent.add(m);
    if (occlude && sink) sink.push(m);
    return m;
  };
  const instanced = (geometry, material, placements, name, pose, parent, { cast = true } = {}) => {
    if (!placements.length) return null;
    const m = new THREE.InstancedMesh(keepGeometry(geometry), material, placements.length);
    m.name = name;
    placements.forEach((p, i) => {
      pose(dummy, p, i);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = shadows && cast;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  };

  // A box standing in a feature's frame.
  const featureBox = (parent, feature, material, { along = 0, out0, out1, w, y0, y1, name, occlude = true }) => {
    const depth = out1 - out0;
    const geometry = new THREE.BoxGeometry(w, y1 - y0, depth);
    const m = mesh(geometry, material, parent, { name, occlude });
    const cx = feature.x + feature.tx * along + feature.nx * ((out0 + out1) / 2);
    const cz = feature.z + feature.tz * along + feature.nz * ((out0 + out1) / 2);
    m.position.set(cx, (y0 + y1) / 2, cz);
    m.rotation.y = yawOf(feature);
    return m;
  };

  // --- the ribbons, per state -----------------------------------------------
  function ribbons(state, parent) {
    for (const profile of PROFILES) {
      const material = state === 'ruin' ? M.rubbleStone : M.ashlar;
      for (const geometry of buildWallChunks(THREE, profile, state)) {
        mesh(geometry, material, parent, { name: `wall-${profile.wall.id}-${state}`, occlude: true });
      }
    }
  }

  // --- merlons along the outer parapet (the finished wall) -------------------
  function merlons(parent) {
    const placements = [];
    for (const profile of PROFILES) {
      const half = profile.wall.thickness / 2;
      for (let s = 0.9; s < profile.length; s += 1.9) {
        if (FEATURES.some((f) => f.kind === 'gate' && f.wall === profile.wall.id && Math.abs(f.s - s) < 0.6)) continue;
        const frame = frameAt(profile, s);
        placements.push({
          x: frame.x + frame.nx * (half - 0.28), z: frame.z + frame.nz * (half - 0.28), y: frame.top, yaw: Math.atan2(frame.nx, frame.nz),
        });
      }
    }
    instanced(new THREE.BoxGeometry(1.05, 1.15, 0.55), M.ashlar, placements, 'merlons', (o, p) => {
      o.position.set(p.x, p.y + 0.575, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1, 1, 1);
    }, parent, { cast: !low });
  }

  // --- towers and gate flanks -----------------------------------------------
  function towers(state, parent) {
    const full = state === 'built';
    for (const feature of FEATURES) {
      const profile = PROFILES.find((p) => p.wall.id === feature.wall);
      const half = profile.wall.thickness / 2;
      const frame = frameAt(profile, feature.s);
      const lowGround = Math.min(
        groundAt(feature.x + feature.nx * (half + 8), feature.z + feature.nz * (half + 8)),
        groundAt(feature.x + feature.nx * half, feature.z + feature.nz * half),
        feature.ground,
      ) - FOOT;
      const stateTop = topAt(profile, frame, state);
      if (feature.kind === 'tower') {
        const info = TOWER_INFO[feature.id];
        const top = stateTop + (full ? info.rise : state === 'half' ? info.rise * 0.35 : 0.8);
        featureBox(parent, feature, state === 'ruin' ? M.rubbleStone : M.ashlar, {
          out0: -half * 0.4, out1: half + info.project, w: info.width, y0: lowGround, y1: top, name: `tower-${feature.id}`,
        });
        if (full) {
          // A parapet course round the roof.
          featureBox(parent, feature, M.ashlar, {
            out0: half + info.project - 0.55, out1: half + info.project, w: info.width, y0: top, y1: top + 1.1, name: `tower-parapet-${feature.id}`, occlude: false,
          });
          for (const side of [-1, 1]) {
            featureBox(parent, feature, M.ashlar, {
              along: side * (info.width / 2 - 0.27), out0: half + 0.2, out1: half + info.project, w: 0.55, y0: top, y1: top + 1.1, name: `tower-parapet-${feature.id}`, occlude: false,
            });
          }
        }
      } else if (feature.kind === 'gate' && state !== 'ruin') {
        const top = stateTop + (full ? GATE.rise : state === 'half' ? GATE.rise * 0.4 : 0);
        for (const side of [-1, 1]) {
          featureBox(parent, feature, M.ashlar, {
            along: side * (GATE.width / 2 + GATE.flankWidth / 2),
            out0: half - 0.1, out1: half + GATE.flank, w: GATE.flankWidth, y0: lowGround, y1: top, name: `gate-flank-${feature.id}`,
          });
        }
        if (full) {
          // The doors, hung open against the jambs.
          for (const side of [-1, 1]) {
            featureBox(parent, feature, M.timber, {
              along: side * (GATE.width / 2 - 0.12), out0: -half + 0.15, out1: half - 0.15, w: 0.16, y0: feature.ground, y1: feature.ground + GATE.height - 0.6, name: `gate-door-${feature.id}`, occlude: false,
            });
          }
          // Studs and bars, a stripe of dark across each leaf.
          for (const side of [-1, 1]) {
            featureBox(parent, feature, M.iron, {
              along: side * (GATE.width / 2 - 0.2), out0: -half + 0.2, out1: half - 0.2, w: 0.04, y0: feature.ground + 1.2, y1: feature.ground + 1.45, name: `gate-bar-${feature.id}`, occlude: false,
            });
          }
        }
      } else if (feature.kind === 'gate' && state === 'ruin') {
        // "Its gates … destroyed by fire": charred beams down across the way,
        // and the flanks fallen to a heap.
        for (let k = 0; k < 3; k += 1) {
          const beam = mesh(new THREE.BoxGeometry(0.3, 0.3, 3.2 + random()), M.charred, parent, { name: `burned-beam-${feature.id}`, cast: false });
          beam.position.set(
            feature.x + feature.tx * (random() - 0.5) * 2.4 + feature.nx * (random() - 0.5) * 2,
            feature.ground + 0.2 + k * 0.18,
            feature.z + feature.tz * (random() - 0.5) * 2.4 + feature.nz * (random() - 0.5) * 2,
          );
          beam.rotation.set(0.1 * (random() - 0.5), random() * Math.PI, 0.14 * (random() - 0.5));
        }
      }
    }
  }

  // --- stairs ---------------------------------------------------------------
  function stairs(parent) {
    const treads = [];
    const kerb = [];
    for (const flight of STAIR_FLIGHTS) {
      const pts = flight.points;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        const landing = a.u >= flight.landing - 1;
        const yaw = Math.atan2(dx, dz);
        const topH = landing ? (a.h + b.h) / 2 : Math.round(((a.h + b.h) / 2) / STAIR.rise) * STAIR.rise;
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const lowGround = Math.min(groundAt(mx, mz), groundAt(a.x, a.z), groundAt(b.x, b.z)) - FOOT;
        const width = landing ? STAIR.width + 1.4 : STAIR.width;
        const nx = -dz / length;
        const nz = dx / length;
        // Landings reach toward the wall as well: shift the box centre.
        treads.push({ x: mx, z: mz, y0: lowGround, y1: topH, length: length + 0.04, width, yaw, shiftX: landing ? 0 : 0, shiftZ: 0, nx, nz });
        kerb.push({ x: mx + nx * (STAIR.width / 2 + 0.02), z: mz + nz * (STAIR.width / 2 + 0.02), y: topH, length, yaw });
        kerb.push({ x: mx - nx * (STAIR.width / 2 + 0.02), z: mz - nz * (STAIR.width / 2 + 0.02), y: topH, length, yaw });
      }
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), M.ashlar, treads, 'stairs', (o, p) => {
      o.position.set(p.x, (p.y0 + p.y1) / 2, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.width, p.y1 - p.y0, p.length);
    }, parent, { cast: !low });
    // A low parapet on the open side of each flight, so the drop is drawn.
    instanced(new THREE.BoxGeometry(1, 1, 1), M.ashlar, kerb, 'stair-kerbs', (o, p) => {
      o.position.set(p.x, p.y + 0.3, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(0.22, 0.6, p.length);
    }, parent, { cast: false });
  }

  // --- the work in hand: ladders against the half wall ---------------------------
  function ladders(parent) {
    const parts = [];
    for (const x of [-0.32, 0.32]) {
      const rail = new THREE.BoxGeometry(0.07, 1, 0.07);
      rail.translate(x, 0.5, 0);
      parts.push(rail);
    }
    for (let k = 0; k < 8; k += 1) {
      const rung = new THREE.BoxGeometry(0.64, 0.05, 0.05);
      rung.translate(0, 0.1 + k * 0.125, 0);
      parts.push(rung);
    }
    const ladder = mergeSimple(THREE, parts);
    const placements = [];
    const profile = PROFILES[0];
    const half = profile.wall.thickness / 2;
    for (let s = 14; s < profile.length; s += 42) {
      if (FEATURES.some((f) => f.kind === 'gate' && f.wall === profile.wall.id && Math.abs(f.s - s) < 10)) continue;
      const frame = frameAt(profile, s);
      const top = topAt(profile, frame, 'half');
      const x = frame.x - frame.nx * (half + 0.12);
      const z = frame.z - frame.nz * (half + 0.12);
      const base = groundAt(x, z);
      placements.push({ x, z, y: base, h: top - base, yaw: Math.atan2(frame.nx, frame.nz) });
    }
    instanced(ladder, M.timber, placements, 'ladders', (o, p) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(-0.16, p.yaw + Math.PI, 0, 'YXZ');
      o.scale.set(1, p.h + 0.8, 1);
    }, parent, { cast: false });
  }

  // --- the fall of the wall, and the stone for its rebuilding -------------------
  function rubble(state, parent) {
    const placements = [];
    const density = state === 'ruin' ? 1 : 0.35;
    for (const profile of PROFILES) {
      for (let s = 0; s < profile.length; s += SAMPLE / density * 0.8) {
        const frame = frameAt(profile, s);
        const spread = state === 'ruin' ? 5.5 : 3.2;
        const lateral = (random() + random() - 1) * spread;
        const alongJitter = (random() - 0.5) * 2;
        const x = frame.x + frame.nx * lateral + frame.tx * alongJitter;
        const z = frame.z + frame.nz * lateral + frame.tz * alongJitter;
        const size = 0.28 + random() * (state === 'ruin' ? 0.9 : 0.55);
        placements.push({
          x, z, y: groundAt(x, z), size, rx: random() * 6, ry: random() * 6, flat: 0.55 + random() * 0.4,
        });
      }
    }
    instanced(new THREE.DodecahedronGeometry(1, 0), state === 'ruin' ? M.rubbleStone : M.ashlar, placements, `wall-rubble-${state}`, (o, p) => {
      o.position.set(p.x, p.y + p.size * 0.3, p.z);
      o.rotation.set(p.rx, p.ry, 0);
      o.scale.set(p.size, p.size * p.flat, p.size);
    }, parent, { cast: false });
  }

  // --- braziers on the gates, for the evening ---------------------------------
  const flames = [];
  function braziers(parent) {
    for (const feature of FEATURES.filter((f) => f.kind === 'gate')) {
      const profile = PROFILES.find((p) => p.wall.id === feature.wall);
      const half = profile.wall.thickness / 2;
      const top = frameAt(profile, feature.s).top + GATE.rise;
      for (const side of [-1, 1]) {
        const x = feature.x + feature.tx * side * (GATE.width / 2 + GATE.flankWidth / 2) + feature.nx * (half + GATE.flank - 0.8);
        const z = feature.z + feature.tz * side * (GATE.width / 2 + GATE.flankWidth / 2) + feature.nz * (half + GATE.flank - 0.8);
        const bowl = mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.3, 10), M.iron, parent, { cast: false, name: 'brazier' });
        bowl.position.set(x, top + 0.15, z);
        const flame = mesh(new THREE.ConeGeometry(0.22, 0.7, 8), M.flame, parent, { cast: false, name: 'brazier-flame' });
        flame.position.set(x, top + 0.62, z);
        flame.userData.phase = flames.length * 1.7;
        flames.push(flame);
      }
    }
  }

  // --- build a state, once ---------------------------------------------------
  function build(state) {
    const group = new THREE.Group();
    group.name = `nehemiah-wall-${state}`;
    sink = stateOccluders[state];
    ribbons(state, group);
    towers(state, group);
    rubble(state, group);
    if (state === 'built') {
      merlons(group);
      stairs(group);
      braziers(group);
    }
    if (state === 'half') {
      ladders(group);
    }
    sink = null;
    root.add(group);
    group.visible = false;
    groups[state] = group;
    return group;
  }

  let current = null;
  function setState(state) {
    const group = groups[state] || build(state);
    for (const [key, g] of Object.entries(groups)) g.visible = key === state;
    group.visible = true;
    current = state;
    root.updateMatrixWorld(true);
  }

  function update(elapsed, hour) {
    const night = hour?.id === 'night' ? 1 : hour?.id === 'dusk' ? 0.85 : hour?.id === 'dawn' ? 0.55 : 0.2;
    for (const flame of flames) {
      const f = 0.85 + Math.sin(elapsed * 9 + flame.userData.phase) * 0.1 + Math.sin(elapsed * 23 + flame.userData.phase * 2) * 0.05;
      flame.scale.set(f, f * (0.9 + night * 0.3), f);
      flame.material.opacity = 0.35 + night * 0.55;
    }
  }

  function dispose() {
    geometries.forEach((g) => g.dispose());
    root.removeFromParent();
  }

  return {
    group: root,
    setState,
    getState: () => current,
    update,
    occludersFor: (state) => stateOccluders[state] || [],
    dispose,
    lighting,
    states: groups,
  };
}
