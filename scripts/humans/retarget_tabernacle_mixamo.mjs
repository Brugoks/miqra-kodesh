// Offline: FBX references stay in ignored cache; only target-bound motion ships.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildPoseClip } from '../../src/components/scene/sceneHumanClips.js';
const cache = path.resolve('scripts/.cache/tabernacle');
const sourceDir = path.resolve(process.argv[2] || path.join(cache, 'mixamo'));
const buffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
T.TextureLoader.prototype.load = () => new T.Texture();
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new T.Texture() }));
const definitions = {
  idle: { file: 'Idle.fbx' }, walk: { file: 'Walking.fbx', travel: true },
  talk: { file: 'Talking.fbx' }, talk2: { file: 'Talking (1).fbx' },
  carry: { file: 'holding idle.fbx', grip: true },
  carryWalk: { file: 'holding walk.fbx', grip: true, travel: true },
  pour: { file: 'watering.fbx', rightGrip: true }, pourRest: { file: 'Idle.fbx', rightGrip: true },
};
const roles = { 'high-priest': ['idle'], priest: ['idle', 'walk', 'carry', 'carryWalk'],
  levite: ['idle', 'walk', 'talk'], 'camp-man': ['idle', 'walk', 'talk', 'carry', 'carryWalk'],
  'camp-woman': ['idle', 'walk', 'talk2', 'carry', 'carryWalk', 'pour', 'pourRest'] };
const donors = {};
for (const [key, def] of Object.entries(definitions)) {
  const bytes = await fs.readFile(path.join(sourceDir, def.file));
  const scene = new FBXLoader().parse(buffer(bytes), ''); scene.updateMatrixWorld(true);
  const bones = new Map(); scene.traverse(n => { if (n.isBone && !bones.has(n.name)) bones.set(n.name, n); });
  const clip = scene.animations.find(c => c.tracks.length);
  if (!clip || !bones.has('mixamorigHips')) throw new Error(`Invalid donor: ${def.file}`);
  donors[key] = { scene, bones, clip, sha256: hash(bytes),
    bind: new Map([...bones].map(([n, b]) => [n, b.getWorldQuaternion(new T.Quaternion())])),
    hip: bones.get('mixamorigHips').getWorldPosition(new T.Vector3()) };
}

// Append animation accessors to the original GLB, preserving textures, skins,
// garment metadata, inverse bind matrices and all existing authoring clips.
function appendClips(bytes, clips, records) {
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length));
  const chunks = [bytes.subarray(28 + length)]; let offset = chunks[0].length;
  const nodes = new Map(gltf.nodes.map((n, i) => [T.PropertyBinding.sanitizeNodeName(n.name || ''), i]));
  function accessor(values, type) {
    const data = Buffer.from(new Float32Array(values).buffer);
    const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) - 1;
    chunks.push(data); offset += data.length;
    const spec = { bufferView: view, componentType: 5126, count: values.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[type]), type };
    if (type === 'SCALAR') { spec.min = [values[0]]; spec.max = [values.at(-1)]; }
    return gltf.accessors.push(spec) - 1;
  }
  for (const clip of clips) {
    const animation = { name: clip.name, channels: [], samplers: [], extras: records[clip.name] };
    for (const track of clip.tracks) {
      const [name, property] = track.name.split('.'); const node = nodes.get(name);
      if (node === undefined) throw new Error(`Unknown target bone: ${name}`);
      const input = accessor(track.times, 'SCALAR'); const output = accessor(track.values, property === 'quaternion' ? 'VEC4' : 'VEC3');
      animation.channels.push({ sampler: animation.samplers.length, target: { node, path: property === 'quaternion' ? 'rotation' : 'translation' } });
      animation.samplers.push({ input, output, interpolation: 'LINEAR' });
    }
    gltf.animations.push(animation);
  }
  gltf.buffers[0].byteLength = offset;
  const raw = Buffer.from(JSON.stringify(gltf)); const json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + offset, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8); bin.writeUInt32LE(offset); bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, bin, ...chunks]);
}
const manifest = {};
function placeHand(model, side, destination) {
  const arm = model.getObjectByName(`mixamorig${side}Arm`), fore = model.getObjectByName(`mixamorig${side}ForeArm`), hand = model.getObjectByName(`mixamorig${side}Hand`);
  const a = arm.getWorldPosition(new T.Vector3()), b = fore.getWorldPosition(new T.Vector3()), c = hand.getWorldPosition(new T.Vector3());
  const wrist = hand.getWorldQuaternion(new T.Quaternion());
  const upper = a.distanceTo(b), lower = b.distanceTo(c), direction = destination.clone().sub(a).normalize();
  const distance = T.MathUtils.clamp(a.distanceTo(destination), Math.abs(upper - lower) + .001, upper + lower - .001);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const bend = b.clone().sub(a); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  const aim = (bone, child, target) => {
    const origin = bone.getWorldPosition(new T.Vector3());
    const from = child.getWorldPosition(new T.Vector3()).sub(origin).normalize(), to = target.clone().sub(origin).normalize();
    const world = new T.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new T.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world)); bone.updateMatrixWorld(true);
  };
  aim(arm, fore, elbow); aim(fore, hand, a.clone().addScaledVector(direction, distance));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(wrist)); hand.updateMatrixWorld(true);
}
for (const [role, keys] of Object.entries(roles)) {
  const bytes = await fs.readFile(path.join(cache, `${role}.glb`));
  const model = (await loader.parseAsync(buffer(bytes), '')).scene;
  const bones = []; model.traverse(n => { if (n.isBone) bones.push(n); });
  const rest = new Map(bones.map(b => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
  const restore = () => { for (const [b, p] of rest) { b.quaternion.copy(p.q); b.position.copy(p.p); } model.updateMatrixWorld(true); };
  const reference = buildPoseClip(T, model, 'reference', 1, () => ({ left: { armAbduct: 90 }, right: { armAbduct: 90 }, fingerCurl: 0 }));
  const referenceMixer = new T.AnimationMixer(model); referenceMixer.clipAction(reference).play(); referenceMixer.setTime(0); model.updateMatrixWorld(true);
  const targetBind = new Map(bones.map(b => [b.name, b.getWorldQuaternion(new T.Quaternion())]));
  referenceMixer.stopAllAction(); referenceMixer.uncacheRoot(model); restore();
  const hip = model.getObjectByName('mixamorigHips'); const restHip = hip.getWorldPosition(new T.Vector3());
  const grips = {};
  for (const [name, curl] of [['relaxed', 18], ['carry', 45], ['handle', 58]]) {
    const c = buildPoseClip(T, model, name, 1, () => ({
      left: { armFlex: 18, armAbduct: 13, foreArmFlex: 85, foreArmAbduct: -8 },
      right: { armFlex: 18, armAbduct: 13, foreArmFlex: 85, foreArmAbduct: -8 }, fingerCurl: curl,
    }));
    grips[name] = new Map(c.tracks.map(t => [t.name, t]));
  }
  const skin = []; model.traverse(n => { if (n.isSkinnedMesh && n.name.startsWith('Skin') && n.name.includes('_LOD0')) skin.push(n); });
  // Only sole vertices can be the lowest point for the upright clips selected.
  const soles = skin.map(mesh => ({ mesh, indices: Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i)
    .filter(i => new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).y < .13) }));
  const clips = []; const records = {};
  for (const key of keys) {
    restore(); const def = definitions[key]; const d = donors[key]; const scale = restHip.y / d.hip.y;
    const mixer = new T.AnimationMixer(d.scene); mixer.clipAction(d.clip).play();
    const fps = 30; const frames = Math.round(d.clip.duration * fps); const duration = frames / fps;
    const times = []; const rotations = new Map(bones.map(b => [b, []])); const positions = [];
    const first = new T.Vector3(), last = new T.Vector3();
    mixer.setTime(0); d.scene.updateMatrixWorld(true); d.bones.get('mixamorigHips').getWorldPosition(first);
    mixer.setTime(d.clip.duration - 1e-6); d.scene.updateMatrixWorld(true); d.bones.get('mixamorigHips').getWorldPosition(last);
    const displacement = last.clone().sub(first); const stride = Math.hypot(displacement.x, displacement.z) * scale;
    for (let frame = 0; frame <= frames; frame++) {
      const t = Math.min(frame / fps, d.clip.duration - 1e-6); times.push(frame / fps);
      mixer.setTime(t); d.scene.updateMatrixWorld(true);
      for (const bone of bones) {
        const name = bone.name, donor = d.bones.get(name);
        const fixed = /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(name) || (def.grip && /(Left|Right)(Arm|ForeArm|Hand)$/.test(name));
        const grip = fixed && grips[def.grip ? 'carry' : def.rightGrip && name.startsWith('mixamorigRightHand') ? 'handle' : 'relaxed'].get(`${name}.quaternion`);
        if (grip) bone.quaternion.fromArray(grip.values);
        else if (donor) {
          const q = donor.getWorldQuaternion(new T.Quaternion()).multiply(d.bind.get(name).clone().invert()).multiply(targetBind.get(name));
          bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q)).normalize();
        }
        bone.updateMatrixWorld(true);
      }
      const p = d.bones.get('mixamorigHips').getWorldPosition(new T.Vector3()).sub(d.hip);
      // Remove travelled translation; retain lateral weight shift and hip bob.
      if (def.travel) { p.x -= displacement.x * frame / frames + first.x - d.hip.x; p.z -= displacement.z * frame / frames + first.z - d.hip.z; }
      p.multiplyScalar(scale).add(restHip); hip.position.copy(hip.parent.worldToLocal(p)); model.updateMatrixWorld(true);
      if (def.grip) {
        const centre = hip.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, .08, .33));
        placeHand(model, 'Left', centre.clone().add(new T.Vector3(.24, 0, 0)));
        placeHand(model, 'Right', centre.clone().add(new T.Vector3(-.24, 0, 0)));
      }
      let floor = Infinity; const point = new T.Vector3();
      for (const { mesh, indices } of soles) { mesh.skeleton.update(); for (const i of indices) floor = Math.min(floor, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y); }
      if (!Number.isFinite(floor)) throw new Error(`Missing sole: ${role}`);
      const grounded = hip.getWorldPosition(point).clone(); grounded.y -= floor; hip.position.copy(hip.parent.worldToLocal(grounded));
      positions.push(...hip.position.toArray());
      for (const bone of bones) rotations.get(bone).push(...bone.quaternion.toArray());
    }
    const tracks = bones.map(b => new T.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rotations.get(b)));
    tracks.push(new T.VectorKeyframeTrack('mixamorigHips.position', times, positions));
    // Genuine cyclic locomotion keeps its cadence. Idle/actions receive a short
    // return only when they are not already seamless; no root-motion teleport.
    const seam = def.travel ? 0 : .2;
    for (const track of tracks) {
      const size = track.getValueSize(); const values = Array.from(track.values);
      if (seam) { values.push(...values.slice(0, size)); track.times = new Float32Array([...track.times, duration + seam]); }
      else values.splice(values.length - size, size, ...values.slice(0, size));
      track.values = new Float32Array(values);
    }
    const name = `mixamo-${key}`; const clip = new T.AnimationClip(name, duration + seam, tracks).optimize(); clips.push(clip);
    records[name] = { source: 'Adobe Mixamo', title: def.file.replace('.fbx', ''), sourceSha256: d.sha256,
      targetBindSha256: hash(bytes), fps, sourceDuration: d.clip.duration, ...(def.travel ? { metersPerCycle: +stride.toFixed(5) } : {}),
      adaptation: def.grip ? 'Torso and gait capture; authored two-hand basket/wood grip' : 'Target proportions, neutral finger curl and sole grounding' };
    mixer.stopAllAction(); mixer.uncacheRoot(d.scene);
    console.log(`${role}: ${name} (${clip.duration.toFixed(2)}s${def.travel ? `, ${stride.toFixed(2)}m/cycle` : ''})`);
  }
  // Laver hand-washing is an authored gesture, not a farming action passed off
  // as a documented ritual. Feet washing is not represented by this loop.
  if (role === 'priest') {
    restore(); const wash = buildPoseClip(T, model, 'tabernacle-wash', 6, t => {
      const wave = Math.sin(t * Math.PI * 2 / 3);
      return { spineLean: 6, headPitch: 14, left: { armFlex: 30, armAbduct: 8, foreArmFlex: 92 + wave * 5, foreArmAbduct: -24 },
        right: { armFlex: 30, armAbduct: 8, foreArmFlex: 92 - wave * 5, foreArmAbduct: -24 }, fingerCurl: 8 };
    });
    const washingMixer = new T.AnimationMixer(model); washingMixer.clipAction(wash).play();
    const handTracks = wash.tracks.filter(track => /(Left|Right)(Arm|ForeArm|Hand)\.quaternion$/.test(track.name));
    const corrected = new Map(handTracks.map(track => [track.name, []]));
    for (let frame = 0; frame < handTracks[0].times.length; frame++) {
      const t = handTracks[0].times[frame]; washingMixer.setTime(t); model.updateMatrixWorld(true);
      const centre = hip.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, .10, .46));
      placeHand(model, 'Left', centre.clone().add(new T.Vector3(.035, .013 * Math.sin(t * Math.PI * 2 / 3), 0)));
      placeHand(model, 'Right', centre.clone().add(new T.Vector3(-.035, -.013 * Math.sin(t * Math.PI * 2 / 3), .025)));
      for (const track of handTracks) corrected.get(track.name).push(...model.getObjectByName(track.name.split('.')[0]).quaternion.toArray());
    }
    washingMixer.stopAllAction(); washingMixer.uncacheRoot(model);
    for (const track of handTracks) track.values = new Float32Array(corrected.get(track.name));
    clips.push(wash); records[wash.name] = { source: 'Miqra Kodesh authored', description: 'Restrained hand-washing at laver; exact gesture interpretive' };
  }
  manifest[role] = records;
  await fs.writeFile(path.join(cache, `${role}-animated.glb`), appendClips(bytes, clips, records));
}
await fs.writeFile(path.join(cache, 'motion-manifest.json'), JSON.stringify(manifest, null, 2));
