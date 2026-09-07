import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHumanClips, __internal } from './sceneHumanClips';
import { BIND_POSES } from './humanBindPoseFixtures';

// Builds a real THREE.Bone hierarchy from the fixture bind-pose data — the
// same shape GLTFLoader would hand back for these characters' skeletons,
// minus the mesh geometry sceneHumanClips.js never looks at. Bone `.name` is
// sanitized exactly as GLTFLoader's `createUniqueName` does on load (it
// strips `[ ] . : /`, since a track-name string uses those as syntax) — a
// real loaded `mixamorig:Hips` bone is actually named `mixamorigHips` at
// runtime, and sceneHumanClips.js has to look it up as such. This dictionary
// stays keyed by the readable, colon-bearing fixture name for legibility;
// only the bone objects' own `.name` is the sanitized one.
function buildSkeleton(character) {
  const bindData = BIND_POSES[character];
  const bones = {};
  for (const name of Object.keys(bindData)) {
    const bone = new THREE.Bone();
    bone.name = THREE.PropertyBinding.sanitizeNodeName(name);
    bone.position.fromArray(bindData[name].t);
    bone.quaternion.fromArray(bindData[name].r);
    bones[name] = bone;
  }
  const humanRig = new THREE.Group();
  humanRig.name = 'HumanRig';
  for (const name of Object.keys(bindData)) {
    const parentName = bindData[name].parent;
    if (parentName === 'HumanRig') humanRig.add(bones[name]);
    else if (bones[parentName]) bones[parentName].add(bones[name]);
  }
  const sceneRoot = new THREE.Group();
  sceneRoot.name = 'Scene';
  sceneRoot.add(humanRig);
  sceneRoot.updateMatrixWorld(true);
  return { sceneRoot, bones };
}

// Plays a built clip through a real AnimationMixer to an absolute time and
// updates world matrices — the same playback path the actual scene uses, not
// a hand-rolled re-implementation of the forward kinematics being tested.
function sampleAt(sceneRoot, clip, time) {
  const mixer = new THREE.AnimationMixer(sceneRoot);
  mixer.clipAction(clip).play();
  mixer.update(time);
  sceneRoot.updateMatrixWorld(true);
}

function worldPos(bone) {
  const v = new THREE.Vector3();
  bone.getWorldPosition(v);
  return v;
}

function boneDir(fromBone, toBone) {
  return worldPos(toBone).sub(worldPos(fromBone)).normalize();
}

function degFromDown(dir) {
  return (Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)) * 180) / Math.PI;
}

const CHARACTERS = ['artisan', 'villager'];

describe('buildHumanClips', () => {
  for (const character of CHARACTERS) {
    describe(character, () => {
      it('builds every semantic clip with finite, unit quaternions', () => {
        const { sceneRoot } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        const expected = ['idle', 'walk', 'work', 'talk', 'listen', 'carry', 'sit', 'kneel', 'prayer'];
        for (const name of expected) expect(clips[name]).toBeDefined();
        for (const clip of Object.values(clips)) {
          for (const track of clip.tracks) {
            if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
            for (let i = 0; i < track.values.length; i += 4) {
              const q = new THREE.Quaternion().fromArray(track.values, i);
              for (const component of [q.x, q.y, q.z, q.w]) expect(Number.isFinite(component)).toBe(true);
              expect(q.length()).toBeCloseTo(1, 4);
            }
          }
        }
        // Every clip, every track, every keyframe — many thousands of
        // individual assertions. Comfortably fast in isolation, but the
        // heaviest single test in this file, so it gets a wider berth than
        // vitest's 5s default under a loaded machine.
      }, 20000);

      it('hangs the forearm within 30 degrees of vertical at rest — idle, walk and listen', () => {
        // The defect this fixes: every baked clip put the forearm 50-70
        // degrees off vertical (idle 50.6, walk 51.8) because the authoring
        // script rotated it in world axes with no regard for the elbow.
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        for (const name of ['idle', 'listen']) {
          sampleAt(sceneRoot, clips[name], clips[name].duration * 0.3);
          for (const side of ['Left', 'Right']) {
            const dir = boneDir(bones[`mixamorig:${side}ForeArm`], bones[`mixamorig:${side}Hand`]);
            expect(degFromDown(dir)).toBeLessThan(30);
          }
        }
        // Walk: sample mid-stride, where the arm swing is near its rest point.
        sampleAt(sceneRoot, clips.walk, 0.0);
        for (const side of ['Left', 'Right']) {
          const dir = boneDir(bones[`mixamorig:${side}ForeArm`], bones[`mixamorig:${side}Hand`]);
          expect(degFromDown(dir)).toBeLessThan(30);
        }
      });

      it('does not skate: ankle fore-aft excursion matches half the manifest stride', () => {
        // The defect: the baked clip's ankle travelled 0.31m against a
        // manifest stride of 1.15m — roughly half of every metre walked was
        // the feet sliding across the ground.
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i <= 40; i += 1) {
          sampleAt(sceneRoot, clips.walk, (i / 40) * clips.walk.duration);
          const pos = worldPos(bones['mixamorig:LeftFoot']);
          minZ = Math.min(minZ, pos.z);
          maxZ = Math.max(maxZ, pos.z);
        }
        const excursion = maxZ - minZ;
        // 1.30m manifest stride (sceneHumanManifest.js) => 0.65m per step.
        // Shorter characters cover proportionally less; both are well clear
        // of the 0.31m the baked clip actually produced.
        expect(excursion).toBeGreaterThan(0.4);
        expect(excursion).toBeLessThan(0.9);
      });

      it('lifts the swing foot off the ground — the baked clip cleared only 3.6cm', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i <= 40; i += 1) {
          sampleAt(sceneRoot, clips.walk, (i / 40) * clips.walk.duration);
          const pos = worldPos(bones['mixamorig:LeftFoot']);
          minY = Math.min(minY, pos.y);
          maxY = Math.max(maxY, pos.y);
        }
        expect(maxY - minY).toBeGreaterThan(0.06);
      });

      it('rises and falls twice per stride, 3-6cm peak-to-peak', () => {
        // The defect: the baked clip's hips do not move vertically at all.
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        // Drop the last sample (p=1) — for a period-1 signal it duplicates
        // the first (p=0), which would otherwise make the wraparound minimum
        // look like two separate boundary points instead of the one it is.
        const ys = [];
        for (let i = 0; i < 60; i += 1) {
          sampleAt(sceneRoot, clips.walk, (i / 60) * clips.walk.duration);
          ys.push(worldPos(bones['mixamorig:Hips']).y);
        }
        const range = Math.max(...ys) - Math.min(...ys);
        expect(range).toBeGreaterThan(0.03);
        expect(range).toBeLessThan(0.06);
        // Two minima (both heel strikes), not one — a single sine would put
        // only one leg's heel strike at the low point. Circular: the signal
        // loops, so the sample before index 0 is the last sample, not
        // nothing.
        const n = ys.length;
        let minimaCount = 0;
        for (let i = 0; i < n; i += 1) {
          const prev = ys[(i - 1 + n) % n];
          const next = ys[(i + 1) % n];
          if (ys[i] < prev && ys[i] < next) minimaCount += 1;
        }
        expect(minimaCount).toBeGreaterThanOrEqual(2);
      });

      it('is left-right symmetric, offset by half a stride', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        for (const p of [0, 0.2, 0.4, 0.6, 0.8]) {
          sampleAt(sceneRoot, clips.walk, p * clips.walk.duration);
          const leftKnee = degFromDown(boneDir(bones['mixamorig:LeftUpLeg'], bones['mixamorig:LeftLeg']));
          const leftKneeZ = worldPos(bones['mixamorig:LeftFoot']).z;

          sampleAt(sceneRoot, clips.walk, ((p + 0.5) % 1) * clips.walk.duration);
          const rightKnee = degFromDown(boneDir(bones['mixamorig:RightUpLeg'], bones['mixamorig:RightLeg']));
          const rightKneeZ = worldPos(bones['mixamorig:RightFoot']).z;

          expect(Math.abs(leftKnee - rightKnee)).toBeLessThan(1);
          expect(Math.abs(leftKneeZ - rightKneeZ)).toBeLessThan(0.02);
        }
      });

      it('swings the arms opposite the ipsilateral leg, 12-25 degrees', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        const angles = [];
        for (let i = 0; i <= 30; i += 1) {
          sampleAt(sceneRoot, clips.walk, (i / 30) * clips.walk.duration);
          const armDir = boneDir(bones['mixamorig:LeftArm'], bones['mixamorig:LeftForeArm']);
          angles.push(Math.atan2(armDir.z, -armDir.y));
        }
        const amplitude = (Math.max(...angles) - Math.min(...angles)) * (180 / Math.PI) / 2;
        expect(amplitude).toBeGreaterThan(12);
        expect(amplitude).toBeLessThan(25);
      });

      it('hip flexion reaches 18-26 degrees forward and 8-16 back', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        const angles = [];
        for (let i = 0; i <= 40; i += 1) {
          sampleAt(sceneRoot, clips.walk, (i / 40) * clips.walk.duration);
          const dir = boneDir(bones['mixamorig:LeftUpLeg'], bones['mixamorig:LeftLeg']);
          const signed = Math.atan2(dir.z, -dir.y) * (180 / Math.PI);
          angles.push(signed);
        }
        expect(Math.max(...angles)).toBeGreaterThan(18);
        expect(Math.max(...angles)).toBeLessThan(26);
        expect(Math.min(...angles)).toBeLessThan(-8);
        expect(Math.min(...angles)).toBeGreaterThan(-16);
      });

      it('idle is not a photograph: at least one joint moves more than 2 degrees over the loop', () => {
        // The defect: the baked idle clip moves the arms by 0.2 degrees and
        // the head by 1.7mm over its whole 4-second loop.
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        const angles = [];
        for (let i = 0; i <= 20; i += 1) {
          sampleAt(sceneRoot, clips.idle, (i / 20) * clips.idle.duration);
          const dir = boneDir(bones['mixamorig:LeftArm'], bones['mixamorig:LeftForeArm']);
          angles.push(degFromDown(dir));
        }
        expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(2);
      });

      it('sits with the thigh raised and the shin back down toward the floor', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        sampleAt(sceneRoot, clips.sit, clips.sit.duration * 0.4);
        const thighDeg = degFromDown(boneDir(bones['mixamorig:LeftUpLeg'], bones['mixamorig:LeftLeg']));
        const shinDeg = degFromDown(boneDir(bones['mixamorig:LeftLeg'], bones['mixamorig:LeftFoot']));
        expect(thighDeg).toBeGreaterThan(70); // raised close to horizontal
        expect(shinDeg).toBeLessThan(30); // shin hangs back down
      });

      it('lifts the arms open in prayer rather than folding them', () => {
        const { sceneRoot, bones } = buildSkeleton(character);
        const clips = buildHumanClips(THREE, sceneRoot);
        sampleAt(sceneRoot, clips.prayer, clips.prayer.duration * 0.3);
        const dir = boneDir(bones['mixamorig:LeftArm'], bones['mixamorig:LeftForeArm']);
        // Raised well above hanging straight down, not folded at the waist.
        expect(degFromDown(dir)).toBeGreaterThan(60);
      });
    });
  }

  it('produces the same absolute result on two different bind poses (within 1 degree)', () => {
    // The guard against re-introducing the defect this module exists to fix:
    // a LOCAL delta would give a different absolute result per character,
    // since the artisan's hips sit 9 degrees off true in bind and the
    // villager's do not. The bind poses genuinely differ (confirmed by the
    // fixture data itself); the resulting arm angle must not.
    const a = buildSkeleton('artisan');
    const v = buildSkeleton('villager');
    const clipsA = buildHumanClips(THREE, a.sceneRoot);
    const clipsV = buildHumanClips(THREE, v.sceneRoot);
    sampleAt(a.sceneRoot, clipsA.idle, 0.5);
    sampleAt(v.sceneRoot, clipsV.idle, 0.5);
    const degA = degFromDown(boneDir(a.bones['mixamorig:LeftArm'], a.bones['mixamorig:LeftForeArm']));
    const degV = degFromDown(boneDir(v.bones['mixamorig:LeftArm'], v.bones['mixamorig:LeftForeArm']));
    expect(Math.abs(degA - degV)).toBeLessThan(1);
  });

  it('falls back to an empty clip set on a rig missing the bones it needs', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    root.add(hips);
    expect(buildHumanClips(THREE, root)).toEqual({});
  });
});

describe('aimAbsolute twist continuity', () => {
  // The bug this guards against: a bone's own bind-local aim direction to
  // its next child is exactly (0, 1, 0) for every leg and forearm bone in
  // this rig (a bone always points straight at its own child before any
  // rotation), and a resting `flexDeg = 0` target is exactly (0, -1, 0) —
  // precisely antiparallel. THREE.Quaternion.setFromUnitVectors has no
  // defined rotation axis for that case and falls back to an arbitrary
  // 180-degree twist, which a position-only check (every other test in this
  // file) cannot see at all: a bone twisted about its own long axis has its
  // CHILD in exactly the same place, so the twist is invisible to any test
  // that only measures where things end up, and visible only on the actual
  // skinned mesh, which corkscrews. It happened for every standing figure's
  // legs continuously, not as some rare edge case — most poses (idle, talk,
  // listen, carry, work, prayer) leave the legs untouched, which defaults
  // `thighFlex`/`shinFlex` to exactly 0.
  for (const character of CHARACTERS) {
    it(`${character}: does not jump when a leg's flex angle crosses zero`, () => {
      const { sceneRoot } = buildSkeleton(character);
      const bones = __internal.findBones(THREE, sceneRoot);
      const quatAt = (thighFlex) => {
        const { quaternions } = __internal.poseFrame(THREE, bones, {
          leftLeg: { thighFlex, shinFlex: thighFlex },
        });
        return quaternions.get(bones.leftUpLeg).clone();
      };
      const at = [-2, -1, -0.001, 0, 0.001, 1, 2].map(quatAt);
      for (let i = 1; i < at.length; i += 1) {
        // The angle BETWEEN consecutive samples' quaternions should be tiny
        // (a smooth function of a 1-degree-or-less change in input) — the
        // degenerate case instead puts a ~180-degree jump right at zero.
        const angleBetween = 2 * Math.acos(Math.min(1, Math.abs(at[i - 1].dot(at[i]))));
        expect(angleBetween).toBeLessThan(0.1);
      }
    });

    it(`${character}: does not jump when a forearm's flex angle crosses zero`, () => {
      const { sceneRoot } = buildSkeleton(character);
      const bones = __internal.findBones(THREE, sceneRoot);
      const quatAt = (foreArmFlex) => {
        const { quaternions } = __internal.poseFrame(THREE, bones, {
          left: { armFlex: 10, foreArmFlex },
        });
        return quaternions.get(bones.leftForeArm).clone();
      };
      const at = [-2, -1, -0.001, 0, 0.001, 1, 2].map(quatAt);
      for (let i = 1; i < at.length; i += 1) {
        const angleBetween = 2 * Math.acos(Math.min(1, Math.abs(at[i - 1].dot(at[i]))));
        expect(angleBetween).toBeLessThan(0.1);
      }
    });
  }
});

describe('__internal.bump', () => {
  it('is periodic and zero outside its window', () => {
    expect(__internal.bump(0.5, 0.5, 0.1)).toBeCloseTo(1, 5);
    expect(__internal.bump(0.5, 0.9, 0.05)).toBe(0);
    // Wraps across the 0/1 seam.
    expect(__internal.bump(0.99, 0.0, 0.1)).toBeGreaterThan(0);
  });
});
