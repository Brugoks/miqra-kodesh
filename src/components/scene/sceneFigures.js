// The people in the scenes.
//
// Until this existed, everyone in every scene was a cone with a sphere balanced
// on top, scattered at uniform random across the available floor. That reads
// exactly as what it is — traffic cones — and it is the single most obviously
// wrong thing in the frame, because a human being is the one object in these
// reconstructions that every visitor is an expert on.
//
// Two changes do most of the work, and neither is about polygon count:
//
//   A figure has limbs, and the limbs move. A robe, a head, a headcloth and
//   two arms on a pivot is still only five primitives, but the arms are what
//   turn a silhouette into a posture — and posture is what says whether
//   someone is praying, carrying something, arguing, or waiting.
//
//   People stand in groups. Uniform random scatter is the giveaway: real
//   crowds are lumpy, they face each other, and they leave the middle of a
//   thoroughfare clear. `gather()` below is a bigger improvement than anything
//   done to the geometry.
//
// Everything is instanced — one InstancedMesh per body part, not per person —
// so a hundred and ten pilgrims cost five draw calls. Poses are computed into a
// single reusable rig of Object3Ds and read out as world matrices, which means
// the joint maths is three's rather than mine.
//
// three.js is passed in, as everywhere else in this directory, so the module
// stays importable in jsdom.

import { routePlan, sampleRoute } from './sceneRoutes';

// Kept in sync with sceneHumanManifest.js's locomotion.walkMetersPerCycle, so
// a figure that swaps between this instanced fallback and the skeletal GLB
// actor (sceneHumans.js) does not visibly change cadence when it does.
const WALK_METERS_PER_CYCLE = 1.3;

// --- proportions ----------------------------------------------------------

// A first-century adult, which is shorter than a modern one: skeletal remains
// from the period put the average man around 1.65m. The visitor's own eye is at
// 1.7, so a crowd built to modern heights would very slightly look down on them
// — a detail nobody could name but everybody would feel.
export const FIGURE = {
  height: 1.66,
  robeHeight: 1.28,
  robeBase: 0.02,
  robeTop: 0.17,
  robeHem: 0.29,
  shoulderY: 1.26,
  shoulderX: 0.19,
  headY: 0.2,
  headRadius: 0.107,
  clothY: 0.225,
  clothRadius: 0.126,
  armLength: 0.55,
  armRadius: 0.043,
};

// Undyed wool and linen, with the occasional madder or indigo among them.
// Bright dyes were expensive, so most of a crowd is the colour the sheep were.
export const ROBE_PALETTE = [
  0xe6ddc9, 0xd8cdb4, 0xc4b79a, 0xa8967d, 0x9c8b74, 0xb6a68c, 0x8d7f6c, 0xd9cdb6,
  0xbfae91, 0x7d6f5e,
];

// A handful of colours nobody could have afforded much of, used sparingly.
export const ROBE_ACCENTS = [0x8a4b3c, 0x4a5c74, 0x6b5340];

export const SKIN = 0x9c7c5f;
export const HEADCLOTH = 0xe8e1d2;

// --- what people are doing ------------------------------------------------
//
// Each activity is a function of time and the figure's own phase, returning a
// pose. Keeping them as pure functions of (t, phase) is what lets a hundred
// people share five geometries and still not move as one.
//
//   lean    — forward tilt at the hips, radians
//   sway    — rotation about the vertical, radians, added to the facing
//   rise    — vertical offset, for sitting and kneeling
//   crouch  — vertical scale on the body, for the same
//   armL/R  — { swing, raise }: swing is forward and back, raise is outward
//             from the body. Both are radians from hanging straight down.

const IDLE_ARM = { swing: 0, raise: 0.06 };

export const ACTIVITIES = {
  // Waiting. Almost still, but never quite: weight shifts, and the head turns.
  standing: (t, phase) => ({
    lean: Math.sin(t * 0.5 + phase) * 0.012,
    sway: Math.sin(t * 0.31 + phase * 1.7) * 0.09,
    armL: { swing: Math.sin(t * 0.4 + phase) * 0.05, raise: 0.07 },
    armR: { swing: Math.sin(t * 0.37 + phase * 2) * 0.05, raise: 0.07 },
  }),

  // In conversation. One arm does most of the talking, in bursts rather than
  // continuously, because a gesture that never stops is a windmill.
  talking: (t, phase) => {
    const burst = Math.max(0, Math.sin(t * 0.7 + phase * 3));
    return {
      lean: 0.03 + Math.sin(t * 0.6 + phase) * 0.02,
      sway: Math.sin(t * 0.45 + phase) * 0.13,
      armL: { swing: -0.15 * burst, raise: 0.1 + 0.32 * burst },
      armR: { swing: Math.sin(t * 0.5 + phase) * 0.06, raise: 0.08 },
    };
  },

  // Listening to whoever is talking. Still, slightly inclined toward them.
  attending: (t, phase) => ({
    lean: 0.05 + Math.sin(t * 0.4 + phase) * 0.012,
    sway: Math.sin(t * 0.22 + phase) * 0.05,
    armL: IDLE_ARM,
    armR: IDLE_ARM,
  }),

  // Standing prayer: hands lifted, palms out, which is how Jews prayed and how
  // Paul tells Timothy men should — not the folded hands of later Christian
  // art. 1 Timothy 2:8.
  praying: (t, phase) => ({
    lean: -0.04 + Math.sin(t * 0.33 + phase) * 0.015,
    sway: Math.sin(t * 0.2 + phase) * 0.03,
    armL: { swing: -1.15 + Math.sin(t * 0.5 + phase) * 0.04, raise: 0.5 },
    armR: { swing: -1.15 + Math.sin(t * 0.47 + phase * 1.3) * 0.04, raise: 0.5 },
  }),

  // Bowed, or prostrate at the moment of the offering.
  bowing: (t, phase) => ({
    lean: 0.75 + Math.sin(t * 0.4 + phase) * 0.03,
    sway: 0,
    armL: { swing: 0.5, raise: 0.14 },
    armR: { swing: 0.5, raise: 0.14 },
  }),

  // Sitting — on a step, a wall, the ground. The robe shortens rather than the
  // legs bending, which is all the resolution this needs.
  sitting: (t, phase) => ({
    lean: 0.12 + Math.sin(t * 0.35 + phase) * 0.02,
    sway: Math.sin(t * 0.25 + phase) * 0.06,
    // `crouch` is what lowers a seated figure — it scales the whole body
    // about the feet — so `rise` only has to settle the robe onto the ground
    // it is pooling on. Applying both at full strength buries the head at
    // half a metre, which is not sitting, it is lying down.
    rise: -0.05,
    crouch: 0.66,
    armL: { swing: 0.42, raise: 0.16 },
    armR: { swing: 0.38, raise: 0.16 },
  }),

  // Carrying something on the hip or the shoulder: one arm up and bent, and a
  // lean away from the load to balance it.
  carrying: (t, phase) => ({
    lean: 0.05,
    sway: 0.16 + Math.sin(t * 0.4 + phase) * 0.03,
    armL: { swing: -0.5, raise: 0.62 },
    armR: { swing: 0.1, raise: 0.05 },
  }),

  // Bent over work — mending a net, sorting fish, washing.
  working: (t, phase) => ({
    lean: 0.62 + Math.sin(t * 1.4 + phase) * 0.07,
    sway: Math.sin(t * 0.7 + phase) * 0.06,
    rise: -0.04,
    crouch: 0.92,
    armL: { swing: 0.85 + Math.sin(t * 1.5 + phase) * 0.18, raise: 0.2 },
    armR: { swing: 0.85 + Math.sin(t * 1.5 + phase + 1.1) * 0.18, raise: 0.2 },
  }),

  // Kneeling, low.
  kneeling: (t, phase) => ({
    lean: 0.28 + Math.sin(t * 0.4 + phase) * 0.02,
    sway: 0,
    // Taller than sitting: kneeling upright puts the head about a head and a
    // half higher than sitting on the ground does.
    rise: -0.02,
    crouch: 0.78,
    armL: { swing: 0.3, raise: 0.12 },
    armR: { swing: 0.3, raise: 0.12 },
  }),

  // On the move. The arms swing against the legs; `cadence` is supplied by the
  // caller from distance travelled so the swing matches the speed.
  walking: (t, phase, cadence = 0) => ({
    lean: 0.06,
    sway: Math.sin(cadence) * 0.05,
    // The bob is what actually reads as walking at any distance.
    rise: Math.abs(Math.sin(cadence)) * 0.035,
    armL: { swing: Math.sin(cadence) * 0.55, raise: 0.09 },
    armR: { swing: -Math.sin(cadence) * 0.55, raise: 0.09 },
  }),
};

export const ACTIVITY_NAMES = Object.keys(ACTIVITIES);

export function poseFor(activity, t, phase, cadence) {
  const fn = ACTIVITIES[activity] || ACTIVITIES.standing;
  const pose = fn(t, phase, cadence);
  return {
    lean: pose.lean || 0,
    sway: pose.sway || 0,
    rise: pose.rise || 0,
    crouch: pose.crouch === undefined ? 1 : pose.crouch,
    armL: pose.armL || IDLE_ARM,
    armR: pose.armR || IDLE_ARM,
  };
}

// --- placing people -------------------------------------------------------

// A knot of people standing together and facing roughly inward, which is what
// a crowd actually looks like and what a uniform scatter never does. Returns
// bare placements; the caller decides what each of them is doing.
//
// Left at its old defaults this is unchanged — no `clearAt`, no `floorAt`, no
// `minSeparation` — which is deliberate: those are opt-in so the three
// scenes that already call `gather()` without them keep their exact existing
// behaviour, and the new personal-space enforcement lands only where a caller
// asks for it. See docs/scene-humans-motion-and-crowding-plan.md §6.2 — this
// is what made the Capernaum haunts a 13-person huddle with a 0.08m closest
// pair, and it took three separate bugs (uneven distribution, no separation,
// everyone facing dead centre) to get there.
export function gather(random, centre, count, options = {}) {
  const {
    radius = 1.5,
    y = 0,
    spread = 0.55,
    clearAt = null,
    floorAt = null,
    minSeparation = 0,
    faceAt = null,
  } = options;
  const centreFloor = floorAt ? floorAt(centre[0], centre[1]) : null;
  const centreHeight = typeof centreFloor === 'number' ? centreFloor : centreFloor?.height ?? centreFloor?.y;
  const placements = [];
  let guard = 0;
  while (placements.length < count && guard < count * 40) {
    guard += 1;
    const i = placements.length;
    // Nobody stands exactly on the circle and nobody stands exactly facing
    // the middle, or the group reads as a committee photograph.
    const around = (i / count) * Math.PI * 2 + random() * spread;
    const distance = radius * (0.55 + random() * 0.62);
    const x = centre[0] + Math.cos(around) * distance;
    const z = centre[1] + Math.sin(around) * distance;

    if (clearAt && !clearAt(x, z)) continue;

    let personY = y;
    if (floorAt) {
      const floor = floorAt(x, z);
      const height = typeof floor === 'number' ? floor : floor?.height ?? floor?.y;
      if (!Number.isFinite(height)) continue;
      // A knot never straddles a step or the shore ramp: everyone in it
      // stands on the same surface the centre does.
      if (Number.isFinite(centreHeight) && Math.abs(height - centreHeight) > 0.15) continue;
      personY = height;
    }

    if (minSeparation > 0 && placements.some((p) => Math.hypot(p.x - x, p.z - z) < minSeparation)) continue;

    const towards = faceAt || centre;
    const facing = Math.atan2(towards[0] - x, towards[1] - z) + (random() - 0.5) * 0.7;
    placements.push({
      x, z, y: personY, facing,
    });
  }

  if (minSeparation > 0) relax(placements, minSeparation);
  return placements;
}

// A few passes pushing apart any pair still closer than `minSeparation`,
// after rejection sampling has already done most of the work. Cheap, and it
// catches the near-misses rejection sampling leaves behind without needing an
// unbounded retry budget.
//
// Exported separately from `gather()`/`knot()` because those only enforce
// `minSeparation` within one call's own group — two different haunts, or a
// haunt and a scattered loner, can still end up close to each other by
// chance. A caller assembling several groups into one crowd (buildCapernaum's
// villagers, for instance) runs this once more over the merged list.
export function separatePlacements(placements, minSeparation) {
  relax(placements, minSeparation);
  return placements;
}

function relax(placements, minSeparation) {
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i];
        const b = placements[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= minSeparation || distance < 1e-6) continue;
        const push = (minSeparation - distance) / 2;
        const ux = dx / distance;
        const uz = dz / distance;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
}

// Two to four people on a tight ring, all facing the middle of their own
// small group — a conversation, not a village square. `gather()` with a
// large count reads as one crowd staring at a point; a haunt is several of
// these standing apart instead. See the plan's §6.3.
export function knot(random, centre, size, options = {}) {
  return gather(random, centre, size, { radius: 0.85, spread: 0.7, ...options });
}

// Scatters loose individuals across a rectangle, avoiding a middle strip so a
// thoroughfare stays walkable and the scene does not read as a field of
// people. `clearAt` and `floorAt` are opt-in, exactly as in `gather()` — a
// caller that does not pass them gets the old behaviour unchanged.
export function scatter(random, count, options = {}) {
  const {
    x0, x1, z0, z1, y = 0, clearX = 0, clearAt = null, floorAt = null,
  } = options;
  const placements = [];
  let guard = 0;
  while (placements.length < count && guard < count * 40) {
    guard += 1;
    const x = x0 + random() * (x1 - x0);
    const z = z0 + random() * (z1 - z0);
    if (clearX > 0 && Math.abs(x) < clearX) continue;
    if (clearAt && !clearAt(x, z)) continue;
    let personY = y;
    if (floorAt) {
      const floor = floorAt(x, z);
      const height = typeof floor === 'number' ? floor : floor?.height ?? floor?.y;
      if (!Number.isFinite(height)) continue;
      personY = height;
    }
    placements.push({ x, z, y: personY, facing: random() * Math.PI * 2 });
  }
  return placements;
}

// --- the rig --------------------------------------------------------------

// One reusable skeleton, posed once per figure per frame and read out as world
// matrices. Using real Object3Ds for the joints means the arm maths — a pivot
// at the shoulder, a mesh hanging half its length below it — is three's and not
// hand-rolled trigonometry that is wrong in one quadrant.
function makeRig(THREE) {
  const root = new THREE.Object3D();
  const body = new THREE.Object3D();
  root.add(body);

  const robe = new THREE.Object3D();
  robe.position.y = FIGURE.robeBase + FIGURE.robeHeight / 2;
  body.add(robe);

  const shoulders = new THREE.Object3D();
  shoulders.position.y = FIGURE.shoulderY;
  body.add(shoulders);

  const head = new THREE.Object3D();
  head.position.y = FIGURE.headY;
  shoulders.add(head);

  const cloth = new THREE.Object3D();
  cloth.position.y = FIGURE.clothY;
  shoulders.add(cloth);

  const makeArm = (side) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * FIGURE.shoulderX, -0.02, 0);
    shoulders.add(pivot);
    const limb = new THREE.Object3D();
    limb.position.y = -FIGURE.armLength / 2;
    pivot.add(limb);
    return { pivot, limb };
  };

  const left = makeArm(-1);
  const right = makeArm(1);

  root.matrixAutoUpdate = false;
  return {
    root, body, robe, shoulders, head, cloth, left, right,
  };
}

// --- the crowd ------------------------------------------------------------

export function createCrowd(THREE, options = {}) {
  const {
    figures = [],
    quality = 'high',
    castShadow = true,
    skin = SKIN,
    headcloth = HEADCLOTH,
    name = 'crowd',
    // Scenes whose ground is not flat resolve the height under a figure that
    // moves. Capernaum's routes run from the beach up into the village, and a
    // walker carrying a fixed Y either wades or floats.
    groundAt = null,
  } = options;

  const low = quality === 'low';
  const count = figures.length;
  const group = new THREE.Group();
  group.name = name;

  if (count === 0) {
    return {
      group, meshes: [], count: 0, update() {}, dispose() {},
    };
  }

  const geometries = [];
  const materials = [];

  const geometry = (g) => {
    geometries.push(g);
    return g;
  };
  const material = (m) => {
    materials.push(m);
    return m;
  };

  // A belted 1st-century tunic with waist cinch, chest volume, and draped hem flare
  const robeHeightSegs = low ? 4 : 8;
  const robeRadialSegs = low ? 8 : 14;
  const robeGeometry = geometry(new THREE.CylinderGeometry(
    FIGURE.robeTop,
    FIGURE.robeHem,
    FIGURE.robeHeight,
    robeRadialSegs,
    robeHeightSegs,
  ));

  // Modulate vertices to shape the waist cinch and natural fabric drape
  const pos = robeGeometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const vY = (y + FIGURE.robeHeight / 2) / FIGURE.robeHeight; // 0 at bottom, 1 at top
    const factor = vY > 0.7 ? 1.08 : (vY > 0.4 ? 0.88 : 1.02);
    pos.setX(i, pos.getX(i) * factor);
    pos.setZ(i, pos.getZ(i) * factor);
  }
  robeGeometry.computeVertexNormals();

function makeFaceTexture(THREE, skinColorHex) {
  try {
    if (typeof document === 'undefined') return null;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
    const canvas = document.createElement('canvas');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = 256;
    canvas.height = 256;

    const r = (skinColorHex >> 16) & 0xff;
    const g = (skinColorHex >> 8) & 0xff;
    const b = skinColorHex & 0xff;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, 256, 256);

    const warmGrad = ctx.createRadialGradient(128, 128, 30, 128, 128, 120);
    warmGrad.addColorStop(0, `rgba(${Math.min(255, r + 24)}, ${Math.min(255, g + 12)}, ${b}, 0.4)`);
    warmGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
    warmGrad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = warmGrad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(50, 28, 16, 0.35)';
    ctx.beginPath();
    ctx.ellipse(96, 108, 20, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(160, 108, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e140d';
    ctx.beginPath();
    ctx.ellipse(96, 94, 22, 5.5, -0.12, 0, Math.PI * 2);
    ctx.ellipse(160, 94, 22, 5.5, 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2ede4';
    ctx.beginPath();
    ctx.ellipse(96, 108, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.ellipse(160, 108, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#422817';
    ctx.beginPath();
    ctx.arc(96, 108, 5.5, 0, Math.PI * 2);
    ctx.arc(160, 108, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0a0705';
    ctx.beginPath();
    ctx.arc(96, 108, 2.8, 0, Math.PI * 2);
    ctx.arc(160, 108, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(98, 106, 1.5, 0, Math.PI * 2);
    ctx.arc(162, 106, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#22140a';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(96, 108, 13, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(160, 108, 13, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = 'rgba(65, 36, 20, 0.22)';
    ctx.beginPath();
    ctx.moveTo(123, 100);
    ctx.lineTo(133, 100);
    ctx.lineTo(135, 140);
    ctx.lineTo(121, 140);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(30, 14, 8, 0.65)';
    ctx.beginPath();
    ctx.ellipse(122, 140, 4, 2.2, 0.25, 0, Math.PI * 2);
    ctx.ellipse(134, 140, 4, 2.2, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 235, 215, 0.28)';
    ctx.beginPath();
    ctx.arc(128, 137, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#221610';
    ctx.beginPath();
    ctx.moveTo(114, 148);
    ctx.quadraticCurveTo(128, 143, 142, 148);
    ctx.quadraticCurveTo(150, 158, 138, 161);
    ctx.quadraticCurveTo(128, 153, 118, 161);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(165, 80, 65, 0.75)';
    ctx.beginPath();
    ctx.ellipse(128, 164, 8.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c120c';
    ctx.beginPath();
    ctx.moveTo(68, 126);
    ctx.quadraticCurveTo(76, 192, 128, 224);
    ctx.quadraticCurveTo(180, 192, 188, 126);
    ctx.quadraticCurveTo(172, 164, 142, 172);
    ctx.quadraticCurveTo(128, 175, 114, 172);
    ctx.quadraticCurveTo(84, 164, 68, 126);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

function makeTunicTexture(THREE) {
  try {
    if (typeof document === 'undefined') return null;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
    const canvas = document.createElement('canvas');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = 256;
    canvas.height = 256;

    ctx.fillStyle = '#e5ded4';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let y = 0; y < 256; y += 4) {
      ctx.fillRect(0, y, 256, 1.5);
    }
    for (let x = 0; x < 256; x += 4) {
      ctx.fillRect(x, 0, 1.5, 256);
    }

    ctx.fillStyle = '#682836';
    ctx.fillRect(48, 0, 14, 256);
    ctx.fillRect(194, 0, 14, 256);

    ctx.fillStyle = '#3a121c';
    ctx.fillRect(47, 0, 1.5, 256);
    ctx.fillRect(62, 0, 1.5, 256);
    ctx.fillRect(193, 0, 1.5, 256);
    ctx.fillRect(208, 0, 1.5, 256);

    const sashGrad = ctx.createLinearGradient(0, 110, 0, 150);
    sashGrad.addColorStop(0, 'rgba(0,0,0,0)');
    sashGrad.addColorStop(0.3, 'rgba(30,15,10,0.4)');
    sashGrad.addColorStop(0.7, 'rgba(30,15,10,0.4)');
    sashGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sashGrad;
    ctx.fillRect(0, 110, 256, 40);

    ctx.fillStyle = '#823224';
    ctx.fillRect(0, 126, 256, 8);
    ctx.fillStyle = '#551e14';
    ctx.fillRect(0, 134, 256, 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  } catch {
    return null;
  }
}

function makeClothTexture(THREE, headclothColorHex) {
  try {
    if (typeof document === 'undefined') return null;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
    const canvas = document.createElement('canvas');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = 128;
    canvas.height = 128;

    const r = (headclothColorHex >> 16) & 0xff;
    const g = (headclothColorHex >> 8) & 0xff;
    const b = headclothColorHex & 0xff;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let i = 0; i < 128; i += 3) {
      ctx.fillRect(0, i, 128, 1);
      ctx.fillRect(i, 0, 1, 128);
    }

    ctx.fillStyle = '#181410';
    ctx.fillRect(0, 78, 128, 12);
    ctx.fillStyle = '#322a22';
    for (let x = 0; x < 128; x += 6) {
      ctx.fillRect(x, 78, 2, 12);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

  // Anatomical cranial oval with subtle jaw contour and forward facing rotation
  const headGeometry = geometry(new THREE.SphereGeometry(FIGURE.headRadius, low ? 10 : 16, low ? 8 : 12));
  headGeometry.scale(0.92, 1.15, 1.04);
  headGeometry.rotateY(-Math.PI / 2);

  // Draped headcloth with fabric cowl flowing down the back of the neck
  const clothGeometry = geometry(new THREE.SphereGeometry(
    FIGURE.clothRadius,
    low ? 10 : 16,
    low ? 6 : 10,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62,
  ));
  const clothPos = clothGeometry.attributes.position;
  for (let i = 0; i < clothPos.count; i += 1) {
    const z = clothPos.getZ(i);
    if (z < -0.01) {
      clothPos.setY(i, clothPos.getY(i) - 0.045);
    }
  }
  clothGeometry.computeVertexNormals();

  // Tapered arm: broader at shoulder/elbow, slimmer at wrist with hand form
  const armGeometry = geometry(new THREE.CylinderGeometry(
    FIGURE.armRadius,
    FIGURE.armRadius * 0.68,
    FIGURE.armLength,
    low ? 6 : 10,
    low ? 3 : 6,
  ));
  const armPos = armGeometry.attributes.position;
  for (let i = 0; i < armPos.count; i += 1) {
    const y = armPos.getY(i);
    if (y < -FIGURE.armLength * 0.3) {
      armPos.setZ(i, armPos.getZ(i) * 0.65);
    }
  }
  armGeometry.computeVertexNormals();

  const textures = [];
  const headTex = makeFaceTexture(THREE, skin);
  const tunicTex = makeTunicTexture(THREE);
  const clothTex = makeClothTexture(THREE, headcloth);

  if (headTex) textures.push(headTex);
  if (tunicTex) textures.push(tunicTex);
  if (clothTex) textures.push(clothTex);

  const robeMaterial = material(new THREE.MeshStandardMaterial({
    map: tunicTex || null,
    roughness: 0.90,
    metalness: 0.02,
  }));
  const skinMaterial = material(new THREE.MeshStandardMaterial({
    color: headTex ? 0xffffff : skin,
    map: headTex || null,
    roughness: 0.76,
    metalness: 0.04,
  }));
  const clothMaterial = material(new THREE.MeshStandardMaterial({
    color: clothTex ? 0xffffff : headcloth,
    map: clothTex || null,
    roughness: 0.94,
  }));

  const mesh = (g, m, instances) => {
    const instanced = new THREE.InstancedMesh(g, m, instances);
    instanced.frustumCulled = false;
    if (!low && castShadow) {
      instanced.castShadow = true;
      instanced.receiveShadow = true;
    }
    group.add(instanced);
    return instanced;
  };

  const robes = mesh(robeGeometry, robeMaterial, count);
  const heads = mesh(headGeometry, skinMaterial, count);
  const cloths = mesh(clothGeometry, clothMaterial, count);
  robes.name = name;
  heads.name = `${name}-heads`;
  cloths.name = `${name}-cloths`;
  // Arms share one instanced mesh with two entries per figure, because two
  // meshes of N is two draw calls where one of 2N is one.
  const arms = mesh(armGeometry, robeMaterial, count * 2);
  arms.name = `${name}-arms`;

  if (figures.some((figure) => figure.route)) {
    for (const instanced of [robes, heads, cloths, arms]) {
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }

  const rig = makeRig(THREE);
  const colour = new THREE.Color();
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  const suppressedIndices = new Set();
  const idToIndex = new Map();
  figures.forEach((fig, idx) => {
    if (fig.id) idToIndex.set(fig.id, idx);
  });

  function suppress(idOrIndex, isSuppressed = true) {
    const idx = typeof idOrIndex === 'number' ? idOrIndex : idToIndex.get(idOrIndex);
    if (idx === undefined || idx < 0 || idx >= count) return;
    if (isSuppressed) {
      suppressedIndices.add(idx);
    } else {
      suppressedIndices.delete(idx);
    }
  }

  function isSuppressed(idOrIndex) {
    const idx = typeof idOrIndex === 'number' ? idOrIndex : idToIndex.get(idOrIndex);
    if (idx === undefined) return false;
    return suppressedIndices.has(idx);
  }

  // Robe colour is per-figure and never changes, so it is written once.
  figures.forEach((figure, i) => {
    colour.setHex(figure.colour ?? ROBE_PALETTE[i % ROBE_PALETTE.length]);
    robes.setColorAt(i, colour);
    arms.setColorAt(i * 2, colour);
    arms.setColorAt(i * 2 + 1, colour);
  });
  if (robes.instanceColor) robes.instanceColor.needsUpdate = true;
  if (arms.instanceColor) arms.instanceColor.needsUpdate = true;

  function update(elapsed) {
    const t = elapsed || 0;
    for (let i = 0; i < count; i += 1) {
      if (suppressedIndices.has(i)) {
        robes.setMatrixAt(i, zeroMatrix);
        heads.setMatrixAt(i, zeroMatrix);
        cloths.setMatrixAt(i, zeroMatrix);
        arms.setMatrixAt(i * 2, zeroMatrix);
        arms.setMatrixAt(i * 2 + 1, zeroMatrix);
        continue;
      }
      const figure = figures[i];
      let { x, z } = figure;
      let facing = figure.facing || 0;
      let cadence = 0;

      // A figure with a route walks it, out and back, so nobody vanishes at
      // the end of a line — at a real walking pace with a stop and a turn at
      // each end, via the same route model sceneHumans.js uses for the GLB
      // actors (sceneRoutes.js). `figure.speed` used to be route-fractions
      // per second, which meant an 86m lane was run at 4 m/s; see the plan's
      // §1.1.
      if (figure.route) {
        figure.__routePlan ||= routePlan(figure);
        const sample = sampleRoute(figure.__routePlan, t);
        x = sample.x;
        z = sample.z;
        facing = sample.facing;
        // Cadence is a phase angle: one full 2*pi sin() cycle per
        // WALK_METERS_PER_CYCLE of ground actually covered, kept in step with
        // the GLB actors' own gait so a figure swapping between the fallback
        // and the skeletal rig does not visibly change stride.
        cadence = sample.moving
          ? ((sample.along * figure.__routePlan.length) / WALK_METERS_PER_CYCLE) * Math.PI * 2
          : 0;
      }

      const pose = poseFor(figure.activity, t, figure.phase || i * 0.7, cadence);
      const scale = figure.scale || 1;
      const ground = groundAt ? groundAt(x, z, figure) : (figure.y || 0);

      rig.root.position.set(x, ground + pose.rise * scale, z);
      rig.root.rotation.y = facing + pose.sway;
      rig.root.scale.setScalar(scale);
      rig.body.rotation.x = pose.lean;
      rig.body.scale.y = pose.crouch;
      rig.left.pivot.rotation.set(pose.armL.swing, 0, pose.armL.raise);
      rig.right.pivot.rotation.set(pose.armR.swing, 0, -pose.armR.raise);

      rig.root.updateMatrix();
      rig.root.updateMatrixWorld(true);

      robes.setMatrixAt(i, rig.robe.matrixWorld);
      heads.setMatrixAt(i, rig.head.matrixWorld);
      cloths.setMatrixAt(i, rig.cloth.matrixWorld);
      arms.setMatrixAt(i * 2, rig.left.limb.matrixWorld);
      arms.setMatrixAt(i * 2 + 1, rig.right.limb.matrixWorld);
    }
    robes.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    cloths.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  }

  // Posed once at build time so a scene that is never updated — a still, a
  // test — still has people in it rather than a pile at the origin.
  update(0);

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    for (const child of group.children) child.dispose?.();
  }

  return {
    group,
    meshes: [robes, heads, cloths, arms],
    count,
    update,
    dispose,
    suppress,
    isSuppressed,
  };
}
