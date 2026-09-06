// The measurements of the Herod's Temple scene, in one place.
//
// Both the geometry (buildSecondTemple.js) and the collision model
// (templeNavigation.js) read from here. That is the whole point of the module:
// a visitor who can walk is a visitor who can find the seam between what is
// drawn and what is solid, and two copies of "the women's court is 135 cubits
// wide" drift the moment one of them is edited.
//
// Metres throughout; 1 cubit = 0.5m. Cubit figures are from Mishnah Middot
// unless noted. Axes: -Z west toward the sanctuary, +Z east toward the gates,
// +X north, +Y up.

export const CUBIT = 0.5;

// A standing eye. Everything the camera does vertically is floor + this.
export const EYE_HEIGHT = 1.7;

// Floor heights. The scene is a westward climb, so these three numbers are
// load-bearing: the vantages in src/lib/scenes.js are measured against them,
// and every walkable region resolves to one of them or to a ramp between two.
export const LEVEL = {
  outer: 0, // Court of the Gentiles — the great paved platform
  women: 3.2, // up twelve steps through the Beautiful Gate
  inner: 6.95, // up the fifteen semicircular steps to Nicanor
};

export const PLATFORM = { halfX: 230, zWest: -110, zEast: 236 }; // ~485m x ~345m
export const INNER = { halfX: 33.75, zWest: -62, zEast: 26.5 }; // 135 cubits wide
export const WOMEN = { halfX: 33.75, zWest: 37, zEast: 105 }; // 135 cubits square
export const ALTAR = { half: 8, z: 9, height: 6 }; // 32 cubits square at the base
export const PORCH = { halfX: 25, height: 50, zEast: -10, depth: 6 }; // 100 x 100 cubits

// Gate openings. Both are real holes in the masonry rather than painted-on
// rectangles, so these half-widths are what the walker squeezes through.
export const GATE = {
  nicanorHalfWidth: 4.7,
  beautifulHalfWidth: 4.6,
};

// The fifteen steps are modelled as concentric rings centred on the middle of
// the Nicanor Gate, bulging east into the women's court.
export const FIFTEEN_STEPS = {
  centreZ: INNER.zEast,
  outerRadius: 10.5,
  innerRadius: 1.82, // 10.5 - 14 * 0.62, the top ring
  count: 15,
};

// The twelve steps up through the Beautiful Gate, running east to west.
export const TWELVE_STEPS = {
  halfX: 40,
  zTop: 106.5, // at LEVEL.women, flush with the inside of the east wall
  zBottom: 116.9, // at LEVEL.outer
};

// The soreg: the waist-high screen that enclosed the inner courts and carried
// the notices forbidding Gentiles to pass. Middot records thirteen breaches in
// it; five are modelled, which is enough for the barrier to read as a boundary
// with doors rather than a box with no way in.
export const SOREG = {
  halfX: 70,
  zEast: 118,
  zWest: -70,
  height: 3 * CUBIT,
  thickness: 0.35,
  // Gaps in the east face only, as [from, to] in X.
  gaps: [[-3, 3], [-33, -27], [27, 33], [-61, -55], [55, 61]],
};

// The colonnade around the platform edge. Deliberately identical at every
// quality setting: a column you can walk through on a phone but not on a
// laptop is a worse bug than a slightly heavier draw call, and 500-odd
// instances of a cylinder cost almost nothing either way. Low quality reduces
// the segment count, the shadows and the crowd instead.
export const COLONNADE = {
  rows: [8, 16], // insets from the platform edge
  spacing: 6,
  radius: 0.85,
  height: 11,
};

// Generated once and shared, so the columns that are drawn are exactly the
// columns you bump into.
export function colonnadePositions() {
  const positions = [];
  for (const inset of COLONNADE.rows) {
    for (let x = -PLATFORM.halfX + inset; x <= PLATFORM.halfX - inset; x += COLONNADE.spacing) {
      positions.push([x, PLATFORM.zEast - inset]);
      positions.push([x, PLATFORM.zWest + inset]);
    }
    for (let z = PLATFORM.zWest + inset + COLONNADE.spacing; z < PLATFORM.zEast - inset; z += COLONNADE.spacing) {
      positions.push([PLATFORM.halfX - inset, z]);
      positions.push([-PLATFORM.halfX + inset, z]);
    }
  }
  return positions;
}

// The east face of the soreg as solid runs, derived from the gaps so the
// screen that is drawn is the screen that stops you.
export function soregSegments() {
  const gaps = [...SOREG.gaps].sort((a, b) => a[0] - b[0]);
  const runs = [];
  let cursor = -SOREG.halfX;
  for (const [from, to] of gaps) {
    if (from > cursor) runs.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < SOREG.halfX) runs.push([cursor, SOREG.halfX]);
  return runs;
}
