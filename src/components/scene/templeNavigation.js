// Where a visitor can and cannot walk in the Herod's Temple scene.
//
// No raycasting. The precinct is a handful of axis-aligned rectangles at three
// known heights plus two ramps, and all of that is already written down in
// templeDimensions.js — so collision is arithmetic on those same numbers, which
// is both far cheaper than sampling the mesh and, more usefully, testable
// without a GPU. Walking is exactly the kind of feature where "you clip through
// the north wall at one specific corner" never shows up in a screenshot.
//
// Two ideas do most of the work:
//
//   `floorAt` answers "what is under this point, and how high is it" for the
//   whole site. Being outside every region means there is no floor at all.
//
//   The step rule then blocks any move whose floor height changes by more than
//   a stride. That single check keeps you from walking off the edge of the
//   inner court, off the side of the fifteen steps, or off the platform, with
//   no wall geometry enumerated for any of it. Only barriers that separate two
//   points at the *same* height need to be listed explicitly.

import {
  LEVEL,
  PLATFORM,
  INNER,
  WOMEN,
  ALTAR,
  PORCH,
  GATE,
  FIFTEEN_STEPS,
  TWELVE_STEPS,
  SOREG,
  COLONNADE,
  colonnadePositions,
  soregSegments,
} from './templeDimensions';

// How far the visitor's shoulders reach. Blockers are inflated by this so you
// stop in front of a wall rather than with your eye inside it.
export const BODY_RADIUS = 0.45;

// The tallest rise that counts as a stride rather than a fall.
export const MAX_STEP = 0.5;

// Keeps you off the lip of the retaining wall, which is a 46m drop.
const PLATFORM_MARGIN = 3;

// The barriers worth explaining. A visitor stopped by one of these gets the
// reason on screen — which is the point of letting people walk at all. Bumping
// a column or a wall is just a wall; being refused entry at the soreg is the
// architecture doing what it was built to do.
export const BARRIERS = {
  soreg: {
    id: 'soreg',
    label: 'Turned Back at the Soreg',
    body:
      'A stone screen, waist high, easily stepped over — and absolutely not to be. '
      + 'Notices in Greek and Latin were set along it at intervals. One of them was dug '
      + 'up in Jerusalem in 1871 and reads: “No foreigner is to enter within the '
      + 'balustrade and enclosure around the temple. Whoever is caught will have himself '
      + 'to blame for his ensuing death.” Paul was nearly killed over a rumour that he had '
      + 'brought a Greek past it.',
    refs: ['Ephesians 2:13-14', 'Acts 21:28-29'],
  },
  rail: {
    id: 'rail',
    label: 'The Court of the Priests',
    body:
      'A low rail, and the end of the road for a layman. Israelite men came into the '
      + 'narrow court behind you to watch and to lay a hand on their offering; past this '
      + 'point the work belonged to the priests alone. Everyone in the building knew '
      + 'exactly how far in they were allowed to stand.',
    refs: ['Numbers 18:7', '2 Chronicles 26:16-18'],
  },
  sanctuary: {
    id: 'sanctuary',
    label: 'The Sanctuary Door',
    body:
      'Through the doorway lay the Holy Place, where only priests went, and behind a '
      + 'curtain the room beyond it, where only the high priest went, once a year, with '
      + 'blood. The whole building is arranged to say the same thing at every threshold: '
      + 'not you, not yet, not without a mediator.',
    refs: ['Hebrews 9:6-8', 'Matthew 27:51'],
  },
};

// --- what is underfoot ----------------------------------------------------

// Returns { height, region } for a point on the site, or null where there is
// no floor at all (off the platform).
export function floorAt(x, z) {
  // Inner precinct: the Court of Israel and the Court of the Priests.
  if (Math.abs(x) <= INNER.halfX && z >= INNER.zWest && z <= INNER.zEast) {
    return { height: LEVEL.inner, region: 'inner' };
  }

  // The fifteen steps, bulging east of the Nicanor Gate. Modelled as a
  // continuous cone rather than fifteen discrete treads: the visitor rides up
  // it smoothly, which is both kinder to the stomach and indistinguishable
  // from stepping when the rise is 25cm.
  if (z > INNER.zEast) {
    const radius = Math.hypot(x, z - FIFTEEN_STEPS.centreZ);
    if (radius <= FIFTEEN_STEPS.outerRadius) {
      const span = FIFTEEN_STEPS.outerRadius - FIFTEEN_STEPS.innerRadius;
      const climbed = Math.min(1, Math.max(0, (FIFTEEN_STEPS.outerRadius - radius) / span));
      return {
        height: LEVEL.women + climbed * (LEVEL.inner - LEVEL.women),
        region: 'fifteen-steps',
      };
    }
  }

  // The Court of the Women, out to the inside face of its east wall.
  if (Math.abs(x) <= WOMEN.halfX && z >= INNER.zEast && z <= TWELVE_STEPS.zTop) {
    return { height: LEVEL.women, region: 'women' };
  }

  // The twelve steps down through the Beautiful Gate to the outer court.
  if (Math.abs(x) <= TWELVE_STEPS.halfX && z >= TWELVE_STEPS.zTop && z <= TWELVE_STEPS.zBottom) {
    const descended = (z - TWELVE_STEPS.zTop) / (TWELVE_STEPS.zBottom - TWELVE_STEPS.zTop);
    return { height: LEVEL.women * (1 - descended), region: 'twelve-steps' };
  }

  // The great outer platform, held clear of its own edge.
  if (
    Math.abs(x) <= PLATFORM.halfX - PLATFORM_MARGIN
    && z >= PLATFORM.zWest + PLATFORM_MARGIN
    && z <= PLATFORM.zEast - PLATFORM_MARGIN
  ) {
    return { height: LEVEL.outer, region: 'outer' };
  }

  return null;
}

// --- what is in the way ---------------------------------------------------

// Solid rectangles, as [x0, x1, z0, z1, id]. Only barriers separating two
// points at the same height need to be here; everything else is handled by the
// step rule in `move`.
const RECTS = [
  // The sanctuary and the flight of steps up to its porch.
  [-PORCH.halfX, PORCH.halfX, INNER.zWest, -1.6, 'sanctuary'],

  // The altar and its southern ramp.
  [-ALTAR.half, ALTAR.half, ALTAR.z - ALTAR.half, ALTAR.z + ALTAR.half, 'altar'],
  [-ALTAR.half - 16, -ALTAR.half, ALTAR.z - 4, ALTAR.z + 4, 'altar'],

  // The rail dividing the Court of Israel from the Court of the Priests.
  [-INNER.halfX + 2, INNER.halfX - 2, 19.6, 20, 'rail'],

  // The Nicanor Gate wall, split around its opening.
  [-INNER.halfX, -GATE.nicanorHalfWidth, INNER.zEast - 2, INNER.zEast, 'wall'],
  [GATE.nicanorHalfWidth, INNER.halfX, INNER.zEast - 2, INNER.zEast, 'wall'],

  // The east wall of the women's court, split around the Beautiful Gate. The
  // twelve steps are wider than the gate, so this is what funnels the crowd.
  [-WOMEN.halfX - 1.5, -GATE.beautifulHalfWidth, WOMEN.zEast, TWELVE_STEPS.zTop, 'wall'],
  [GATE.beautifulHalfWidth, WOMEN.halfX + 1.5, WOMEN.zEast, TWELVE_STEPS.zTop, 'wall'],

  // The four corner chambers inside the women's court.
  [-WOMEN.halfX, -WOMEN.halfX + 12, WOMEN.zWest, WOMEN.zWest + 12, 'wall'],
  [WOMEN.halfX - 12, WOMEN.halfX, WOMEN.zWest, WOMEN.zWest + 12, 'wall'],
  [-WOMEN.halfX, -WOMEN.halfX + 12, WOMEN.zEast - 12, WOMEN.zEast, 'wall'],
  [WOMEN.halfX - 12, WOMEN.halfX, WOMEN.zEast - 12, WOMEN.zEast, 'wall'],

  // The soreg's north, south and west runs. Its east face is generated below
  // from the same gap list the geometry is drawn from.
  [-SOREG.halfX, -SOREG.halfX + SOREG.thickness, SOREG.zWest, SOREG.zEast, 'soreg'],
  [SOREG.halfX - SOREG.thickness, SOREG.halfX, SOREG.zWest, SOREG.zEast, 'soreg'],
  [-SOREG.halfX, SOREG.halfX, SOREG.zWest, SOREG.zWest + SOREG.thickness, 'soreg'],
  ...soregSegments().map(([x0, x1]) => [x0, x1, SOREG.zEast, SOREG.zEast + SOREG.thickness, 'soreg']),
];

// The columns, in a coarse grid so a move tests four or five of them rather
// than five hundred.
const CELL = 24;
const cellKey = (x, z) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
const COLUMN_GRID = new Map();
for (const position of colonnadePositions()) {
  const key = cellKey(position[0], position[1]);
  const bucket = COLUMN_GRID.get(key);
  if (bucket) bucket.push(position);
  else COLUMN_GRID.set(key, [position]);
}

function columnAt(x, z) {
  const reach = COLONNADE.radius + BODY_RADIUS;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
    for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
      const bucket = COLUMN_GRID.get(`${ix}:${iz}`);
      if (!bucket) continue;
      for (const [px, pz] of bucket) {
        if (Math.hypot(x - px, z - pz) < reach) return true;
      }
    }
  }
  return false;
}

// Returns the id of whatever solid thing occupies this point, or null.
export function blockerAt(x, z) {
  const r = BODY_RADIUS;
  for (const [x0, x1, z0, z1, id] of RECTS) {
    if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return id;
  }
  return columnAt(x, z) ? 'column' : null;
}

// --- moving ---------------------------------------------------------------

// Attempts a step, sliding along a wall rather than stopping dead against it.
// Returns the new stance plus `blocked`: the id of whatever refused the direct
// move, even when the slide succeeded, so brushing along the soreg still tells
// you what the soreg is.
export function move(from, dx, dz) {
  const attempt = (x, z) => {
    const floor = floorAt(x, z);
    if (!floor) return { blocked: 'edge' };
    if (Math.abs(floor.height - from.height) > MAX_STEP) return { blocked: 'edge' };
    const hit = blockerAt(x, z);
    if (hit) return { blocked: hit };
    return { x, z, height: floor.height, region: floor.region, blocked: null };
  };

  const direct = attempt(from.x + dx, from.z + dz);
  if (!direct.blocked) return direct;

  // Slide: keep whichever component of the movement is still legal.
  if (dx !== 0) {
    const alongX = attempt(from.x + dx, from.z);
    if (!alongX.blocked) return { ...alongX, blocked: direct.blocked };
  }
  if (dz !== 0) {
    const alongZ = attempt(from.x, from.z + dz);
    if (!alongZ.blocked) return { ...alongZ, blocked: direct.blocked };
  }

  return { x: from.x, z: from.z, height: from.height, region: from.region, blocked: direct.blocked };
}

// A standing position at a point, for dropping the visitor somewhere directly
// (the opening vantage, or the end of a fast-travel flight).
export function stanceAt(x, z) {
  const floor = floorAt(x, z);
  if (!floor) return null;
  return { x, z, height: floor.height, region: floor.region, blocked: null };
}

// --- tap to walk ----------------------------------------------------------

// Marches a ray until it meets the ground, then bisects for a tidy point.
// Used by tap-to-walk, which needs to know which of the three floors the
// visitor actually pointed at — a ray aimed at the women's court passes over
// the outer platform on the way, so a single ground plane gets it wrong.
export function groundPointAlongRay(origin, direction, maxDistance = 340) {
  const at = (t) => ({
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  });

  // Aiming at or above the horizon never meets the floor.
  if (direction.y >= 0) return null;

  let previous = 0;
  for (let t = 0.5; t <= maxDistance; t += 0.75) {
    const point = at(t);
    const floor = floorAt(point.x, point.z);
    // A floor higher than the eye that is aiming at it is behind a wall from
    // here — you cannot see over the side of a raised court, so tapping must
    // not put a target on one. Scene.jsx falls back to walking on the tapped
    // bearing, which climbs the stairs on the way.
    if (!floor || floor.height > origin.y) {
      previous = t;
      continue;
    }
    if (point.y <= floor.height) {
      let low = previous;
      let high = t;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        const sample = at(mid);
        const midFloor = floorAt(sample.x, sample.z);
        if (midFloor && sample.y <= midFloor.height) high = mid;
        else low = mid;
      }
      const hit = at(high);
      const hitFloor = floorAt(hit.x, hit.z);
      if (!hitFloor) return null;
      // Tapping a wall, a column or the altar should do nothing rather than
      // send the visitor walking into it.
      if (blockerAt(hit.x, hit.z)) return null;
      return { x: hit.x, z: hit.z, height: hitFloor.height, region: hitFloor.region };
    }
    previous = t;
  }
  return null;
}
