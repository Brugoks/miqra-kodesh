// Dedicated, measured Elah characters. Geometry/textures belong to the asset
// session; cloned skeletons, mixers and hand-held props belong to this tableau.
import { cloneSkinnedMesh } from './sceneResources.js';
import { buildPoseClip } from './sceneHumanClips.js';
import { terrainHeight } from './elahTerrain.js';
import mixamoClips from './elahMixamoClips.json' with { type: 'json' };

import { ELAH_CAST } from './elahDimensions.js';
export { ELAH_CAST } from './elahDimensions.js';

export function createElahPrincipals(THREE, root, { quality = 'high', reducedMotion = false, sun = null } = {}) {
  const group = new THREE.Group(); group.name = 'elah-principals'; root.add(group);
  const actors = new Map(); const resources = new Set(); let disposed = false; let elapsed = 0;
  const own = (v) => { resources.add(v); return v; };
  const material = (color, metalness = 0, roughness = .8) => own(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const wood = material(0x503720); const leather = material(0x483022);
  const cord = material(0x907754); const bronze = material(0x8f6334, .85, .45); const iron = material(0x555a5e, .85, .37);
  // A small sky/earth reflection probe gives bronze an environment to reflect.
  // AmbientLight alone does not illuminate the specular component of a metal.
  const faceSize = 32;
  const faces = Array.from({ length: 6 }, (_, face) => {
    const pixels = new Uint8Array(faceSize * faceSize * 4);
    for (let y = 0; y < faceSize; y++) for (let x = 0; x < faceSize; x++) {
      const vertical = face === 2 ? 1 : face === 3 ? -1 : 1 - 2 * y / (faceSize - 1);
      const t = (vertical + 1) / 2; const i = (y * faceSize + x) * 4;
      pixels[i] = 137 + t * 32; pixels[i + 1] = 116 + t * 72; pixels[i + 2] = 87 + t * 127; pixels[i + 3] = 255;
    }
    return own(new THREE.DataTexture(pixels, faceSize, faceSize));
  });
  const environment = own(new THREE.CubeTexture(faces));
  environment.colorSpace = THREE.SRGBColorSpace; environment.needsUpdate = true;
  bronze.envMap = environment; bronze.envMapIntensity = 2.1;
  iron.envMap = environment; iron.envMapIntensity = 1.8;
  const gripPoint = new THREE.Vector3(); const fingerPoint = new THREE.Vector3();
  const mesh = (geometry, mat, parent, position = [0, 0, 0]) => {
    const obj = new THREE.Mesh(own(geometry), mat); obj.position.fromArray(position);
    obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  };
  const curve = (points, radius, mat, parent) => mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 32, radius, 7, false), mat, parent);
  function pole(length, radius, spear = false) {
    const prop = new THREE.Group();
    mesh(new THREE.CylinderGeometry(radius * .88, radius, length, 12), wood, prop, [0, length * .5 - .85, 0]);
    if (spear) {
      const shape = new THREE.Shape(); shape.moveTo(0, .5); shape.lineTo(.067, .12); shape.lineTo(.018, 0); shape.lineTo(-.018, 0); shape.lineTo(-.067, .12); shape.closePath();
      const head = mesh(new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: true, bevelThickness: .007, bevelSize: .005, bevelSegments: 1, steps: 1 }), iron, prop, [0, length - .85, -.009]);
      head.name = 'iron-spearhead';
      for (let i = 0; i < 8; i++) mesh(new THREE.TorusGeometry(radius * 1.08, .003, 5, 12), cord, prop, [0, length - .85 - i * .012, 0]).rotation.x = Math.PI / 2;
    }
    return prop;
  }
  function sling() {
    const prop = new THREE.Group(); prop.name = 'woven-sling';
    curve([[0, 0, 0], [-.03, -.18, .01], [-.035, -.38, .015], [0, -.52, .01]], .006, cord, prop);
    curve([[.012, 0, 0], [.048, -.20, 0], [.04, -.40, .01], [0, -.52, .01]], .006, cord, prop);
    const pouch = mesh(new THREE.SphereGeometry(1, 16, 10), leather, prop, [0, -.50, .01]); pouch.scale.set(.04, .065, .018);
    const loop = mesh(new THREE.TorusGeometry(.015, .0035, 6, 16), cord, prop); loop.rotation.x = Math.PI / 2;
    return prop;
  }
  function shield() {
    const prop = new THREE.Group(); prop.name = 'shield-bearer-shield';
    // Wood/leather shield with a bronze rim and central boss; its exact outline
    // is an art choice, unlike the scriptural presence of a separate bearer.
    const face = mesh(new THREE.CylinderGeometry(.52, .52, .048, 40), leather, prop, [0, 0, .09]); face.rotation.x = Math.PI / 2; face.scale.y = 1;
    const rim = mesh(new THREE.TorusGeometry(.52, .021, 8, 48), bronze, prop, [0, 0, .12]); rim.scale.y = 1.18; face.scale.z = 1.18;
    const boss = mesh(new THREE.SphereGeometry(.11, 20, 12), bronze, prop, [0, 0, .14]); boss.scale.z = .5;
    for (let i = 0; i < 12; i++) {
      const t = i * Math.PI / 6;
      mesh(new THREE.SphereGeometry(.012, 8, 6), bronze, prop, [Math.cos(t) * .47, Math.sin(t) * .47 * 1.18, .13]);
    }
    return prop;
  }
  function addProp(actor, prop, hand, upright = true) {
    actor.container.add(prop); actor.props.push({ object: prop, hand, upright }); return prop;
  }
  function sample(id, t) {
    const breath = Math.sin(t * Math.PI / 3) * .3;
    if (id === 'david') return { spineLean: breath, headPitch: -4,
      left: { armFlex: 6, armAbduct: 12, foreArmFlex: 55, foreArmAbduct: 12 },
      right: { armFlex: 0, armAbduct: 8, foreArmFlex: 12 }, fingerCurl: 52 };
    if (id === 'goliath') return { spineLean: breath, headPitch: 7,
      left: { armFlex: 5, armAbduct: 21, foreArmFlex: 72, foreArmAbduct: 24 },
      right: { armFlex: 0, armAbduct: 10, foreArmFlex: 6 }, fingerCurl: 59 };
    return { spineLean: breath, left: { armFlex: 20, armAbduct: 5, foreArmFlex: 84, foreArmAbduct: -13 },
      right: { armFlex: 3, armAbduct: 8, foreArmFlex: 12 }, fingerCurl: 55 };
  }
  function setQuality(profile) {
    quality = typeof profile === 'string' ? profile : profile?.name || quality;
    for (const actor of actors.values()) actor.model.traverse((node) => {
      if (!node.isMesh) return;
      node.visible = node.name.includes('_LOD1') ? quality === 'low' : !node.name.includes('_LOD0') || quality !== 'low';
      node.castShadow = quality !== 'low';
    });
  }
  function acceptAssets(assetGroup) {
    if (disposed) return;
    for (const entry of ELAH_CAST) {
      if (actors.has(entry.id)) continue;
      const gltf = assetGroup?.models?.[`human-${entry.id}`];
      if (!gltf?.scene?.getObjectByName('mixamorigHips')) continue;
      const physical = gltf.scene.getObjectByName('PhysicalHeight');
      if (Math.abs((physical?.userData.bodyHeightMeters || 0) - entry.height) > .001) continue;
      const model = cloneSkinnedMesh(gltf.scene); model.name = `${entry.id}-anatomical-model`;
      // Preserve exported PBR metallic values (shared villager preparation zeros them).
      model.traverse((node) => {
        if (node.isMesh) {
          node.receiveShadow = true; node.frustumCulled = false;
          if (node.material?.metalness > .5) {
            // These material clones belong to this tableau, like the probe.
            node.material = own(node.material.clone());
            node.material.envMap = environment; node.material.envMapIntensity = 2.1;
          }
        }
      });
      const motion = !reducedMotion && mixamoClips[entry.id];
      const clip = motion ? THREE.AnimationClip.parse(motion.clip)
        : buildPoseClip(THREE, model, `${entry.id}-standoff`, 6, (t) => sample(entry.id, t));
      const container = new THREE.Group(); container.name = `principal-${entry.id}`;
      container.position.set(entry.x, terrainHeight(entry.x, entry.z), entry.z);
      container.rotation.y = Math.atan2(entry.target[0] - entry.x, entry.target[1] - entry.z);
      container.add(model); group.add(container);
      const mixer = new THREE.AnimationMixer(model); if (clip) mixer.clipAction(clip).play();
      const actor = { ...entry, container, model, mixer, clip, motionSource: motion?.title || null, props: [], bodyProps: [] }; actors.set(entry.id, actor);
      if (entry.id === 'david') {
        const staff = pole(1.65, .014); staff.name = 'shepherd-staff';
        if (motion) {
          // Both hands participate in the captured guard. Plant the staff
          // beside David rather than sweeping a full pole through his face.
          staff.position.set(.65, .85, -.2); container.add(staff);
        } else addProp(actor, staff, 'Left');
        addProp(actor, sling(), 'Right');
      }
      if (entry.id === 'goliath') {
        const spear = pole(2.65, .03, true); spear.name = 'goliath-spear';
        addProp(actor, spear, 'Left');
        const sword = new THREE.Group(); sword.name = 'sheathed-sword';
        mesh(new THREE.BoxGeometry(.072, .77, .045), leather, sword, [0, -.35, 0]);
        mesh(new THREE.CylinderGeometry(.024, .026, .17, 10), bronze, sword, [0, .12, 0]);
        mesh(new THREE.BoxGeometry(.15, .025, .04), bronze, sword, [0, .03, 0]);
        sword.position.set(-.38, 1.52, -.04); sword.rotation.z = -.18; container.add(sword);
        const javelin = pole(1.8, .014); javelin.position.set(-.14, 1.95, -.22); javelin.rotation.z = -.25; container.add(javelin);
        // Retain the authored placement as a bind-relative offset, then follow
        // the moving torso/pelvis along with the skinned armor.
        container.updateMatrixWorld(true);
        for (const [object, name] of [[sword, 'Hips'], [javelin, 'Spine2']]) {
          const bone = model.getObjectByName(`mixamorig${name}`);
          const offset = bone.matrixWorld.clone().invert().multiply(object.matrixWorld);
          actor.bodyProps.push({ object, bone, offset });
        }
      }
      if (entry.id === 'shield-bearer') addProp(actor, shield(), 'Left');
    }
    setQuality(quality); update(elapsed);
  }
  function update(time) {
    if (disposed) return;
    elapsed = reducedMotion ? 0 : time;
    const daylight = sun ? Math.min(1.2, sun.intensity / 2.6) : 1;
    for (const resource of resources) if (resource.isMaterial && resource.envMap) resource.envMapIntensity = 2.1 * daylight;
    for (const actor of actors.values()) {
      actor.mixer.setTime(elapsed); actor.container.updateMatrixWorld(true);
      for (const { object, bone, offset } of actor.bodyProps) {
        const local = actor.container.matrixWorld.clone().invert().multiply(bone.matrixWorld).multiply(offset);
        local.decompose(object.position, object.quaternion, object.scale);
      }
      for (const prop of actor.props) {
        const hand = actor.model.getObjectByName(`mixamorig${prop.hand}Hand`);
        const finger = actor.model.getObjectByName(`mixamorig${prop.hand}HandMiddle1`);
        hand.getWorldPosition(gripPoint);
        if (finger) { finger.getWorldPosition(fingerPoint); gripPoint.lerp(fingerPoint, .65); }
        actor.container.worldToLocal(gripPoint); prop.object.position.copy(gripPoint);
      }
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.model);
      actor.model.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    }
    skeletons.forEach((s) => s.dispose()); resources.forEach((r) => r.dispose());
    root.remove(group); actors.clear();
  }
  return { group, acceptAssets, update, setQuality, dispose, getActors: () => actors, isReady: () => actors.size === ELAH_CAST.length };
}
