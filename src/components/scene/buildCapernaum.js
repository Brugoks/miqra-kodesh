// Procedural geometry for Capernaum (/scene/capernaum).
//
// Built from primitives and shader maths, with no downloaded models or images.
// Capernaum earns more detail than the larger scenes for a simple reason: it is
// small. A village core a hundred metres across can be built at something close
// to real fidelity — door frames, roof beams, the courses of a wall — where a
// 485m temple platform can only ever be gestured at.
//
// The set piece is the insula. You walk in off the lane, cross the courtyard,
// duck into the one room, and stand under a hole in the roof with the light
// coming down through it. Then you go back out, up the outside stair, and look
// down through the same hole. Everything else in the scene is arranged to make
// that walk worth taking.
//
// three.js is passed in rather than imported, so this module stays importable
// in jsdom and the 3D chunk is only fetched by the route that renders it.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import {
  ROBE_PALETTE, createCrowd, knot, scatter,
} from './sceneFigures';
import { alongWall, createProps, heap } from './sceneProps';
import { createCapernaumAssetManager } from './capernaumAssets';
import { createSceneHumans } from './sceneHumans';
import { floorAt, blockerAt } from './capernaumNavigation';
import {
  LEVEL,
  SHORE,
  VILLAGE,
  INSULA,
  HOUSE,
  COURTYARD,
  COURTYARD_ENTRY,
  ROOF_OPENING,
  ROOF_STAIR,
  SYNAGOGUE,
  BLOCKS,
  TAX_BOOTH,
  BOATS,
  QUAYSIDE,
  YARD_THINGS,
  TREES,
} from './capernaumDimensions';

// Deterministic, so the village looks the same on every visit. A place that
// reshuffles itself each time you open it reads as noise.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export default function buildCapernaum(THREE, options = {}) {
  // Nothing here is textured from an image, so there is no anisotropy to set;
  // the stone is a shader and the rest is flat colour under a low sun.
  const { quality = 'high', timeOfDay, reducedMotion = false } = options;
  const low = quality === 'low';

  const root = new THREE.Group();
  root.name = 'capernaum';
  const textures = [];
  const random = makeRandom(28061128);
  const dummy = new THREE.Object3D();

  const add = (geometry, material, [x, y, z], { cast = true, receive = true, parent = root, name = '' } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
    parent.add(mesh);
    return mesh;
  };

  // Positioned by extents rather than centre, the way the site plan is written.
  // Extents are normalised because a face on the south or west side of a block
  // is naturally written as `wall + dir * thickness`, which runs backwards when
  // dir is -1 — and a box with a negative dimension is invisible rather than
  // wrong-looking, so it disappears without complaint.
  const occluders = [];
  const slab = (material, x0, x1, y0, y1, z0, z1, opts = {}) => {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    const mesh = add(new THREE.BoxGeometry(bx - ax, by - ay, bz - az), material,
      [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], opts);
    if (opts.name === 'insula-mass' || opts.name === 'roof-surface' || opts.name?.startsWith?.('synagogue-wall') || opts.occlude) {
      occluders.push(mesh);
    }
    return mesh;
  };

  const instances = (geometry, material, transforms, name, { cast = true } = {}) => {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      dummy.scale.set(...(t.s || [1, 1, 1]));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (t.c !== undefined) mesh.setColorAt(i, new THREE.Color(t.c));
    });
    dummy.scale.set(1, 1, 1);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
    }
    root.add(mesh);
    return mesh;
  };

  // --- materials ----------------------------------------------------------

  const materialSet = new Set();
  const track = (material) => {
    materialSet.add(material);
    return material;
  };
  const standard = (parameters) => track(new THREE.MeshStandardMaterial(parameters));

  // Basalt fieldstone. Capernaum was built out of the black volcanic rock the
  // whole plain is made of, laid up as rough unshaped stones in mud mortar —
  // not the neat ashlar courses of a Roman city. A Voronoi cell pattern in
  // world space gives genuinely irregular stones whose size stays constant
  // across differently sized buildings, which a UV-mapped texture cannot.
  const basaltShader = (material, { scale = 0.62, mortar = 0.055, lift = 0.5 } = {}) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStoneScale = { value: scale };
      shader.uniforms.uMortar = { value: mortar };
      shader.uniforms.uLift = { value: lift };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 basaltPos = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            basaltPos = instanceMatrix * basaltPos;
          #endif
          vWorldPos = (modelMatrix * basaltPos).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldPos;
          uniform float uStoneScale;
          uniform float uMortar;
          uniform float uLift;
          vec2 cellHash(vec2 p) {
            return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Triplanar without a normal varying: the screen-space derivatives of
          // the world position give the face orientation for free.
          vec3 faceNormal = abs(normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos))));
          vec2 stoneUv = (faceNormal.x > faceNormal.z ? vWorldPos.zy : vWorldPos.xy) / uStoneScale;
          if (faceNormal.y > max(faceNormal.x, faceNormal.z)) stoneUv = vWorldPos.xz / uStoneScale;

          vec2 baseCell = floor(stoneUv);
          float nearest = 8.0;
          float second = 8.0;
          vec2 nearestId = vec2(0.0);
          for (int gy = -1; gy <= 1; gy++) {
            for (int gx = -1; gx <= 1; gx++) {
              vec2 cell = baseCell + vec2(float(gx), float(gy));
              // Jitter is squashed vertically so stones read as laid, not tossed.
              vec2 site = cell + cellHash(cell) * vec2(1.0, 0.72) + vec2(0.0, 0.14);
              float d = length(site - stoneUv);
              if (d < nearest) { second = nearest; nearest = d; nearestId = cell; }
              else if (d < second) { second = d; }
            }
          }
          float seam = smoothstep(0.0, uMortar, second - nearest);
          float stoneTone = cellHash(nearestId).x;
          float grain = fract(sin(dot(floor(stoneUv * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= (0.72 + stoneTone * 0.55 + grain * 0.10);
          // Mud mortar is paler and duller than the basalt it holds.
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.9, 1.75, 1.5) * uLift, diffuseColor.rgb, seam);`);
    };
    material.customProgramCacheKey = () => `capernaum-basalt-${scale}-${mortar}-${lift}`;
    return material;
  };

  const M = {
    basalt: basaltShader(standard({ color: 0x3b3a3c, roughness: 0.95 })),
    // The synagogue was the one building anyone spent money on: dressed basalt,
    // laid in courses, and a good deal smoother than a house wall.
    basaltDressed: basaltShader(standard({ color: 0x46454a, roughness: 0.82 }), { scale: 1.15, mortar: 0.03, lift: 0.62 }),
    plaster: standard({ color: 0xbfae92, roughness: 0.95 }),
    earth: standard({ color: 0x8a7458, roughness: 1 }),
    sand: standard({ color: 0xbda887, roughness: 1 }),
    timber: standard({ color: 0x6b5334, roughness: 0.9 }),
    timberPale: standard({ color: 0x9a8058, roughness: 0.9 }),
    thatch: standard({ color: 0x9c8853, roughness: 1 }),
    reed: standard({ color: 0xa89257, roughness: 1 }),
    cloth: standard({ color: 0xcbb99a, roughness: 0.95 }),
    net: standard({ color: 0x8d7f63, roughness: 1, transparent: true, opacity: 0.85 }),
    frond: standard({ color: 0x5f7038, roughness: 0.9, side: THREE.DoubleSide }),
    leaf: standard({ color: 0x55702f, roughness: 0.9, side: THREE.DoubleSide }),
    hill: standard({ color: 0x7d7a55, roughness: 1 }),
    skin: standard({ color: 0x9c7c5c, roughness: 0.9 }),
  };

  // --- sky and light ------------------------------------------------------
  // Placed by compass bearing in sceneLighting.js rather than by hand.
  // Capernaum is built with +X east and +Z north — the opposite handedness to
  // the temple — which is exactly the sort of thing a hand-placed sun gets
  // wrong invisibly, by mirroring the shadows.

  const lighting = applyLighting(THREE, root, {
    slug: 'capernaum',
    timeOfDay,
    skyRadius: 1500,
    low,
  });
  const { sun } = lighting;
  sun.target.position.set(12, 0, 8);
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -110;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
  }

  // The lake's specular track has to come from wherever the sun actually is,
  // so it shares the sky's uniform rather than keeping a copy: re-pointing the
  // sun at another hour moves the glitter on the water with it.
  const sunDirection = lighting.uniforms.uSun.value;

  // --- the lake -----------------------------------------------------------

  const waterUniforms = {
    uTime: { value: 0 },
    uSun: { value: sunDirection },
    uShore: { value: SHORE.beachSouth },
  };
  const waterMaterial = track(new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Three crossed swells; the lake is small and its chop is short.
        float w = sin(world.x * 0.22 + uTime * 1.05) * 0.10
                + sin(world.z * 0.31 - uTime * 0.83) * 0.075
                + sin((world.x + world.z) * 0.13 + uTime * 0.5) * 0.06;
        world.y += w;
        vWave = w;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSun;
      uniform float uShore;
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        float toShore = clamp((uShore - vWorld.z) / 34.0, 0.0, 1.0);
        vec3 shallow = vec3(0.32, 0.50, 0.50);
        vec3 deep = vec3(0.07, 0.20, 0.31);
        vec3 c = mix(shallow, deep, toShore);

        // A rough normal from the analytic swell, enough for a sun track.
        vec3 n = normalize(vec3(-cos(vWorld.x * 0.22 + uTime * 1.05) * 0.022, 1.0,
                                -cos(vWorld.z * 0.31 - uTime * 0.83) * 0.023));
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 h = normalize(normalize(uSun) + view);
        float spec = pow(max(dot(n, h), 0.0), 220.0);
        float sheen = pow(1.0 - max(dot(n, view), 0.0), 4.0) * 0.35;
        c += vec3(1.0, 0.88, 0.70) * spec * 2.4 + vec3(0.55, 0.70, 0.85) * sheen;

        // Foam where the swell meets the beach.
        float edge = 1.0 - smoothstep(0.0, 4.5, uShore - vWorld.z);
        float foam = edge * (0.45 + 0.55 * smoothstep(0.02, 0.12, vWave));
        c = mix(c, vec3(0.93, 0.94, 0.92), clamp(foam, 0.0, 0.85));

        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const water = add(
    new THREE.PlaneGeometry(1400, 900, low ? 60 : 160, low ? 40 : 110),
    waterMaterial,
    [0, LEVEL.lake, SHORE.beachSouth - 450],
    { cast: false, receive: false },
  );
  water.rotation.x = -Math.PI / 2;

  // The lake bed, so the shallows read as water over sand rather than a void.
  const bed = add(new THREE.PlaneGeometry(1400, 900), M.sand, [0, LEVEL.lake - 1.4, SHORE.beachSouth - 450], { cast: false });
  bed.rotation.x = -Math.PI / 2;

  // --- ground -------------------------------------------------------------

  const beach = add(
    new THREE.PlaneGeometry(VILLAGE.halfX * 2 + 60, SHORE.beachNorth - SHORE.beachSouth),
    M.sand,
    [0, LEVEL.beach, (SHORE.beachSouth + SHORE.beachNorth) / 2],
    { cast: false },
  );
  beach.rotation.x = -Math.PI / 2;

  // The ramp up off the beach, and the village floor beyond it.
  const rampDepth = SHORE.rampNorth - SHORE.beachNorth;
  const ramp = add(new THREE.PlaneGeometry(VILLAGE.halfX * 2 + 60, Math.hypot(rampDepth, LEVEL.ground - LEVEL.beach)),
    M.earth, [0, (LEVEL.beach + LEVEL.ground) / 2, (SHORE.beachNorth + SHORE.rampNorth) / 2], { cast: false });
  ramp.rotation.x = -Math.PI / 2 + Math.atan2(LEVEL.ground - LEVEL.beach, rampDepth);

  slab(M.earth, -VILLAGE.halfX - 30, VILLAGE.halfX + 30, LEVEL.ground - 2.2, LEVEL.ground,
    SHORE.rampNorth, VILLAGE.zNorth + 40, { cast: false, name: 'village-ground' });

  // Basalt paving on the shore road, where the traffic was.
  const paving = [];
  for (let x = -VILLAGE.halfX; x < VILLAGE.halfX; x += 2.6) {
    for (let z = SHORE.rampNorth; z < SHORE.promenadeNorth + 1.5; z += 2.2) {
      paving.push({
        p: [x + random() * 0.5, LEVEL.ground + 0.012, z + random() * 0.4],
        ry: random() * 0.25,
        s: [2.1 + random() * 0.5, 0.024, 1.75 + random() * 0.4],
      });
    }
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.basalt, paving, 'shore-paving', { cast: false });

  // --- village blocks -----------------------------------------------------
  // Each block is a mass of basalt with a parapet, a packed-earth roof, and
  // doors and windows punched into the faces that lanes run along.

  const roofClutter = [];

  function houseBlock(x0, x1, z0, z1, height, { doorFaces = ['south'], name = '' } = {}) {
    slab(M.basalt, x0, x1, LEVEL.ground, LEVEL.ground + height, z0, z1, { name });
    // Packed-earth roof surface and the low parapet round it.
    slab(M.earth, x0 + 0.1, x1 - 0.1, LEVEL.ground + height, LEVEL.ground + height + 0.18, z0 + 0.1, z1 - 0.1, { cast: false });
    const p = 0.42;
    slab(M.basalt, x0, x1, LEVEL.ground + height, LEVEL.ground + height + 0.55, z0, z0 + p, { receive: false });
    slab(M.basalt, x0, x1, LEVEL.ground + height, LEVEL.ground + height + 0.55, z1 - p, z1, { receive: false });
    slab(M.basalt, x0, x0 + p, LEVEL.ground + height, LEVEL.ground + height + 0.55, z0, z1, { receive: false });
    slab(M.basalt, x1 - p, x1, LEVEL.ground + height, LEVEL.ground + height + 0.55, z0, z1, { receive: false });

    for (const face of doorFaces) {
      const along = face === 'south' || face === 'north' ? [x0, x1] : [z0, z1];
      for (let t = along[0] + 3.4; t < along[1] - 2.6; t += 6.2) {
        const isDoor = random() > 0.42;
        const w = isDoor ? 1.15 : 0.85;
        const h = isDoor ? 1.95 : 0.75;
        const sill = isDoor ? 0 : 1.5;
        if (face === 'south' || face === 'north') {
          const zz = face === 'south' ? z0 : z1;
          const dir = face === 'south' ? -1 : 1;
          slab(M.timber, t - w, t + w, LEVEL.ground + sill, LEVEL.ground + sill + h, zz + dir * 0.06, zz + dir * 0.12, { cast: false });
          slab(M.timberPale, t - w - 0.18, t + w + 0.18, LEVEL.ground + sill + h, LEVEL.ground + sill + h + 0.22, zz + dir * 0.02, zz + dir * 0.2, { receive: false });
        } else {
          const xx = face === 'west' ? x0 : x1;
          const dir = face === 'west' ? -1 : 1;
          slab(M.timber, xx + dir * 0.06, xx + dir * 0.12, LEVEL.ground + sill, LEVEL.ground + sill + h, t - w, t + w, { cast: false });
          slab(M.timberPale, xx + dir * 0.02, xx + dir * 0.2, LEVEL.ground + sill + h, LEVEL.ground + sill + h + 0.22, t - w - 0.18, t + w + 0.18, { receive: false });
        }
      }
    }

    // Things left on a roof: drying figs, a stack of brushwood, a water jar.
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    roofClutter.push({ p: [cx + (random() - 0.5) * (x1 - x0 - 4), LEVEL.ground + height + 0.36, cz + (random() - 0.5) * (z1 - z0 - 4)], ry: random() * 3, s: [1.6, 0.18, 1.2] });
    roofClutter.push({ p: [cx + (random() - 0.5) * (x1 - x0 - 5), LEVEL.ground + height + 0.44, cz + (random() - 0.5) * (z1 - z0 - 5)], ry: random() * 3, s: [1.1, 0.36, 0.9] });
  }

  for (const block of BLOCKS) {
    houseBlock(block.x0, block.x1, block.z0, block.z1, block.height, {
      doorFaces: block.z0 < 20 ? ['south', 'east'] : ['south', 'west'],
      name: block.id,
    });
  }

  houseBlock(TAX_BOOTH.x0, TAX_BOOTH.x1, TAX_BOOTH.z0, TAX_BOOTH.z1, TAX_BOOTH.height, { doorFaces: ['east'], name: 'tax-booth' });
  // An awning over the booth, which is what a customs post on a hot road is.
  slab(M.cloth, TAX_BOOTH.x1, TAX_BOOTH.x1 + 3.6, LEVEL.ground + 2.5, LEVEL.ground + 2.62, TAX_BOOTH.z0, TAX_BOOTH.z1, { receive: false });
  for (const z of [TAX_BOOTH.z0 + 0.3, TAX_BOOTH.z1 - 0.3]) {
    add(new THREE.CylinderGeometry(0.09, 0.09, 2.5, 6), M.timber, [TAX_BOOTH.x1 + 3.3, LEVEL.ground + 1.25, z]);
  }

  // --- the insula ---------------------------------------------------------
  // The one block you can go inside. Built as four wings around the courtyard
  // so the courtyard is genuinely open to the sky, with the roof carried on
  // real beams and a hole cut through it.

  const ROOF_Y = LEVEL.ground + LEVEL.roof;

  // The east and west wings are solid; the south and north ones have holes cut
  // in them, so they are built as the runs of wall that remain rather than as
  // blocks something is subtracted from afterwards.
  slab(M.basalt, INSULA.x0, COURTYARD.x0, LEVEL.ground, ROOF_Y, COURTYARD.z0, COURTYARD.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD.x1, INSULA.x1, LEVEL.ground, ROOF_Y, COURTYARD.z0, COURTYARD.z1, { name: 'insula-mass' });

  // The floor of the one room that can be entered.
  slab(M.plaster, HOUSE.x0, HOUSE.x1, LEVEL.ground, LEVEL.ground + 0.02, HOUSE.z0, HOUSE.z1, { cast: false, name: 'house-floor' });

  // South wing: walls around the room, with the doorway left open on its
  // courtyard side.
  slab(M.basalt, INSULA.x0, HOUSE.x0, LEVEL.ground, ROOF_Y, INSULA.z0, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x1, INSULA.x1, LEVEL.ground, ROOF_Y, INSULA.z0, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x0, HOUSE.x1, LEVEL.ground, ROOF_Y, INSULA.z0, HOUSE.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x0, HOUSE.doorX0, LEVEL.ground, ROOF_Y, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.doorX1, HOUSE.x1, LEVEL.ground, ROOF_Y, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  // The lintel over the door.
  slab(M.basalt, HOUSE.doorX0, HOUSE.doorX1, LEVEL.ground + 2.0, ROOF_Y, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.timber, HOUSE.doorX0 - 0.1, HOUSE.doorX1 + 0.1, LEVEL.ground + 1.94, LEVEL.ground + 2.06, HOUSE.z1 - 0.1, COURTYARD.z0 + 0.1, { receive: false });

  // North wing: the passage from the lane into the courtyard, left open.
  slab(M.basalt, INSULA.x0, COURTYARD_ENTRY.x0, LEVEL.ground, ROOF_Y, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD_ENTRY.x1, INSULA.x1, LEVEL.ground, ROOF_Y, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD_ENTRY.x0, COURTYARD_ENTRY.x1, LEVEL.ground + 2.3, ROOF_Y, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });

  // The roof: beams across the wings, brushwood over them, packed earth on top,
  // with the opening left through all three layers.
  const roofPanels = [
    [INSULA.x0, INSULA.x1, INSULA.z0, ROOF_OPENING.z0],
    [INSULA.x0, INSULA.x1, ROOF_OPENING.z1, COURTYARD.z0],
    [INSULA.x0, ROOF_OPENING.x0, ROOF_OPENING.z0, ROOF_OPENING.z1],
    [ROOF_OPENING.x1, INSULA.x1, ROOF_OPENING.z0, ROOF_OPENING.z1],
    [INSULA.x0, INSULA.x1, COURTYARD.z1, INSULA.z1],
    [INSULA.x0, COURTYARD.x0, COURTYARD.z0, COURTYARD.z1],
    [COURTYARD.x1, INSULA.x1, COURTYARD.z0, COURTYARD.z1],
  ];
  for (const [x0, x1, z0, z1] of roofPanels) {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
    slab(M.earth, x0, x1, ROOF_Y, ROOF_Y + 0.16, z0, z1, { name: 'roof-surface' });
    slab(M.thatch, x0, x1, ROOF_Y - 0.14, ROOF_Y, z0, z1, { cast: false });
  }

  // Beams under the roof of the room, visible from inside and through the hole
  // — the layer the four men had to break through.
  const beams = [];
  for (let x = HOUSE.x0 + 0.5; x < HOUSE.x1; x += 0.62) {
    const throughOpening = x > ROOF_OPENING.x0 - 0.2 && x < ROOF_OPENING.x1 + 0.2;
    if (throughOpening) {
      beams.push({ p: [x, ROOF_Y - 0.26, (HOUSE.z0 + ROOF_OPENING.z0) / 2], s: [0.13, 0.16, ROOF_OPENING.z0 - HOUSE.z0] });
      beams.push({ p: [x, ROOF_Y - 0.26, (ROOF_OPENING.z1 + HOUSE.z1) / 2], s: [0.13, 0.16, HOUSE.z1 - ROOF_OPENING.z1] });
    } else {
      beams.push({ p: [x, ROOF_Y - 0.26, (HOUSE.z0 + HOUSE.z1) / 2], s: [0.13, 0.16, HOUSE.z1 - HOUSE.z0] });
    }
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.timber, beams, 'roof-beams');

  // Broken ends around the hole, and the spoil pushed aside on the roof.
  const brokenEnds = [];
  for (let x = ROOF_OPENING.x0; x < ROOF_OPENING.x1; x += 0.62) {
    for (const z of [ROOF_OPENING.z0 - 0.18, ROOF_OPENING.z1 + 0.18]) {
      brokenEnds.push({ p: [x, ROOF_Y - 0.26, z], ry: (random() - 0.5) * 0.3, s: [0.13, 0.15, 0.5] });
    }
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.timberPale, brokenEnds, 'roof-broken-ends');

  const spoil = [];
  for (let i = 0; i < (low ? 14 : 34); i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 2.2 + random() * 2.6;
    spoil.push({
      p: [
        (ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2 + Math.cos(angle) * distance,
        ROOF_Y + 0.2 + random() * 0.12,
        (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2 + Math.sin(angle) * distance,
      ],
      ry: random() * 3,
      s: [0.3 + random() * 0.5, 0.09 + random() * 0.12, 0.3 + random() * 0.45],
    });
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.earth, spoil, 'roof-spoil');

  // The outside stair, as real treads.
  const treads = [];
  const treadCount = 14;
  for (let i = 0; i < treadCount; i += 1) {
    const t = i / (treadCount - 1);
    const z = ROOF_STAIR.zBottom - t * (ROOF_STAIR.zBottom - ROOF_STAIR.zTop);
    const y = LEVEL.ground + t * LEVEL.roof;
    treads.push({
      p: [(ROOF_STAIR.x0 + ROOF_STAIR.x1) / 2, y - 0.12, z],
      s: [ROOF_STAIR.x1 - ROOF_STAIR.x0, 0.24 + y * 0.5, (ROOF_STAIR.zBottom - ROOF_STAIR.zTop) / treadCount + 0.3],
    });
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.basalt, treads, 'roof-stair');

  // --- inside the room ----------------------------------------------------
  // Lit from the hole above, which is the only reason to come in here.

  const shaftCentre = [
    (ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2,
    (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2,
  ];

  const roomLight = new THREE.PointLight(0xffe6bd, 26, 16, 2);
  roomLight.position.set(shaftCentre[0], LEVEL.ground + 2.2, shaftCentre[1]);
  root.add(roomLight);
  // Base intensity, scaled by the hour in update(): daylight drowns a lamp,
  // and at night it is the only thing burning in the whole insula.
  const ROOM_LIGHT_BASE = 26;

  // The shaft of light itself: a frustum from the hole down to a slightly wider
  // patch on the floor, fading as it falls.
  const shaftGeometry = new THREE.BufferGeometry();
  {
    const spread = 0.9;
    const top = [
      [ROOF_OPENING.x0, ROOF_Y - 0.3, ROOF_OPENING.z0],
      [ROOF_OPENING.x1, ROOF_Y - 0.3, ROOF_OPENING.z0],
      [ROOF_OPENING.x1, ROOF_Y - 0.3, ROOF_OPENING.z1],
      [ROOF_OPENING.x0, ROOF_Y - 0.3, ROOF_OPENING.z1],
    ];
    // The sun is low and to the south-east, so the patch lands offset, not
    // directly beneath — which is what makes it read as sunlight.
    const drift = [-1.5, 1.1];
    const bottom = top.map(([x, , z]) => [
      shaftCentre[0] + (x - shaftCentre[0]) * (1 + spread) + drift[0],
      LEVEL.ground + 0.03,
      shaftCentre[1] + (z - shaftCentre[1]) * (1 + spread) + drift[1],
    ]);
    const positions = [];
    const fade = [];
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      positions.push(...top[i], ...top[j], ...bottom[j], ...top[i], ...bottom[j], ...bottom[i]);
      fade.push(1, 1, 0, 1, 0, 0);
    }
    shaftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    shaftGeometry.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  }
  const shaftMaterial = track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aFade;
      varying float vFade;
      void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uTime;
      varying float vFade;
      void main() {
        // Dust turning in the beam keeps it from looking like a solid wedge.
        float motes = 0.9 + 0.1 * sin(uTime * 1.7);
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * 0.30 * vFade * motes, 0.30 * vFade * motes);
      }
    `,
  }));
  const shaft = add(shaftGeometry, shaftMaterial, [0, 0, 0], { cast: false, receive: false, name: 'light-shaft' });
  shaft.renderOrder = 2;

  // The lit patch where it lands, and the mat it lands on.
  const patch = add(new THREE.PlaneGeometry(4.4, 4.0), track(new THREE.MeshBasicMaterial({
    color: 0xffe0a8, transparent: true, opacity: 0.5, depthWrite: false,
  })), [shaftCentre[0] - 1.5, LEVEL.ground + 0.03, shaftCentre[1] + 1.1], { cast: false, receive: false });
  patch.rotation.x = -Math.PI / 2;
  patch.renderOrder = 1;

  const mat = add(new THREE.BoxGeometry(1.9, 0.07, 0.8), M.cloth,
    [shaftCentre[0] - 1.5, LEVEL.ground + 0.06, shaftCentre[1] + 1.1], { cast: false });
  mat.rotation.y = 0.24;

  // Benches and jars round the walls of the room.
  slab(M.basalt, HOUSE.x0 + 0.3, HOUSE.x0 + 0.9, LEVEL.ground, LEVEL.ground + 0.45, HOUSE.z0 + 0.6, HOUSE.z1 - 0.6);
  slab(M.basalt, HOUSE.x1 - 0.9, HOUSE.x1 - 0.3, LEVEL.ground, LEVEL.ground + 0.45, HOUSE.z0 + 0.6, HOUSE.z1 - 0.6);
  const jarGeometry = new THREE.CylinderGeometry(0.24, 0.16, 0.62, 9);
  instances(jarGeometry, M.plaster, [
    { p: [HOUSE.x0 + 1.4, LEVEL.ground + 0.31, HOUSE.z0 + 0.9] },
    { p: [HOUSE.x0 + 2.0, LEVEL.ground + 0.31, HOUSE.z0 + 0.7] },
    { p: [HOUSE.x1 - 1.5, LEVEL.ground + 0.31, HOUSE.z1 - 1.0] },
  ], 'house-jars');

  // --- the synagogue ------------------------------------------------------
  // Black basalt, and deliberately plain. The white limestone building in every
  // photograph of Capernaum is three centuries later than this scene; it stands
  // on the basalt foundation of the one Jesus taught in, and that foundation is
  // what is reconstructed here.

  slab(M.basaltDressed, SYNAGOGUE.podiumX0, SYNAGOGUE.podiumX1, LEVEL.ground - 0.4, LEVEL.ground + LEVEL.platform,
    SYNAGOGUE.podiumZ0, SYNAGOGUE.podiumZ1, { name: 'synagogue-podium' });

  const stepCount = 5;
  for (let i = 0; i < stepCount; i += 1) {
    const t = i / stepCount;
    const z0 = SYNAGOGUE.stepsZ0 + t * (SYNAGOGUE.stepsZ1 - SYNAGOGUE.stepsZ0);
    slab(M.basaltDressed, SYNAGOGUE.podiumX0, SYNAGOGUE.podiumX1, LEVEL.ground - 0.3,
      LEVEL.ground + ((i + 1) / stepCount) * LEVEL.platform, z0, SYNAGOGUE.stepsZ1, { cast: false });
  }

  const SYN_TOP = LEVEL.ground + LEVEL.platform;
  const SYN_HEIGHT = 7.4;
  const inX0 = SYNAGOGUE.x0 + SYNAGOGUE.wall;
  const inX1 = SYNAGOGUE.x1 - SYNAGOGUE.wall;
  const inZ0 = SYNAGOGUE.z0 + SYNAGOGUE.wall;
  const inZ1 = SYNAGOGUE.z1 - SYNAGOGUE.wall;

  slab(M.basaltDressed, SYNAGOGUE.x0, inX0, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, SYNAGOGUE.z1);
  slab(M.basaltDressed, inX1, SYNAGOGUE.x1, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, SYNAGOGUE.z1);
  slab(M.basaltDressed, inX0, inX1, SYN_TOP, SYN_TOP + SYN_HEIGHT, inZ1, SYNAGOGUE.z1);
  slab(M.basaltDressed, inX0, SYNAGOGUE.doorX0, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0);
  slab(M.basaltDressed, SYNAGOGUE.doorX1, inX1, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0);
  slab(M.basaltDressed, SYNAGOGUE.doorX0, SYNAGOGUE.doorX1, SYN_TOP + 3.1, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0);
  slab(M.timber, SYNAGOGUE.doorX0 - 0.2, SYNAGOGUE.doorX1 + 0.2, SYN_TOP + 3.0, SYN_TOP + 3.24, SYNAGOGUE.z0 - 0.1, inZ0 + 0.1, { receive: false });

  // Roof carried on two rows of columns, as these halls were.
  const synColumns = [];
  const synCapitals = [];
  for (const x of [inX0 + 2.6, inX1 - 2.6]) {
    for (let z = inZ0 + 2.4; z < inZ1 - 1.4; z += 3.6) {
      synColumns.push({ p: [x, SYN_TOP + 2.6, z] });
      synCapitals.push({ p: [x, SYN_TOP + 5.3, z] });
    }
  }
  instances(new THREE.CylinderGeometry(0.34, 0.42, 5.2, low ? 8 : 14), M.basaltDressed, synColumns, 'synagogue-columns');
  instances(new THREE.BoxGeometry(1.0, 0.34, 1.0), M.basaltDressed, synCapitals, 'synagogue-capitals');

  slab(M.timber, SYNAGOGUE.x0 - 0.4, SYNAGOGUE.x1 + 0.4, SYN_TOP + SYN_HEIGHT, SYN_TOP + SYN_HEIGHT + 0.4,
    SYNAGOGUE.z0 - 0.4, SYNAGOGUE.z1 + 0.4, { receive: false });

  // Stone benches around the inside walls, where the congregation sat.
  slab(M.basaltDressed, inX0, inX0 + 0.75, SYN_TOP, SYN_TOP + 0.46, inZ0, inZ1);
  slab(M.basaltDressed, inX1 - 0.75, inX1, SYN_TOP, SYN_TOP + 0.46, inZ0, inZ1);
  slab(M.basaltDressed, inX0, inX1, SYN_TOP, SYN_TOP + 0.46, inZ1 - 0.75, inZ1);

  // --- boats --------------------------------------------------------------
  // Proportioned on the first-century hull dug out of the lake mud at Ginosar
  // in 1986: 8.2m long, 2.3m in the beam.

  function hullGeometry() {
    const length = 8.2;
    const beam = 2.3;
    const depth = 1.25;
    const rings = 16;
    const sides = 9;
    const positions = [];
    const indices = [];
    for (let i = 0; i <= rings; i += 1) {
      const t = i / rings;
      const z = (t - 0.5) * length;
      // Fine at the ends, full amidships, with the bow a little sharper.
      const fullness = Math.sin(Math.PI * t) ** 0.62;
      const halfBeam = (beam / 2) * fullness;
      const draft = depth * (0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.5);
      for (let j = 0; j <= sides; j += 1) {
        const u = j / sides;
        const angle = Math.PI * (u - 0.5);
        positions.push(Math.sin(angle) * halfBeam, -Math.cos(angle) * draft + depth * 0.5, z);
      }
    }
    for (let i = 0; i < rings; i += 1) {
      for (let j = 0; j < sides; j += 1) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  const hull = hullGeometry();
  for (const boat of BOATS) {
    const y = boat.beached ? LEVEL.beach + 0.15 : LEVEL.lake + 0.35;
    const group = new THREE.Group();
    group.position.set(boat.x, y, boat.z);
    group.rotation.y = boat.rotation;
    group.name = boat.id;
    root.add(group);

    const shell = new THREE.Mesh(hull, M.timber);
    shell.name = `${boat.id}-hull`;
    if (!low) {
      shell.castShadow = true;
      shell.receiveShadow = true;
    }
    group.add(shell);

    // Gunwale, thwarts, ribs, and a mast on the anchored one.
    add(new THREE.BoxGeometry(2.42, 0.12, 8.3), M.timberPale, [0, 0.62, 0], { parent: group, receive: false });
    for (const tz of [-2.2, 0, 2.2]) {
      add(new THREE.BoxGeometry(2.0, 0.09, 0.34), M.timberPale, [0, 0.5, tz], { parent: group });
    }
    if (!boat.beached) {
      add(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), M.timber, [0, 2.6, -0.4], { parent: group });
      const sail = add(new THREE.PlaneGeometry(2.6, 3.4), M.cloth, [0, 3.2, -0.35], { parent: group, receive: false });
      sail.rotation.y = Math.PI / 2;
    } else {
      // Nets spread over the side to dry, which is what they were doing when
      // they were called.
      const net = add(new THREE.PlaneGeometry(3.2, 2.4), M.net, [1.3, 0.1, 1.2], { parent: group, cast: false });
      net.rotation.set(-Math.PI / 2.3, 0.3, 0);
    }
  }

  // --- quayside, yards, trees ---------------------------------------------

  for (const item of QUAYSIDE) {
    slab(M.timber, item.x - item.w / 2, item.x + item.w / 2, LEVEL.ground, LEVEL.ground + item.h * 0.25,
      item.z - item.d / 2, item.z + item.d / 2);
    if (item.id.startsWith('nets')) {
      // A drying frame with a net slung over it.
      for (const side of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.07, 0.07, item.h * 1.5, 6), M.timber,
          [item.x + side * (item.w / 2 - 0.2), LEVEL.ground + item.h * 0.75, item.z]);
      }
      const drape = add(new THREE.PlaneGeometry(item.w - 0.4, item.h * 1.2), M.net,
        [item.x, LEVEL.ground + item.h * 0.75, item.z], { cast: false });
      drape.rotation.y = Math.PI / 2 - 0.1;
    } else {
      const pile = [];
      for (let i = 0; i < 6; i += 1) {
        pile.push({
          p: [item.x + (random() - 0.5) * item.w * 0.7, LEVEL.ground + item.h * 0.25 + 0.22 + random() * 0.3,
            item.z + (random() - 0.5) * item.d * 0.7],
          ry: random() * 3,
          s: [0.5, 0.42, 0.5],
        });
      }
      instances(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 8), M.reed, pile, `${item.id}-pile`);
    }
  }

  for (const thing of YARD_THINGS) {
    if (thing.id === 'oven') {
      // A tabun: a clay dome with its mouth on one side.
      const domeGeometry = new THREE.SphereGeometry(thing.radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      add(domeGeometry, M.plaster, [thing.x, LEVEL.ground, thing.z]);
      add(new THREE.BoxGeometry(0.45, 0.4, 0.3), M.timber, [thing.x, LEVEL.ground + 0.2, thing.z + thing.radius]);
    } else if (thing.id === 'millstone') {
      add(new THREE.CylinderGeometry(thing.radius, thing.radius, 0.34, 16), M.basalt, [thing.x, LEVEL.ground + 0.17, thing.z]);
      add(new THREE.CylinderGeometry(thing.radius * 0.62, thing.radius * 0.7, 0.42, 14), M.basalt, [thing.x, LEVEL.ground + 0.55, thing.z]);
    } else {
      const jars = [];
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        jars.push({ p: [thing.x + Math.cos(angle) * thing.radius * 0.6, LEVEL.ground + 0.42, thing.z + Math.sin(angle) * thing.radius * 0.6] });
      }
      instances(new THREE.CylinderGeometry(0.28, 0.2, 0.84, 9), M.plaster, jars, `${thing.id}-jars`);
    }
  }

  for (const tree of TREES) {
    if (tree.kind === 'palm') {
      const trunkHeight = 5.4 + random() * 1.8;
      const trunk = add(new THREE.CylinderGeometry(0.22, 0.34, trunkHeight, 8), M.timber,
        [tree.x, LEVEL.ground + trunkHeight / 2, tree.z]);
      trunk.rotation.z = (random() - 0.5) * 0.12;
      const fronds = [];
      for (let i = 0; i < 11; i += 1) {
        const angle = (i / 11) * Math.PI * 2 + random() * 0.2;
        fronds.push({
          p: [tree.x + Math.cos(angle) * 1.5, LEVEL.ground + trunkHeight + 0.2 - random() * 0.5, tree.z + Math.sin(angle) * 1.5],
          ry: -angle,
          rz: 0.5 + random() * 0.35,
          s: [3.4, 1, 0.5],
        });
      }
      instances(new THREE.PlaneGeometry(1, 1), M.frond, fronds, `palm-${tree.x}-${tree.z}`, { cast: !low });
    } else {
      const trunkHeight = 2.6;
      add(new THREE.CylinderGeometry(0.28, 0.42, trunkHeight, 8), M.timber, [tree.x, LEVEL.ground + trunkHeight / 2, tree.z]);
      const canopy = [];
      for (let i = 0; i < 9; i += 1) {
        canopy.push({
          p: [tree.x + (random() - 0.5) * 3.4, LEVEL.ground + trunkHeight + 0.4 + random() * 1.6, tree.z + (random() - 0.5) * 3.4],
          s: [1.5 + random(), 1.1 + random() * 0.6, 1.5 + random()],
        });
      }
      instances(new THREE.SphereGeometry(1, 7, 5), M.leaf, canopy, `fig-${tree.x}-${tree.z}`);
    }
  }

  // --- the crowd ----------------------------------------------------------
  // A village with nobody in it reads as a ruin, which is exactly the wrong
  // impression for this scene. Some stand, some walk, and — this is the part
  // that matters — they stand in knots of two to four rather than one big
  // ring, because a village square is several conversations, not one crowd
  // staring at a single point. The previous version put thirteen people in a
  // 3m circle at the shore, all facing the middle, with a closest pair 0.08m
  // apart and four of them floating up to half a metre above the ramp they
  // were "standing" on. See the plan's §1.7-1.8.

  const pick = (list) => list[Math.floor(random() * list.length)];
  // Nobody stands where a walker can't — the real navigation mesh, not a
  // guess, and the reason the old haunt at the shore overlapped a net frame.
  const clearAt = (x, z) => !blockerAt(x, z, 0);
  // The height under a villager, from the same surfaces a walker's feet use.
  // The old version was a two-level step function that put four of the
  // thirteen shore villagers up to 0.52m above the ramp they stood on.
  const groundAt = (x, z) => {
    const floor = floorAt(x, z, 0);
    return floor ? floor.height : LEVEL.ground;
  };

  // Where people actually congregate, what they are doing there, and how
  // much of the standing crowd each haunt gets. `spread` is a clear radius —
  // measured against the real navigation mesh, not a guess — and the shares
  // sum to 0.88, leaving 12% to stand or walk alone along the lanes instead
  // of in a knot (a village where everyone is in a group is as wrong as one
  // where nobody is). `faceAt`, where given, is what a haunt's knots face
  // instead of their own middle: the water, the courtyard, the synagogue
  // door — because a knot facing the thing it is doing reads as people, and
  // a haunt where everyone faces the exact centre of the group reads as a
  // séance.
  const HAUNTS = [
    {
      id: 'shore-nets', at: [8, -16.5], spread: 2.0, share: 0.16, faceAt: [8, -20],
      activities: ['working', 'working', 'talking', 'sitting'],
    },
    {
      id: 'promenade-west', at: [-14, -8], spread: 2.8, share: 0.12,
      activities: ['talking', 'attending', 'standing'],
    },
    {
      id: 'courtyard', at: [24, 22.5], spread: 1.8, share: 0.14, faceAt: [22, 20],
      activities: ['talking', 'attending', 'carrying'],
    },
    {
      id: 'synagogue-steps', at: [-19, 24], spread: 1.6, share: 0.14, faceAt: [-19, 28],
      activities: ['talking', 'attending', 'attending', 'sitting'],
    },
    {
      id: 'tax-booth-queue', at: [-48, 4], spread: 1.6, share: 0.10, faceAt: [-52, 0],
      activities: ['sitting', 'talking', 'attending'],
    },
    {
      id: 'north-lane', at: [30, 40], spread: 3.2, share: 0.12,
      activities: ['standing', 'carrying', 'working'],
    },
    {
      id: 'lane-crossing', at: [0, 4], spread: 3.2, share: 0.10,
      activities: ['standing', 'talking', 'carrying'],
    },
  ];

  const villagers = [];
  const standingCount = low ? 22 : 46;
  const hauntFirstIndex = {};

  // `minSeparation` inside `gather()`/`knot()` only rejects a candidate
  // against the other members of that *same* call — it has no way to know
  // about a different haunt's knot, or a loner scattered afterward. Folding
  // "not already occupied" into `clearAt` itself, and growing this list as
  // each group is placed, means every single accepted position — across the
  // whole village, in one pass — keeps its distance from everyone placed
  // before it. (An earlier version instead ran one global relaxation pass at
  // the end; pushing apart a cross-haunt pair could shove one of them into a
  // neighbour from its own, already-correctly-spaced knot — fixing one
  // violation by creating another. Checking at placement time has no such
  // failure mode.)
  const placedSoFar = [];
  const clearOfEveryone = (x, z) => clearAt(x, z)
    && !placedSoFar.some((p) => Math.hypot(p.x - x, p.z - z) < 0.62);

  for (const haunt of HAUNTS) {
    hauntFirstIndex[haunt.id] = villagers.length;
    // Capped at 5: a haunt's own clear radius (1.6 to 3.2m, measured against
    // the real navigation mesh) is too small to split more than that into
    // knots that read as separate groups rather than one crowded one — the
    // overflow goes to the loner pool below instead of being crammed in.
    const count = Math.min(5, Math.max(1, Math.round(standingCount * haunt.share)));
    // A haunt bigger than one knot can comfortably hold splits into several,
    // spaced evenly around its own centre rather than by retrying random
    // offsets against a minimum separation — a haunt's clear radius (1.6 to
    // 3.2m here) is too small for two knots to ever land 3m apart, so a
    // retry loop with that target never terminates usefully and every knot
    // collapses back onto the first. Evenly spaced points at a fraction of
    // the clear radius are separated by construction, in proportion to
    // however much room the haunt actually has.
    const numKnots = Math.max(1, Math.ceil(count / 4));
    const baseSize = Math.floor(count / numKnots);
    let extra = count - baseSize * numKnots;

    for (let k = 0; k < numKnots; k += 1) {
      const size = baseSize + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      let centre = haunt.at;
      if (numKnots > 1) {
        const angle = (k / numKnots) * Math.PI * 2 + random() * 0.4;
        const distance = haunt.spread * 0.55;
        centre = [haunt.at[0] + Math.cos(angle) * distance, haunt.at[1] + Math.sin(angle) * distance];
      }
      const spots = knot(random, centre, size, {
        clearAt: clearOfEveryone, floorAt: groundAt, minSeparation: 0.62, faceAt: haunt.faceAt,
      });
      spots.forEach((spot) => {
        villagers.push({
          ...spot,
          activity: pick(haunt.activities),
          colour: pick(ROBE_PALETTE),
          phase: random() * 12,
          scale: 0.92 + random() * 0.15,
        });
      });
      placedSoFar.push(...spots);
    }
  }

  // A handful of loners and pairs along the lanes, facing one of the four
  // roughly-cardinal headings the lanes actually run rather than an
  // arbitrary angle, so they read as walking-and-stopped rather than planted.
  scatter(random, Math.max(0, standingCount - villagers.length), {
    x0: -VILLAGE.halfX + 4,
    x1: VILLAGE.halfX - 4,
    z0: SHORE.beachNorth,
    z1: VILLAGE.zNorth - 2,
    clearAt: clearOfEveryone,
    floorAt: groundAt,
  }).forEach((spot) => {
    const laneHeading = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    villagers.push({
      ...spot,
      facing: laneHeading + (random() - 0.5) * 0.5,
      activity: pick(['standing', 'talking', 'carrying']),
      colour: pick(ROBE_PALETTE),
      phase: random() * 12,
      scale: 0.92 + random() * 0.15,
    });
    placedSoFar.push(spot);
  });

  // The two named GLB actors (below) suppress a specific fallback figure by
  // id when they are the one actually rendered — tied to which haunt that
  // figure really stands at, not to its position in the array.
  if (villagers[hauntFirstIndex['shore-nets']]) {
    villagers[hauntFirstIndex['shore-nets']].id = 'villager-shore-net-0';
  }
  if (villagers[hauntFirstIndex.courtyard]) {
    villagers[hauntFirstIndex.courtyard].id = 'villager-courtyard-grind-0';
  }

  villagers.forEach((figure, index) => { figure.id ||= `cap-villager-${index}`; });
  const villagerCrowd = createCrowd(THREE, {
    figures: villagers,
    quality,
    name: 'villagers',
    groundAt,
  });
  root.add(villagerCrowd.group);

  // Walkers, moved every frame along a handful of routes through the
  // village — each one walked end to end against `blockerAt` before being
  // trusted here. Three of the previous five routes ran through solid
  // buildings for a third to over half their length; see the plan's §1.2 and
  // its route-by-route audit. Speeds are metres per second (sceneRoutes.js),
  // not the old route-fraction units that turned an 86m lane into a sprint.
  const ROUTES = [
    { route: [[-16, -6.2], [18, -6.2]], speed: 1.15 }, // the shore promenade
    { route: [[6, -5.5], [6, 34]], speed: 1.20 }, // the lane past the insula
    { route: [[-26, 1], [-26, 25]], speed: 1.10 }, // the west lane
    { route: [[36, 21], [36, 2]], speed: 1.25 }, // the east lane
    { route: [[32, 31], [32, 49]], speed: 1.05 }, // the north lane
    { route: [[-48, -2], [-48, 11]], speed: 1.00 }, // approaching the tax booth
    { route: [[22, 35], [22, 29]], speed: 0.95 }, // in and out of the courtyard
    { route: [[18, -16], [30, -16]], speed: 0.90 }, // along the beach
  ];
  const walkerCount = low ? 10 : 22;
  const walkerFigures = [];
  for (let i = 0; i < walkerCount; i += 1) {
    const base = ROUTES[i % ROUTES.length];
    walkerFigures.push({
      route: base.route,
      activity: 'walking',
      speed: base.speed * (0.92 + random() * 0.16),
      // Phased across the whole period, not a `% 2` cycle, so a lane does
      // not read as a column of walkers all reaching the same point in step.
      phase: random(),
      lane: (random() - 0.5) * 1.6,
      colour: pick(ROBE_PALETTE),
      scale: 0.92 + random() * 0.15,
    });
  }
  if (walkerFigures[0]) walkerFigures[0].id = 'walker-north-lane-0';
  walkerFigures.forEach((figure, index) => { figure.id ||= `cap-walker-${index}`; });
  const walkerCrowd = createCrowd(THREE, {
    figures: walkerFigures,
    quality,
    name: 'walkers',
    groundAt,
  });
  root.add(walkerCrowd.group);

  // --- what a fishing village leaves lying about ---------------------------
  // Capernaum lived off the lake. Nets, baskets for the catch, jars, and the
  // stone weights and rope that go with a boat — piled where the boats come in
  // and where the lanes meet.

  const propItems = [];
  for (let i = 0; i < (low ? 5 : 10); i += 1) {
    propItems.push(...heap(random, ['basket', 'jar', 'ropeCoil', 'crate'], {
      at: [-30 + random() * 62, SHORE.beachSouth + 2 + random() * 7],
      y: LEVEL.beach,
      count: 2 + Math.floor(random() * 3),
      radius: 0.85,
    }));
  }
  // Nets spread out to dry above the waterline — flat, so they read as cloth
  // on the ground rather than as objects standing on it.
  for (let i = 0; i < (low ? 3 : 7); i += 1) {
    propItems.push({
      kind: 'awning',
      x: -34 + random() * 70,
      z: SHORE.beachSouth + 1 + random() * 5,
      y: LEVEL.beach + 0.03,
      rotation: random() * Math.PI,
      scale: 0.7 + random() * 0.5,
    });
  }
  // Household things against the walls of the insula and along the lanes.
  propItems.push(...alongWall(random, ['waterJar', 'jar', 'basket', 'bundle'], {
    from: INSULA.z0 + 1.5, to: INSULA.z1 - 1.5, at: INSULA.x1, axis: 'z',
    y: LEVEL.ground, count: low ? 4 : 8, offset: 0.7,
  }));
  propItems.push(...heap(random, ['waterJar', 'basket', 'sack'], {
    at: [21, 22], y: LEVEL.ground, count: low ? 3 : 5, radius: 1.2,
  }));
  propItems.push(...heap(random, ['crate', 'sack', 'jar'], {
    at: [-50, 3], y: LEVEL.ground, count: low ? 3 : 5, radius: 1.1,
  }));

  const props = createProps(THREE, { items: propItems, quality });
  root.add(props.group);

  instances(new THREE.BoxGeometry(1, 1, 1), M.reed, roofClutter, 'roof-clutter');

  // --- the land beyond ----------------------------------------------------

  // The hills of Galilee rising behind the village.
  const ridge = add(new THREE.SphereGeometry(320, 24, 14), M.hill, [-30, -230, 430], { cast: false, name: 'ridge-horizon' });
  ridge.scale.set(1.8, 0.85, 1);
  const ridgeEast = add(new THREE.SphereGeometry(260, 20, 12), M.hill, [330, -200, 300], { cast: false });
  ridgeEast.scale.set(1.3, 0.72, 1);
  // The Golan on the far side of the water, hazed by distance.
  const golan = add(new THREE.SphereGeometry(420, 24, 14), M.hill, [120, -320, -700], { cast: false });
  golan.scale.set(2.1, 0.86, 1);

  // --- animation ----------------------------------------------------------

  function update(elapsed) {
    waterUniforms.uTime.value = elapsed;
    shaftMaterial.uniforms.uTime.value = elapsed;

    // Lamplight tracks the hour, and flickers, because an oil lamp does.
    const flicker = 1 + Math.sin(elapsed * 6.1) * 0.07 + Math.sin(elapsed * 2.7) * 0.04;
    roomLight.intensity = ROOM_LIGHT_BASE * (0.35 + lighting.current.lamps * 1.5) * flicker;

    // The villagers shift and gesture where they stand; the walkers walk their
    // routes. Both are sceneFigures.js doing the same job with the same rig —
    // the only difference is whether the figure was given somewhere to go.
    villagerCrowd.update(elapsed);
    walkerCrowd.update(elapsed);
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    materialSet.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    villagerCrowd.dispose();
    walkerCrowd.dispose();
    props.dispose();
  }

  const humans = createSceneHumans({
    sceneSlug: 'capernaum',
    THREE,
    root,
    floorAt,
    crowdFigures: [...villagers, ...walkerFigures],
    qualityProfile: quality,
    reducedMotion,
    onFallbackSuppressed: (fallbackId, isSuppressed) => {
      villagerCrowd.suppress(fallbackId, isSuppressed);
      walkerCrowd.suppress(fallbackId, isSuppressed);
    },
  });

  const assetManager = createCapernaumAssetManager({ root, humans }, THREE);

  return {
    root,
    sun,
    lighting,
    humans,
    update: (elapsed) => update(elapsed),
    dispose: () => {
      assetManager.detach();
      humans.dispose();
      dispose();
    },
    fog: resolveTimeOfDay(timeOfDay).fog,
    exposure: resolveTimeOfDay(timeOfDay).exposure,
    occluders,
    // Raw placement data, before it goes through createCrowd's per-frame
    // pose — a bent-over `working` figure's rendered torso can sit tens of
    // centimetres from its own placed (x, z), which is exactly the lean that
    // makes bending over read as bending over. Tests that care where a
    // figure was actually *placed* (on the floor, clear of a blocker, apart
    // from its neighbours) belong here, not on the rendered mesh.
    debugCrowd: { villagers, walkerFigures },
    applyAssets: (group) => assetManager.applyGroup(group),
    applyQuality: (profile) => {
      humans.setQuality(profile);
      // Dynamic profile updates (visibility/detail)
      if (profile?.dynamicActors !== undefined) {
        // Can scale crowd visibility if needed
      }
    },
  };
}
