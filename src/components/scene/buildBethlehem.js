import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { createProps } from './sceneProps';
import { ROBE_PALETTE } from './sceneFigures';
import { createLivingCrowd } from './sceneLivingCrowd';
import { loadMotionLibrary } from './sceneMixamo';
import { createHerd } from './sceneAnimals';
import { createBethlehemEvents } from './bethlehemEvents';
import {
  BOUNDS,
  HOUSES,
  WALLS,
  OLIVES,
  WELL,
  MANGER,
  CAMP,
  PATHS,
  groundAt,
  pathDistance,
} from './bethlehemDimensions';

export default function buildBethlehem(
  THREE,
  { quality = 'high', reducedMotion = false, timeOfDay = 'night', motionLibrary = undefined } = {},
) {
  motionLibrary = motionLibrary === undefined ? loadMotionLibrary().catch(() => null) : motionLibrary;
  const low = quality === 'low',
    root = new THREE.Group();
  root.name = 'bethlehem';
  const geometries = new Set(),
    materials = new Set(),
    lights = [],
    flames = [];
  const cameraColliders = [],
    occluders = [];
  let disposed = false,
    hour = resolveTimeOfDay(timeOfDay),
    currentEpisode = 'birth';
  let seed = 7043;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const own = (g) => {
    geometries.add(g);
    return g;
  };
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra });
    materials.add(m);
    return m;
  };
  const stone = mat(0xb9a989, { side: THREE.DoubleSide }),
    pale = mat(0xd8c9ab),
    rock = mat(0x9e907b, { side: THREE.DoubleSide });
  const earth = mat(0xbca882),
    timber = mat(0x63513c),
    dark = mat(0x34352d),
    clay = mat(0x9e6746);
  const linen = mat(0xe3d7b9),
    skin = mat(0x9d7355),
    straw = mat(0xbaa46e),
    olive = mat(0x63705b);
  const lamp = mat(0xf6c169, { emissive: 0xffad45, emissiveIntensity: 2.5 });
  const mesh = (geometry, material, x, y, z, name = '', solid = false, parent = root) => {
    const m = new THREE.Mesh(own(geometry), material);
    m.position.set(x, y, z);
    m.name = name;
    m.castShadow = !low;
    m.receiveShadow = true;
    parent.add(m);
    if (solid) {
      cameraColliders.push(m);
      occluders.push(m);
    }
    return m;
  };
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const box = (w, h, d, material, x, y, z, name = '', solid = false, parent = root) => {
    const m = mesh(cube, material, x, y, z, name, solid, parent);
    m.scale.set(w, h, d);
    return m;
  };
  const instanced = (geometry, material, items, name) => {
    const m = new THREE.InstancedMesh(own(geometry), material, items.length),
      dummy = new THREE.Object3D();
    m.name = name;
    items.forEach((item, i) => {
      dummy.position.set(...item.p);
      dummy.scale.set(...(item.s || [1, 1, 1]));
      dummy.rotation.set(...(item.r || [0, 0, 0]));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (item.color !== undefined) m.setColorAt(i, new THREE.Color(item.color));
    });
    m.castShadow = !low;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  // Surface detail remains at a human scale, independent of the wall size.
  for (const material of [stone, pale]) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMasonry;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vec4 localStone=vec4(position,1.0);
        #ifdef USE_INSTANCING
          localStone=instanceMatrix*localStone;
        #endif
        vMasonry=(modelMatrix*localStone).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMasonry;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 n=abs(normalize(cross(dFdx(vMasonry),dFdy(vMasonry))));
        vec2 p=n.x>n.z?vMasonry.zy:vMasonry.xy;
        if(n.y>max(n.x,n.z)) p=vMasonry.xz;
        float row=floor(p.y/.34);vec2 uv=vec2(p.x/.72+mod(row,2.)*.5,p.y/.34);
        vec2 edge=min(fract(uv),1.-fract(uv));
        float mortar=1.-smoothstep(.009,.033,min(edge.x,edge.y));
        float block=fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453);
        float grain=fract(sin(dot(floor(vMasonry*80.),vec3(12.9,43.1,78.2)))*43758.5);
        diffuseColor.rgb*=(.89+block*.2)*(1.-mortar*.16)*(.96+grain*.08);`,
        );
    };
    material.customProgramCacheKey = () => 'bethlehem-limestone-v1';
  }
  // Continuous earth and worn tracks, with no raised, hard-edged road ribbons.
  // World-space noise also gives the uncut shelter rock a different surface
  // from the laid stone of the houses.
  const pathSegments = PATHS.flatMap((points) => points.slice(1).map((b, i) => [points[i], b]));
  function naturalSurface(material, { paths = false, cliff = false } = {}) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNatural;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 naturalPos=vec4(position,1.0);
          #ifdef USE_INSTANCING
            naturalPos=instanceMatrix*naturalPos;
          #endif
          vNatural=(modelMatrix*naturalPos).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vNatural;
          float soilHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
          float soilNoise(vec2 p) {
            vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
            return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),
              mix(soilHash(i+vec2(0,1)),soilHash(i+vec2(1,1)),f.x),f.y);
          }
          float trackDistance(vec2 p,vec2 a,vec2 b) {
            vec2 v=b-a; return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 soilUv=vNatural.xz${cliff ? '+vec2(vNatural.y*.4,vNatural.y)' : ''};
          float soilPatch=soilNoise(soilUv*.32)*.6+soilNoise(soilUv*1.8)*.4;
          float grit=soilNoise(soilUv*28.);
          float nearby=1.-smoothstep(12.,60.,length(vViewPosition));
          diffuseColor.rgb*=.76+soilPatch*.42+(grit-.5)*.13*nearby;
          ${
            cliff
              ? `float strata=sin(vNatural.y*11.+soilNoise(soilUv*.4)*3.);
            diffuseColor.rgb*=.92+strata*.08;`
              : ''
          }
          ${
            paths
              ? `float track=10000.;
            ${pathSegments.map(([a, b]) => `track=min(track,trackDistance(vNatural.xz,vec2(${a.map((v) => v.toFixed(1)).join(',')}),vec2(${b.map((v) => v.toFixed(1)).join(',')})));`).join('\n')}
            float worn=1.-smoothstep(1.5,3.4,track+(soilNoise(soilUv*2.)-.5)*.7);
            diffuseColor.rgb*=mix(vec3(.91,.95,.82),vec3(1.15,1.08,.97),worn);`
              : ''
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float relief=soilNoise(soilUv*${cliff ? '2.4' : '4.'})*.8+grit*.2;
          vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
          vec3 r1=cross(sy,normal),r2=cross(normal,sx);
          float det=dot(sx,r1);
          normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2)*${cliff ? '.08' : '.025'}*nearby);`,
        );
    };
    material.customProgramCacheKey = () => `bethlehem-natural-${paths}-${cliff}`;
    return material;
  }
  naturalSurface(earth);
  naturalSurface(rock, { cliff: true });
  const groundMaterial = naturalSurface(mat(0xbbae8f), { paths: true });
  const lighting = applyLighting(THREE, root, { slug: 'bethlehem', timeOfDay, low, skyRadius: 1800 });
  const { sun } = lighting;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 700 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
  }
  // A triangle grid shared with the navigation: feet never float over a
  // differently tessellated visual hillside, even on the low quality tier.
  function terrain(size, step, hollow = 0) {
    const positions = [],
      indices = [];
    const n = size / step;
    for (let iz = 0; iz <= n; iz++)
      for (let ix = 0; ix <= n; ix++) {
        const x = -size / 2 + ix * step,
          z = -size / 2 + iz * step,
          y = groundAt(x, z);
        positions.push(x, y, z);
        if (ix < n && iz < n && (!hollow || Math.abs(x) >= hollow || Math.abs(z) >= hollow)) {
          const a = iz * (n + 1) + ix,
            b = a + 1,
            c = a + n + 1,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const m = mesh(g, groundMaterial, 0, 0, 0, hollow ? 'distant-hills' : 'walkable-ground');
    m.castShadow = false;
    return m;
  }
  terrain(280, 2);
  terrain(1200, 20, 140);
  const rubble = [],
    beams = [];
  for (const [i, b] of HOUSES.entries()) {
    const x = (b.x0 + b.x1) / 2,
      z = (b.z0 + b.z1) / 2,
      w = b.x1 - b.x0,
      d = b.z1 - b.z0,
      y = groundAt(x, z);
    box(w, b.height, d, i % 3 === 0 ? pale : stone, x, y + b.height / 2, z, b.id, true);
    box(w + 0.3, 0.27, d + 0.3, earth, x, y + b.height + 0.14, z, `${b.id}-roof`, true);
    for (const side of [-1, 1]) box(w, 0.42, 0.32, stone, x, y + b.height + 0.38, z + side * (d / 2 - 0.12));
    for (const side of [-1, 1]) box(0.32, 0.42, d, stone, x + side * (w / 2 - 0.12), y + b.height + 0.38, z);
    const front = b.z1;
    box(1.45, 2.1, 0.05, dark, x, y + 1.05, front + 0.026);
    box(1.5, 2.02, 0.045, timber, x + 0.03, y + 1.01, front + 0.06);
    box(2.1, 0.38, 0.42, pale, x, y + 2.28, front + 0.06);
    for (const dx of [-w * 0.29, w * 0.29]) {
      box(0.65, 0.8, 0.07, dark, x + dx, y + 2.2, front + 0.03);
      box(0.42, 0.45, 0.075, lamp, x + dx, y + 2.2, front + 0.072);
    }
    for (let zz = b.z0 + 0.8; zz < b.z1; zz += 1.3)
      beams.push({ p: [x, y + b.height - 0.05, zz], s: [w + 0.5, 0.15, 0.18] });
    for (let k = 0; k < 18; k++) {
      const xx = b.x0 + random() * w,
        zz = front + 0.15 + random() * 0.6;
      if (Math.abs(xx - x) < 1.1) continue;
      rubble.push({
        p: [xx, groundAt(xx, zz) + 0.1, zz],
        s: [0.25 + random() * 0.25, 0.2, 0.2 + random() * 0.2],
        r: [0, random() * 6, 0],
      });
    }
  }
  instanced(cube, timber, beams, 'roof-timbers');
  // The broad entrance admits the follow camera; solid sides and ceiling
  // still stop it cutting through the shelter when the visitor turns.
  for (const b of WALLS) {
    const wall = new THREE.BoxGeometry(b.x1 - b.x0, b.height, b.z1 - b.z0, 8, 6, 8);
    const vertices = wall.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        y = vertices.getY(i),
        z = vertices.getZ(i);
      // Small relief stays inside the walking clearance of the shared wall bounds.
      vertices.setXYZ(
        i,
        x + Math.sin(y * 2.1 + z * 1.7) * 0.1,
        y + Math.sin(x * 2.3 + z) * 0.07,
        z + Math.sin(x * 1.8 + y * 2) * 0.1,
      );
    }
    wall.computeVertexNormals();
    mesh(wall, rock, (b.x0 + b.x1) / 2, 7 + b.height / 2, (b.z0 + b.z1) / 2, b.id, true);
  }
  const ceiling = new THREE.PlaneGeometry(18, 19, 24, 20);
  ceiling.rotateX(-Math.PI / 2);
  const cp = ceiling.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i),
      z = cp.getZ(i);
    cp.setY(i, 4.8 - 0.014 * x * x + Math.sin(x * 1.6 + z) * 0.16 + Math.cos(z * 2.1 - x) * 0.09);
  }
  ceiling.computeVertexNormals();
  mesh(ceiling, rock, -10, 7, -32.5, 'shelter-ceiling', true);
  box(8, 1, 1.2, rock, -10, 11.25, -24.2, 'shelter-lintel', true);
  box(14, 0.025, 15, naturalSurface(mat(0xa49475)), -10, 7.015, -32.5, 'shelter-earth');
  // An open stone trough; the infant lies above the bedding, not inside a box.
  const { x: mx, z: mz, width: mw, depth: md, height: mh } = MANGER;
  box(mw, 0.2, md, stone, mx, 7.1, mz, 'manger-base', true);
  for (const side of [-1, 1])
    box(mw, mh, 0.13, pale, mx, 7 + mh / 2, mz + side * (md / 2 - 0.065), 'manger-side', true);
  for (const side of [-1, 1])
    box(0.13, mh, md, pale, mx + side * (mw / 2 - 0.065), 7 + mh / 2, mz, 'manger-end', true);
  box(mw - 0.2, 0.12, md - 0.2, straw, mx, 7.51, mz, 'manger-bedding');
  const infant = new THREE.Group();
  infant.name = 'infant-in-manger';
  infant.position.set(mx, 7.67, mz);
  root.add(infant);
  const wrap = mesh(
    new THREE.CapsuleGeometry(0.115, 0.34, 6, 12),
    linen,
    0,
    0,
    0,
    'swaddling-cloths',
    false,
    infant,
  );
  wrap.rotation.z = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.09, 12, 10), skin, 0.285, 0.025, 0, 'infant-head', false, infant);
  const strawBits = [];
  for (let i = 0; i < (low ? 70 : 170); i++) {
    const x = -16 + random() * 12,
      z = -38 + random() * 11;
    strawBits.push({ p: [x, 7.035, z], s: [0.008, 0.01, 0.09 + random() * 0.25], r: [0, random() * 6, 0] });
  }
  instanced(cube, straw, strawBits, 'scattered-straw');
  // Well, jars and work surfaces give the village a domestic scale.
  mesh(
    new THREE.CylinderGeometry(WELL.radius, WELL.radius, 1.05, 20, 1, true),
    stone,
    WELL.x,
    groundAt(WELL.x, WELL.z) + 0.525,
    WELL.z,
    'well-rim',
    true,
  );
  mesh(
    new THREE.CircleGeometry(1.2, 24),
    dark,
    WELL.x,
    groundAt(WELL.x, WELL.z) + 0.08,
    WELL.z,
    'well-water',
  ).rotation.x = -Math.PI / 2;
  for (const dx of [-1.5, 1.5])
    box(0.16, 2.5, 0.16, timber, WELL.x + dx, groundAt(WELL.x, WELL.z) + 1.25, WELL.z);
  box(3.4, 0.18, 0.22, timber, WELL.x, groundAt(WELL.x, WELL.z) + 2.5, WELL.z);
  mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.8, 5),
    timber,
    WELL.x,
    groundAt(WELL.x, WELL.z) + 1.4,
    WELL.z,
  );
  // Olive trunks, low crowns and loose field stones share instanced geometry.
  const crowns = [],
    trunks = [];
  for (const tree of OLIVES) {
    const y = groundAt(tree.x, tree.z);
    const trunk = mesh(
      new THREE.CylinderGeometry(0.19, tree.radius, tree.height, 7),
      timber,
      tree.x,
      y + tree.height / 2,
      tree.z,
      'olive-trunk',
      true,
    );
    trunk.rotation.z = 0.09 * Math.sin(tree.x);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      crowns.push({
        p: [tree.x + Math.cos(a) * 1.2, y + tree.height + Math.sin(i) * 0.25, tree.z + Math.sin(a) * 1.2],
        s: [1.8, 1.05, 1.5],
        r: [0, a, 0],
        color: i % 2 ? 0x717b63 : 0x57654f,
      });
      trunks.push({
        p: [tree.x + Math.cos(a) * 0.45, y + tree.height - 0.55, tree.z + Math.sin(a) * 0.45],
        s: [0.14, 1.6, 0.14],
        r: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5],
      });
    }
  }
  instanced(new THREE.IcosahedronGeometry(1, low ? 1 : 2), olive, crowns, 'olive-crowns');
  instanced(cube, timber, trunks, 'olive-branches');
  for (let i = 0; i < (low ? 120 : 350); i++) {
    const x = -85 + random() * 170,
      z = -76 + random() * 166;
    if (
      pathDistance(x, z) < 3.5 ||
      HOUSES.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) ||
      (x > -20 && x < 0 && z > -45 && z < -20)
    )
      continue;
    rubble.push({
      p: [x, groundAt(x, z) + 0.06, z],
      s: [0.1 + random() * 0.35, 0.08 + random() * 0.15, 0.12 + random() * 0.3],
      r: [0, random() * 6, 0],
    });
  }
  instanced(new THREE.DodecahedronGeometry(1, 0), pale, rubble, 'limestone-scatter');
  const grass = [];
  for (let i = 0; i < (low ? 1800 : 6000); i++) {
    const x = -86 + random() * 172,
      z = -75 + random() * 173;
    if (
      pathDistance(x, z) < 3.1 ||
      HOUSES.some((b) => x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4) ||
      (x > -20 && x < 0 && z > -45 && z < -20)
    )
      continue;
    grass.push({
      p: [x, groundAt(x, z) + 0.14, z],
      s: [0.065 + random() * 0.08, 0.16 + random() * 0.28, 0.075],
      r: [0, random() * 6, 0],
      color: [0x8e9567, 0xb6ad79, 0x737f58][i % 3],
    });
  }
  const tuft = new THREE.BufferGeometry();
  tuft.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, -0.5, 0, 0.5, -0.5, 0, -0.2, 0.5, 0, 0, -0.5, -0.5, 0, -0.5, 0.5, 0, 0.35, 0.1, -0.35, -0.5,
        -0.35, 0.35, -0.5, 0.35, 0.16, 0.6, 0.16,
      ],
      3,
    ),
  );
  tuft.computeVertexNormals();
  const tufts = instanced(tuft, mat(0xffffff, { side: THREE.DoubleSide }), grass, 'pasture-tufts');
  tufts.castShadow = false;
  const propItems = [];
  for (const b of HOUSES)
    for (let k = 0; k < 5; k++) {
      const x = b.x0 + 1 + k * 0.55,
        z = b.z1 + 0.9;
      propItems.push({
        kind: ['jar', 'waterJar', 'basket', 'sack', 'bundle'][k],
        x,
        z,
        y: groundAt(x, z),
        rotation: random() * 6,
        scale: 0.85 + random() * 0.3,
      });
    }
  for (const [x, z] of [
    [-13, 9],
    [-15, 9],
    [-15, -37],
    [-5, -37],
    [58, 35],
  ])
    propItems.push({ kind: 'waterJar', x, z, y: groundAt(x, z), rotation: 0 });
  const props = createProps(THREE, { items: propItems, quality });
  root.add(props.group);
  function oilLamp(x, z, height, withLight = false) {
    const y = groundAt(x, z) + height;
    mesh(new THREE.SphereGeometry(0.12, 8, 6), clay, x, y, z).scale.set(1, 0.5, 0.7);
    const flame = mesh(new THREE.SphereGeometry(0.04, 6, 5), lamp, x + 0.07, y + 0.06, z, 'oil-flame');
    flame.scale.y = 1.7;
    flame.castShadow = false;
    flames.push(flame);
    if (withLight) {
      const light = new THREE.PointLight(0xffc17b, 16, 15, 2);
      light.position.set(x, y + 0.35, z);
      root.add(light);
      lights.push({ light, base: 16 });
    }
  }
  oilLamp(-13, -34, 1.25, true);
  oilLamp(-5, -29, 1.4, true);
  oilLamp(-13, 8, 1, true);
  oilLamp(12, -39, 1, true);
  for (const b of HOUSES) oilLamp((b.x0 + b.x1) / 2 + 1, b.z1 + 0.3, 2);
  const glow = new THREE.PointLight(0xffc68a, 32, 22, 2);
  glow.position.set(-10, 9.6, -32);
  root.add(glow);
  lights.push({ light: glow, base: 32 });
  const fireY = groundAt(CAMP.x, CAMP.z);
  mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.14, 12), rock, CAMP.x, fireY + 0.07, CAMP.z, 'field-hearth');
  for (let i = 0; i < 4; i++) {
    const stick = box(1.1, 0.12, 0.12, timber, CAMP.x, fireY + 0.16 + i * 0.015, CAMP.z);
    stick.rotation.y = i * 1.1;
  }
  const flame = mesh(new THREE.ConeGeometry(0.2, 0.65, 7), lamp, CAMP.x, fireY + 0.44, CAMP.z, 'watch-fire');
  flames.push(flame);
  flame.castShadow = false;
  const fire = new THREE.PointLight(0xffb564, 25, 20, 2);
  fire.position.set(CAMP.x, fireY + 1, CAMP.z);
  root.add(fire);
  lights.push({ light: fire, base: 25 });
  const angelLight = new THREE.PointLight(0xe9f1ff, 70, 24, 2);
  angelLight.position.set(64, groundAt(64, 34) + 2.5, 34);
  root.add(angelLight);
  const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9b7, toneMapped: false });
  materials.add(starMaterial);
  const star = mesh(new THREE.SphereGeometry(1, 8, 6), starMaterial, 110, 155, -410, 'magi-star');
  star.castShadow = false;
  const animals = Array.from({ length: low ? 16 : 30 }, (_, i) => ({
    species: 'sheep',
    x: 63 + Math.sin(i * 2.1) * (4 + i * 0.27),
    z: 44 + Math.cos(i * 1.8) * (5 + i * 0.25),
    pose: i % 4 === 0 ? 'lie' : 'graze',
    facing: i * 1.7,
    phase: i * 0.9,
    scale: 0.85 + (i % 4) * 0.08,
  })).filter(({ x, z }) =>
    [
      [59, 39],
      [61, 40],
      [64, 34],
      [53, 43],
      [54, 44],
      [CAMP.x, CAMP.z],
    ].every(([px, pz]) => Math.hypot(x - px, z - pz) > 2),
  );
  const herd = createHerd(THREE, { animals, quality, groundAt, name: 'bethlehem-flock' });
  root.add(herd.group);
  const figures = [
    [-20, -28],
    [-20, 0],
    [-19, 12],
    [4, 22],
    [9, 28],
    [1, -30],
    [27, -31],
    [35, 26],
  ].map(([x, z], i) => ({
    id: `bethlehem-villager-${i}`,
    x,
    z,
    y: groundAt(x, z),
    facing: i * 0.9,
    activity: 'standing',
    colour: ROBE_PALETTE[i],
    phase: i * 1.3,
  }));
  // A pair by the well take turns speaking; two women follow the open lanes.
  figures[1].x = -13; figures[1].z = 12;
  figures[2].x = -14.8; figures[2].z = 12;
  for (const [slot, figure] of [figures[1], figures[2]].entries()) {
    figure.activity = 'talking';
    figure.facing = slot ? Math.PI / 2 : -Math.PI / 2;
    figure.conversationId = 'bethlehem-well';
    figure.conversationSlot = slot;
  }
  for (const [i, route] of [[[0, -17], [0, 6]], [[11, 28], [32, 28]]].entries()) {
    figures.push({ id: `bethlehem-walker-${i}`, x: route[0][0], z: route[0][1],
      variantId: 'tabernacle-camp-woman-a', kind: 'woman', activity: 'standing',
      route, speed: 0.8 + i * 0.1, dwell: 6, phase: i * 0.37 });
  }
  const villagers = createLivingCrowd(THREE, {
    sceneSlug: 'bethlehem', root, figures, groundAt, quality, reducedMotion, motionLibrary,
  });
  const episodes = createBethlehemEvents(THREE, {
    root,
    motionLibrary,
    onChange: (id) => {
      currentEpisode = id;
      infant.visible = ['birth', 'good-news', 'shepherds-visit'].includes(id);
      angelLight.visible = id === 'good-news';
      star.visible = id === 'magi-visit';
    },
  });
  episodes.setEpisode('birth');
  function applyHour(time) {
    hour = resolveTimeOfDay(time);
    const night = hour.id === 'night',
      twilight = hour.id === 'dusk' || hour.id === 'dawn';
    for (const item of lights) item.light.intensity = item.base * (night ? 1 : twilight ? 0.75 : 0.2);
    lamp.emissiveIntensity = night ? 3 : twilight ? 2 : 1;
    // A little reflected lamplight keeps faces legible under the shelter roof.
    glow.intensity = night ? 32 : 20;
  }
  applyHour(hour);
  const humans = {
    update: (frame) => {
      villagers.update(frame);
      episodes.update(frame);
    },
    getElapsed: () => villagers.getElapsed(),
    queryClearance: (...args) => {
      const hit = episodes.queryClearance(...args);
      return hit.collides ? hit : villagers.queryClearance(...args);
    },
    dispose: () => {
      villagers.dispose();
      episodes.dispose();
    },
  };
  function update(elapsed, delta = 0, frame = {}) {
    if (disposed) return;
    const t = reducedMotion ? 0 : elapsed;
    herd.update(t);
    const warmth = hour.id === 'night' ? 1 : hour.id === 'dusk' || hour.id === 'dawn' ? 0.75 : 0.2;
    fire.intensity += (25 * warmth * (1 + Math.sin(t * 4) * 0.07) - fire.intensity) * Math.min(1, delta * 8);
    flames.forEach((f, i) => {
      f.scale.y = 1.4 + Math.sin(t * 7 + i) * 0.14 + Math.sin(t * 11 + i) * 0.08;
    });
    if (frame.camera) {
      lighting.sky.position.copy(frame.camera.position);
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    humans.dispose();
    herd.dispose();
    props.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    sun.shadow.map?.dispose();
    lighting.sky.geometry.dispose();
    lighting.skyMaterial.dispose();
  }
  root.updateMatrixWorld(true);
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
    fog: { color: hour.fog.color, density: hour.id === 'night' ? 0.002 : 0.0016 },
    exposure: hour.exposure,
    fogFor: (time) => ({
      color: time.sky.low.map((value, i) => value * 0.9 + time.sky.high[i] * 0.1),
      density: time.id === 'night' ? 0.002 : 0.0016,
    }),
    onTimeOfDay: applyHour,
    shadowFollow: low ? null : { extent: 55 },
    episodes: episodes.ids,
    setEpisode: episodes.setEpisode,
    getEpisode: () => currentEpisode,
    applyAssets: (group) => {
      villagers.acceptAssets(group);
      episodes.acceptAssets(group);
    },
    applyQuality: (profile) => villagers.setQuality(profile),
    bounds: BOUNDS,
  };
}
