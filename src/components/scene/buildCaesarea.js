import { GROUND, BUILDINGS, COLUMNS, PALMS, CARGO } from './caesareaDimensions';

// Entirely procedural: geometry, masonry and sea, with no network assets.
// Compact interpretive composition, not a metrically surveyed ancient city.
export default function buildCaesarea(THREE, { quality = 'high', reducedMotion = false } = {}) {
  const low = quality === 'low';
  const root = new THREE.Group();
  root.name = 'caesarea';
  const materials = new Set(), geometries = new Set();
  const standard = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    materials.add(m); return m;
  };
  const stone = standard(0xd8b88b), trim = standard(0xf1dbb2), dark = standard(0x483c35);
  const terracotta = standard(0xa7684b), wood = standard(0x64442c), rope = standard(0xa3906b);
  const green = standard(0x657347, { side: THREE.DoubleSide });
  const plaster = standard(0xe5cfaa), bronze = standard(0xa1834d, { metalness: 0.55, roughness: 0.4 });
  // World-space masonry keeps block scale constant across differently sized buildings.
  stone.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 stonePosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          stonePosition = instanceMatrix * stonePosition;
        #endif
        vStone = (modelMatrix * stonePosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 nn = abs(normalize(cross(dFdx(vStone),dFdy(vStone))));
        vec2 uv = nn.x > nn.z ? vStone.zy : vStone.xy;
        float row = floor(uv.y / 0.52);
        vec2 block = vec2(uv.x / 1.3 + mod(row,2.0)*0.5, uv.y/0.52);
        vec2 seam = min(fract(block),1.0-fract(block));
        float mortar = 1.0-smoothstep(0.012,0.035,min(seam.x,seam.y));
        float grain = fract(sin(dot(floor(block),vec2(12.9898,78.233)))*43758.5453);
        diffuseColor.rgb *= (0.91+grain*0.16)*(1.0-mortar*0.18);`);
  };
  stone.customProgramCacheKey = () => 'caesarea-masonry-v1';
  const add = (geometry, material, x, y, z, parent = root, name = '') => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.name = name;
    mesh.castShadow = !low; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const box = (w, h, d, material, x, y, z, parent = root, name = '') =>
    add(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent, name);
  const rod = (a, b, radius, material, parent = root) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const delta = to.clone().sub(from);
    const m = add(new THREE.CylinderGeometry(radius, radius, delta.length(), low ? 5 : 8), material, ...from.clone().add(to).multiplyScalar(0.5).toArray(), parent);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return m;
  };
  const instances = (geometry, material, transforms, name) => {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name; const dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p); dummy.scale.set(...(t.s || [1, 1, 1]));
      dummy.rotation.set(0, t.r || 0, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = !low; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };

  root.add(new THREE.HemisphereLight(0xb8d7df, 0x94744f, 2.0));
  const sun = new THREE.DirectionalLight(0xffdab0, 3.1);
  sun.position.set(-100, 65, -65); sun.target.position.set(25, 0, 10);
  if (!low) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 140, bottom: -140, near: 1, far: 350 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.08;
  }
  root.add(sun, sun.target);
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 vDir; void main(){
      vec3 d=normalize(vDir); float h=smoothstep(-0.03,0.65,d.y);
      vec3 c=mix(vec3(0.94,0.72,0.47),vec3(0.22,0.48,0.65),h);
      float s=max(dot(d,normalize(vec3(-100.0,65.0,-65.0))),0.0);
      c+=vec3(1.0,0.6,0.23)*pow(s,45.0)*0.3+vec3(1.0,0.9,0.65)*pow(s,1800.0)*2.0;
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  materials.add(skyMat);
  const sky = add(new THREE.SphereGeometry(1600, 32, 16), skyMat, 0, 0, 0);
  sky.castShadow = false; sky.receiveShadow = false;

  box(110, 4, 210, stone, 55, 0, 5, root, 'district-ground');
  // Thin contrasting paving courses, instanced rather than thousands of draws.
  const pavers = [];
  for (let z = -98; z < 110; z += 3.5) {
    pavers.push({ p: [9, GROUND + 0.008, z], s: [17, 0.018, 0.07] });
    pavers.push({ p: [30, GROUND + 0.008, z], s: [18, 0.018, 0.07] });
  }
  instances(new THREE.BoxGeometry(1, 1, 1), trim, pavers, 'paving-courses');
  // Quay coping sits flush with the walk surface, so it adds no unseen obstacle.
  box(0.65, 0.3, 210, trim, 0.325, 1.85, 5);
  for (const b of BUILDINGS) {
    const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    box(w, b.height, d, stone, x, GROUND + b.height / 2, z, root, b.id);
    box(w + 0.5, 0.45, d + 0.5, trim, x, GROUND + b.height, z);
    box(w - 1, 0.3, d - 1, terracotta, x, GROUND + b.height + 0.35, z);
    // Recessed-looking doors and lintels on the west face, within solid bounds.
    for (let zz = b.z0 + 4; zz < b.z1 - 2; zz += 7) {
      box(0.035, 3.1, 2, dark, b.x0 - 0.02, 3.55, zz);
      box(0.2, 0.35, 2.5, trim, b.x0 - 0.05, 5.2, zz);
      if (b.height > 7) box(0.04, 1.7, 1.2, dark, b.x0 - 0.025, 10.5, zz);
    }
  }
  // Colonnade columns share exact positions and radius with the navigation.
  instances(new THREE.CylinderGeometry(0.52, 0.65, 7, low ? 8 : 14), trim,
    COLUMNS.map(c => ({ p: [c.x, GROUND + 3.5, c.z] })), 'colonnade-shafts');
  instances(new THREE.CylinderGeometry(0.82, 0.82, 0.32, 12), stone,
    COLUMNS.flatMap(c => [{ p: [c.x, GROUND + 0.16, c.z] }, { p: [c.x, GROUND + 6.9, c.z] }]), 'column-capitals');
  for (const x of [23, 37]) {
    box(1.7, 0.8, 87, trim, x, 9.25, 3);
    box(1.9, 0.25, 88, terracotta, x, 9.77, 3);
  }
  box(16.4, 0.36, 87, wood, 30, 9.7, 3);
  box(17, 0.25, 88, terracotta, 30, 10, 3);
  for (let z = -38; z <= 45; z += 7) box(15, 0.28, 0.28, wood, 30, 9.4, z);
  // Palace upper pilasters and pediment: decorative, all above walking height.
  for (let z = -85; z < -55; z += 5) box(0.7, 10, 0.8, trim, 23.9, 8, z);
  box(1, 0.8, 37, trim, 23.8, 14, -71);
  const ped = new THREE.Shape(); ped.moveTo(-11, 0); ped.lineTo(0, 4); ped.lineTo(11, 0); ped.closePath();
  const pediment = add(new THREE.ExtrudeGeometry(ped, { depth: 0.6, bevelEnabled: false }), trim, 23.5, 15, -71);
  pediment.rotation.y = -Math.PI / 2;
  box(0.1, 1.2, 3, bronze, 23.45, 11, -71);

  for (const c of CARGO) {
    box(c.w, c.h, c.d, wood, c.x, GROUND + c.h / 2, c.z);
    for (const dz of [-c.d * 0.32, c.d * 0.32]) box(c.w + 0.02, 0.1, 0.12, rope, c.x, GROUND + c.h, c.z + dz);
  }
  for (const p of PALMS) {
    add(new THREE.CylinderGeometry(0.23, 0.55, 8, 8), wood, p.x, 6, p.z);
    for (let k = 0; k < (low ? 7 : 10); k += 1) {
      const a = k * Math.PI * 2 / (low ? 7 : 10);
      const pts = [], inds = [];
      for (let j = 0; j <= 7; j += 1) {
        const t = j / 7, length = 5.2 * t, width = Math.sin(t * Math.PI) * 0.65;
        for (const side of [-1, 1]) pts.push(Math.cos(a) * length + Math.sin(a) * width * side, 1.5 * Math.sin(t * Math.PI) - 1.6 * t, Math.sin(a) * length - Math.cos(a) * width * side);
        if (j < 7) { const n = j * 2; inds.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(inds); geo.computeVertexNormals();
      add(geo, green, p.x, 10, p.z);
    }
  }

  // A shaded domestic courtyard is left open between the house wings.
  const awning = standard(0xb58162, { side: THREE.DoubleSide });
  const canopy = add(new THREE.PlaneGeometry(15, 15, 6, 6), awning, 68, 6.4, 75);
  canopy.rotation.x = -Math.PI / 2;
  // The canopy is supported from buildings by cables overhead, not invisible posts.
  rod([60.5, 6.4, 67.5], [78, 7.8, 50], 0.035, rope);
  rod([60.5, 6.4, 82.5], [60, 8, 91], 0.035, rope);

  const waterMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `uniform float time; varying vec3 vWorld;
      void main(){vec3 p=position;
        p.z+=sin(p.x*0.08+time*0.75)*0.12+sin(p.y*0.13-time*0.9)*0.08;
        vWorld=(modelMatrix*vec4(p,1.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`,
    fragmentShader: `uniform float time; varying vec3 vWorld;
      void main(){vec2 p=vWorld.xz;
        float w=sin(p.x*0.8+p.y*0.3+time)*sin(p.y*1.4-time*0.7);
        vec3 n=normalize(vec3(w*0.13,1.0,cos(p.x*0.5-p.y*0.7+time)*0.12));
        vec3 v=normalize(cameraPosition-vWorld); vec3 l=normalize(vec3(-100.,65.,-65.));
        float fres=pow(1.0-max(dot(n,v),0.0),3.0);
        float shine=pow(max(dot(reflect(-l,n),v),0.0),110.0);
        vec3 c=mix(vec3(0.018,0.19,0.23),vec3(0.25,0.48,0.52),fres);
        c+=w*0.016+shine*vec3(1.5,0.96,0.42);
        float foam=(1.0-smoothstep(0.0,1.8,abs(p.x+0.2)))*smoothstep(0.4,0.8,sin(p.y*2.0+time*1.6));
        c=mix(c,vec3(0.62,0.75,0.67),foam*0.45);
        float haze=smoothstep(180.0,1200.0,length(cameraPosition-vWorld));
        c=mix(c,vec3(0.7,0.65,0.53),haze);
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  materials.add(waterMat);
  const sea = add(new THREE.PlaneGeometry(2400, 2600, low ? 24 : 80, low ? 24 : 80), waterMat, -1100, -0.2, 0, root, 'sea');
  sea.rotation.x = -Math.PI / 2; sea.castShadow = false; sea.receiveShadow = false;
  // Moles are scenery beyond the walkable district, not false accessible paths.
  box(150, 5, 13, stone, -77, -0.5, -39);
  box(14, 5, 142, stone, -147, -0.5, 24);
  box(55, 4.7, 12, stone, -30, -0.5, 126);
  for (let z = -35; z < 100; z += 10) box(15, 0.5, 0.5, trim, -147, 2.2, z);
  box(13, 11, 13, stone, -147, 7, 99);
  box(15, 0.65, 15, trim, -147, 12.7, 99);

  const ships = [];
  const sailMat = standard(0xe7d9b7, { side: THREE.DoubleSide, roughness: 1 });
  const ship = (x, z, scale, angle) => {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); group.rotation.y = angle;
    group.name = 'merchant-ship'; root.add(group);
    // Lofted hull: elliptical cross-sections taper to raised bow and stern.
    const vertices = [], indices = [], sections = 18, ribs = 12;
    for (let i = 0; i <= sections; i += 1) {
      const t = i / sections, taper = Math.pow(Math.sin(Math.PI * t), 0.65);
      for (let j = 0; j <= ribs; j += 1) {
        const a = Math.PI * j / ribs;
        vertices.push(Math.cos(a) * 3.3 * taper, 1.5 - Math.sin(a) * 2.4 * taper + Math.pow(Math.abs(t - 0.5) * 2, 4) * 1.4, (t - 0.5) * 24);
        if (i < sections && j < ribs) { const n = i * (ribs + 1) + j; indices.push(n, n + ribs + 1, n + 1, n + 1, n + ribs + 1, n + ribs + 2); }
      }
    }
    const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); hull.setIndex(indices); hull.computeVertexNormals();
    const hullMat = standard(0x63452d, { side: THREE.DoubleSide });
    add(hull, hullMat, 0, 0, 0, group);
    // Tapered deck follows the same longitudinal footprint.
    const shape = new THREE.Shape();
    for (let i = 0; i <= sections; i += 1) { const t = i / sections; const xx = 3.15 * Math.pow(Math.sin(Math.PI * t), 0.65); if (!i) shape.moveTo(xx, (t - 0.5) * 24); else shape.lineTo(xx, (t - 0.5) * 24); }
    for (let i = sections; i >= 0; i -= 1) { const t = i / sections; shape.lineTo(-3.15 * Math.pow(Math.sin(Math.PI * t), 0.65), (t - 0.5) * 24); }
    const deck = add(new THREE.ShapeGeometry(shape), wood, 0, 1.45, 0, group); deck.rotation.x = -Math.PI / 2;
    rod([0, 1, 0], [0, 17, 0], 0.16, wood, group);
    rod([-7, 14, 0], [7, 14, 0], 0.13, wood, group);
    for (const zz of [-10, 10]) for (const xx of [-2, 2]) rod([0, 16, 0], [xx, 1.5, zz], 0.025, rope, group);
    const sailGeo = new THREE.PlaneGeometry(13, 9, 12, 9);
    const pos = sailGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i), py = pos.getY(i);
      pos.setZ(i, 1.6 * Math.sin((px / 13 + 0.5) * Math.PI) * Math.sin((py / 9 + 0.5) * Math.PI));
    }
    sailGeo.computeVertexNormals();
    add(sailGeo, sailMat, 0, 9.4, 0, group);
    // Visible seams on the square sail are real narrow lines, not image assets.
    for (let xx = -5; xx <= 5; xx += 2.5) rod([xx, 5, 0.02], [xx, 13.8, 0.02], 0.016, rope, group);
    box(3.3, 1.8, 3.5, wood, 0, 2.2, -6, group);
    rod([2.4, 2, -8], [4.5, -0.7, -11], 0.12, wood, group);
    ships.push({ group, phase: ships.length * 1.9 });
  };
  ship(-25, 80, 0.9, -0.25); ship(-69, 29, 1.25, 0.65); ship(-103, 73, 0.8, -0.8);
  if (!low) { ship(-235, 190, 0.8, 0.4); ship(-380, -170, 0.7, 1.1); }
  // A restrained city silhouette beyond the bounded explorable district.
  const skyline = [];
  for (let i = 0; i < (low ? 28 : 60); i += 1) {
    const h = 4 + (i * 7 % 11);
    skyline.push({ p: [128 + (i % 5) * 19, h / 2 + 2, -110 + Math.floor(i / 5) * 24], s: [12 + i % 4, h, 15], r: (i % 3) * 0.03 });
  }
  instances(new THREE.BoxGeometry(1, 1, 1), plaster, skyline, 'distant-city');
  const seabirds = [];
  if (!low) for (let i = 0; i < 7; i += 1) {
    const bird = new THREE.Group(); root.add(bird);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0.2, 0.2, 1, 0, 0, 0, 0, -0.25], 3)); g.setIndex([0, 1, 3, 1, 2, 3]); g.computeVertexNormals();
    add(g, sailMat, 0, 0, 0, bird); seabirds.push(bird);
  }
  function update(elapsed) {
    const t = reducedMotion ? 0 : elapsed;
    waterMat.uniforms.time.value = t;
    ships.forEach(({ group, phase }) => { group.position.y = Math.sin(t * 0.65 + phase) * 0.14; group.rotation.z = Math.sin(t * 0.48 + phase) * 0.014; });
    seabirds.forEach((b, i) => { const a = t * 0.055 + i; b.position.set(-75 + Math.cos(a) * (35 + i * 4), 24 + Math.sin(a * 2) * 3 + i, 46 + Math.sin(a) * 38); b.rotation.y = -a; });
  }
  update(0);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    sun.shadow.map?.dispose();
  }
  return { root, sun, update, dispose, fog: { color: 0xc9b89c, density: 0.0017 } };
}
