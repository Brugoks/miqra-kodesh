// Open, pointed olive leaves replace solid crowns. All trees share one foliage
// draw call; leaf motion is on the GPU and freezes with reduced motion.
export function createOliveFoliage(THREE, { trees, groundAt, low, random, instanced, mat }) {
  const positions = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * 0.22, z = Math.sin(angle) * 0.22;
    const y = (i % 3) * 0.06;
    const dx = Math.cos(angle) * 0.14, dz = Math.sin(angle) * 0.14;
    const sx = -Math.sin(angle) * 0.032, sz = Math.cos(angle) * 0.032;
    positions.push(x - dx, y, z - dz, x + sx, y + 0.018, z + sz, x + dx, y + 0.06, z + dz,
      x - dx, y, z - dz, x + dx, y + 0.06, z + dz, x - sx, y + 0.018, z - sz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = mat(0xffffff, { side: THREE.DoubleSide, roughness: 0.92 });
  const clock = { value: 0 };
  function wind(shader) {
    shader.uniforms.oliveTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float oliveTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 centre=instanceMatrix[3].xyz;
        float breeze=sin(oliveTime*.8+centre.x*.31+centre.z*.23)*.055
          +sin(oliveTime*1.9+centre.y*2.)*.016;
        transformed.x+=breeze;
        transformed.z+=breeze*.4;`);
  }
  material.onBeforeCompile = wind;
  material.customProgramCacheKey = () => 'bethlehem-olive-wind-v1';
  const leaves = [];
  for (const tree of trees) {
    for (let i = 0; i < (low ? 240 : 520); i++) {
      const a = random() * Math.PI * 2, radius = Math.sqrt(random()) * 2.55;
      const y = (random() - 0.5) * 2.1 * Math.sqrt(1 - (radius / 2.7) ** 2);
      leaves.push({
        p: [tree.x + Math.cos(a) * radius, groundAt(tree.x, tree.z) + tree.height + y,
          tree.z + Math.sin(a) * radius * 0.88],
        r: [(random() - 0.5) * 1.6, random() * 6.28, (random() - 0.5) * 1.6],
        s: [1, 1, 1], color: [0x758268, 0x929980, 0x586c4a, 0xa2a58c][i % 4],
      });
    }
  }
  const mesh = instanced(geometry, material, leaves, 'olive-leaves');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = wind;
  depth.customProgramCacheKey = () => 'bethlehem-olive-depth-v1';
  mesh.customDepthMaterial = depth;
  return { update: (time) => { clock.value = time; }, dispose: () => depth.dispose() };
}
