// What a wall of Nehemiah's Jerusalem is, as numbers.
//
// A wall here is a polyline of vertices (nehemiahDimensions.js WALLS) laid on
// real ground, and two things are asked of it again and again: how high is it
// at this point along its length, and where on it can a visitor stand. This
// module answers both, for the geometry that draws the wall and for the
// navigation that walks it, so a wall that is drawn eight metres high is a
// wall that is solid to eight metres.
//
// The profile is the interesting part. A wall on a hillside is not a constant
// height above anything: its top follows the hill, and the face on the downhill
// side is a retaining wall, taller than the one on the uphill side. So the top
// is the *higher* ground at the wall's foot plus its height, smoothed so that
// it ramps rather than staircases, and limited in slope so that the walkway
// along the top can be walked.
//
// A wall has three states (WALL_STATES): ruin, half, built. They differ only
// in height — and in whether a stump is a stump or a gap — so the three share
// one profile and a function from state to height.
//
// No three.js: this module is arithmetic, and the tests run it as such.

import {
  WALLS, GATE, STAIRS, STAIR, MOUNT, groundAt, insidePolygon,
} from './nehemiahDimensions.js';

export const SAMPLE = 2; // metres between profile samples
const SMOOTH = 7; // samples either side in the moving average
const MAX_SLOPE = 0.34; // the steepest the walkway may climb, rise over run

// A cheap deterministic hash in [0, 1).
function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- the profile ------------------------------------------------------------------

function buildProfile(wall, index) {
  const pts = wall.vertices;
  const segCount = wall.closed ? pts.length : pts.length - 1;
  const segments = [];
  let length = 0;
  for (let i = 0; i < segCount; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ a, b, len, s0: length, tx: (b.x - a.x) / len, tz: (b.z - a.z) / len });
    length += len;
  }

  // Which way is outward. For the city, away from the inside of its own
  // polygon; for the Temple Mount's walls, away from the platform.
  const probe = (inner) => {
    const seg = segments[0];
    const mx = (seg.a.x + seg.b.x) / 2;
    const mz = (seg.a.z + seg.b.z) / 2;
    return inner(mx + -seg.tz * 4, mz + seg.tx * 4);
  };
  const cityPolygon = wall.closed ? pts.map((p) => [p.x, p.z]) : null;
  const normalIsInward = wall.closed
    ? probe((x, z) => insidePolygon(x, z, cityPolygon))
    : probe((x, z) => insidePolygon(x, z, MOUNT.polygon));
  const sign = normalIsInward ? -1 : 1;
  segments.forEach((seg) => { seg.nx = -seg.tz * sign; seg.nz = seg.tx * sign; });

  const count = Math.max(2, Math.round(length / SAMPLE)) + (wall.closed ? 0 : 1);
  const step = wall.closed ? length / count : length / (count - 1);
  const samples = [];
  for (let k = 0; k < count; k += 1) {
    const s = k * step;
    const seg = segments.find((candidate) => s <= candidate.s0 + candidate.len + 1e-9) || segments[segments.length - 1];
    const u = (s - seg.s0) / seg.len;
    const x = seg.a.x + (seg.b.x - seg.a.x) * Math.min(1, u);
    const z = seg.a.z + (seg.b.z - seg.a.z) * Math.min(1, u);
    const half = wall.thickness / 2;
    const gOut = groundAt(x + seg.nx * half, z + seg.nz * half);
    const gIn = groundAt(x - seg.nx * half, z - seg.nz * half);
    const gC = groundAt(x, z);
    samples.push({
      s, x, z, tx: seg.tx, tz: seg.tz, nx: seg.nx, nz: seg.nz,
      gOut, gIn, gC,
      high: Math.max(gOut, gIn, gC),
      low: Math.min(gOut, gIn, gC),
      top: 0,
    });
  }

  // The top: the higher ground plus the wall's height, smoothed along its
  // length, never below the raw figure by more than a course or two, and
  // limited in slope both ways so it can be walked.
  const raw = samples.map((sample) => sample.high + wall.height);
  const at = (arr, k) => (wall.closed ? arr[((k % count) + count) % count] : arr[Math.max(0, Math.min(count - 1, k))]);
  const top = raw.map((_, k) => {
    let sum = 0;
    for (let d = -SMOOTH; d <= SMOOTH; d += 1) sum += at(raw, k + d);
    return Math.max(sum / (2 * SMOOTH + 1), raw[k] - 1.2);
  });
  // Raise, never lower: forward then back, twice round a closed wall so the
  // seam closes.
  const limit = MAX_SLOPE * step;
  const loops = wall.closed ? 3 : 1;
  for (let r = 0; r < loops; r += 1) {
    for (let k = 1; k < count; k += 1) top[k] = Math.max(top[k], top[k - 1] - limit);
    if (wall.closed) top[0] = Math.max(top[0], top[count - 1] - limit);
    for (let k = count - 2; k >= 0; k -= 1) top[k] = Math.max(top[k], top[k + 1] - limit);
    if (wall.closed) top[count - 1] = Math.max(top[count - 1], top[0] - limit);
  }
  samples.forEach((sample, k) => { sample.top = top[k]; });

  return { wall, index, segments, samples, length, step, count, closed: wall.closed };
}

export const PROFILES = WALLS.map(buildProfile);
export const PROFILE_BY_ID = Object.fromEntries(PROFILES.map((profile) => [profile.wall.id, profile]));

// A point on a wall at arc length s (wrapping on a closed one).
export function frameAt(profile, s) {
  const { samples, step, count, closed, length } = profile;
  const t = closed ? ((s % length) + length) % length : Math.max(0, Math.min(length, s));
  const f = t / step;
  const i = Math.floor(f);
  const u = f - i;
  const a = samples[Math.min(i, count - 1)];
  const b = closed ? samples[(i + 1) % count] : samples[Math.min(i + 1, count - 1)];
  const lerp = (p, q) => p + (q - p) * u;
  return {
    s: t,
    x: lerp(a.x, b.x),
    z: lerp(a.z, b.z),
    tx: a.tx,
    tz: a.tz,
    nx: a.nx,
    nz: a.nz,
    top: lerp(a.top, b.top),
    high: lerp(a.high, b.high),
    low: lerp(a.low, b.low),
  };
}

// --- the three states ---------------------------------------------------------------

// Half the wall: "all the wall was joined together to half its height" (4:6).
// Each stretch is a little ahead or behind its neighbours, as stretches built
// by different families are.
export function halfFactor(profile, s) {
  return 0.46 + 0.1 * hash(profile.index + 7, Math.floor(s / 24));
}

// The ruin: stumps and breaches. Height above the ground at the wall's foot;
// zero is a gap you could ride a mule through.
export function ruinHeight(profile, s) {
  const slot = Math.floor(s / 7);
  const u = hash(profile.index + 3, slot);
  if (u < 0.3) return 0;
  return 0.7 + 2.4 * ((u - 0.3) / 0.7) ** 1.4;
}

// How high a wall stands above its own base, at a sample, in a state.
export function topAt(profile, sample, state) {
  if (state === 'ruin') return sample.high + ruinHeight(profile, sample.s) + 0.05;
  // Half the wall — but never lower than a man's height above the higher ground
  // at its foot: a retaining wall half built on a slope would otherwise stand
  // below the ground behind it, and be a wall nobody could see.
  if (state === 'half') {
    return Math.max(sample.low + (sample.top - sample.low) * halfFactor(profile, sample.s), sample.high + 2);
  }
  return sample.top;
}

// --- gates and towers ------------------------------------------------------------

// Each vertex of kind `gate` or `tower`, with its arc position and outward
// direction: what the geometry places and the navigation opens or closes.
function featureAt(profile, vertex, s) {
  // A vertex joins two segments: its direction is the mean of theirs.
  const { segments, closed } = profile;
  const i = segments.findIndex((seg) => seg.a === vertex);
  const after = segments[i >= 0 ? i : segments.length - 1];
  const before = i > 0 ? segments[i - 1] : closed ? segments[segments.length - 1] : after;
  const unit = (x, z) => {
    const m = Math.hypot(x, z) || 1;
    return [x / m, z / m];
  };
  const [tx, tz] = unit(after.tx + before.tx, after.tz + before.tz);
  const [nx, nz] = unit(after.nx + before.nx, after.nz + before.nz);
  return {
    id: vertex.id,
    kind: vertex.kind,
    wall: profile.wall.id,
    x: vertex.x,
    z: vertex.z,
    s,
    tx,
    tz,
    nx,
    nz,
    ground: groundAt(vertex.x, vertex.z),
  };
}

export const FEATURES = [];
for (const profile of PROFILES) {
  const pts = profile.wall.vertices;
  pts.forEach((vertex, i) => {
    if (vertex.kind === 'bend') return;
    const seg = profile.segments[i];
    FEATURES.push(featureAt(profile, vertex, seg ? seg.s0 : profile.length));
  });
}

export const FEATURE_BY_ID = Object.fromEntries(FEATURES.map((feature) => [feature.id, feature]));
export const GATES = FEATURES.filter((feature) => feature.kind === 'gate');
export const TOWERS = FEATURES.filter((feature) => feature.kind === 'tower');

// --- where a point is relative to the walls ------------------------------------------

// The nearest point on any wall: which, how far along, how far off it, and
// on which side (lateral > 0 is the outer face).
export function nearestWall(x, z, only = null) {
  let best = null;
  for (const profile of PROFILES) {
    if (only && profile.wall.id !== only) continue;
    for (const seg of profile.segments) {
      const dx = seg.b.x - seg.a.x;
      const dz = seg.b.z - seg.a.z;
      const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / (seg.len * seg.len)));
      const px = seg.a.x + dx * t;
      const pz = seg.a.z + dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (!best || distance < best.distance) {
        const lateral = (x - px) * seg.nx + (z - pz) * seg.nz;
        best = { profile, seg, s: seg.s0 + t * seg.len, distance, lateral, along: (x - px) * seg.tx + (z - pz) * seg.tz, px, pz };
      }
    }
  }
  return best;
}

// Is this point within a gate's passage? Returns the gate, or null.
const GATE_REACH = 14;
export function gateAt(x, z, margin = 0) {
  for (const gate of GATES) {
    const dx = x - gate.x;
    const dz = z - gate.z;
    if (Math.abs(dx) > GATE_REACH || Math.abs(dz) > GATE_REACH) continue;
    const along = dx * gate.tx + dz * gate.tz;
    const lateral = dx * gate.nx + dz * gate.nz;
    const wall = PROFILE_BY_ID[gate.wall].wall;
    if (Math.abs(along) <= GATE.width / 2 - margin && Math.abs(lateral) <= wall.thickness / 2 + 3) return gate;
  }
  return null;
}

// --- standing on a wall -----------------------------------------------------------

// The walkway is the wall's top less a hand's breadth at either edge, and in
// the finished wall only.
const WALK_INSET = 0.4;
export function wallTopAt(x, z) {
  const hit = nearestWall(x, z);
  if (!hit) return null;
  const { profile, s, lateral, distance } = hit;
  if (distance > profile.wall.thickness) return null;
  if (Math.abs(lateral) > profile.wall.thickness / 2 - WALK_INSET) return null;
  return { height: frameAt(profile, s).top, wall: profile.wall.id, s };
}

// --- the stairs -------------------------------------------------------------------

// A flight lies against the inside face of the wall, rising at STAIR.slope from
// the ground until its surface meets the walkway, then runs level with it for
// a landing. Each is a centre line of points with a height at every one.
const LANDING = 4;
function layStair(spec) {
  const profile = PROFILE_BY_ID[spec.wall];
  const feature = FEATURE_BY_ID[spec.vertex];
  const half = profile.wall.thickness / 2;
  const offset = half + 0.45 + 0.25 + STAIR.width / 2;
  const sStart = feature.s + spec.direction * spec.start;
  const at = (u) => {
    const frame = frameAt(profile, sStart + spec.direction * u);
    return { frame, x: frame.x - frame.nx * offset, z: frame.z - frame.nz * offset };
  };
  const first = at(0);
  const base = groundAt(first.x, first.z) + 0.06;
  const points = [];
  let u = 0;
  let landing = null;
  while (u < 140) {
    const p = at(u);
    let h = base + STAIR.slope * u;
    const top = p.frame.top;
    if (h >= top - 0.02 && landing === null) landing = u;
    if (landing !== null) h = top;
    points.push({ u, x: p.x, z: p.z, h, s: p.frame.s });
    if (landing !== null && u >= landing + LANDING) break;
    u += 1;
  }
  return {
    id: spec.id,
    label: spec.label,
    wall: spec.wall,
    width: STAIR.width,
    length: landing ?? u,
    landing: landing ?? u,
    points,
    refs: spec.refs,
    spec,
  };
}
export const STAIR_FLIGHTS = STAIRS.map(layStair);

// The surface of whichever flight a point is on, or null. `lateral` is
// measured from the flight's centre line; the landing also takes the strip
// between the flight and the walkway, so the one runs into the other.
export function stairAt(x, z) {
  for (const flight of STAIR_FLIGHTS) {
    const pts = flight.points;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      const onLanding = a.u >= flight.landing - 1;
      const reach = onLanding ? flight.width / 2 + 1.4 : flight.width / 2;
      if (d <= reach) {
        return { height: a.h + (b.h - a.h) * t, flight: flight.id, u: a.u + t, landing: onLanding };
      }
    }
  }
  return null;
}

// --- measurements the text gives ---------------------------------------------------

// Along-the-wall distance between two features on one wall, the short way
// round a closed one in the direction of travel.
export function arcBetween(fromId, toId) {
  const a = FEATURE_BY_ID[fromId];
  const b = FEATURE_BY_ID[toId];
  const profile = PROFILE_BY_ID[a.wall];
  let d = b.s - a.s;
  if (profile.closed && d < 0) d += profile.length;
  return d;
}

export const circuitLength = (wallId = 'city') => PROFILE_BY_ID[wallId].length;
