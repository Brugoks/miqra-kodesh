// How people walk, and how fast, and how far a step goes.
//
// A walk is distance-driven: a person's gait advances by the metres they have
// covered divided by the metres one cycle of the clip covers. Feet therefore
// do not skate IF that number is right. This module is where the number comes
// from, measured off the captured clip itself rather than declared beside it:
// the speed at which a planted foot travels backward under the hips is the
// speed the person has to be moving for that foot to stay where it is put.
//
// And it is where a walk is matched to a pace. A captured walk is one
// person's walk at one speed (Mixamo's "Walking" is a brisk 1.6 m/s); played
// at a village's 1.1 m/s it runs at two thirds time, a slow-motion strut.
// People slow down by taking shorter steps and fewer of them, not by walking
// the same steps slowly, so a variant is made for a pace by scaling the
// captured walk's stride, swing and sway and its tempo together (step length
// grows roughly with speed^0.42, and cadence with speed^0.58), then correcting
// the tempo until the measured pace is the one asked for.
//
// Pure functions of a character, a clip and a request: the crowd's bake
// (sceneInstancedHumans.js) and the near actors (sceneHumans.js) both ask here,
// so the same person walks the same walk at either distance.

import { retargetMotion } from './sceneMixamo.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { routePlan } from './sceneRoutes.js';

// The paces a walk is made for, in metres a second for a person of average
// size. A request is rounded to the nearest, so the crowd needs at most a few
// variants per body, however many walkers there are.
export const PACE_BINS = [0.8, 1.0, 1.2, 1.4, 1.6];

// Which captured walk each kind of walker starts from, and the paces it can
// be made to cover without ceasing to look like itself.
export const WALK_FAMILIES = {
  neutral: { key: 'walk-neutral', min: 0.8, max: 1.6 },
  woman: { key: 'female-walk', min: 0.8, max: 1.2 },
  carry: { key: 'walk-carry', min: 1.0, max: 1.2 },
  elder: { key: 'old-man-walk', fixed: true },
};

const LEG = /^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/;
const ARM = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/;
const TRUNK = /^(Hips|Spine|Spine1|Spine2|Neck|Head)$/;
const TRACK = /^mixamorig:?(.+?)\.(quaternion|position)$/;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// --- measuring ------------------------------------------------------------------

const measured = new WeakMap();

// What a walk clip does on a character, measured by playing it on a copy of
// the body and watching the feet. `scene` is the character's shared scene.
//   metersPerCycle   the distance one cycle covers with the feet planted
//   pace             that over the clip's duration, m/s
//   cadence          steps a minute
//   bob              the hips' vertical travel, m
//   lift             how far the higher foot's ankle rises in a cycle, m
//   skate            how far the planted foot's speed wanders from steady, as
//                    a fraction of the pace: 0 is a foot nailed to the ground
export function measureWalk(THREE, scene, clip) {
  if (!measured.has(clip)) measured.set(clip, new WeakMap());
  const byBody = measured.get(clip);
  if (byBody.has(scene)) return byBody.get(scene);

  const root = cloneSkinnedMesh(scene);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const find = (name) => root.getObjectByName(`mixamorig${name}`) || root.getObjectByName(`mixamorig:${name}`);
  const hips = find('Hips');
  const feet = [find('LeftFoot'), find('RightFoot')];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const frames = Math.max(24, Math.round(clip.duration * 30));
  const dt = clip.duration / frames;
  const point = new THREE.Vector3();
  const hipY = []; const ankleY = [[], []]; const relative = [[], []];
  for (let k = 0; k < frames; k += 1) {
    mixer.setTime(k * dt);
    root.updateMatrixWorld(true);
    hips.getWorldPosition(point);
    const hz = point.z;
    hipY.push(point.y);
    feet.forEach((foot, side) => {
      foot.getWorldPosition(point);
      ankleY[side].push(point.y);
      relative[side].push(point.z - hz);
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);

  // A foot is planted while its ankle stays near its lowest and it is moving
  // backward under the hips. (A swing foot passes low on its way to the ground
  // too, but going the other way, and fast.) The speed of the walk is the speed
  // of the planted foot, taken as a median so one stray frame cannot move it.
  const lift = (side) => Math.max(...ankleY[side]) - Math.min(...ankleY[side]);
  const candidates = [];
  for (let side = 0; side < 2; side += 1) {
    const low = Math.min(...ankleY[side]);
    const near = low + Math.max(0.02, 0.25 * lift(side));
    for (let k = 0; k < frames; k += 1) {
      if (ankleY[side][k] > near) continue;
      const ahead = relative[side][(k + 1) % frames];
      const behind = relative[side][(k + frames - 1) % frames];
      const speed = -(ahead - behind) / (2 * dt);
      if (speed > 0) candidates.push(speed);
    }
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const speeds = candidates.filter((speed) => speed > 0.5 * median);
  const range = (values) => Math.max(...values) - Math.min(...values);
  let pace = 0;
  let skate = 1;
  if (speeds.length >= frames * 0.2) {
    pace = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const rms = Math.sqrt(speeds.reduce((a, b) => a + (b - pace) ** 2, 0) / speeds.length);
    skate = pace > 0 ? rms / pace : 1;
  }
  // A clip with no planted foot to read (a standing sway) is not a walk.
  const result = {
    metersPerCycle: Math.max(0, pace) * clip.duration,
    pace: Math.max(0, pace),
    duration: clip.duration,
    cadence: 120 / clip.duration,
    bob: range(hipY),
    lift: Math.max(lift(0), lift(1)),
    skate,
    planted: speeds.length / (frames * 2),
  };
  byBody.set(scene, result);
  return result;
}

// --- shaping --------------------------------------------------------------------

// The oscillation of a track's values about their mean, scaled by `k`. Rotations
// are scaled along the shortest arc to the mean; vectors by component.
function scaleQuaternions(THREE, values, k) {
  const count = values.length / 4;
  const mean = new THREE.Quaternion(0, 0, 0, 0);
  const q = new THREE.Quaternion();
  const first = new THREE.Quaternion(values[0], values[1], values[2], values[3]);
  for (let i = 0; i < count; i += 1) {
    q.fromArray(values, i * 4);
    if (q.dot(first) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    mean.set(mean.x + q.x, mean.y + q.y, mean.z + q.z, mean.w + q.w);
  }
  mean.normalize();
  const out = new Float32Array(values.length);
  for (let i = 0; i < count; i += 1) {
    q.fromArray(values, i * 4);
    if (q.dot(mean) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    new THREE.Quaternion().copy(mean).slerp(q, k).toArray(out, i * 4);
  }
  return out;
}

function scaleVectors(values, scales) {
  const count = values.length / 3;
  const mean = [0, 0, 0];
  for (let i = 0; i < count; i += 1) for (let a = 0; a < 3; a += 1) mean[a] += values[i * 3 + a] / count;
  const out = new Float32Array(values.length);
  for (let i = 0; i < count; i += 1) for (let a = 0; a < 3; a += 1) out[i * 3 + a] = mean[a] + (values[i * 3 + a] - mean[a]) * scales[a];
  return out;
}

// A walk made smaller, slower or looser: legs scale the stride, arms the swing,
// trunk the pelvis and shoulders' counter-turn, bob the hips' rise and fall,
// and `time` the length of the cycle. Then set back down on the floor, since
// shorter strides on the same legs would otherwise float or sink the feet.
export function shapeWalk(THREE, scene, clip, {
  name = `${clip.name}-shaped`, time = 1, legs = 1, arms = 1, trunk = 1, bob = 1,
} = {}) {
  const tracks = clip.tracks.map((track) => {
    const match = TRACK.exec(track.name);
    const times = Float32Array.from(track.times, (t) => t * time);
    if (!match) return new track.constructor(track.name, times, track.values);
    const [, bone, property] = match;
    let values = track.values;
    if (property === 'quaternion') {
      const k = LEG.test(bone) ? legs : ARM.test(bone) ? arms : TRUNK.test(bone) ? trunk : 1;
      if (k !== 1) values = scaleQuaternions(THREE, values, k);
    } else if (bone === 'Hips') {
      values = scaleVectors(values, [trunk, bob, legs]);
    }
    return new track.constructor(track.name, times, values);
  });
  const shaped = new THREE.AnimationClip(name, clip.duration * time, tracks);
  shaped.userData = { ...clip.userData };
  return groundWalk(THREE, scene, shaped);
}

// Sets the lowest foot of every frame on the floor, by the hips: a walk with
// its stride changed has its feet at other heights than the capture had them.
function groundWalk(THREE, scene, clip) {
  const hipsTrack = clip.tracks.find((track) => /^mixamorig:?Hips\.position$/.test(track.name));
  if (!hipsTrack) return clip;
  const root = cloneSkinnedMesh(scene);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const find = (name) => root.getObjectByName(`mixamorig${name}`) || root.getObjectByName(`mixamorig:${name}`);
  const parts = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(find).filter(Boolean);
  const point = new THREE.Vector3();
  // A foot's own height above the ground at rest is its thickness.
  const thickness = parts.map((bone) => Math.max(0.01, bone.getWorldPosition(point).y));
  const hips = find('Hips');
  const parentScale = new THREE.Vector3().setFromMatrixScale(hips.parent.matrixWorld).y || 1;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const values = Float32Array.from(hipsTrack.values);
  hipsTrack.times.forEach((t, i) => {
    mixer.setTime(Math.min(t, clip.duration - 1e-6));
    root.updateMatrixWorld(true);
    let lift = Infinity;
    parts.forEach((bone, n) => { lift = Math.min(lift, bone.getWorldPosition(point).y - thickness[n]); });
    values[i * 3 + 1] -= lift / parentScale;
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  hipsTrack.values = values;
  return clip;
}

// A captured walk that does not end where it began would, left as it came,
// jump at every wrap — or, as the retargeter does for any loop that is open,
// stand still for a third of a second to close it, which in a walk is a hitch
// every step. The gap is small: spread it over the whole cycle, a little more
// at every frame, so the last frame is the first and no frame moves much.
export function closeLoop(THREE, clip) {
  const q = new THREE.Quaternion(); const first = new THREE.Quaternion(); const last = new THREE.Quaternion();
  const drift = new THREE.Quaternion(); const identity = new THREE.Quaternion();
  const tracks = clip.tracks.map((track) => {
    const n = track.times.length;
    if (n < 3) return track.clone();
    const end = track.times[n - 1];
    const values = Float32Array.from(track.values);
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      first.fromArray(values, 0);
      last.fromArray(values, (n - 1) * 4);
      drift.copy(first).multiply(last.clone().invert());
      for (let i = 0; i < n; i += 1) {
        q.fromArray(values, i * 4);
        new THREE.Quaternion().copy(identity).slerp(drift, track.times[i] / end).multiply(q).toArray(values, i * 4);
      }
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      for (let i = 0; i < n; i += 1) {
        const w = track.times[i] / end;
        for (let a = 0; a < 3; a += 1) values[i * 3 + a] += (values[a] - values[(n - 1) * 3 + a]) * w;
      }
    }
    return new track.constructor(track.name, track.times, values);
  });
  const closed = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  closed.userData = { ...clip.userData };
  return closed;
}

// --- making a walk for a pace -----------------------------------------------------

// Made once per character, per library and per request.
const walks = new WeakMap();

// The walk for a request, on a character, from a captured library: its clip, and
// everything measured about it. Made once per character and request and shared
// by everyone who walks it. Null if the library lacks the clip.
//   request: { family, pace, style }  style is 'easy' or 'spry'
export function makeWalk(THREE, scene, library, request) {
  const id = walkId(request);
  if (!walks.has(scene)) walks.set(scene, new WeakMap());
  if (!walks.get(scene).has(library)) walks.get(scene).set(library, new Map());
  const made = walks.get(scene).get(library);
  if (made.has(id)) return made.get(id);
  const family = WALK_FAMILIES[request.family];
  const captured = family && retargetMotion(THREE, scene, library, family.key, { name: `walk-${family.key}`, seam: 0 });
  if (!captured) { made.set(id, null); return null; }
  const base = closeLoop(THREE, captured);
  const native = measureWalk(THREE, scene, base);
  // Never the library's own cached clip: it is named and annotated below.
  let clip = base.clone();
  let gait = native;
  const ratio = request.pace / native.pace;
  if (!family.fixed && native.pace > 0 && Math.abs(ratio - 1) > 0.06) {
    // Shorter steps and fewer: the stride and the tempo each take their share
    // of the change in pace. A loose walk swings the arms and turns the trunk
    // less; a spry one as the capture does.
    const stride = ratio ** 0.42;
    const tempo = ratio ** 0.58;
    const loose = request.style === 'easy' ? 0.8 : 1;
    const options = { name: id, time: 1 / tempo, legs: stride, arms: Math.min(1.2, stride ** 1.5) * loose, trunk: stride * (request.style === 'easy' ? 0.85 : 1), bob: stride };
    clip = shapeWalk(THREE, scene, base, options);
    gait = measureWalk(THREE, scene, clip);
    // The shaped stride is whatever the legs now cover; bring the tempo to the
    // pace that was asked for, which keeps that stride and moves only the time.
    if (gait.pace > 0 && Math.abs(gait.pace / request.pace - 1) > 0.03) {
      clip = shapeWalk(THREE, scene, base, { ...options, time: (1 / tempo) * (gait.pace / request.pace) });
      gait = measureWalk(THREE, scene, clip);
    }
  }
  clip.name = id;
  const result = { id, clip, ...gait, request };
  clip.userData = { ...clip.userData, gait: result };
  made.set(id, result);
  return result;
}

export const walkId = ({ family, pace, style }) => `walk:${family}:${pace}:${family === 'carry' || family === 'elder' ? 'fixed' : style}`;

// --- who walks which walk ---------------------------------------------------------

// What a person's walk should be: whose walk (a woman's, a carrier's, an
// old man's, or the neutral one), at what pace for someone of their size,
// and how loose. `woman` is whether they are drawn on a woman's body; `seed`
// is their stable identity (sceneHumanAppearance.js), so the same person
// walks the same walk wherever they are seen from.
export function walkRequest(figure, { woman = false, seed = 0, scale = figure?.scale || 1 } = {}) {
  if (!figure?.route) return null;
  const plan = figure.__routePlan || routePlan(figure);
  // A smaller person walks at the same pace in their own steps: a child at
  // 0.6 covers a metre in the strides of a body 0.6 as long.
  const pace = plan.topSpeed / (scale || 1);
  // Read off the figure alone, so a person is the same walker at every distance
  // (a near actor's authored props are not on the figure the crowd draws).
  const carries = figure.activity === 'carrying' || Boolean(figure.carries);
  let family = 'neutral';
  if (figure.gait === 'elder') family = 'elder';
  else if (carries) family = 'carry';
  else if (woman && pace <= 1.3) family = 'woman';
  const { min, max, fixed } = WALK_FAMILIES[family];
  const wanted = fixed ? 0 : PACE_BINS.reduce((best, bin) => (Math.abs(bin - clamp(pace, min, max)) < Math.abs(best - clamp(pace, min, max)) ? bin : best), PACE_BINS[0]);
  return { family, pace: wanted, style: seed % 2 ? 'spry' : 'easy' };
}
