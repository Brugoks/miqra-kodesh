// Cloth fitted to the real rig, shared by skeletal and instanced people.
// The skull's extent in the model's rest pose, from the head and hair
// vertices above the jaw — what a head cloth or a veil is fitted over.
export function measureSkull(THREE, root) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity; let top = -Infinity;
  const head = root.getObjectByName('mixamorigHead') || root.getObjectByName('mixamorig:Head');
  const jaw = head ? head.getWorldPosition(new THREE.Vector3()).y - 0.025 : 1.5;
  const point = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.geometry.attributes.skinIndex || !node.geometry.attributes.skinWeight || !node.name.endsWith('_LOD1') || !/^Skin(_|long|short)/.test(node.name)) return;
    const count = node.geometry.attributes.position.count;
    for (let i = 0; i < count; i += 1) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      if (point.y < jaw) continue;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      top = Math.max(top, point.y);
    }
  });
  if (!Number.isFinite(top)) return { centre: [0, 1.6, 0.02], radii: [0.1, 0.12, 0.11], jaw };
  return {
    centre: [(minX + maxX) / 2, (jaw + top) / 2, (minZ + maxZ) / 2],
    radii: [(maxX - minX) / 2, (top - jaw) / 2, (maxZ - minZ) / 2],
    jaw,
    top,
  };
}

// The shape of what is worn on the head, in the model's rest pose: a shell a
// little larger than the skull, tipped back so the brow shows. `kind` is
// 'cloth' (a man's head cloth, to the nape) or 'veil' (a woman's, over the
// head and down onto the shoulders). Returns the shell and, per vertex, how
// much of it should follow the shoulders rather than the head — a veil falls
// with the upper spine; a cloth moves with the head alone.
export function shapeHeadwear(THREE, skull, kind) {
  const { centre, radii } = skull;
  const veil = kind === 'veil';
  const shell = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * (veil ? 0.78 : 0.6));
  const position = shell.attributes.position;
  const count = position.count;
  const spineWeight = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    v.fromBufferAttribute(position, i);
    const below = Math.max(0, -v.y);
    let x = v.x * (radii[0] + 0.02);
    let y = v.y * (radii[1] + 0.025);
    let z = v.z * (radii[2] + 0.025) - 0.01;
    if (veil) {
      // Drawn down and out from the widest point of the head over the neck
      // and onto the shoulders, longer behind than in front.
      y -= below * (z < 0 ? 0.32 : 0.2);
      x *= 1 + below * 1.6;
      z *= 1 + below * 0.9;
    } else if (z < 0) {
      // A man's cloth falls to the nape at the back.
      y -= below * 0.08;
    }
    // A cloth falls down the sides and back, never across the face like a helmet.
    const front = Math.max(0, v.z);
    if (front > 0.35) y = Math.max(y, (front - 0.35) * radii[1] * 0.7);
    // Broad folds and an uneven hem keep the outline from reading as a sphere.
    const fold = Math.sin(Math.atan2(v.z, v.x) * 9) * 0.006 * (1 - Math.max(0, v.y));
    x += Math.sign(x) * fold;
    z += Math.sign(z) * fold;
    v.set(centre[0] + x, centre[1] + y, centre[2] + z);
    position.setXYZ(i, v.x, v.y, v.z);
    // Near the head it moves with the head; lower down, with the shoulders.
    spineWeight[i] = veil ? Math.min(1, Math.max(0, (centre[1] - 0.06 - v.y) / 0.2)) : 0;
  }
  return { shell, spineWeight };
}

// What is worn on the head, as a skinned part of the baked model: the shape
// above, carried into the geometry's own authored space through the
// rest-pose transform of the bones it follows, so the baked matrices move it
// exactly as they move the head beneath it.
export function headwearGeometry(THREE, bake, kind) {
  const { shell, spineWeight } = shapeHeadwear(THREE, bake.skull, kind);
  const position = shell.attributes.position;
  const count = position.count;
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const rest = (bone) => new THREE.Matrix4().fromArray(bake.data, (bake.restRow * bake.width + bone * 4) * 4);
  const spineBone = bake.bones.spine >= 0 ? bake.bones.spine : bake.bones.head;
  const headInverse = rest(bake.bones.head).invert();
  const spineInverse = rest(spineBone).invert();
  const local = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const toSpine = spineWeight[i];
    skinIndex.set([bake.bones.head, spineBone, 0, 0], i * 4);
    skinWeight.set([1 - toSpine, toSpine, 0, 0], i * 4);
    // Into the geometry's authored space. The head and the spine agree on it
    // in the rest pose (the rest pose is the bind), so either inverse serves.
    local.fromBufferAttribute(position, i).applyMatrix4(toSpine > 0.5 ? spineInverse : headInverse);
    position.setXYZ(i, local.x, local.y, local.z);
  }
  shell.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  shell.computeVertexNormals();
  return shell;
}


// A lightweight rest descriptor; near actors do not need an animation bake.
export function wardrobeRig(THREE, root) {
  root.updateMatrixWorld(true);
  let mesh;
  root.traverse((node) => { if (!mesh && node.isSkinnedMesh) mesh = node; });
  if (!mesh || !mesh.geometry.attributes.skinWeight || !mesh.geometry.attributes.skinIndex) return null;
  const bones = mesh.skeleton.bones;
  const pre = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
  const data = new Float32Array(bones.length * 16);
  bones.forEach((bone, i) => {
    const m = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[i]);
    m.premultiply(pre).multiply(mesh.bindMatrix);
    data.set(m.elements, i * 16);
  });
  return {
    root, mesh, data, width: bones.length * 4, restRow: 0,
    bones: Object.fromEntries(['Head', 'Spine2', 'Hips'].map((name) => [
      { Head: 'head', Spine2: 'spine', Hips: 'hips' }[name],
      bones.findIndex((bone) => bone.name.replace(':', '') === `mixamorig${name}`),
    ])),
    skull: measureSkull(THREE, root),
  };
}

export function sashGeometry(THREE, bake) {
  const hip = bake.root.getObjectByName('mixamorigHips') || bake.root.getObjectByName('mixamorig:Hips');
  if (!hip) return null;
  const centre = hip.getWorldPosition(new THREE.Vector3());
  const hipIndex = bake.bones.hips ?? (() => {
    let index = -1;
    bake.root.traverse((n) => { if (n.isSkinnedMesh) index = n.skeleton.bones.indexOf(hip); });
    return index;
  })();
  if (hipIndex < 0) return null;
  // Fit to the tunic, not an assumed cylinder through the abdomen.
  let rx = 0.14; let rz = 0.10;
  const point = new THREE.Vector3();
  bake.root.traverse((node) => {
    if (!node.isSkinnedMesh || !/tunic|skirt/i.test(node.name) || !node.name.endsWith('_LOD1')) return;
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      if (Math.abs(point.y - centre.y) > 0.09) continue;
      rx = Math.max(rx, Math.abs(point.x - centre.x));
      rz = Math.max(rz, Math.abs(point.z - centre.z));
    }
  });
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 48, 4, true);
  const position = geometry.attributes.position;
  const indices = new Float32Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  const inverse = new THREE.Matrix4().fromArray(bake.data, (bake.restRow * bake.width + hipIndex * 4) * 4).invert();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const angle = Math.atan2(point.z, point.x);
    const fold = 0.003 * Math.cos(point.y * 32 + angle * 2);
    point.set(centre.x + point.x * (rx + 0.012 + fold), centre.y + point.y * 0.095 + 0.008 * Math.sin(angle),
      centre.z + point.z * (rz + 0.012 + fold));
    point.applyMatrix4(inverse);
    position.setXYZ(i, point.x, point.y, point.z);
    indices[i * 4] = hipIndex;
    weights[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  geometry.computeVertexNormals();
  return geometry;
}

export function attachWardrobe(THREE, root, appearance) {
  const resources = [];
  if (appearance.ceremonial) return resources;
  const rig = wardrobeRig(THREE, root);
  if (!rig || rig.bones.head < 0) return resources;
  const specs = [];
  if (appearance.headwear) specs.push(['headwrap', headwearGeometry(THREE, rig, appearance.headwear), appearance.wrap]);
  // Existing camp tunics already have a fitted sash.
  let hasSash = false;
  root.traverse((node) => { if (node.isMesh && /sash/i.test(node.name)) hasSash = true; });
  if (appearance.sashWorn && !hasSash) specs.push(['waist-wrap', sashGeometry(THREE, rig), appearance.sash]);
  if (appearance.shoulderWrap) specs.push(['shoulder-wrap', shoulderWrapGeometry(THREE, rig), appearance.wrap]);
  for (const [name, geometry, color] of specs) {
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.94, side: THREE.DoubleSide });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name;
    // Our geometry is in the donor mesh's authored space.
    mesh.position.copy(rig.mesh.position); mesh.quaternion.copy(rig.mesh.quaternion); mesh.scale.copy(rig.mesh.scale);
    mesh.bind(rig.mesh.skeleton, rig.mesh.bindMatrix);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    rig.mesh.parent.add(mesh);
    resources.push(geometry, material);
  }
  return resources;
}

// An open rectangular shoulder wrap. Fitted against the actual tunic surface,
// with a smooth pelvis-to-spine blend so it follows the existing skeletal clips.
// This is skeletal cloth, not a fabric simulation.
export function shoulderWrapGeometry(THREE, bake) {
  const hip = bake.root.getObjectByName('mixamorigHips');
  const neck = bake.root.getObjectByName('mixamorigNeck');
  if (!hip || !neck) return null;
  const hips = hip.getWorldPosition(new THREE.Vector3());
  const shoulders = neck.getWorldPosition(new THREE.Vector3());
  const samples = [];
  const point = new THREE.Vector3();
  bake.root.traverse((node) => {
    if (!node.isSkinnedMesh || !/tunic/i.test(node.name) || !node.name.endsWith('_LOD1')) return;
    const { position, skinIndex, skinWeight } = node.geometry.attributes;
    if (!skinIndex || !skinWeight) return;
    for (let i = 0; i < position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      if (point.y < hips.y - 0.25 || point.y > shoulders.y + 0.06) continue;
      samples.push({ point: point.clone() });
    }
  });
  if (!samples.length) return null;
  const positions = [], indices = [], weights = [], uv = [], faces = [];
  const rows = 20, cols = 8;
  const boneMatrix = (i) => new THREE.Matrix4().fromArray(bake.data, (bake.restRow * bake.width + i * 4) * 4);
  const spineIndex = bake.bones.spine;
  let hipIndex = -1;
  bake.root.traverse((node) => { if (node.isSkinnedMesh) hipIndex = node.skeleton.bones.indexOf(hip); });
  if (hipIndex < 0 || spineIndex < 0) return null;
  const radii = Array.from({ length: rows + 1 }, (_, row) => {
    const y = shoulders.y - 0.025 - row / rows * (shoulders.y - hips.y + 0.16);
    const band = samples.filter((s) => Math.abs(s.point.y - y) < 0.065 && Math.abs(s.point.x) < 0.28);
    return { y, x: Math.max(0.17, ...band.map((s) => Math.abs(s.point.x))),
      front: Math.max(0.075, ...band.map((s) => s.point.z - hips.z)),
      back: Math.max(0.075, ...band.map((s) => hips.z - s.point.z)) };
  });
  for (const side of [1, -1]) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const { y } = radii[row];
      const neighbours = radii.slice(Math.max(0, row - 2), Math.min(rows + 1, row + 3));
      const rx = neighbours.reduce((n, r) => n + r.x, 0) / neighbours.length;
      const rz = neighbours.reduce((n, r) => n + r[side > 0 ? 'front' : 'back'], 0) / neighbours.length;
      const width = 0.13 + Math.sin(Math.PI * t * 0.65) * 0.13;
      const cx = 0.13 - t * 0.16;
      const toSpine = Math.min(1, Math.max(0, (y - hips.y) / (shoulders.y - hips.y - 0.1)));
      const jointIndices = [spineIndex, hipIndex, 0, 0], jointWeights = [toSpine, 1 - toSpine, 0, 0];
      const matrix = new THREE.Matrix4(); matrix.elements.fill(0);
      jointIndices.forEach((bone, j) => {
        if (!jointWeights[j]) return;
        boneMatrix(bone).elements.forEach((v, k) => { matrix.elements[k] += v * jointWeights[j]; });
      });
      matrix.invert();
      for (let col = 0; col <= cols; col++) {
        const u = col / cols;
        const x = cx + (u - 0.5) * width;
        const fold = 0.006 * Math.cos(u * Math.PI * 6) * Math.sin(t * Math.PI / 2);
        const z = hips.z + side * (rz * Math.sqrt(Math.max(0.25, 1 - (x / (rx + 0.05)) ** 2)) + 0.025 + t * 0.035 + fold);
        point.set(x, y + 0.006 * Math.sin(u * Math.PI * 2), z).applyMatrix4(matrix);
        positions.push(point.x, point.y, point.z); indices.push(...jointIndices); weights.push(...jointWeights); uv.push(u, t);
        if (row < rows && col < cols) {
          const a = start + row * (cols + 1) + col, b = a + cols + 1;
          if (side > 0) faces.push(a, b, a + 1, a + 1, b, b + 1);
          else faces.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
  }
  // Join front and back over the shoulder: one cloth, not two loose panels.
  const backStart = (rows + 1) * (cols + 1);
  for (let col = 0; col < cols; col++) faces.push(col, col + 1, backStart + col, col + 1, backStart + col + 1, backStart + col);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Float32BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(faces); geometry.computeVertexNormals();
  return geometry;
}
