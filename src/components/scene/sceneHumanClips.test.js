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
          angles.push(Math.atan2(dir.z, -dir.y) * 180 / Math.PI);
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

// A geometrically real (if idealised) hand: knuckles spread along +X, fingers
// aiming +Y, thumb standing off toward +Z. That makes the palm +Z, so the
// axes sceneHumanClips.js measures for itself are known here in advance and
// the assertions below can be about where the fingertips actually GO. A hand
// of bones all sitting at the origin — which is what this test used to build
// — has no derivable frame at all, and so proves nothing about curl.
function buildHand() {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  root.add(hips);
  const digits = {};
  for (const side of ['Left', 'Right']) {
    const hand = new THREE.Bone();
    hand.name = `mixamorig${side}Hand`;
    hand.position.set(0, 0, 0);
    root.add(hand);
    const spread = { Index: -0.03, Middle: -0.01, Ring: 0.01, Pinky: 0.03 };
    for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
      let parent = hand;
      for (let joint = 1; joint <= 3; joint += 1) {
        const bone = new THREE.Bone();
        bone.name = `mixamorig${side}Hand${finger}${joint}`;
        bone.position.set(joint === 1 ? spread[finger] : 0, joint === 1 ? 0.09 : 0.03, 0);
        parent.add(bone);
        digits[bone.name] = bone;
        parent = bone;
      }
    }
    let parent = hand;
    for (let joint = 1; joint <= 3; joint += 1) {
      const bone = new THREE.Bone();
      bone.name = `mixamorig${side}HandThumb${joint}`;
      // Standing off the knuckle plane on the palm side, which is the only
      // evidence in a rig for which side of the hand the palm is.
      bone.position.set(joint === 1 ? -0.03 : 0, joint === 1 ? 0.03 : 0.03, joint === 1 ? 0.025 : 0.008);
      parent.add(bone);
      digits[bone.name] = bone;
      parent = bone;
    }
  }
  root.updateMatrixWorld(true);
  return { root, digits };
}

describe('finger and thumb kinematics', () => {
  // Poses the hand by writing the solved local rotations onto the bones, the
  // same thing an AnimationMixer does with the baked tracks.
  function pose(root, fingerCurl) {
    const bones = __internal.findBones(THREE, root);
    const { quaternions } = __internal.poseFrame(THREE, bones, { fingerCurl });
    for (const [bone, quaternion] of quaternions) bone.quaternion.copy(quaternion);
    root.updateMatrixWorld(true);
    return { bones, quaternions };
  }

  // In the HAND's own frame, which is where a hand pose is legible: +Z is the
  // palm, +X runs from the index knuckle toward the pinky, +Y up the fingers.
  // Measured in world space instead, the wrist's own aim (poseFrame orients
  // the hand bone too) swamps everything the fingers do.
  const inHand = (root, side, name) => {
    const hand = root.getObjectByName(`mixamorig${side}Hand`);
    return hand.worldToLocal(worldPos(root.getObjectByName(name)));
  };

  it('curls every finger toward the palm rather than sideways or backwards', () => {
    const bindHand = buildHand();
    const posed = buildHand();
    pose(posed.root, 18);

    for (const side of ['Left', 'Right']) {
      for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
        const name = `mixamorig${side}Hand${finger}3`;
        const moved = inHand(posed.root, side, name).sub(inHand(bindHand.root, side, name));
        expect(moved.z).toBeGreaterThan(0.008);
        // Sideways drift small next to the curl: fingers close, they do not fan.
        expect(Math.abs(moved.x)).toBeLessThan(moved.z * 0.5);
        // And the tip draws back toward the knuckle rather than reaching out.
        expect(moved.y).toBeLessThan(0);
      }
    }
  });

  it('cascades the curl across the fingers and concentrates it in the middle joint', () => {
    const { root } = buildHand();
    const { bones, quaternions } = pose(root, 18);
    const turn = (finger, joint) => {
      const entry = bones.fingers.find((f) => f.side === 'Left' && f.finger === finger && f.joint === joint);
      return quaternions.get(entry.bone).angleTo(new THREE.Quaternion());
    };
    // The middle joint carries most of a relaxed hand's curl — an evenly
    // curled finger is the flat, board-like hand this replaced.
    expect(turn('Middle', 2)).toBeGreaterThan(turn('Middle', 1));
    expect(turn('Middle', 1)).toBeGreaterThan(turn('Middle', 3));
    // Pinky curls furthest, index least.
    expect(turn('Pinky', 2)).toBeGreaterThan(turn('Ring', 2));
    expect(turn('Ring', 2)).toBeGreaterThan(turn('Middle', 2));
    expect(turn('Middle', 2)).toBeGreaterThan(turn('Index', 2));
  });

  it('opposes the thumb across the palm and closes the grip as the curl rises', () => {
    const bindThumb = inHand(buildHand().root, 'Left', 'mixamorigLeftHandThumb3');
    const reach = (curl) => {
      const fresh = buildHand();
      pose(fresh.root, curl);
      return {
        thumb: inHand(fresh.root, 'Left', 'mixamorigLeftHandThumb3'),
        pinch: worldPos(fresh.digits.mixamorigLeftHandThumb3)
          .distanceTo(worldPos(fresh.digits.mixamorigLeftHandIndex3)),
      };
    };
    const open = reach(8);
    const relaxed = reach(18);
    const grip = reach(64);

    // Opposition travels across the palm (+X, toward the pinky) and into it.
    expect(relaxed.thumb.x).toBeGreaterThan(bindThumb.x + 0.004);
    expect(grip.thumb.x).toBeGreaterThan(relaxed.thumb.x);
    // And the hand actually closes.
    expect(relaxed.pinch).toBeLessThan(open.pinch);
    expect(grip.pinch).toBeLessThan(relaxed.pinch);
  });

  it('keeps the joints past the knuckle pure hinges and folds the splay away in a grip', () => {
    const { root } = buildHand();
    const bones = __internal.findBones(THREE, root);
    for (const entry of bones.fingers) {
      expect(entry.hinge).toBeDefined();
      // Only the knuckle abducts; a yawing middle or tip joint is half of
      // what made a curled hand read as broken.
      if (entry.joint === 1) expect(entry.spread).toBeDefined();
    }
    const splayAt = (curl) => {
      const fresh = buildHand();
      pose(fresh.root, curl);
      return worldPos(fresh.digits.mixamorigLeftHandIndex3)
        .distanceTo(worldPos(fresh.digits.mixamorigLeftHandPinky3));
    };
    // Fingers converge onto a grip instead of staying fanned.
    expect(splayAt(64)).toBeLessThan(splayAt(8));
  });

  it('reads the palm side from the thumb, and from the body midline without one', () => {
    const withThumb = __internal.findBones(THREE, buildHand().root);
    const stripped = buildHand();
    for (const side of ['Left', 'Right']) {
      for (let joint = 1; joint <= 3; joint += 1) {
        const bone = stripped.digits[`mixamorig${side}HandThumb${joint}`];
        bone.parent.remove(bone);
      }
    }
    stripped.root.updateMatrixWorld(true);
    const withoutThumb = __internal.findBones(THREE, stripped.root);
    const axis = (bones) => bones.fingers.find((f) => f.side === 'Left' && f.finger === 'Middle' && f.joint === 1).hinge;
    expect(withoutThumb.thumbs).toHaveLength(0);
    expect(axis(withoutThumb).angleTo(axis(withThumb))).toBeLessThan(0.001);
  });
});
