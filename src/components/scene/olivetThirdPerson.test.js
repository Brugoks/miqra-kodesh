import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import buildOlivet from './buildOlivet';
import { floorAt, stanceAt, gardenWallSegments } from './olivetNavigation';
import { FARMSTEAD, GARDEN_OLIVES, PRESS, TOMBS, campTents, groundAt } from './olivetDimensions';
import { sceneModule } from './sceneModules';
import {
  createThirdPersonRig, thirdPersonAim, PIVOT_HEIGHT, FOLLOW_DISTANCE, FOLLOW_MAX,
  FLOOR_CLEARANCE, THIRD_PERSON_NEAR,
} from './sceneThirdPerson';
import { OLIVET } from '../../lib/olivetScene';

describe('the follow camera on the Mount of Olives', () => {
  let built;
  let rig;
  const raycaster = new THREE.Raycaster();
  const anchor = new THREE.Vector3();
  const direction = new THREE.Vector3();

  beforeAll(() => {
    built = buildOlivet(THREE, { quality: 'low', motionLibrary: null });
    rig = createThirdPersonRig(THREE, { colliders: built.cameraColliders, floorAt });
  });
  afterAll(() => built?.dispose());

  function checkPose(stance, yaw, pitch, distance = FOLLOW_DISTANCE) {
    const frame = {
      x: stance.x, y: stance.height + PIVOT_HEIGHT, z: stance.z,
      walkerFloor: stance.height, yaw, pitch, distance,
      fov: 60, aspect: 16 / 10, near: THIRD_PERSON_NEAR,
    };
    const camera = rig.settle(frame);
    const where = `${stance.x.toFixed(1)}, ${stance.z.toFixed(1)} / ${yaw.toFixed(2)}, ${pitch}`;
    expect(camera.toArray().every(Number.isFinite), where).toBe(true);
    const floor = floorAt(camera.x, camera.z);
    expect(camera.y, where).toBeGreaterThanOrEqual((floor?.height ?? stance.height) + FLOOR_CLEARANCE - 1e-6);
    anchor.set(frame.x, frame.y, frame.z);
    const reach = direction.subVectors(camera, anchor).length();
    if (reach > 1e-4) {
      raycaster.set(anchor, direction.multiplyScalar(1 / reach));
      raycaster.far = reach - 1e-4;
      expect(raycaster.intersectObjects(built.cameraColliders, false), `obstructed camera: ${where}`).toHaveLength(0);
    }
    return reach;
  }

  it('offers the same default view and controls as Capernaum', () => {
    const modules = sceneModule(OLIVET.slug);
    expect(modules.thirdPerson).toBe(true);
    expect(modules.defaultView).toBe(sceneModule('capernaum').defaultView);
  });

  it('lands every place and event above the hillside with a clear line to the visitor', () => {
    for (const place of [...OLIVET.vantages, ...OLIVET.events]) {
      const [x, eye, z] = place.position;
      const stance = stanceAt(x, z, eye - 1.7);
      expect(stance, place.id).toBeTruthy();
      const { yaw, pitch } = thirdPersonAim(place.position, place.lookAt);
      checkPose(stance, yaw, pitch);
      checkPose(stance, yaw, pitch, FOLLOW_MAX);
    }
  });

  it('pulls in around walls, tombs, tents, the press and old olive trunks while orbiting', () => {
    const [ax, az, bx, bz] = gardenWallSegments()[0];
    const [treeX, treeZ] = GARDEN_OLIVES[0];
    const tent = campTents()[0];
    const spots = [
      [(ax + bx) / 2, (az + bz) / 2 - 1.2],
      [FARMSTEAD.x0 - 1.2, FARMSTEAD.z0 + 2],
      [TOMBS.absalom.x - TOMBS.absalom.half - 1.2, TOMBS.absalom.z],
      [PRESS.x, PRESS.z + 2],
      [treeX - 2, treeZ],
      [tent.x + Math.cos(tent.facing) * (tent.width / 2 + 1.2), tent.z - Math.sin(tent.facing) * (tent.width / 2 + 1.2)],
    ];
    for (const [x, z] of spots) {
      const stance = stanceAt(x, z, floorAt(x, z)?.height ?? groundAt(x, z));
      expect(stance, `${x}, ${z}`).toBeTruthy();
      let closest = Infinity;
      for (let i = 0; i < 16; i += 1) {
        for (const pitch of [-0.7, -0.25, 0.3]) {
          closest = Math.min(closest, checkPose(stance, i * Math.PI / 8, pitch));
        }
      }
      expect(closest, `camera never pulls in at ${x}, ${z}`).toBeLessThan(FOLLOW_DISTANCE - 0.3);
    }
  });
});
