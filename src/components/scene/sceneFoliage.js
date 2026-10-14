// Open, leafy crowns for the scenes' few hero trees: the olives of Gethsemane,
// the terebinths of the Valley of Elah. A solid lump of a crown reads as a
// bush from ten metres away; sprays of real leaves with sky between them read
// as a tree. Every crown shares one instanced draw call (plus one for the
// inner cores), the wind moves on the GPU, and `update(time)` is the only
// per-frame work. Pass a frozen time for reduced motion.
//
// This is for dozens of trees, not thousands: 500 sprays a tree is the point.
// The big groves keep their cheap crowns (sceneLandscape.js oliveTreeGeometry).
const KINDS = {
  // Narrow, pointed, silver-green: the olive's leaf.
  olive: {
    leaves: 8, length: 0.28, width: 0.064, lift: 0.06, spray: 0.22,
    colors: [0x758268, 0x929980, 0x586c4a, 0xa2a58c], core: 0x4d5a42,
    reach: 2.55, depth: 2.1, flatten: 0.88,
  },
  // Broader leaflets in a looser, darker crown: terebinth and oak country.
  terebinth: {
    leaves: 6, length: 0.34, width: 0.13, lift: 0.1, spray: 0.26,
    colors: [0x4f6238, 0x62743f, 0x3f5230, 0x74814a], core: 0x34452a,
    reach: 2.3, depth: 1.9, flatten: 0.9,
  },
};

function spray(THREE, { leaves, length, width, lift, spray: radius }) {
  const positions = [];
  const half = length / 2;
  for (let i = 0; i < leaves; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y = (i % 3) * 0.06;
    const dx = Math.cos(angle) * half, dz = Math.sin(angle) * half;
    const sx = -Math.sin(angle) * (width / 2), sz = Math.cos(angle) * (width / 2);
    positions.push(x - dx, y, z - dz, x + sx, y + width * 0.28, z + sz, x + dx, y + lift, z + dz,
      x - dx, y, z - dz, x + dx, y + lift, z + dz, x - sx, y + width * 0.28, z - sz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createLeafCrowns(THREE, {
  trees, groundAt = () => 0, low = false, random, kind = 'olive', name = 'leaf-crowns',
  // Sprays per tree: a full crown on a laptop, a thin one on a phone.
  density = low ? 240 : 520,
  // A darker, smaller lump inside each crown so the gaps between sprays open
  // onto leaves rather than onto the trunk's far side.
  core = true,
  castShadow = !low,
}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`unknown leaf kind: ${kind}`);
  const clock = { value: 0 };
  const wind = (shader) => {
    shader.uniforms.leafTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float leafTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 centre=instanceMatrix[3].xyz;
        float breeze=sin(leafTime*.8+centre.x*.31+centre.z*.23)*.055
          +sin(leafTime*1.9+centre.y*2.)*.016;
        transformed.x+=breeze;
        transformed.z+=breeze*.4;`);
  };
  const geometry = spray(THREE, spec);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.92 });
  material.onBeforeCompile = wind;
  material.customProgramCacheKey = () => 'leaf-crowns-wind-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = wind;
  depth.customProgramCacheKey = () => 'leaf-crowns-depth-v1';

  const total = trees.length * density;
  const leaves = new THREE.InstancedMesh(geometry, material, total);
  leaves.name = name;
  leaves.castShadow = castShadow;
  leaves.receiveShadow = true;
  leaves.customDepthMaterial = depth;
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  let n = 0;
  for (const tree of trees) {
    const scale = tree.scale ?? 1, reach = spec.reach * scale, depthY = spec.depth * scale;
    const cy = (tree.y ?? groundAt(tree.x, tree.z)) + tree.height;
    for (let i = 0; i < density; i++) {
      const a = random() * Math.PI * 2, radius = Math.sqrt(random()) * reach;
      const y = (random() - 0.5) * depthY * Math.sqrt(Math.max(0, 1 - (radius / (reach * 1.06)) ** 2));
      dummy.position.set(tree.x + Math.cos(a) * radius, cy + y, tree.z + Math.sin(a) * radius * spec.flatten);
      dummy.rotation.set((random() - 0.5) * 1.6, random() * 6.28, (random() - 0.5) * 1.6);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(n, dummy.matrix);
      leaves.setColorAt(n, tint.setHex(spec.colors[i % spec.colors.length]));
      n++;
    }
  }
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  // The sprays are scattered around each trunk; one sphere over all of them.
  leaves.computeBoundingSphere();

  let cores = null, coreGeometry = null, coreMaterial = null;
  if (core && trees.length) {
    coreGeometry = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
    coreMaterial = new THREE.MeshStandardMaterial({ color: spec.core, roughness: 1, flatShading: true });
    cores = new THREE.InstancedMesh(coreGeometry, coreMaterial, trees.length);
    cores.name = `${name}-cores`;
    cores.castShadow = castShadow;
    cores.receiveShadow = true;
    trees.forEach((tree, i) => {
      const scale = tree.scale ?? 1;
      dummy.position.set(tree.x, (tree.y ?? groundAt(tree.x, tree.z)) + tree.height, tree.z);
      dummy.rotation.set(0, random() * 6.28, 0);
      dummy.scale.set(spec.reach * 0.62 * scale, spec.depth * 0.34 * scale, spec.reach * 0.55 * scale);
      dummy.updateMatrix();
      cores.setMatrixAt(i, dummy.matrix);
    });
    cores.instanceMatrix.needsUpdate = true;
    cores.computeBoundingSphere();
  }

  return {
    leaves,
    cores,
    count: total,
    meshes: [leaves, cores].filter(Boolean),
    update: (time) => { clock.value = time; },
    dispose() {
      geometry.dispose();
      material.dispose();
      depth.dispose();
      coreGeometry?.dispose();
      coreMaterial?.dispose();
      leaves.dispose();
      cores?.dispose();
    },
  };
}
