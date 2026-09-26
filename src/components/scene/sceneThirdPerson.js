// The third-person view: the visitor as a figure standing in the place, seen
// from just behind and over one shoulder, rather than a camera floating at eye
// height.
//
// Why a body. A first-person camera has nothing to measure the world against:
// the doorway of the house in Capernaum is two metres high, and from 1.7m up it
// reads as "a doorway". Put a person-sized figure in it and it reads as a
// doorway a person has to stoop through, into a room seven metres across with
// more people in it than it holds — which is the whole story of Mark 2. The
// scale of a village of basalt houses is carried by a body standing in it.
//
// Everything here is either a small pure function or the one stateful rig that
// strings them together, and THREE is passed in rather than imported, so the
// module stays importable in jsdom and its tests can drive the real maths
// against the real village.
//
// Two conventions meet here and must not be confused:
//
//   The camera's yaw and pitch are Scene.jsx's. Yaw 0 looks down -Z, and the
//   camera looks along (-sin yaw · cos pitch, sin pitch, -cos yaw · cos pitch).
//
//   The avatar's heading is three.js's model convention: root.rotation.y =
//   heading, so the figure walks toward (sin heading, cos heading).
//
// They differ by half a turn. Getting that wrong walks the figure backwards
// while everything else looks fine, so the conversion lives in exactly one
// place: headingFromYaw.

// --- the numbers ------------------------------------------------------------

// The point the camera orbits, above the feet. A little below the eyes, so that
// looking down on the figure puts its head in the lower half of the frame
// rather than dead centre.
export const PIVOT_HEIGHT = 1.5;
// Over the shoulder rather than straight behind: the figure sits left of centre,
// so the middle of the frame — where a vantage's subject lands and where the
// hotspot labels appear — is left clear for the thing you came to look at.
export const SHOULDER_OFFSET = 0.4;
// Far enough back to see the whole figure and a doorway around it; close
// enough that the lanes, which are three or four metres wide, do not pull the
// camera in at every step.
export const FOLLOW_DISTANCE = 3.2;
export const FOLLOW_MIN = 1.2;
export const FOLLOW_MAX = 7;
// Looking down on the figure, to a little way up past it. Straight down is a
// map and straight up from behind a shoulder is the underside of a chin.
export const PITCH_MIN = -0.95;
export const PITCH_MAX = 0.5;
// How close the camera may come to anything solid, measured along the rays that
// find it. Larger than the near plane's half-diagonal at any field of view the
// framing module allows, so a wall behind or beside the lens is never cut open.
export const CAMERA_CLEARANCE = 0.3;
export const FLOOR_CLEARANCE = 0.3;
// A first-person camera sits half a metre behind its own near plane with a body
// in the way; this one can be backed up to 30cm from a wall, so it needs a near
// plane small enough not to slice that wall open at the edges of the frame.
export const THIRD_PERSON_NEAR = 0.15;
// Collision pulls the camera in on the frame it is needed and lets it back out
// over this long, because a camera that springs outward the instant a doorway
// clears reads as a glitch, and one that lingers inside a wall is a worse one.
export const EASE_OUT_SECONDS = 0.4;
// The follow spring. Short: long enough that starting and stopping have some
// weight, short enough that the figure never drifts out of its place in frame.
export const FOLLOW_SECONDS = 0.12;
const ZOOM_SECONDS = 0.08;
// Handing control back from a flight, or swinging out from the eye when the
// visitor switches view, eases over this long rather than cutting.
export const HANDOFF_SECONDS = 0.45;
// Turning to face the way you walk: an exponential approach, capped so that an
// about-turn takes a third of a second rather than a single frame.
export const TURN_RATE = 12;
export const MAX_TURN_SPEED = 10;
// The figure fades as the camera closes on its head and is gone before the lens
// is inside it.
export const FADE_NEAR = 0.6;
export const FADE_FAR = 1.1;
// Shift is a jog in this view, not the first-person 8.5 m/s sprint: the figure
// has a walk and a jog to show, and a body visibly jogging at sprint speed
// skates across the ground.
export const JOG_SPEED = 4.2;

// The opening shot: high over the village, behind the standpoint and looking at
// it, then down to the shoulder. See establishingPose.
export const ESTABLISHING = Object.freeze({ height: 55, back: 80, seconds: 4 });

const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// --- angles -----------------------------------------------------------------

// Into [-PI, PI).
export function wrapAngle(angle) {
  let wrapped = (angle + Math.PI) % TAU;
  if (wrapped < 0) wrapped += TAU;
  return wrapped - Math.PI;
}

// The signed turn from one heading to another, the short way round, so a turn
// from +170° to -170° swings 20° rather than 340°.
export function shortestTurn(from, to) {
  return wrapAngle(to - from);
}

// The heading that faces the way the camera is looking — the figure seen from
// behind. Half a turn, because the two conventions face opposite ways at 0.
export function headingFromYaw(yaw) {
  return wrapAngle(yaw + Math.PI);
}

// The heading of a step, in the avatar's convention.
export function headingOfTravel(dx, dz) {
  return Math.atan2(dx, dz);
}

// Eases the figure round toward the way it is going. The exponential part is
// exact for any frame length, and the cap is a fixed number of radians per
// second, so the turn takes the same time at 30 frames a second as at 144.
// Positional arguments rather than an options bag: this runs every frame.
export function turnToward(current, target, dt, rate = TURN_RATE, maxSpeed = MAX_TURN_SPEED) {
  if (!(dt > 0) || !Number.isFinite(target)) return current;
  const delta = shortestTurn(current, target);
  let step = delta * (1 - Math.exp(-rate * dt));
  const cap = maxSpeed * dt;
  if (step > cap) step = cap;
  else if (step < -cap) step = -cap;
  return wrapAngle(current + step);
}

// Camera direction convention shared with Scene.jsx and src/lib/scenes.js:
// yaw 0 looks down -Z. Kept here too so the vantage maths the tests check is
// the maths the route runs.
export function aimFrom(position, lookAt) {
  const dx = lookAt[0] - position[0];
  const dy = lookAt[1] - position[1];
  const dz = lookAt[2] - position[2];
  const flat = Math.hypot(dx, dz) || 1e-6;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, flat) };
}

// How a vantage is framed from behind the figure: the camera looks the way the
// vantage looks, so its subject is in the middle of the frame, and the figure
// faces the same way, so it is seen from behind rather than staring back.
export function thirdPersonAim(position, lookAt) {
  const aim = aimFrom(position, lookAt);
  return {
    yaw: aim.yaw,
    pitch: clampThirdPersonPitch(aim.pitch),
    heading: headingFromYaw(aim.yaw),
  };
}

export function clampThirdPersonPitch(pitch) {
  return Number.isFinite(pitch) ? clamp(pitch, PITCH_MIN, PITCH_MAX) : 0;
}

export function clampFollowDistance(distance) {
  return Number.isFinite(distance) ? clamp(distance, FOLLOW_MIN, FOLLOW_MAX) : FOLLOW_DISTANCE;
}

// --- where the camera wants to be -------------------------------------------

// The shoulder offset shrinks as the camera comes in. At full distance it is
// what keeps the middle of the frame clear; pulled in to a metre behind the
// head it would put the lens beside the figure's ear, looking past it.
export function shoulderFor(distance) {
  return SHOULDER_OFFSET * clamp(distance / FOLLOW_DISTANCE, 0, 1);
}

// Where the camera looks, as a unit vector written into `out`.
export function lookDirection(yaw, pitch, out) {
  const flat = Math.cos(pitch);
  out.x = -Math.sin(yaw) * flat;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * flat;
  return out;
}

// The unobstructed camera position: back from the pivot along the view, and
// out to the camera's right by the shoulder offset. The view axis then passes
// beside the pivot rather than through it, which is what puts the figure left
// of centre. Written into `out`; allocates nothing.
export function desiredCameraPosition(pivot, yaw, pitch, distance, out) {
  const flat = Math.cos(pitch);
  const side = shoulderFor(distance);
  out.x = pivot.x + Math.cos(yaw) * side + Math.sin(yaw) * flat * distance;
  out.y = pivot.y - Math.sin(pitch) * distance;
  out.z = pivot.z - Math.sin(yaw) * side + Math.cos(yaw) * flat * distance;
  return out;
}

// The opening shot: `back` metres behind the standpoint along the reverse of
// the view and `height` metres up, looking at it — so the flight down arrives
// facing the way the vantage faces, over the roofs of the village it is about.
export function establishingPose(anchor, yaw) {
  const position = [
    anchor.x + Math.sin(yaw) * ESTABLISHING.back,
    anchor.y + ESTABLISHING.height,
    anchor.z + Math.cos(yaw) * ESTABLISHING.back,
  ];
  const aim = aimFrom(position, [anchor.x, anchor.y, anchor.z]);
  return { position, yaw: aim.yaw, pitch: aim.pitch };
}

// --- easing -----------------------------------------------------------------

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// How much of the figure to draw, from how far the camera is from its head.
export function avatarOpacity(distance) {
  return smoothstep(FADE_NEAR, FADE_FAR, distance);
}

// During a vantage flight the figure fades out where it stood and back in where
// it lands — the first fifth of the flight and the last quarter.
export function flightFadeOut(t) {
  return clamp(1 - t / 0.2, 0, 1);
}

export function flightFadeIn(t) {
  return clamp((t - 0.75) / 0.25, 0, 1);
}

// The collision-limited arm length, one frame on. In at once, out gradually:
// at 3/EASE_OUT_SECONDS the gap is 95% closed after EASE_OUT_SECONDS whatever
// the frame rate, and never overshoots.
export function followReach(current, allowed, dt, reduced = false) {
  if (current === null || !Number.isFinite(current) || reduced || allowed <= current) return allowed;
  if (!(dt > 0)) return current;
  return current + (allowed - current) * (1 - Math.exp(-dt * (3 / EASE_OUT_SECONDS)));
}

function springAxis(position, velocity, target, key, dt, omega, decay) {
  const offset = position[key] - target[key];
  const temp = (velocity[key] + omega * offset) * dt;
  velocity[key] = (velocity[key] - omega * temp) * decay;
  position[key] = target[key] + (offset + temp) * decay;
}

// A critically damped spring toward `target`, integrated in closed form rather
// than stepped, so a second of following comes out the same in 30 frames as in
// 144 — and never overshoots, which a follow camera must not do. `smoothTime`
// is roughly how long it takes to arrive. Mutates `position` and `velocity`.
export function springToward(position, velocity, target, dt, smoothTime = FOLLOW_SECONDS) {
  if (!(dt > 0)) return position;
  const omega = 2 / smoothTime;
  const decay = Math.exp(-omega * dt);
  springAxis(position, velocity, target, 'x', dt, omega, decay);
  springAxis(position, velocity, target, 'y', dt, omega, decay);
  springAxis(position, velocity, target, 'z', dt, omega, decay);
  return position;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

// --- the rig ----------------------------------------------------------------

// The stateful half: the follow spring, the collision memory that lets the
// camera ease back out, and the hand-off blend. Everything it needs per frame
// arrives in one plain object the caller reuses —
//
//   { dt, x, y, z, walkerFloor, yaw, pitch, distance, fov, aspect, near, reduced }
//
// where x/y/z is the anchor (the figure's feet plus PIVOT_HEIGHT) and
// walkerFloor the height of the floor under them — and it answers with
// `rig.position`, a Vector3 it owns and overwrites. Nothing is allocated per
// frame except what three's raycaster makes for an actual hit.
//
// `colliders` are Mesh or InstancedMesh; `floorAt(x, z, fromHeight)` is the
// scene navigation's, and is optional — without it the floor under the camera
// is taken to be the floor under the figure.
export function createThirdPersonRig(THREE, { colliders = [], floorAt = null } = {}) {
  const raycaster = new THREE.Raycaster();
  const hits = [];
  let targets = Array.isArray(colliders) ? colliders : [];

  const position = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const pivotVelocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const arm = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const ray = new THREE.Vector3();
  const handoffFrom = new THREE.Vector3();

  let primed = false;
  let zoom = FOLLOW_DISTANCE;
  let reach = null;
  let handoffLeft = 0;

  // The floor under a point, asked from the figure's own floor, not from the
  // camera's height. Inside the house the camera can rise to within a hand of
  // the roof, and asked from there the navigation would answer "the roof" —
  // and a floor clamp would then push the camera straight up through it.
  function floorUnder(x, z, walkerFloor) {
    const floor = floorAt ? floorAt(x, z, walkerFloor) : null;
    return floor && Number.isFinite(floor.height) ? floor.height : walkerFloor;
  }

  function keepAboveFloor(point, walkerFloor) {
    const lowest = floorUnder(point.x, point.z, walkerFloor) + FLOOR_CLEARANCE;
    if (point.y < lowest) point.y = lowest;
  }

  // How far along the ray from `origin` to `target` the camera may come, as a
  // fraction of that ray, leaving CAMERA_CLEARANCE before the first thing hit.
  // The ray runs CAMERA_CLEARANCE past its target, so a wall just behind where
  // the camera wants to be counts too.
  function freeFraction(origin, target) {
    ray.subVectors(target, origin);
    const length = ray.length();
    if (length < 1e-6 || targets.length === 0) return Infinity;
    ray.multiplyScalar(1 / length);
    raycaster.set(origin, ray);
    raycaster.near = 0;
    raycaster.far = length + CAMERA_CLEARANCE;
    hits.length = 0;
    raycaster.intersectObjects(targets, false, hits);
    const first = hits.length ? hits[0].distance : Infinity;
    hits.length = 0;
    return (first - CAMERA_CLEARANCE) / length;
  }

  // Resolves the arm for one pose. Leaves the unit direction from the anchor in
  // `arm` and returns how long it may be.
  //
  // Five rays, not one and not a sphere sweep. One ray down the middle lets a
  // doorway jamb slide past the edge of the lens and be cut open by the near
  // plane; a sweep is a cost three.js does not offer. Rays to the four corners
  // of the near plane at the wanted position are the standard stand-in: if
  // the straight line from the figure to each corner is clear, nothing can sit
  // between the figure and any part of the picture. Five rays at ~40 meshes is
  // two hundred cheap bounding-sphere tests a frame.
  function resolveArm(origin, framePivot, yaw, pitch, distance, walkerFloor, fov, aspect, near) {
    desiredCameraPosition(framePivot, yaw, pitch, distance, desired);
    // Asked before the rays are cast, so a camera that wanted to be under the
    // lane swings up over it rather than being cast into it and then lifted
    // off the line of sight.
    keepAboveFloor(desired, walkerFloor);

    arm.subVectors(desired, origin);
    const length = arm.length();
    if (length < 1e-6) {
      arm.set(0, 0, 0);
      return 0;
    }
    arm.multiplyScalar(1 / length);

    let fraction = freeFraction(origin, desired);

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const nearPlane = Number.isFinite(near) && near > 0 ? near : THIRD_PERSON_NEAR;
    const halfHeight = Math.tan(((Number.isFinite(fov) ? fov : 60) * Math.PI) / 360) * nearPlane;
    const halfWidth = halfHeight * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
    for (let corner = 0; corner < 4; corner += 1) {
      const across = corner & 1 ? halfWidth : -halfWidth;
      const up = corner & 2 ? halfHeight : -halfHeight;
      probe.set(
        desired.x - sinYaw * cosPitch * nearPlane + cosYaw * across + sinYaw * sinPitch * up,
        desired.y + sinPitch * nearPlane + cosPitch * up,
        desired.z - cosYaw * cosPitch * nearPlane - sinYaw * across + cosYaw * sinPitch * up,
      );
      fraction = Math.min(fraction, freeFraction(origin, probe));
    }
    return clamp(fraction * length, 0, length);
  }

  function place(walkerFloor) {
    position.copy(anchor).addScaledVector(arm, reach);
    keepAboveFloor(position, walkerFloor);
  }

  // Resolves a pose outright — no spring, no easing — and makes it the rig's
  // current state, so the next update carries on from exactly here. Used for
  // the end of a flight and to compute where a flight should end.
  function settle(frame) {
    anchor.set(frame.x, frame.y, frame.z);
    pivot.copy(anchor);
    pivotVelocity.set(0, 0, 0);
    zoom = clampFollowDistance(frame.distance);
    primed = true;
    handoffLeft = 0;
    reach = resolveArm(anchor, pivot, frame.yaw, frame.pitch, zoom, frame.walkerFloor,
      frame.fov, frame.aspect, frame.near);
    place(frame.walkerFloor);
    return position;
  }

  function update(frame) {
    const { dt, reduced } = frame;
    anchor.set(frame.x, frame.y, frame.z);
    const wanted = clampFollowDistance(frame.distance);
    if (!primed || reduced) {
      pivot.copy(anchor);
      pivotVelocity.set(0, 0, 0);
      zoom = wanted;
      primed = true;
    } else {
      springToward(pivot, pivotVelocity, anchor, dt, FOLLOW_SECONDS);
      zoom += (wanted - zoom) * (1 - Math.exp(-(dt > 0 ? dt : 0) / ZOOM_SECONDS));
    }
    // Rays go from the figure's real position, not the lagging pivot: the
    // figure is always somewhere a body can stand, and the pivot, cutting a
    // corner behind it through a doorway, is not.
    const allowed = resolveArm(anchor, pivot, frame.yaw, frame.pitch, zoom, frame.walkerFloor,
      frame.fov, frame.aspect, frame.near);
    reach = followReach(reach, allowed, dt, reduced);
    place(frame.walkerFloor);

    if (handoffLeft > 0) {
      handoffLeft = reduced ? 0 : Math.max(0, handoffLeft - (dt > 0 ? dt : 0));
      if (handoffLeft > 0) {
        position.lerp(handoffFrom, 1 - easeInOut(1 - handoffLeft / HANDOFF_SECONDS));
      }
    }
    return position;
  }

  return {
    position,
    settle,
    update,
    // Blends from wherever the camera is now into the rig's own answer over
    // HANDOFF_SECONDS, so giving the view back after a flight, or swinging out
    // from the eye into this view, is a move rather than a cut.
    handoff(from) {
      handoffFrom.copy(from);
      handoffLeft = HANDOFF_SECONDS;
    },
    // Forgets the spring and the collision memory; the next update starts
    // from rest wherever it is told the figure is.
    reset() {
      primed = false;
      reach = null;
      handoffLeft = 0;
    },
    setColliders(list) {
      targets = Array.isArray(list) ? list : [];
    },
    get colliders() {
      return targets;
    },
  };
}

// --- which view -------------------------------------------------------------

export const VIEW_KEY_PREFIX = 'miqra_scene_view:';

export function storedView(slug) {
  try {
    const value = window.localStorage.getItem(`${VIEW_KEY_PREFIX}${slug}`);
    return value === 'first' || value === 'third' ? value : null;
  } catch {
    return null;
  }
}

export function storeView(slug, view) {
  try {
    window.localStorage.setItem(`${VIEW_KEY_PREFIX}${slug}`, view);
  } catch {
    // A browser refusing storage is not a reason to refuse the view; it just
    // will not be remembered next time.
  }
}

// The view a scene opens in. A scene that has not opted in is first-person,
// whatever was stored; one that has opens in the visitor's last choice there,
// or in its own default.
export function initialView(slug, module) {
  if (!module?.thirdPerson) return 'first';
  return storedView(slug) ?? (module.defaultView === 'third' ? 'third' : 'first');
}
