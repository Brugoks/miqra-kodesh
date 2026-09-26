import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PIVOT_HEIGHT, FOLLOW_DISTANCE, FOLLOW_MIN, FOLLOW_MAX, CAMERA_CLEARANCE, FLOOR_CLEARANCE,
  PITCH_MIN, PITCH_MAX, MAX_TURN_SPEED, FADE_NEAR, FADE_FAR, EASE_OUT_SECONDS,
  wrapAngle, shortestTurn, headingFromYaw, headingOfTravel, turnToward, aimFrom, thirdPersonAim,
  clampThirdPersonPitch, clampFollowDistance, shoulderFor, lookDirection, desiredCameraPosition,
  establishingPose, avatarOpacity, followReach, springToward, createThirdPersonRig, initialView,
} from './sceneThirdPerson';
import buildCapernaum from './buildCapernaum';
import * as capernaumNavigation from './capernaumNavigation';
import { CAPERNAUM } from '../../lib/capernaumScene';

const EYE_HEIGHT = 1.7;

// A frame object of the shape Scene.jsx hands the rig every frame.
function frameAt(stance, { yaw = 0, pitch = -0.3, distance = FOLLOW_DISTANCE, dt = 0, reduced = false } = {}) {
  return {
    dt,
    x: stance.x,
    y: stance.height + PIVOT_HEIGHT,
    z: stance.z,
    walkerFloor: stance.height,
    yaw,
    pitch,
    distance,
    fov: 60,
    aspect: 16 / 10,
    near: 0.15,
    reduced,
  };
}

describe('angles', () => {
  it('wraps and turns the short way round', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 9);
    expect(shortestTurn(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(shortestTurn(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 9);
  });

  it('converts a camera yaw into the heading of a figure seen from behind', () => {
    // Walking "forward" (W) from any camera yaw moves along the camera's view,
    // and the figure turned to that heading must face the way it moves — the
    // one conversion that, got backwards, walks the figure like a moonwalker.
    for (const yaw of [0, 0.8, -1.9, 3]) {
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const heading = headingFromYaw(yaw);
      expect(Math.sin(heading)).toBeCloseTo(forward.x, 9);
      expect(Math.cos(heading)).toBeCloseTo(forward.z, 9);
      expect(wrapAngle(headingOfTravel(forward.x, forward.z) - heading)).toBeCloseTo(0, 9);
    }
  });

  it('eases the figure round at a capped rate, the same at any frame rate', () => {
    expect(turnToward(0, 0.2, 0)).toBe(0);
    // Capped: a half turn cannot happen in one frame.
    expect(Math.abs(turnToward(0, Math.PI - 0.01, 1 / 60))).toBeLessThanOrEqual(MAX_TURN_SPEED / 60 + 1e-9);
    // The short way round across the seam.
    expect(turnToward(3.0, -3.0, 1 / 60)).toBeGreaterThan(3.0);
    // Frame-rate independent once the cap is out of the way.
    // A quarter of a second in whole frames at each rate.
    const run = (fps) => {
      let heading = 0;
      for (let i = 0; i < fps / 4; i += 1) heading = turnToward(heading, 0.3, 1 / fps);
      return heading;
    };
    expect(run(60)).toBeCloseTo(run(144), 6);
  });

  it('frames a vantage from behind, facing what it is about', () => {
    const vantage = CAPERNAUM.vantages[0];
    const aim = thirdPersonAim(vantage.position, vantage.lookAt);
    const straight = aimFrom(vantage.position, vantage.lookAt);
    expect(aim.yaw).toBeCloseTo(straight.yaw, 9);
    expect(aim.pitch).toBeGreaterThanOrEqual(PITCH_MIN);
    expect(aim.pitch).toBeLessThanOrEqual(PITCH_MAX);
    expect(wrapAngle(aim.heading - headingFromYaw(aim.yaw))).toBeCloseTo(0, 9);
    expect(clampThirdPersonPitch(-5)).toBe(PITCH_MIN);
    expect(clampThirdPersonPitch(Number.NaN)).toBe(0);
    expect(clampFollowDistance(100)).toBe(FOLLOW_MAX);
    expect(clampFollowDistance(0)).toBe(FOLLOW_MIN);
  });
});

describe('where the camera wants to be', () => {
  it('sits behind the pivot, up with the pitch and out to the right by the shoulder', () => {
    const pivot = { x: 0, y: 1.5, z: 0 };
    const out = {};
    desiredCameraPosition(pivot, 0, 0, FOLLOW_DISTANCE, out);
    // Yaw 0 looks down -Z, so behind is +Z; the camera's right is +X.
    expect(out.z).toBeCloseTo(FOLLOW_DISTANCE, 9);
    expect(out.x).toBeCloseTo(shoulderFor(FOLLOW_DISTANCE), 9);
    expect(out.y).toBeCloseTo(1.5, 9);
    // Looking down puts the camera up.
    desiredCameraPosition(pivot, 0, -0.5, FOLLOW_DISTANCE, out);
    expect(out.y).toBeGreaterThan(1.5 + 1);
    // The shoulder offset shrinks as the camera comes in.
    expect(shoulderFor(1)).toBeLessThan(shoulderFor(FOLLOW_DISTANCE));
    const dir = lookDirection(0.4, -0.2, {});
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 9);
  });

  it('opens high over the standpoint, looking at it', () => {
    const pose = establishingPose({ x: 2, y: 1, z: -16 }, 0.5);
    expect(pose.position[1]).toBeGreaterThan(40);
    const back = aimFrom(pose.position, [2, 1, -16]);
    expect(pose.yaw).toBeCloseTo(back.yaw, 9);
    expect(pose.pitch).toBeLessThan(-0.3);
  });

  it('fades the figure out before the lens reaches it', () => {
    expect(avatarOpacity(FADE_NEAR - 0.1)).toBe(0);
    expect(avatarOpacity(FADE_FAR + 0.1)).toBe(1);
    const middle = avatarOpacity((FADE_NEAR + FADE_FAR) / 2);
    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.8);
  });
});

describe('easing', () => {
  it('pulls in at once and lets out gradually', () => {
    expect(followReach(3, 1, 1 / 60)).toBe(1);
    let reach = 1;
    for (let t = 0; t < EASE_OUT_SECONDS; t += 1 / 60) reach = followReach(reach, 3, 1 / 60);
    expect(reach).toBeGreaterThan(2.8);
    expect(reach).toBeLessThan(3);
    // Reduced motion: no easing either way.
    expect(followReach(1, 3, 1 / 60, true)).toBe(3);
  });

  it('follows on a spring that never overshoots and does not care about frame rate', () => {
    const run = (fps) => {
      const position = { x: 0, y: 0, z: 0 };
      const velocity = { x: 0, y: 0, z: 0 };
      let peak = 0;
      for (let i = 0; i < fps / 2; i += 1) {
        springToward(position, velocity, { x: 1, y: 0, z: 0 }, 1 / fps, 0.12);
        peak = Math.max(peak, position.x);
      }
      return { x: position.x, peak };
    };
    const slow = run(30);
    const fast = run(144);
    expect(slow.peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(fast.peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(slow.x).toBeCloseTo(fast.x, 2);
    expect(slow.x).toBeGreaterThan(0.95);
  });
});

describe('createThirdPersonRig against a wall', () => {
  function wallScene() {
    const world = new THREE.Group();
    // A wall one metre behind the figure (+Z is behind at yaw 0).
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 0.6), new THREE.MeshBasicMaterial());
    wall.position.set(0, 3, 1.3);
    world.add(wall);
    world.updateMatrixWorld(true);
    return { world, wall };
  }

  it('pulls the camera in front of a wall and never inside it', () => {
    const { wall } = wallScene();
    const rig = createThirdPersonRig(THREE, { colliders: [wall] });
    const at = rig.settle(frameAt({ x: 0, z: 0, height: 0 }, { pitch: 0 }));
    const box = new THREE.Box3().setFromObject(wall);
    expect(box.containsPoint(at)).toBe(false);
    expect(at.z).toBeLessThan(box.min.z - CAMERA_CLEARANCE + 0.05);
  });

  it('eases back out once the wall is gone, and holds the floor', () => {
    const { wall } = wallScene();
    const rig = createThirdPersonRig(THREE, { colliders: [wall] });
    const stance = { x: 0, z: 0, height: 0 };
    rig.settle(frameAt(stance, { pitch: 0 }));
    rig.setColliders([]);
    const first = rig.update(frameAt(stance, { pitch: 0, dt: 1 / 60 })).z;
    expect(first).toBeLessThan(FOLLOW_DISTANCE - 0.5);
    let z = first;
    for (let i = 0; i < 60; i += 1) z = rig.update(frameAt(stance, { pitch: 0, dt: 1 / 60 })).z;
    expect(z).toBeGreaterThan(FOLLOW_DISTANCE - 0.1);
    // Looking up from behind would put the lens underground; the floor stops it.
    const low = rig.settle(frameAt(stance, { pitch: PITCH_MAX, distance: FOLLOW_MAX }));
    expect(low.y).toBeGreaterThanOrEqual(FLOOR_CLEARANCE - 1e-9);
  });

  it('remembers the chosen view per scene, and only where the scene offers one', () => {
    expect(initialView('second-temple', {})).toBe('first');
    expect(initialView('capernaum', { thirdPerson: true, defaultView: 'third' })).toBe('third');
  });
});

// --- the real village ---------------------------------------------------------
// The camera must never end up inside a wall or a roof, or looking at the
// figure through one, anywhere a visitor can walk on the route the scene is
// built around — and the collision it uses is the builder's own.

// Is a point inside solid geometry? Every collider is a closed solid with
// outward-facing faces, so from inside one the first face a ray meets faces
// away from where the ray came from. Checked along two directions, since a
// ray can leave through a gap between two solids that touch. (A bounding-box
// test would be wrong here: the builder merges many slabs into one mesh, whose
// box spans half the village.)
function makeInsideTest(colliders) {
  const raycaster = new THREE.Raycaster();
  const normal = new THREE.Vector3();
  const matrix = new THREE.Matrix3();
  const directions = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.577, 0.577, -0.577)];
  return (point) => directions.some((direction) => {
    raycaster.set(point, direction);
    raycaster.far = 60;
    const [first] = raycaster.intersectObjects(colliders, false);
    if (!first?.face) return false;
    normal.copy(first.face.normal).applyMatrix3(matrix.getNormalMatrix(first.object.matrixWorld));
    if (first.object.isInstancedMesh && first.instanceId !== undefined) {
      const instance = new THREE.Matrix4();
      first.object.getMatrixAt(first.instanceId, instance);
      normal.copy(first.face.normal).applyMatrix3(matrix.getNormalMatrix(instance.premultiply(first.object.matrixWorld)));
    }
    return normal.dot(direction) > 0;
  });
}

// Walks from waypoint to waypoint with the navigation's own move, and returns
// a stance roughly every metre. Fails loudly if any leg of the route cannot be
// completed, since a route that silently stops short tests nothing.
function walkRoute(waypoints) {
  const { move, stanceAt } = capernaumNavigation;
  let current = stanceAt(waypoints[0][0], waypoints[0][1], waypoints[0][2] ?? 0);
  expect(current, 'route start').toBeTruthy();
  const samples = [current];
  let sinceSample = 0;
  for (const [x, z] of waypoints.slice(1)) {
    for (let guard = 0; guard < 2000; guard += 1) {
      const dx = x - current.x;
      const dz = z - current.z;
      const remaining = Math.hypot(dx, dz);
      if (remaining < 0.3) break;
      const step = Math.min(0.25, remaining);
      const next = move(current, (dx / remaining) * step, (dz / remaining) * step);
      const progressed = Math.hypot(next.x - current.x, next.z - current.z);
      expect(progressed, `stuck near (${current.x.toFixed(1)}, ${current.z.toFixed(1)}) heading for (${x}, ${z})`).toBeGreaterThan(1e-4);
      current = next;
      sinceSample += progressed;
      if (sinceSample >= 1) {
        samples.push(current);
        sinceSample = 0;
      }
    }
  }
  return samples;
}

describe('the third-person camera in Capernaum', () => {
  const built = buildCapernaum(THREE, { quality: 'low' });
  built.root.updateMatrixWorld(true);
  const colliders = built.cameraColliders ?? built.occluders ?? [];
  // Seen from inside, a face must still be hit, so the test looks at both
  // sides of every collider (the scene is built for this test alone).
  colliders.forEach((mesh) => { mesh.material = mesh.material.clone(); mesh.material.side = THREE.DoubleSide; });
  const insideSolid = makeInsideTest(colliders);
  const rig = createThirdPersonRig(THREE, { colliders, floorAt: capernaumNavigation.floorAt });
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const pivot = new THREE.Vector3();

  function checkPose(stance, yaw, pitch) {
    const frame = frameAt(stance, { yaw, pitch });
    const camera = rig.settle(frame).clone();
    const where = `at (${stance.x.toFixed(1)}, ${stance.height.toFixed(1)}, ${stance.z.toFixed(1)}) yaw ${yaw.toFixed(2)} pitch ${pitch}`;
    expect(insideSolid(camera), `camera inside a collider ${where}`).toBe(false);
    pivot.set(frame.x, frame.y, frame.z);
    const length = direction.subVectors(camera, pivot).length();
    if (length > 1e-3) {
      raycaster.set(pivot, direction.multiplyScalar(1 / length));
      raycaster.far = length;
      const hits = raycaster.intersectObjects(colliders, false);
      expect(hits.length, `a collider between the camera and the figure ${where}`).toBe(0);
    }
    const floor = capernaumNavigation.floorAt(camera.x, camera.z, stance.height);
    if (floor) expect(camera.y, `camera below the floor ${where}`).toBeGreaterThan(floor.height);
  }

  const YAWS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  const PITCHES = [-0.7, -0.25, 0.3];

  it('uses a real set of colliders, and can tell inside one from outside', () => {
    expect(colliders.length).toBeGreaterThan(10);
    // Inside the west wing of the insula, inside a village block, inside the
    // synagogue's wall — and out in the open lane.
    expect(insideSolid(new THREE.Vector3(11, 1.5, 20))).toBe(true);
    expect(insideSolid(new THREE.Vector3(-13, 1.5, 12))).toBe(true);
    expect(insideSolid(new THREE.Vector3(-27.3, 3, 38))).toBe(true);
    expect(insideSolid(new THREE.Vector3(6, 1.5, 20))).toBe(false);
  });

  it('stays clear of walls and roofs along the story route: shore, lane, courtyard, house, stair, roof', () => {
    const route = walkRoute([
      [2, -16, -0.55], // the shore vantage
      // Up the beach clear of the nets frame and the boat, then the lane.
      [8, -14], [8, -5], [6, -2], [6, 31], [22, 31], [22, 23], [15.6, 20], [15.6, 12.5], // into the house
      [15.6, 20], [22, 23], [22, 31], [33, 31], [33, 22], [33, 10.6], // round to the stair and up
      [29, 10.6], [20.5, 12.5], // across the roof toward the opening
    ]);
    expect(route.length).toBeGreaterThan(60);
    route.forEach((stance) => YAWS.forEach((yaw) => PITCHES.forEach((pitch) => checkPose(stance, yaw, pitch))));
    // The walk really did end on the roof.
    expect(route[route.length - 1].height).toBeCloseTo(3.3, 1);
  }, 30000);

  it('stays clear of the synagogue walls on the way in', () => {
    const route = walkRoute([[-19, 24.5], [-19, 29], [-18.9, 33.5], [-17.3, 37], [-17.3, 40.5]]);
    route.forEach((stance) => YAWS.forEach((yaw) => PITCHES.forEach((pitch) => checkPose(stance, yaw, pitch))));
    expect(route[route.length - 1].region).toBe('synagogue-podium');
  }, 30000);

  it('lands every vantage on a clear pose', () => {
    for (const vantage of CAPERNAUM.vantages) {
      const stance = capernaumNavigation.stanceAt(vantage.position[0], vantage.position[2], vantage.position[1] - EYE_HEIGHT);
      expect(stance, vantage.id).toBeTruthy();
      const aim = thirdPersonAim(vantage.position, vantage.lookAt);
      checkPose(stance, aim.yaw, aim.pitch);
    }
  });
});
