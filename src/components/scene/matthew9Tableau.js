// The call of Matthew, at the customs post on the Via Maris.
//
// The companion piece to mark2Tableau.js, and built the same way: a fixed cast
// of real skinned characters and their furniture, held as one composition and
// kept out of the ambient crowd's LOD pool, so the moment is always there
// rather than assembling itself when enough people happen to be nearby.
//
// What it holds is the instant in Matthew 9:9 — "he saw a man called Matthew
// sitting at the tax booth, and he said to him, Follow me." Nobody is walking
// away yet. Matthew is still seated behind his table with the stylus in his
// hand, stopped in the middle of a line; Jesus has his hand out toward him;
// the clerk beside him has not looked up and is still counting, which is the
// whole reason the clerk is there. The queue is still a queue.
//
// The staging is a profile confrontation across a table, because that is what
// reads from the vantage: the visitor stands under the south-east corner of
// the awning and sees both faces and the table between them.

import { LEVEL, TAX_BOOTH } from './capernaumDimensions.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { buildHumanClips, buildPoseClip } from './sceneHumanClips.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';
import { preferPrincipalModelAliases } from './scenePrincipalModels.js';

const G = LEVEL.ground;

// The customs table, along the open (east) face of the booth. Everything else
// in the composition is measured off it, so moving the table moves the scene.
export const TAX_TABLE = {
  x: -48.72,
  z: -1.75,
  depth: 0.9,
  length: 2.8,
  top: G + 0.76,
};

// Where the awning stands. The whole tableau lives under it.
export const MATTHEW_TABLEAU = {
  centre: [TAX_TABLE.x, G, TAX_TABLE.z],
  awningX0: TAX_BOOTH.x1,
  awningX1: TAX_BOOTH.x1 + 3.6,
};

// A seated actor's hips are driven to 0.58 above its root by the shared sit
// pose, so a stool it can credibly be sitting on has its seat here.
const STOOL_TOP = G + 0.44;
const SEATED_Y = G - 0.02;

export const MATTHEW_CAST = [
  // The two the scene is about. Square across the table from each other.
  {
    id: 'matthew',
    model: 'human-matthew',
    pose: 'called',
    position: [-49.4, SEATED_Y, -2.3],
    target: [-47.9, -2.3],
    stool: true,
    principal: true,
  },
  {
    id: 'jesus',
    model: 'human-jesus',
    pose: 'summon',
    position: [-47.9, G, -2.3],
    target: [-49.4, -2.3],
    principal: true,
  },
  // Still counting. The one figure in the tableau who has not noticed, and
  // the only one whose animation actually goes anywhere.
  {
    id: 'clerk',
    model: 'human-artisan',
    pose: 'tally',
    position: [-49.4, SEATED_Y, -0.85],
    target: [-47.8, -0.9],
    stool: true,
  },
  // The queue, which does not stop for this.
  {
    id: 'payer-front',
    model: 'human-villager',
    pose: 'listen',
    position: [-48.15, G, -0.75],
    target: [-49.4, -0.85],
    audience: true,
  },
  {
    id: 'payer-back',
    model: 'human-traveler',
    pose: 'idle',
    position: [-47.85, G, 0.15],
    target: [-48.15, -0.75],
    audience: true,
    phase: 2.4,
  },
  // A guard leaning by the awning post: a border post on the Damascus road
  // collected money under arms, which is part of why the job was hated.
  {
    id: 'guard',
    model: 'human-traveler',
    pose: 'idle',
    position: [-47.1, G, -1.55],
    target: [-48.9, -2.1],
    audience: true,
    phase: 4.1,
  },
  // The two who walked here with him and are watching what he does next.
  {
    id: 'disciple-near',
    model: 'human-artisan',
    pose: 'listen',
    position: [-47.75, G, -3.45],
    target: [-48.6, -2.6],
    audience: true,
    phase: 1.3,
  },
  {
    id: 'disciple-far',
    model: 'human-villager',
    pose: 'talk',
    position: [-47.15, G, -4.15],
    target: [-48.4, -2.8],
    audience: true,
    phase: 3.6,
  },
];

// Keep the ambient crowd, and any future random placement, out of the booth
// and its awning. The tax-booth queue haunt sits north of this, at z = 4, and
// is deliberately left alone: it reads as the tail of the same line.
export function inMatthewTableauArea(x, z) {
  return x > TAX_BOOTH.x0 - 0.3 && x < MATTHEW_TABLEAU.awningX1 + 0.6
    && z > TAX_BOOTH.z0 - 0.8 && z < TAX_BOOTH.z1 + 0.8;
}

function poseSample(name, t) {
  const breath = Math.sin((t * Math.PI * 2) / 6);
  if (name === 'called') {
    // Stopped, not standing. He has sat back off the tablet and looked up;
    // the writing hand is still over the line it was in the middle of.
    return {
      seated: true,
      spineLean: -9 + breath * 0.5,
      spineYaw: -7,
      headPitch: -13,
      leftLeg: { thighFlex: 88, shinFlex: 3 },
      rightLeg: { thighFlex: 84, shinFlex: -4 },
      // Reach solved against the real bone lengths so both hands land ON the
      // table rather than in his lap: the arm carries the hand forward and
      // the near-horizontal forearm keeps it at the height of the top.
      left: { armFlex: 37, armAbduct: 7, foreArmAbduct: -18, foreArmFlex: 88 },
      right: { armFlex: 40, armAbduct: 5, foreArmAbduct: -14, foreArmFlex: 90 + breath * 0.6 },
      fingerCurl: 30,
    };
  }
  if (name === 'summon') {
    // The right arm out and level, the hand open, the weight already forward.
    // Two words, and no hurry in them.
    return {
      spineLean: 4 + breath * 0.4,
      headPitch: 7,
      leftLeg: { thighFlex: 3, shinFlex: 0 },
      rightLeg: { thighFlex: -4, shinFlex: -2 },
      left: { armFlex: -1, armAbduct: 5, foreArmFlex: 14 },
      right: { armFlex: 66 + breath * 0.5, armAbduct: 9, foreArmAbduct: -6, foreArmFlex: 78 + breath * 0.4 },
      fingerCurl: 6,
    };
  }
  // The clerk, head down over the coins, hands working. Deliberately the
  // liveliest thing in a tableau that is otherwise holding still.
  const count = Math.sin((t * Math.PI * 2) / 3);
  const reach = Math.sin((t * Math.PI * 2) / 3 + 1.1);
  return {
    seated: true,
    spineLean: 21 + count * 1.6,
    headPitch: 17,
    leftLeg: { thighFlex: 90, shinFlex: 0 },
    rightLeg: { thighFlex: 90, shinFlex: 0 },
    left: { armFlex: 24 + count * 3, armAbduct: 8, foreArmAbduct: -20, foreArmFlex: 99 + count * 7 },
    right: { armFlex: 22 + reach * 5, armAbduct: 8, foreArmAbduct: -22, foreArmFlex: 101 + reach * 9 },
    fingerCurl: 40,
  };
}

export function createMatthew9Tableau(THREE, { root, onReady } = {}) {
  const group = new THREE.Group();
  group.name = 'matthew-9-tableau';
  group.visible = false;
  root.add(group);

  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const timber = own(new THREE.MeshStandardMaterial({ color: 0x6d4c2c, roughness: 0.93 }));
  const darkTimber = own(new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 }));
  // Bronze, not gold: a customs post weighed provincial coin, and the pans
  // and the weights are the only things here that catch any light at all.
  const bronze = own(new THREE.MeshStandardMaterial({ color: 0xa8813f, roughness: 0.42, metalness: 0.55 }));
  const silver = own(new THREE.MeshStandardMaterial({ color: 0xb9b6a8, roughness: 0.38, metalness: 0.5 }));
  const cord = own(new THREE.MeshStandardMaterial({ color: 0xbca97c, roughness: 1 }));
  const leather = own(new THREE.MeshStandardMaterial({ color: 0x54402a, roughness: 0.72 }));
  const wax = own(new THREE.MeshStandardMaterial({ color: 0xd9cba4, roughness: 0.86 }));

  const addMesh = (geometry, material, parent, position = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(own(geometry), material);
    mesh.position.fromArray(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // --- the table ----------------------------------------------------------
  const table = new THREE.Group();
  table.name = 'customs-table';
  table.position.set(TAX_TABLE.x, 0, TAX_TABLE.z);
  group.add(table);
  addMesh(new THREE.BoxGeometry(TAX_TABLE.depth, 0.07, TAX_TABLE.length), timber, table,
    [0, TAX_TABLE.top - 0.035, 0]);
  const legGeometry = own(new THREE.BoxGeometry(0.085, TAX_TABLE.top - G - 0.07, 0.085));
  for (const dx of [-0.32, 0.32]) {
    for (const dz of [-1.24, 1.24]) {
      const leg = new THREE.Mesh(legGeometry, darkTimber);
      leg.position.set(dx, G + (TAX_TABLE.top - G - 0.07) / 2, dz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      table.add(leg);
    }
  }
  addMesh(new THREE.BoxGeometry(0.06, 0.06, 2.4), darkTimber, table, [0, G + 0.2, 0]);

  // Stools for the two men who sit here all day.
  const stoolSeat = own(new THREE.CylinderGeometry(0.19, 0.2, 0.055, 12));
  const stoolLeg = own(new THREE.CylinderGeometry(0.022, 0.026, STOOL_TOP - G - 0.055, 6));
  for (const entry of MATTHEW_CAST.filter((actor) => actor.stool)) {
    const stool = new THREE.Group();
    stool.name = `stool-${entry.id}`;
    // Slightly behind the sitter, which is where a stool under someone is.
    const back = Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]);
    stool.position.set(entry.position[0] - Math.sin(back) * 0.07, 0, entry.position[2] - Math.cos(back) * 0.07);
    group.add(stool);
    const seat = new THREE.Mesh(stoolSeat, timber);
    seat.position.y = STOOL_TOP - 0.028;
    seat.castShadow = true;
    seat.receiveShadow = true;
    stool.add(seat);
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(stoolLeg, darkTimber);
      leg.position.set(Math.cos(angle) * 0.13, G + (STOOL_TOP - G - 0.055) / 2, Math.sin(angle) * 0.13);
      leg.rotation.set(Math.sin(angle) * 0.13, 0, -Math.cos(angle) * 0.13);
      leg.castShadow = true;
      stool.add(leg);
    }
  }

  // --- what is on the table ----------------------------------------------
  // The tablet Matthew is in the middle of, its stylus, the day's coin in
  // stacks and bags, and the strongbox it goes into.
  const tablet = new THREE.Group();
  tablet.position.set(TAX_TABLE.x - 0.3, TAX_TABLE.top, TAX_TABLE.z - 0.52);
  tablet.rotation.y = 0.22;
  group.add(tablet);
  addMesh(new THREE.BoxGeometry(0.26, 0.018, 0.34), darkTimber, tablet, [0, 0.009, 0]);
  addMesh(new THREE.BoxGeometry(0.21, 0.006, 0.29), wax, tablet, [0, 0.021, 0]);

  const coinGeometry = own(new THREE.CylinderGeometry(0.0135, 0.0135, 0.0035, 10));
  const stack = (x, z, count, material) => {
    for (let i = 0; i < count; i += 1) {
      const coin = new THREE.Mesh(coinGeometry, material);
      coin.position.set(x, TAX_TABLE.top + 0.002 + i * 0.0037, z);
      coin.rotation.y = i * 0.4;
      coin.castShadow = true;
      coin.receiveShadow = true;
      group.add(coin);
    }
  };
  stack(TAX_TABLE.x + 0.12, TAX_TABLE.z - 0.98, 9, silver);
  stack(TAX_TABLE.x + 0.05, TAX_TABLE.z - 0.86, 6, bronze);
  stack(TAX_TABLE.x + 0.19, TAX_TABLE.z - 0.82, 4, bronze);
  stack(TAX_TABLE.x - 0.02, TAX_TABLE.z + 0.62, 7, silver);
  stack(TAX_TABLE.x + 0.14, TAX_TABLE.z + 0.74, 5, bronze);
  // A few knocked flat, which is what a working table looks like.
  for (const [dx, dz] of [[0.24, -1.1], [-0.1, -0.7], [0.28, 0.5], [-0.24, 0.88]]) {
    const coin = new THREE.Mesh(coinGeometry, dx > 0 ? bronze : silver);
    coin.position.set(TAX_TABLE.x + dx, TAX_TABLE.top + 0.002, TAX_TABLE.z + dz);
    coin.receiveShadow = true;
    group.add(coin);
  }

  const bagGeometry = own(new THREE.SphereGeometry(1, 12, 8));
  for (const [dx, dz, scale] of [[-0.16, 0.36, 1], [0.2, 0.16, 0.82]]) {
    const bag = addMesh(bagGeometry, leather, group,
      [TAX_TABLE.x + dx, TAX_TABLE.top + 0.058 * scale, TAX_TABLE.z + dz]);
    bag.scale.set(0.082 * scale, 0.062 * scale, 0.076 * scale);
    const neck = addMesh(new THREE.CylinderGeometry(0.014, 0.026, 0.05, 8), leather, group,
      [TAX_TABLE.x + dx, TAX_TABLE.top + 0.113 * scale, TAX_TABLE.z + dz]);
    neck.scale.setScalar(scale);
  }

  const strongbox = new THREE.Group();
  strongbox.position.set(-49.72, 0, TAX_TABLE.z - 1.3);
  group.add(strongbox);
  addMesh(new THREE.BoxGeometry(0.42, 0.3, 0.56), darkTimber, strongbox, [0, G + 0.15, 0]);
  addMesh(new THREE.BoxGeometry(0.44, 0.035, 0.06), bronze, strongbox, [0, G + 0.22, 0]);
  addMesh(new THREE.BoxGeometry(0.05, 0.055, 0.04), bronze, strongbox, [0, G + 0.19, -0.29]);

  // --- the balance --------------------------------------------------------
  // A customs post weighed coin rather than trusting its face value, so the
  // balance is the one piece of equipment that says what this table is. Its
  // pans hang from the beam and are solved every frame, so the beam can rock
  // without the threads coming adrift.
  const balance = {
    origin: new THREE.Vector3(TAX_TABLE.x + 0.16, TAX_TABLE.top, TAX_TABLE.z - 1.16),
    beamHalf: 0.21,
    drop: 0.15,
  };
  addMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.02, 12), bronze, group,
    [balance.origin.x, balance.origin.y + 0.01, balance.origin.z]);
  addMesh(new THREE.CylinderGeometry(0.011, 0.013, 0.42, 8), bronze, group,
    [balance.origin.x, balance.origin.y + 0.22, balance.origin.z]);
  const beam = addMesh(new THREE.CylinderGeometry(0.007, 0.007, balance.beamHalf * 2, 6), bronze, group,
    [balance.origin.x, balance.origin.y + 0.43, balance.origin.z]);
  beam.rotation.x = Math.PI / 2;
  const panGeometry = own(new THREE.CylinderGeometry(0.056, 0.042, 0.011, 12));
  const threadGeometry = own(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 4));
  const pans = [-1, 1].map((side) => {
    const pan = new THREE.Mesh(panGeometry, bronze);
    pan.castShadow = true;
    group.add(pan);
    const thread = new THREE.Mesh(threadGeometry, cord);
    group.add(thread);
    return { side, pan, thread, end: new THREE.Vector3(), rest: new THREE.Vector3() };
  });
  // Two bronze weights beside it, one on the near pan's rim.
  for (const [dx, dz, size] of [[0.3, -0.99, 0.028], [0.31, -1.07, 0.022]]) {
    const weight = addMesh(new THREE.CylinderGeometry(size, size * 1.1, size * 1.1, 8), bronze, group,
      [TAX_TABLE.x + dx, TAX_TABLE.top + size * 0.55, TAX_TABLE.z + dz]);
    weight.receiveShadow = true;
  }

  // --- the cast -----------------------------------------------------------
  const models = new Map();
  const actors = new Map();
  const clipsByModel = new Map();
  let ready = false;
  let disposed = false;
  let time = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const cameraPosition = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const focus = new THREE.Vector3(TAX_TABLE.x, TAX_TABLE.top, TAX_TABLE.z);
  const worldQuaternion = new THREE.Quaternion();
  const stylusGeometry = own(new THREE.CylinderGeometry(0.0035, 0.0022, 0.135, 5));
  let stylus = null;

  function acceptAssets(assetGroup) {
    if (disposed || ready) return;
    for (const [id, model] of Object.entries(assetGroup?.models || {})) {
      let skinned = false;
      model.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
      if (skinned && ['Hips', 'LeftArm', 'LeftUpLeg', 'LeftHand', 'RightHand']
        .every((bone) => model.scene.getObjectByName(`mixamorig${bone}`))) models.set(id, model);
    }
    preferPrincipalModelAliases(models);
    if (!MATTHEW_CAST.every((entry) => models.has(entry.model))) return;

    for (const entry of MATTHEW_CAST) {
      const model = models.get(entry.model);
      prepareHumanMaterials(model.scene);
      if (!clipsByModel.has(entry.model)) {
        const clips = buildHumanClips(THREE, model.scene);
        for (const name of ['called', 'summon', 'tally']) {
          clips[name] = buildPoseClip(THREE, model.scene, name, 6, (t) => poseSample(name, t));
        }
        clipsByModel.set(entry.model, clips);
      }
      const actorRoot = cloneSkinnedMesh(model.scene);
      actorRoot.name = `matthew-9-${entry.id}`;
      actorRoot.position.fromArray(entry.position);
      actorRoot.rotation.y = Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]);
      group.add(actorRoot);

      const meshes = [[], []];
      actorRoot.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        node.castShadow = true;
        node.receiveShadow = true;
        meshes[node.name.includes('_LOD1') ? 1 : 0].push(node);
      });
      const mixer = new THREE.AnimationMixer(actorRoot);
      const clip = clipsByModel.get(entry.model)[entry.pose];
      if (clip) {
        const action = mixer.clipAction(clip).play();
        action.time = entry.phase || 0;
        mixer.update(0);
      }
      const find = (name) => actorRoot.getObjectByName(`mixamorig${name}`);
      actors.set(entry.id, {
        entry,
        root: actorRoot,
        mixer,
        meshes,
        hands: [find('LeftHand'), find('RightHand')],
        head: find('Head'),
        shoulder: find('RightArm'),
      });
    }

    // The stylus is not parented to the hand: like the ropes in the Mark 2
    // tableau it is placed from the palm every frame, so it stays in the grip
    // through the breathing rather than through a bone offset guessed once.
    stylus = new THREE.Mesh(stylusGeometry, darkTimber);
    stylus.castShadow = true;
    group.add(stylus);

    ready = true;
    group.visible = true;
    update({ delta: 0, reducedMotion: true });
    onReady?.();
  }

  function update({ delta = 0.016, camera = null, quality = 'balanced', reducedMotion = false } = {}) {
    if (!ready || disposed) return;
    const dt = reducedMotion ? 0 : Math.min(0.1, Math.max(0, delta));
    time += dt;
    const profile = quality?.name || quality;
    if (camera) camera.getWorldPosition(cameraPosition);
    const distance = camera ? cameraPosition.distanceTo(focus) : 0;
    group.visible = distance < 65;
    if (!group.visible) return;

    for (const actor of actors.values()) {
      actor.root.visible = !actor.entry.audience || profile !== 'low';
      const lod = profile === 'high' && actor.entry.principal && distance < 12 ? 0 : 1;
      const selected = actor.meshes[lod].length ? lod : 0;
      actor.meshes.forEach((meshes, i) => meshes.forEach((mesh) => { mesh.visible = i === selected; }));
      actor.mixer.update(dt);
    }
    group.updateMatrixWorld(true);

    // The balance rocks very slightly, and the pans hang plumb under whichever
    // way the beam has ended up.
    const tilt = Math.sin(time * 0.44) * 0.035;
    beam.rotation.z = tilt;
    for (const entry of pans) {
      entry.end.set(0, Math.sin(tilt) * entry.side * balance.beamHalf, entry.side * balance.beamHalf * Math.cos(tilt))
        .add(balance.origin).add(new THREE.Vector3(0, 0.43, 0));
      entry.pan.position.copy(entry.end).setY(entry.end.y - balance.drop);
      direction.subVectors(entry.pan.position, entry.end);
      entry.thread.position.copy(entry.end).add(entry.pan.position).multiplyScalar(0.5);
      entry.thread.scale.set(1, direction.length(), 1);
      entry.thread.quaternion.setFromUnitVectors(up, direction.normalize());
      entry.rest.copy(entry.pan.position);
    }

    // The stylus, held over the line he stopped in the middle of.
    const writer = actors.get('matthew');
    if (stylus && writer?.hands[1]) {
      const hand = writer.hands[1];
      stylus.position.set(0, 0.06, 0);
      hand.localToWorld(stylus.position);
      group.worldToLocal(stylus.position);
      // The group can carry a transform of its own, so the grip orientation
      // is taken back into group space rather than assumed to be world space.
      group.getWorldQuaternion(worldQuaternion);
      hand.getWorldQuaternion(stylus.quaternion);
      stylus.quaternion.premultiply(worldQuaternion.invert());
      stylus.rotateX(Math.PI * 0.42);
    }
  }

  // Everyone here is a solid obstacle, and so is the table they are sitting
  // at. Approximated by circles for the same reason the crowd is: a walker
  // only ever asks whether one point is free.
  function queryClearance(x, z, radius = 0.35, y = 0) {
    if (!ready || disposed) return { collides: false, pushX: 0, pushZ: 0 };
    if (Math.abs(y - G) > 1.4) return { collides: false, pushX: 0, pushZ: 0 };
    const candidates = MATTHEW_CAST.map((entry) => ({
      x: entry.position[0], z: entry.position[2], radius: entry.stool ? 0.42 : 0.32,
    }));
    for (let i = 0; i <= 6; i += 1) {
      candidates.push({
        x: TAX_TABLE.x,
        z: TAX_TABLE.z - TAX_TABLE.length / 2 + (i / 6) * TAX_TABLE.length,
        radius: 0.46,
      });
    }
    for (const other of candidates) {
      const dx = x - other.x;
      const dz = z - other.z;
      const distance = Math.hypot(dx, dz);
      const gap = radius + other.radius;
      if (distance < gap) {
        return {
          collides: true,
          pushX: distance > 0.001 ? (dx / distance) * (gap - distance) : gap,
          pushZ: distance > 0.001 ? (dz / distance) * (gap - distance) : 0,
        };
      }
    }
    return { collides: false, pushX: 0, pushZ: 0 };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      actor.mixer.stopAllAction();
      actor.mixer.uncacheRoot(actor.root);
      actor.root.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    }
    skeletons.forEach((skeleton) => skeleton.dispose());
    // Clones share the asset's geometry and materials; only what was created
    // here is owned. Detach before the scenery's disposal traversal runs.
    root.remove(group);
    resources.forEach((resource) => resource.dispose());
    actors.clear();
    models.clear();
    clipsByModel.clear();
  }

  return {
    group,
    table,
    acceptAssets,
    update,
    queryClearance,
    dispose,
    getActors: () => actors,
    getBalance: () => ({ beam, pans }),
    getStylus: () => stylus,
    isReady: () => ready && !disposed,
    getElapsed: () => time,
  };
}
