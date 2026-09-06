// The movement rules every scene shares.
//
// A scene supplies only the two questions that are actually about that place —
// `floorAt(x, z, fromHeight)`, which resolves a point to a floor height and a
// region name or to nothing at all, and `blockerAt(x, z, height)`, which names
// whatever solid thing occupies it.
//
// `fromHeight` is what lets a scene stack surfaces. A room and the roof over it
// occupy the same ground plan, so "what is the floor here" has two answers and
// the right one is the one nearest the height the question is asked from. A
// scene with a single storey ignores the argument entirely. The height matters as soon as a scene has roofs: a
// house wall stops you in the lane and is something you walk over on the roof,
// and the two answers differ only by how high up the question is asked.
//
// Everything else about walking is the same everywhere and lives here: how a
// step is taken, how it slides along a wall, how far it may climb, and how a
// tap on the screen becomes a destination.
//
// Two rules do the heavy lifting, one from each scene that existed before this
// module:
//
//   The step rule refuses any move whose floor height changes by more than a
//   stride. That single check keeps a visitor from walking off the edge of a
//   raised court, off the side of a stair or off a roof, without any of those
//   edges being described as geometry. Only barriers separating two points at
//   the *same* height need listing.
//
//   Substepping walks the move in short hops rather than one jump. Without it a
//   long frame at a jog — a backgrounded tab, a slow phone — can carry the
//   visitor straight through a wall between two samples.

export const DEFAULT_BODY_RADIUS = 0.45;
export const DEFAULT_MAX_STEP = 0.5;

// Short enough that nothing thinner than a wall can be tunnelled through,
// long enough that crossing a courtyard is not thousands of iterations.
const SUBSTEP = 0.2;

// A move longer than this is treated as a mistake rather than a marathon, so a
// bad delta cannot lock the frame up in a loop.
const MAX_MOVE = 400;

export function createNavigator({
  floorAt,
  blockerAt,
  maxStep = DEFAULT_MAX_STEP,
  bodyRadius = DEFAULT_BODY_RADIUS,
}) {
  // Tries one point, and says why it was refused. `blocked` is the id of the
  // thing in the way — a barrier name the UI can explain, or 'edge' for a drop
  // or the end of the world.
  function probe(fromHeight, x, z) {
    const floor = floorAt(x, z, fromHeight);
    if (!floor) return { blocked: 'edge' };
    if (Math.abs(floor.height - fromHeight) > maxStep) return { blocked: 'edge' };
    const hit = blockerAt(x, z, floor.height);
    if (hit) return { blocked: hit };
    return { stance: { x, z, height: floor.height, region: floor.region, blocked: null } };
  }

  // A standing position at a point, or null where nobody could stand. Used to
  // drop the visitor somewhere directly — the opening vantage, or the end of a
  // fast-travel flight.
  function stanceAt(x, z, fromHeight = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const floor = floorAt(x, z, fromHeight);
    if (!floor || blockerAt(x, z, floor.height)) return null;
    return { x, z, height: floor.height, region: floor.region, blocked: null };
  }

  // Walks a step, sliding along whatever it meets rather than stopping dead.
  // Reports `blocked` whenever something refused the direct line, even if the
  // slide succeeded — so brushing along the soreg still names the soreg.
  function move(from, dx, dz) {
    if (!from || !Number.isFinite(dx) || !Number.isFinite(dz)) return from;
    const distance = Math.hypot(dx, dz);
    if (distance === 0) return { ...from, blocked: null };

    const scale = distance > MAX_MOVE ? MAX_MOVE / distance : 1;
    const steps = Math.max(1, Math.ceil((distance * scale) / SUBSTEP));
    const sx = (dx * scale) / steps;
    const sz = (dz * scale) / steps;

    let current = { ...from, blocked: null };
    let blocked = null;

    for (let i = 0; i < steps; i += 1) {
      const direct = probe(current.height, current.x + sx, current.z + sz);
      if (direct.stance) {
        current = direct.stance;
        continue;
      }
      blocked = direct.blocked;

      const alongX = sx !== 0 ? probe(current.height, current.x + sx, current.z) : null;
      if (alongX?.stance) {
        current = alongX.stance;
        continue;
      }
      const alongZ = sz !== 0 ? probe(current.height, current.x, current.z + sz) : null;
      if (alongZ?.stance) {
        current = alongZ.stance;
        continue;
      }
      break; // wedged into a corner; nothing left to try
    }

    return { ...current, blocked };
  }

  // Marches a ray until it meets the ground, then bisects for a tidy point.
  // Tap-to-walk needs to know which floor the visitor actually pointed at — a
  // ray aimed into a raised court passes over the ground before it, so a single
  // ground plane gets the answer wrong in any scene with more than one level.
  function groundPointAlongRay(origin, direction, maxDistance = 340) {
    if (!origin || !direction || direction.y >= 0) return null;

    const at = (t) => ({
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
      z: origin.z + direction.z * t,
    });

    let previous = 0;
    for (let t = 0.5; t <= maxDistance; t += 0.75) {
      const point = at(t);
      const floor = floorAt(point.x, point.z, point.y);
      // A floor above the eye aiming at it is behind a wall from here — you
      // cannot see over the side of a raised court or onto a roof from the
      // street, so a tap must never land on one. Scene.jsx falls back to
      // walking the tapped bearing, which climbs the stairs on the way.
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
          const midFloor = floorAt(sample.x, sample.z, sample.y);
          if (midFloor && sample.y <= midFloor.height) high = mid;
          else low = mid;
        }
        const hit = at(high);
        const hitFloor = floorAt(hit.x, hit.z, hit.y);
        if (!hitFloor) return null;
        // Tapping a wall or a crate should do nothing, rather than send the
        // visitor walking into it.
        if (blockerAt(hit.x, hit.z, hitFloor.height)) return null;
        return { x: hit.x, z: hit.z, height: hitFloor.height, region: hitFloor.region, blocked: null };
      }
      previous = t;
    }
    return null;
  }

  return { stanceAt, move, groundPointAlongRay, probe, bodyRadius, maxStep };
}

// Rectangles are how nearly every barrier in these scenes is described, so the
// hit test is shared too. `rects` are [x0, x1, z0, z1, id], inflated by the
// body radius so a visitor stops in front of a wall rather than inside it.
export function rectHit(rects, x, z, bodyRadius = DEFAULT_BODY_RADIUS) {
  for (const [x0, x1, z0, z1, id] of rects) {
    if (x > x0 - bodyRadius && x < x1 + bodyRadius && z > z0 - bodyRadius && z < z1 + bodyRadius) {
      return id;
    }
  }
  return null;
}

// A coarse grid over circular obstacles — columns, palms, posts — so a move
// tests four or five of them rather than every one in the scene.
export function createCircleIndex(circles, { cell = 24 } = {}) {
  const grid = new Map();
  for (const circle of circles) {
    const key = `${Math.floor(circle.x / cell)}:${Math.floor(circle.z / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(circle);
    else grid.set(key, [circle]);
  }
  return function hit(x, z, bodyRadius = DEFAULT_BODY_RADIUS) {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
        const bucket = grid.get(`${ix}:${iz}`);
        if (!bucket) continue;
        for (const circle of bucket) {
          if (Math.hypot(x - circle.x, z - circle.z) < circle.radius + bodyRadius) return circle.id || 'column';
        }
      }
    }
    return null;
  };
}
