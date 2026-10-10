import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { createProps } from './sceneProps';
import { ROBE_PALETTE } from './sceneFigures';
import { createLivingCrowd } from './sceneLivingCrowd';
import { loadMotionLibrary } from './sceneMixamo';
import { createHerd } from './sceneAnimals';
import { createSinaiEvents } from './sinaiEvents';
import { sinaiSurface } from './sinaiSurface';
import { BOUNDS, SITES, TENTS, CAVE_WALLS, ROCKS, groundAt, pathDistance } from './sinaiDimensions';

export default function buildSinai(
  THREE,
  { quality = 'high', reducedMotion = false, timeOfDay = 'morning', motionLibrary = undefined } = {},
) {
  motionLibrary = motionLibrary === undefined ? loadMotionLibrary().catch(() => null) : motionLibrary;
  const low = quality === 'low',
    root = new THREE.Group();
  root.name = 'sinai';
  const geometries = new Set(),
    materials = new Set(),
    solids = [],
    clearances = [],
    flames = [];
  const cameraColliders = [],
    occluders = [];
  let disposed = false,
    currentEpisode = null,
    hour = resolveTimeOfDay(timeOfDay),
    seed = 285397;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const own = (g) => {
    geometries.add(g);
    return g;
  };
  const mat = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
    materials.add(m);
    return m;
  };
  const rock = sinaiSurface(mat(0xa4816c, { side: THREE.DoubleSide }), { cliff: true });
  const pale = sinaiSurface(mat(0xc7ad8e), { cliff: true });
  const earth = sinaiSurface(mat(0xc6aa83), { paths: true });
  const wood = mat(0x635040),
    cloth = mat(0x51463b, { side: THREE.DoubleSide });
  const linen = mat(0xded2b8, { side: THREE.DoubleSide }),
    blue = mat(0x4d5b70, { side: THREE.DoubleSide });
  const red = mat(0x8c4f3e, { side: THREE.DoubleSide }),
    bronze = mat(0x8d673a, { metalness: 0.65, roughness: 0.38 });
  const gold = mat(0xc69a38, { metalness: 0.8, roughness: 0.27 });
  const fireMat = mat(0xffc56a, {
    emissive: 0xff8b28,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  // Soft billboards avoid faceted, overlapping sphere silhouettes in smoke.
  const cloudPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x - 31.5) / 31.5,
        v = (y - 31.5) / 31.5;
      const falloff = Math.max(0, 1 - Math.hypot(u, v));
      const noise = 0.8 + Math.sin(x * 0.36 + Math.sin(y * 0.27) * 3) * 0.12;
      const offset = (y * 64 + x) * 4;
      cloudPixels[offset] = cloudPixels[offset + 1] = cloudPixels[offset + 2] = 255;
      cloudPixels[offset + 3] = Math.round(falloff * falloff * noise * 255);
    }
  const cloudTexture = new THREE.DataTexture(cloudPixels, 64, 64);
  cloudTexture.needsUpdate = true;
  cloudTexture.magFilter = THREE.LinearFilter;
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: 0x55585d,
    opacity: 0.85,
    depthWrite: false,
  });
  materials.add(cloudMat);
  const vapor = (material, parent, x, y, z, w, h) => {
    const sprite = new THREE.Sprite(material);
    // The AO override material cannot preserve a sprite's alpha silhouette.
    sprite.userData.excludeFromAO = true;
    sprite.position.set(x, y, z);
    sprite.scale.set(w, h, 1);
    parent.add(sprite);
    return sprite;
  };
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const sphere = own(new THREE.IcosahedronGeometry(1, low ? 1 : 2));
  const group = (name) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    return g;
  };
  const mesh = (geometry, material, x, y, z, name = '', parent = root, solid = false) => {
    const m = new THREE.Mesh(own(geometry), material);
    m.position.set(x, y, z);
    m.name = name;
    m.castShadow = !low;
    m.receiveShadow = true;
    parent.add(m);
    if (solid) solids.push(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z, name = '', parent = root, solid = false) => {
    const m = mesh(cube, material, x, y, z, name, parent, solid);
    m.scale.set(w, h, d);
    return m;
  };
  const ellipsoid = (material, x, y, z, sx, sy, sz, parent = root, name = '', solid = false) => {
    const m = mesh(sphere, material, x, y, z, name, parent, solid);
    m.scale.set(sx, sy, sz);
    return m;
  };
  function blockedRect(parent, x, z, w, d, y = groundAt(x, z), height = 3) {
    clearances.push({ parent, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y, height });
  }
  function isVisible(node) {
    for (let p = node; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  function refreshColliders() {
    cameraColliders.length = 0;
    occluders.length = 0;
    for (const m of solids)
      if (isVisible(m)) {
        cameraColliders.push(m);
        occluders.push(m);
      }
    root.updateMatrixWorld(true);
  }
  const lighting = applyLighting(THREE, root, { slug: 'sinai', timeOfDay, low, skyRadius: 2400 });
  const { sun } = lighting;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 900 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
  }
  function terrain(size, step, hollow = 0) {
    const positions = [],
      indices = [],
      n = size / step;
    for (let iz = 0; iz <= n; iz++)
      for (let ix = 0; ix <= n; ix++) {
        const x = -size / 2 + ix * step,
          z = -size / 2 + iz * step;
        positions.push(x, groundAt(x, z), z);
        if (ix < n && iz < n && (!hollow || Math.abs(x) >= hollow || Math.abs(z) >= hollow)) {
          const a = iz * (n + 1) + ix,
            b = a + 1,
            c = a + n + 1;
          indices.push(a, c, b, b, c, c + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const floor = mesh(g, earth, 0, 0, 0, hollow ? 'distant-wilderness' : 'walkable-ground');
    floor.castShadow = false;
  }
  terrain(400, 2);
  terrain(1600, 20, 200);
  // Jagged granite ridges beyond the walking bounds frame the continuous slope.
  for (const [i, [x, z, radius, h]] of [
    [-270, -110, 95, 180],
    [265, -140, 95, 200],
    [-190, -290, 100, 210],
    [170, -330, 115, 230],
    [-12, -300, 86, 155],
    [-340, 100, 110, 145],
    [350, 70, 120, 150],
  ].entries()) {
    const g = new THREE.CylinderGeometry(radius * 0.08, radius, h, 17, 12);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const xx = p.getX(j),
        yy = p.getY(j),
        zz = p.getZ(j),
        angle = Math.atan2(zz, xx);
      const relief = 1 + Math.sin(angle * 7 + i) * 0.14 + Math.sin(yy * 0.075 + angle * 5) * 0.09;
      p.setXYZ(j, xx * relief + Math.sin(yy * 0.02) * 8, yy + Math.sin(angle * 9) * 4, zz * relief);
    }
    g.computeVertexNormals();
    let buriedAt = Infinity;
    for (let j = 0; j < p.count; j++) {
      if (p.getY(j) < -h * 0.45)
        buriedAt = Math.min(buriedAt, groundAt(x + p.getX(j), z + p.getZ(j)) - p.getY(j) - 12);
    }
    mesh(g, rock, x, buriedAt, z, `granite-ridge-${i}`);
  }
  for (const [i, r] of ROCKS.entries())
    ellipsoid(
      rock,
      r.x,
      groundAt(r.x, r.z) + r.height / 2,
      r.z,
      r.radius,
      r.height / 2,
      r.radius,
      root,
      `sinai-rock-${i}`,
      true,
    );
  const caveY = SITES.cave.height;
  for (const w of CAVE_WALLS) {
    const g = new THREE.BoxGeometry(w.x1 - w.x0, w.height, w.z1 - w.z0, 12, 9, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      // Relief stays within the navigation's body clearance around the rock.
      p.setXYZ(
        i,
        x + Math.sin(y * 1.1 + z * 0.7) * 0.17,
        y + Math.sin(x * 1.3 + z) * 0.09,
        z + Math.sin(x * 0.8 + y * 1.4) * 0.17,
      );
    }
    g.computeVertexNormals();
    mesh(g, rock, (w.x0 + w.x1) / 2, caveY + w.height / 2, (w.z0 + w.z1) / 2, w.id, root, true);
  }
  const roof = new THREE.PlaneGeometry(14, 14, 18, 18);
  roof.rotateX(-Math.PI / 2);
  const ceiling = roof.attributes.position;
  for (let i = 0; i < ceiling.count; i++) {
    const x = ceiling.getX(i),
      z = ceiling.getZ(i);
    ceiling.setY(i, 5.1 - x * x * 0.018 + Math.sin(x * 0.9 + z * 1.2) * 0.16);
  }
  roof.computeVertexNormals();
  mesh(roof, rock, 47, caveY, -97, 'cave-roof', root, true);
  ellipsoid(rock, 47, caveY + 6.2, -97, 8, 2.6, 7, root, 'cave-cap');
  for (const dx of [-5.8, 5.8]) ellipsoid(pale, 47 + dx, caveY + 2.3, -90.5, 1, 2.5, 1.2);
  function instanced(geometry, material, items, name) {
    const m = new THREE.InstancedMesh(own(geometry), material, items.length),
      dummy = new THREE.Object3D();
    m.name = name;
    items.forEach((item, i) => {
      dummy.position.set(...item.p);
      dummy.scale.set(...item.s);
      dummy.rotation.set(0, item.r || 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  const rubble = [],
    scrub = [];
  for (let i = 0; i < (low ? 550 : 1500); i++) {
    const x = random() * 300 - 150,
      z = random() * 338 - 178;
    if (pathDistance(x, z) < 3 || Object.values(SITES).some((s) => Math.hypot(x - s.x, z - s.z) < s.radius))
      continue;
    rubble.push({
      p: [x, groundAt(x, z) + 0.06, z],
      s: [0.12 + random() * 0.4, 0.1 + random() * 0.15, 0.12 + random() * 0.4],
      r: random() * 6,
    });
    if (z > 0 && i % 5 === 0)
      scrub.push({ p: [x, groundAt(x, z) + 0.15, z], s: [0.4, 0.24, 0.35], r: random() * 6 });
  }
  instanced(sphere, pale, rubble, 'granite-scatter');
  instanced(new THREE.IcosahedronGeometry(1, 0), mat(0x77765a), scrub, 'desert-scrub');
  const camp = group('israel-camp'),
    sanctuary = group('tabernacle'),
    earlyTent = group('outside-meeting-tent');
  function tent(x, z, w, d, h, parent, name, material = cloth) {
    const y = groundAt(x, z),
      positions = [
        -w / 2,
        0.4,
        -d / 2,
        0,
        h,
        -d / 2,
        -w / 2,
        0.4,
        d / 2,
        0,
        h,
        -d / 2,
        0,
        h,
        d / 2,
        -w / 2,
        0.4,
        d / 2,
        0,
        h,
        -d / 2,
        w / 2,
        0.4,
        -d / 2,
        w / 2,
        0.4,
        d / 2,
        0,
        h,
        -d / 2,
        w / 2,
        0.4,
        d / 2,
        0,
        h,
        d / 2,
      ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    mesh(g, material, x, y, z, name, parent, true);
    for (const zz of [-d / 2, d / 2]) box(0.1, h, 0.1, wood, x, y + h / 2, z + zz, '', parent);
    for (const xx of [-w / 2, w / 2]) box(0.05, 0.45, d, material, x + xx, y + 0.22, z, '', parent, true);
    box(w * 0.76, 0.025, d * 0.75, red, x, y + 0.02, z, '', parent);
    blockedRect(parent, x, z, w, d, y, h);
  }
  for (const t of TENTS) tent(t.x, t.z, t.width, t.depth, t.height, camp, t.id);
  tent(-125, 87, 7, 7, 3.6, earlyTent, 'early-meeting-tent', linen);
  // The later sanctuary's court is open at the south entrance for this walk.
  const sy = SITES.sanctuary.height;
  for (const x of [35, 61]) {
    box(0.08, 2.2, 32, linen, x, sy + 1.1, 84, 'court-hanging', sanctuary, true);
    blockedRect(sanctuary, x, 84, 0.15, 32, sy, 2.2);
  }
  box(26, 2.2, 0.08, linen, 48, sy + 1.1, 68, 'court-back', sanctuary, true);
  blockedRect(sanctuary, 48, 68, 26, 0.15, sy, 2.2);
  for (const x of [39, 57]) {
    box(8, 2.2, 0.08, linen, x, sy + 1.1, 100, 'court-front', sanctuary, true);
    blockedRect(sanctuary, x, 100, 8, 0.15, sy, 2.2);
  }
  for (const x of [35, 61])
    for (let z = 68; z <= 100; z += 4) box(0.12, 2.5, 0.12, bronze, x, sy + 1.25, z, '', sanctuary);
  box(5, 4, 12, linen, 48, sy + 2, 77, 'tabernacle-structure', sanctuary, true);
  box(5.4, 0.25, 12.4, red, 48, sy + 4.1, 77, 'tabernacle-covering', sanctuary);
  box(5, 3.8, 0.12, blue, 48, sy + 1.9, 83.1, 'tabernacle-screen', sanctuary);
  blockedRect(sanctuary, 48, 77, 5.4, 12.4, sy, 4.3);
  box(2.6, 1.4, 2.6, bronze, 48, sy + 0.7, 91, 'bronze-altar', sanctuary, true);
  blockedRect(sanctuary, 48, 91, 2.6, 2.6, sy, 1.4);
  for (const dx of [-1, 1])
    for (const dz of [-1, 1]) box(0.2, 0.35, 0.2, bronze, 48 + dx, sy + 1.5, 91 + dz, '', sanctuary);
  mesh(
    new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    bronze,
    48,
    sy + 0.9,
    86,
    'laver',
    sanctuary,
  ).rotation.x = Math.PI;
  const ceremony = group('covenant-altar');
  box(2, 0.85, 1.6, pale, 6, groundAt(6, 9) + 0.425, 9, 'stone-altar', ceremony, true);
  blockedRect(ceremony, 6, 9, 2, 1.6);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 11) * Math.PI,
      x = 6 + Math.cos(angle) * 9,
      z = 7 - Math.sin(angle) * 5;
    const pillar = mesh(
      new THREE.CylinderGeometry(0.3, 0.42, 1.45, 6),
      pale,
      x,
      groundAt(x, z) + 0.725,
      z,
      `covenant-pillar-${i}`,
      ceremony,
      true,
    );
    blockedRect(ceremony, x, z, 0.8, 0.8, pillar.position.y - 0.725, 1.5);
  }
  const boundary = group('mountain-boundary');
  for (let x = -35; x <= 35; x += 5)
    if (Math.abs(x - 6) > 4) ellipsoid(pale, x, groundAt(x, -2) + 0.25, -2, 0.5, 0.25, 0.4, boundary);
  const bush = group('living-bush');
  const bx = -70,
    bz = 36,
    by = groundAt(bx, bz);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4,
      r = 0.3 + random() * 0.8;
    const branch = mesh(
      new THREE.CylinderGeometry(0.025, 0.06, 1.4, 5),
      wood,
      bx + (Math.cos(a) * r) / 2,
      by + 0.65,
      bz + (Math.sin(a) * r) / 2,
      '',
      bush,
    );
    branch.rotation.z = Math.cos(a) * 0.7;
    branch.rotation.x = Math.sin(a) * 0.7;
    ellipsoid(
      mat(i % 2 ? 0x677151 : 0x879063),
      bx + Math.cos(a) * r,
      by + 0.8 + random() * 0.4,
      bz + Math.sin(a) * r,
      0.43,
      0.3,
      0.4,
      bush,
    );
  }
  function flameCluster(parent, x, y, z, radius, count, height = 1) {
    for (let i = 0; i < count; i++) {
      const angle = i * 2.4,
        r = radius * Math.sqrt(i / count);
      const f = ellipsoid(
        fireMat,
        x + Math.cos(angle) * r,
        y + height * 0.5,
        z + Math.sin(angle) * r,
        height * 0.13,
        height * 0.5,
        height * 0.1,
        parent,
        'flame',
      );
      f.userData.baseScale = f.scale.y;
      f.castShadow = false;
      flames.push(f);
    }
  }
  const burning = group('bush-fire');
  flameCluster(burning, bx, by + 0.4, bz, 0.8, 12, 1.5);
  const bushLight = new THREE.PointLight(0xffbd6b, 60, 18, 2);
  bushLight.position.set(bx, by + 2, bz);
  burning.add(bushLight);
  const sandals = group('moses-sandals');
  for (const dx of [-0.16, 0.16]) ellipsoid(wood, -70 + dx, by + 0.04, 40.5, 0.08, 0.035, 0.2, sandals);
  const serpent = group('staff-serpent');
  const curve = new THREE.CatmullRomCurve3(
    Array.from(
      { length: 14 },
      (_, i) =>
        new THREE.Vector3(
          -70 + Math.sin(i * 0.6) * 0.4,
          by + 0.09 + (i > 10 ? (i - 10) * 0.12 : 0),
          35 + i * 0.16,
        ),
    ),
  );
  mesh(new THREE.TubeGeometry(curve, 32, 0.065, 7, false), mat(0x65523a), 0, 0, 0, 'serpent', serpent);
  const water = group('water-from-rock');
  const waterMat = mat(0x709394, { transparent: true, opacity: 0.7, roughness: 0.15, metalness: 0.2 });
  const stream = mesh(
    new THREE.PlaneGeometry(0.7, 1.5, 1, 6),
    waterMat,
    -109,
    groundAt(-109, 12) + 0.8,
    11.6,
    'rock-stream',
    water,
  );
  const pool = mesh(
    new THREE.CircleGeometry(2.4, 32),
    waterMat,
    -109,
    groundAt(-109, 13) + 0.035,
    13,
    'rock-pool',
    water,
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.y = 0.6;
  const calf = group('golden-calf');
  const cy = groundAt(-23, 45);
  box(2.5, 0.6, 2, pale, -23, cy + 0.3, 45, 'calf-plinth', calf, true);
  blockedRect(calf, -23, 45, 2.5, 2);
  ellipsoid(gold, -23, cy + 1.5, 45, 0.65, 0.38, 0.32, calf);
  ellipsoid(gold, -22.3, cy + 1.8, 45, 0.28, 0.3, 0.25, calf);
  for (const dx of [-0.4, 0.4])
    for (const dz of [-0.22, 0.22]) box(0.13, 0.65, 0.13, gold, -23 + dx, cy + 0.92, 45 + dz, '', calf);
  for (const dz of [-0.2, 0.2])
    mesh(
      new THREE.ConeGeometry(0.075, 0.37, 8),
      gold,
      -22.3,
      cy + 2.08,
      45 + dz,
      'calf-horn',
      calf,
    ).rotation.x = dz * 2;
  const tail = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), gold, -23.7, cy + 1.25, 45, '', calf);
  tail.rotation.z = -0.4;
  const broken = group('broken-tablets'),
    newTablets = group('new-tablets');
  for (let i = 0; i < 6; i++) {
    const b = box(
      0.2 + random() * 0.3,
      0.065,
      0.22,
      pale,
      -23 + (random() - 0.5) * 1.5,
      cy + 0.07,
      45 + random(),
      '',
      broken,
    );
    b.rotation.y = random() * 6;
  }
  for (const dx of [-0.2, 0.2])
    box(0.34, 0.07, 0.5, pale, -3 + dx, groundAt(-3, -149) + 0.07, -149, '', newTablets);
  const meal = group('covenant-meal');
  box(2.7, 0.06, 2, blue, 4, SITES.elders.height + 0.04, -55, 'sapphire-recollection', meal);
  const campMeal = group('passover-meal');
  box(3, 0.025, 4, red, 0, groundAt(0, 68) + 0.03, 68, '', campMeal);
  const workshop = group('craftsmen-workshop');
  box(2.3, 0.12, 1.2, wood, 64, 3.05, 38, 'work-table', workshop, true);
  blockedRect(workshop, 64, 38, 2.3, 1.2);
  for (const dx of [-0.95, 0.95])
    for (const dz of [-0.45, 0.45]) box(0.13, 1, 0.13, wood, 64 + dx, 2.5, 38 + dz, '', workshop);
  for (const x of [62.5, 65.5]) box(0.12, 2.2, 0.12, wood, x, 3.1, 35.5, '', workshop);
  box(3.1, 0.12, 0.12, wood, 64, 4.2, 35.5, '', workshop);
  for (let i = 0; i < 13; i++)
    box(0.05, 1.9, 0.03, i % 3 ? linen : blue, 62.6 + i * 0.23, 3.1, 35.5, '', workshop);
  for (const [i, material] of [linen, blue, red].entries())
    box(0.65, 0.12, 0.7, material, 63.2 + i * 0.75, 3.2, 38, '', workshop);
  const censers = group('unattended-censers');
  for (const dx of [-1, 1]) {
    ellipsoid(bronze, 48 + dx, sy + 0.12, 95, 0.2, 0.12, 0.2, censers);
    box(0.04, 0.04, 0.45, bronze, 48 + dx, sy + 0.14, 95.3, '', censers);
  }
  const standards = group('tribal-standards');
  for (const [i, x] of [-15, 15, 75, -95].entries()) {
    box(0.09, 4, 0.09, wood, x, groundAt(x, 115) + 2, 115, '', standards);
    box(1.1, 0.8, 0.025, i % 2 ? blue : red, x + 0.55, groundAt(x, 115) + 3.5, 115, '', standards);
  }
  const loads = group('packed-for-departure');
  const packedProps = createProps(THREE, {
    quality,
    items: Array.from({ length: 12 }, (_, i) => ({
      kind: i % 2 ? 'bundle' : 'sack',
      x: i % 2 ? 11 : 3,
      z: 130 + Math.floor(i / 2) * 1.5,
      y: 2,
      rotation: i,
      scale: 1,
    })),
  });
  loads.add(packedProps.group);
  const offerings = group('dedication-gifts');
  const giftProps = createProps(THREE, {
    quality,
    items: Array.from({ length: 7 }, (_, i) => ({
      kind: i % 2 ? 'basket' : 'jar',
      x: 43 + i * 0.65,
      z: 93,
      y: sy,
      rotation: i,
      scale: 0.9,
    })),
  });
  offerings.add(giftProps.group);
  const campProps = createProps(THREE, {
    quality,
    items: TENTS.flatMap((t) =>
      ['waterJar', 'basket'].map((kind, i) => ({
        kind,
        x: t.x + t.width / 2 + 0.8,
        z: t.z + i,
        y: groundAt(t.x, t.z),
        rotation: i,
        scale: 1,
      })),
    ),
  });
  camp.add(campProps.group);
  for (const [parent, x, z] of [
    [meal, 4, -55],
    [campMeal, 0, 68],
  ]) {
    for (let i = 0; i < 4; i++)
      ellipsoid(mat(0xb69b6d), x - 0.7 + i * 0.45, groundAt(x, z) + 0.13, z, 0.17, 0.07, 0.13, parent);
  }
  const mountainCloud = group('mountain-cloud'),
    mountainFire = group('mountain-fire');
  for (let i = 0; i < 20; i++) {
    const angle = i * 2.4,
      r = 8 + i * 1.6;
    vapor(
      cloudMat,
      mountainCloud,
      -3 + Math.cos(angle) * r,
      115 + (i % 5) * 3,
      -155 + Math.sin(angle) * r * 0.6,
      70,
      36,
    );
  }
  flameCluster(mountainFire, -3, SITES.summit.height + 7, -164, 15, 32, 4);
  const pillar = group('pillar-of-cloud');
  const pillarMat = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: 0xe6ded0,
    opacity: 0.8,
    depthWrite: false,
  });
  materials.add(pillarMat);
  for (let i = 0; i < 10; i++) vapor(pillarMat, pillar, Math.sin(i) * 0.6, 4 + i * 1.7, 0, 9 + i * 0.3, 9);
  const glory = group('cleft-light');
  const gloryLight = new THREE.PointLight(0xffdfad, 90, 24, 2);
  gloryLight.position.set(-28, SITES.cleft.height + 4, -119);
  glory.add(gloryLight);
  const radiant = group('radiant-face-light');
  const faceLight = new THREE.PointLight(0xffdfb8, 1.8, 2.8, 2);
  faceLight.position.set(0, groundAt(0, 66) + 1.6, 66.3);
  radiant.add(faceLight);
  box(0.5, 0.025, 0.55, linen, 1, groundAt(1, 66) + 0.025, 66, 'moses-veil', radiant);
  const altarFire = group('altar-fire');
  flameCluster(altarFire, 48, sy + 1.4, 91, 0.8, 7, 1.1);
  const elijahFire = group('elijah-fire');
  flameCluster(elijahFire, 60, groundAt(60, -83), -83, 3, 14, 1.6);
  const dust = group('elijah-wind');
  const dustMat = mat(0xbfa58a, { transparent: true, opacity: 0.11, depthWrite: false });
  for (let i = 0; i < 12; i++)
    ellipsoid(dustMat, 33 + i * 2.5, groundAt(47, -82) + 1 + (i % 3), -83 + (i % 4), 3, 0.4, 0.5, dust);
  const sheep = createHerd(THREE, {
    quality,
    groundAt,
    name: 'jethro-flock',
    animals: Array.from({ length: 8 }, (_, i) => ({
      species: 'sheep',
      x: -79 + (i % 4) * 2,
      z: 32 - Math.floor(i / 4) * 2,
      facing: i * 0.7,
      phase: i * 1.2,
      scale: 0.8 + (i % 2) * 0.15,
    })),
  });
  root.add(sheep.group);
  const campFigures = TENTS.map((t, i) => ({
    id: `sinai-camp-${i}`, x: t.x - 1, z: t.z + 5,
    variantId: i % 3 ? 'tabernacle-camp-man-a' : 'tabernacle-camp-woman-a',
    kind: i % 3 ? 'man' : 'woman', facing: 0.3, activity: 'standing',
    colour: ROBE_PALETTE[i % ROBE_PALETTE.length], phase: i,
  }));
  const campRoutes = [[[-62, 88], [-30, 88]], [[-15, 90], [-15, 121]], [[18, 72], [18, 102]]];
  for (const [i, route] of campRoutes.entries()) {
    campFigures.push({ id: `sinai-camp-walker-${i}`, x: route[0][0], z: route[0][1],
      variantId: i === 1 ? 'tabernacle-camp-woman-a' : 'tabernacle-camp-man-a',
      kind: i === 1 ? 'woman' : 'man', activity: 'standing', route,
      speed: 0.75 + i * 0.08, dwell: 7, phase: i * 0.23 });
  }
  for (const slot of [0, 1]) campFigures.push({
    id: `sinai-camp-conversation-${slot}`, x: -38 + slot * 1.8, z: 96,
    variantId: 'tabernacle-camp-man-a', activity: 'talking',
    facing: slot ? -Math.PI / 2 : Math.PI / 2,
    conversationId: 'sinai-camp', conversationSlot: slot,
  });
  const villagers = createLivingCrowd(THREE, {
    root: camp, figures: campFigures, sceneSlug: 'sinai', groundAt,
    quality, reducedMotion, motionLibrary, active: () => camp.visible,
  });
  const sanctuaryStages = [
    'tabernacle-raised',
    'ordination',
    'first-offerings',
    'nadab-abihu',
    'holy-living',
    'dedication',
    'passover',
    'census',
    'trumpets',
  ];
  const optional = [
    burning,
    sandals,
    serpent,
    water,
    ceremony,
    boundary,
    calf,
    broken,
    newTablets,
    meal,
    campMeal,
    workshop,
    censers,
    standards,
    loads,
    offerings,
    mountainCloud,
    mountainFire,
    pillar,
    glory,
    radiant,
    altarFire,
    elijahFire,
    dust,
  ];
  function stage(id) {
    currentEpisode = id;
    optional.forEach((g) => {
      g.visible = false;
    });
    const beforeCamp = ['burning-bush', 'signs', 'aaron-meets-moses', 'water-rock'].includes(id);
    camp.visible = Boolean(id) && !beforeCamp && !id.startsWith('elijah') && id !== 'departure';
    sanctuary.visible = sanctuaryStages.includes(id);
    earlyTent.visible = ['meeting-tent', 'cleft-glory', 'renewal', 'radiant-face', 'craftsmen'].includes(id);
    sheep.group.visible = ['burning-bush', 'signs', 'aaron-meets-moses'].includes(id);
    const show = (...groups) =>
      groups.forEach((g) => {
        g.visible = true;
      });
    if (id === 'burning-bush') show(burning, sandals);
    if (id === 'signs') show(serpent, sandals);
    if (id === 'water-rock') show(water);
    if (['preparation', 'revelation', 'commandments', 'covenant'].includes(id)) show(boundary);
    if (['revelation', 'commandments', 'tablets', 'intercession', 'renewal'].includes(id))
      show(mountainCloud);
    if (id === 'revelation') show(mountainFire);
    if (id === 'covenant') show(ceremony);
    if (id === 'elders-meal') show(meal);
    if (id === 'golden-calf') show(calf);
    if (id === 'broken-tablets') show(broken);
    if (id === 'renewal') show(newTablets);
    if (id === 'cleft-glory') show(glory);
    if (id === 'radiant-face') show(radiant);
    if (id === 'craftsmen') show(workshop);
    if (id === 'nadab-abihu') show(censers);
    if (id === 'first-offerings') show(altarFire);
    if (id === 'dedication') show(offerings);
    if (id === 'passover') show(campMeal);
    if (['census', 'trumpets'].includes(id)) show(standards);
    if (id === 'departure') show(loads);
    if (id === 'meeting-tent') {
      show(pillar);
      pillar.position.set(-125, groundAt(-125, 83), 83);
    }
    if (sanctuary.visible) {
      show(pillar);
      pillar.position.set(48, sy + 4, 77);
    }
    if (id === 'departure') {
      show(pillar);
      pillar.position.set(7, 15, 158);
    }
    if (id === 'elijah-wind') show(dust, elijahFire);
    refreshColliders();
  }
  const episodes = createSinaiEvents(THREE, { root, motionLibrary, onChange: stage });
  episodes.setEpisode('revelation');
  const humans = {
    update: (frame) => { villagers.update(frame); episodes.update(frame); },
    queryClearance(x, z, radius = 0.35, y = groundAt(x, z)) {
      for (const b of clearances) {
        if (
          !isVisible(b.parent) ||
          y < b.y - 1 ||
          y > b.y + b.height ||
          x <= b.x0 - radius ||
          x >= b.x1 + radius ||
          z <= b.z0 - radius ||
          z >= b.z1 + radius
        )
          continue;
        const exits = [
          [b.x0 - radius - x - 0.01, 0],
          [b.x1 + radius - x + 0.01, 0],
          [0, b.z0 - radius - z - 0.01],
          [0, b.z1 + radius - z + 0.01],
        ];
        exits.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        return { collides: true, pushX: exits[0][0], pushZ: exits[0][1] };
      }
      const hit = episodes.queryClearance(x, z, radius, y);
      return hit.collides ? hit : villagers.queryClearance(x, z, radius, y);
    },
    dispose: () => { villagers.dispose(); episodes.dispose(); },
  };
  function update(elapsed, delta = 0, frame = {}) {
    if (disposed) return;
    const t = reducedMotion ? 0 : elapsed;
    sheep.update(t);
    flames.forEach((f, i) => {
      const target = f.userData.baseScale * (1 + Math.sin(t * 5 + i) * 0.12);
      f.scale.y = reducedMotion
        ? target
        : THREE.MathUtils.lerp(f.scale.y, target, Math.min(1, Math.max(0, delta) * 12));
    });
    mountainCloud.rotation.y = Math.sin(t * 0.03) * 0.035;
    dust.position.x = Math.sin(t * 0.8) * 3;
    stream.scale.x = 1 + Math.sin(t * 3) * 0.06;
    pillarMat.color.setHex(hour.id === 'night' ? 0xffbd68 : 0xe6ded0);
    if (frame.camera) lighting.sky.position.copy(frame.camera.position);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    humans.dispose();
    sheep.dispose();
    for (const p of [packedProps, giftProps, campProps]) p.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    cloudTexture.dispose();
    sun.shadow.map?.dispose();
    lighting.sky.geometry.dispose();
    lighting.skyMaterial.dispose();
  }
  return {
    root,
    sun,
    lighting,
    humans,
    dailyLife: villagers,
    update,
    dispose,
    cameraColliders,
    occluders,
    fog: { color: hour.fog.color, density: 0.0017 },
    exposure: hour.exposure,
    fogFor: (time) => ({
      color: time.sky.low.map((v, i) => v * 0.92 + time.sky.high[i] * 0.08),
      density: 0.0017,
    }),
    onTimeOfDay: (time) => {
      hour = resolveTimeOfDay(time);
    },
    shadowFollow: low ? null : { extent: 55 },
    episodes: episodes.ids,
    setEpisode: episodes.setEpisode,
    getEpisode: () => currentEpisode,
    applyAssets: (group) => { villagers.acceptAssets(group); episodes.acceptAssets(group); },
    applyQuality: (profile) => villagers.setQuality(profile),
    bounds: BOUNDS,
  };
}
