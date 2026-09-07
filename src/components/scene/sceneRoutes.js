// One route model, shared by the instanced fallback crowd (sceneFigures.js)
// and the GLB actors (sceneHumans.js), because they used to disagree — the
// fallback measured a step every 0.78m, the GLB path every 1.15m of "distance"
// that was not actually metres. `figure.speed` used to be route-fractions per
// second, so how fast a walker moved depended on how long its route happened
// to be: an 86m lane at speed 0.05 was a 4.3 m/s sprint, a 7m one was a 0.3
// m/s shuffle. See docs/scene-humans-motion-and-crowding-plan.md §1.1.
//
// A route is walked at a real speed in metres per second, out and back, with
// an eased ramp on and off and a pause at each end — a person does not
// reverse direction in one frame at full speed, they arrive, turn, and leave.

export const WALK_SPEED = 1.15; // m/s, an unhurried village pace
export const RAMP = 0.8; // seconds to reach or shed full pace
export const DWELL = 2.6; // seconds standing at each end before turning back

function easeInOut(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  return p * p * (3 - 2 * p);
}

function lerpAngle(a, b, blend) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * blend;
}

// Precomputes everything about a figure's route that does not change frame to
// frame: the trapezoidal speed profile (accelerate for `ramp` seconds, cruise,
// decelerate) that gets the walker from one end to the other in the time a
// real walk at `speed` actually takes.
export function routePlan(figure) {
  const [from, to] = figure.route;
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz) || 0.001;
  const requestedSpeed = figure.speed > 0 ? figure.speed : WALK_SPEED;
  const requestedRamp = Math.max(figure.ramp ?? RAMP, 0.001);

  let topSpeed = requestedSpeed;
  let ramp = requestedRamp;
  let cruiseTime = length / topSpeed - ramp;
  if (cruiseTime < 0) {
    // The route is too short to reach full speed and shed it again. Rather
    // than ask for a negative cruise phase, shrink to a pure triangle: ramp
    // up, touch a lower peak speed, ramp straight back down.
    ramp = Math.sqrt((length * requestedRamp) / requestedSpeed) || 0.001;
    topSpeed = length / ramp;
    cruiseTime = 0;
  }

  const legDuration = 2 * ramp + cruiseTime;
  const dwell = Math.max(figure.dwell ?? DWELL, 0);
  return {
    from,
    to,
    dx,
    dz,
    length,
    topSpeed,
    ramp,
    cruiseTime,
    legDuration,
    dwell,
    period: 2 * (legDuration + dwell),
    lane: figure.lane || 0,
    phase: figure.phase || 0,
  };
}

// Distance travelled (and instantaneous speed) at `legT` seconds into one leg,
// under the plan's trapezoidal profile.
function distanceAt(plan, legT) {
  const {
    ramp, cruiseTime, legDuration, length, topSpeed,
  } = plan;
  if (legT < ramp) {
    return { dist: (topSpeed * legT * legT) / (2 * ramp), speed: topSpeed * (legT / ramp) };
  }
  if (legT < ramp + cruiseTime) {
    return { dist: (topSpeed * ramp) / 2 + topSpeed * (legT - ramp), speed: topSpeed };
  }
  const tau = Math.max(0, legDuration - legT);
  return {
    dist: length - (topSpeed * tau * tau) / (2 * ramp),
    speed: topSpeed * (tau / ramp),
  };
}

// Samples a route plan at `clock` seconds, returning where the walker is, the
// way they are facing, and their instantaneous speed in m/s — which callers
// use directly for gait, rather than differencing two positions (see
// sceneHumans.js, and the plan's §5.3 on why differencing loses the frame a
// walker first becomes active).
//
// Position is tracked as `f`, the fraction of the way from `from` to `to`,
// continuous over the whole period (0 at `from`, 1 at `to`, however many
// times the walker has been back and forth) with a *fixed* perpendicular lane
// offset. An earlier version flipped the offset's sign between the outbound
// and return legs so a walker kept to "its own side" of the lane — but the
// dwell held the outbound sign for its entire duration and the return leg
// then started from the flipped one, so the position jumped by 2x the lane
// offset at every turnaround: an instant teleport dressed up as walking. A
// fixed offset loses the two-sides-of-the-lane nicety but is never
// discontinuous, which matters far more than which side of the path a
// villager happens to be on.
export function sampleRoute(plan, clock = 0) {
  const {
    length, dx, dz, legDuration, dwell, period, lane, phase, from,
  } = plan;
  const t = ((clock + phase * period) % period + period) % period;
  const ux = length > 0 ? dx / length : 0;
  const uz = length > 0 ? dz / length : 0;
  const outboundFacing = Math.atan2(dx, dz);
  const returnFacing = Math.atan2(-dx, -dz);

  let f; // fraction of the way from `from` to `to` — continuous, unlike `along` below
  let facing;
  let speed;
  let moving;
  let direction;
  let along;

  if (t < legDuration) {
    direction = 1;
    const step = distanceAt(plan, t);
    along = step.dist / length;
    f = along;
    facing = outboundFacing;
    speed = step.speed;
    moving = true;
  } else if (t < legDuration + dwell) {
    // Standing at the far end. The facing eases from the way they arrived
    // toward the way they are about to leave, so a walker stops and turns on
    // the spot instead of crabbing sideways into the return leg.
    direction = 1;
    along = 1;
    f = 1;
    facing = lerpAngle(outboundFacing, returnFacing, easeInOut((t - legDuration) / dwell));
    speed = 0;
    moving = false;
  } else if (t < 2 * legDuration + dwell) {
    direction = -1;
    const legT = t - legDuration - dwell;
    const step = distanceAt(plan, legT);
    along = step.dist / length;
    f = 1 - along;
    facing = returnFacing;
    speed = step.speed;
    moving = true;
  } else {
    direction = -1;
    along = 1;
    f = 0;
    facing = lerpAngle(returnFacing, outboundFacing, easeInOut((t - (2 * legDuration + dwell)) / dwell));
    speed = 0;
    moving = false;
  }

  const x = from[0] + dx * f - uz * lane;
  const z = from[1] + dz * f + ux * lane;

  return {
    x, z, facing, speed, moving, along, direction,
  };
}
