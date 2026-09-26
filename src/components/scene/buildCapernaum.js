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
import { createMark2Tableau, inTableauArea } from './mark2Tableau.js';
import { createMatthew9Tableau, inMatthewTableauArea } from './matthew9Tableau.js';
import { createCapernaumFleet, netTexture, netDrapeGeometry } from './capernaumBoats.js';
import { createCapernaumLandscape } from './capernaumLandscape.js';
import { createGalileeWater } from './capernaumWater.js';
import { createCapernaumSky } from './capernaumSky.js';
import { createCapernaumLife } from './capernaumLife.js';
import { createInstancedCrowd } from './sceneInstancedHumans.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  floorAt, blockerAt, ROOF_STAIR_TREADS, SYNAGOGUE_STEP_COUNT,
} from './capernaumNavigation';
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
  PIERS,
  PIER_DECK,
  ROOF_PARAPET,
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

  // Anonymous static pieces the builder itself makes: candidates for being
  // merged into one mesh per material once the architecture is built (see
  // mergeStatic below). Named meshes are left alone — tests, tableaus and the
  // asset manager look them up by name.
  const anonymous = new Set();
  const add = (geometry, material, [x, y, z], { cast = true, receive = true, parent = root, name = '' } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
    parent.add(mesh);
    if (!name && parent === root) anonymous.add(mesh);
    return mesh;
  };

  // Positioned by extents rather than centre, the way the site plan is written.
  // Extents are normalised because a face on the south or west side of a block
  // is naturally written as `wall + dir * thickness`, which runs backwards when
  // dir is -1 — and a box with a negative dimension is invisible rather than
  // wrong-looking, so it disappears without complaint.
  const occluders = [];
  // Everything a third-person camera may not pass through: the masonry, the
  // roofs, the treads. Not the ground (the camera rig keeps itself above the
  // floor) and not the small furniture of a room, which is only ever
  // something to see past. See sceneThirdPerson.js.
  const cameraColliders = [];
  const SOLID = new Set();
  const slab = (material, x0, x1, y0, y1, z0, z1, opts = {}) => {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    const mesh = add(new THREE.BoxGeometry(bx - ax, by - ay, bz - az), material,
      [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], opts);
    if (opts.name === 'insula-mass' || opts.name === 'roof-surface' || opts.name?.startsWith?.('synagogue-wall') || opts.occlude) {
      occluders.push(mesh);
    }
    if (opts.collide ?? (SOLID.has(material) && opts.name !== 'village-ground' && by - ay > 0.3)) {
      cameraColliders.push(mesh);
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

  function mergeStatic(keep) {
    const buckets = new Map();
    for (const mesh of anonymous) {
      if (keep.has(mesh) || mesh.parent !== root || Array.isArray(mesh.material)) continue;
      const occludes = occluders.includes(mesh);
      const collides = cameraColliders.includes(mesh);
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${occludes}|${collides}`;
      if (!buckets.has(key)) buckets.set(key, { meshes: [], occludes, collides });
      buckets.get(key).meshes.push(mesh);
    }
    for (const { meshes, occludes, collides } of buckets.values()) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((mesh) => {
        mesh.updateMatrix();
        const piece = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const name of Object.keys(piece.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) piece.deleteAttribute(name);
        }
        return piece.applyMatrix4(mesh.matrix);
      });
      const merged = new THREE.Mesh(mergeGeometries(pieces, false), meshes[0].material);
      pieces.forEach((piece) => piece.dispose());
      merged.castShadow = meshes[0].castShadow;
      merged.receiveShadow = meshes[0].receiveShadow;
      root.add(merged);
      for (const mesh of meshes) {
        root.remove(mesh);
        mesh.geometry.dispose();
        anonymous.delete(mesh);
      }
      if (occludes) {
        for (let i = occluders.length - 1; i >= 0; i -= 1) if (meshes.includes(occluders[i])) occluders.splice(i, 1);
        occluders.push(merged);
      }
      if (collides) {
        for (let i = cameraColliders.length - 1; i >= 0; i -= 1) if (meshes.includes(cameraColliders[i])) cameraColliders.splice(i, 1);
        cameraColliders.push(merged);
      }
    }
  }

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
  const basaltShader = (material, {
    scale = 0.62, mortar = 0.055, lift = 0.5, bump = 0.05,
  } = {}) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStoneScale = { value: scale };
      shader.uniforms.uMortar = { value: mortar };
      shader.uniforms.uLift = { value: lift };
      shader.uniforms.uBump = { value: bump };
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
          uniform float uBump;
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
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.9, 1.75, 1.5) * uLift, diffuseColor.rgb, seam);
          // Dust settles low on a wall and splashes up it from the lane.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.25, 1.1), (1.0 - smoothstep(0.0, 0.9, vWorldPos.y)) * 0.35);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          // Each stone its own weathering; the mortar flat and dry.
          roughnessFactor = mix(1.0, roughnessFactor * (0.78 + stoneTone * 0.22), seam);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            // Relief from the same cells: stones pillowed proud of their
            // joints, as rough basalt fieldstone is. Without it the walls read
            // as a printed pattern the moment a low sun rakes across them.
            // Derivative-based, as three's own bump mapping is, and faded
            // with distance so the fine detail never shimmers.
            float relief = smoothstep(0.0, uMortar * 3.0, second - nearest) * (0.75 + 0.25 * stoneTone) + grain * 0.05;
            float nearby = 1.0 - smoothstep(14.0, 55.0, length(vViewPosition));
            vec3 sigmaX = dFdx(-vViewPosition);
            vec3 sigmaY = dFdy(-vViewPosition);
            vec3 r1 = cross(sigmaY, normal);
            vec3 r2 = cross(normal, sigmaX);
            float det = dot(sigmaX, r1);
            vec3 gradient = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2) * uBump * nearby;
            normal = normalize(abs(det) * normal - gradient);
          }`);
    };
    material.customProgramCacheKey = () => `capernaum-basalt-${scale}-${mortar}-${lift}-${bump}`;
    return material;
  };

  const netMap = netTexture(THREE);
  netMap.repeat.set(4, 3);
  textures.push(netMap);
  const netShadow = track(new THREE.MeshDepthMaterial({ map: netMap, alphaTest: 0.4, depthPacking: THREE.RGBADepthPacking }));

  // Packed earth: the lanes, the courtyards and the rolled roofs. Never one
  // colour close up — patches of darker damp and paler dust, basalt grit, and
  // a little unevenness underfoot — all in world space, so it stays put.
  function earthShader(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEarth;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEarth = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vEarth;
          float earthHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float earthNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(earthHash(i), earthHash(i + vec2(1.0, 0.0)), f.x),
                       mix(earthHash(i + vec2(0.0, 1.0)), earthHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float earthPatch = earthNoise(vEarth.xz * 0.07) * 0.6 + earthNoise(vEarth.xz * 0.23) * 0.4;
          float earthGrit = earthNoise(vEarth.xz * 7.0);
          diffuseColor.rgb *= 0.82 + earthPatch * 0.3;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 1.0), smoothstep(0.6, 0.9, earthPatch));
          // Black basalt grit trodden into it.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.095, 0.09), step(0.86, earthGrit) * 0.5);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float lumps = earthNoise(vEarth.xz * 2.2) * 0.7 + earthGrit * 0.3;
            float nearby = 1.0 - smoothstep(8.0, 35.0, length(vViewPosition));
            vec3 sigmaX = dFdx(-vViewPosition);
            vec3 sigmaY = dFdy(-vViewPosition);
            vec3 r1 = cross(sigmaY, normal);
            vec3 r2 = cross(normal, sigmaX);
            float det = dot(sigmaX, r1);
            normal = normalize(abs(det) * normal - sign(det) * (dFdx(lumps) * r1 + dFdy(lumps) * r2) * 0.02 * nearby);
          }`);
    };
    material.customProgramCacheKey = () => 'capernaum-earth';
    return material;
  }

  // The beach: not sand but shingle — rounded basalt pebbles and cobbles with
  // coarse grit between, darker and glossier where the lake has wet it.
  function shingleShader(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterline = { value: SHORE.beachSouth };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShingle;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShingle = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vShingle;
          uniform float uWaterline;
          vec2 pebbleHash(vec2 p) {
            return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 pebbleUv = vShingle.xz / 0.09;
          vec2 pebbleCell = floor(pebbleUv);
          float pebbleNear = 8.0;
          vec2 pebbleId = vec2(0.0);
          for (int gy = -1; gy <= 1; gy++) {
            for (int gx = -1; gx <= 1; gx++) {
              vec2 cell = pebbleCell + vec2(float(gx), float(gy));
              float d = length(cell + pebbleHash(cell) - pebbleUv);
              if (d < pebbleNear) { pebbleNear = d; pebbleId = cell; }
            }
          }
          float pebble = 1.0 - smoothstep(0.32, 0.48, pebbleNear);
          vec2 tone = pebbleHash(pebbleId);
          vec3 stone = mix(vec3(0.13, 0.12, 0.115), vec3(0.42, 0.39, 0.35), tone.x * tone.x);
          float farAway = smoothstep(20.0, 60.0, length(vViewPosition));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(stone, diffuseColor.rgb * 0.7, farAway), pebble * 0.85);
          // Wet toward the waterline: darker.
          float wet = 1.0 - smoothstep(0.0, 2.5, vShingle.z - uWaterline);
          diffuseColor.rgb *= 1.0 - wet * 0.45;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.35, (1.0 - smoothstep(0.0, 2.5, vShingle.z - uWaterline)) * 0.8);`);
    };
    material.customProgramCacheKey = () => 'capernaum-shingle';
    return material;
  }

  const M = {
    basalt: basaltShader(standard({ color: 0x3b3a3c, roughness: 0.95 })),
    // The synagogue was the one building anyone spent money on: dressed basalt,
    // laid in courses, and a good deal smoother than a house wall.
    basaltDressed: basaltShader(standard({ color: 0x46454a, roughness: 0.82 }), { scale: 1.15, mortar: 0.03, lift: 0.62, bump: 0.025 }),
    plaster: standard({ color: 0xbfae92, roughness: 0.95 }),
    earth: earthShader(standard({ color: 0x8a7458, roughness: 1 })),
    sand: shingleShader(standard({ color: 0xa89878, roughness: 1 })),
    timber: standard({ color: 0x6b5334, roughness: 0.9 }),
    timberPale: standard({ color: 0x9a8058, roughness: 0.9 }),
    thatch: standard({ color: 0x9c8853, roughness: 1 }),
    reed: standard({ color: 0xa89257, roughness: 1 }),
    cloth: standard({ color: 0xcbb99a, roughness: 0.95 }),
    // Knotted mesh cut out of the light, not a translucent sheet.
    net: standard({ map: netMap, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }),
    frond: standard({ color: 0x5f7038, roughness: 0.9, side: THREE.DoubleSide }),
    leaf: standard({ color: 0x55702f, roughness: 0.9, side: THREE.DoubleSide }),
    hill: standard({ color: 0x7d7a55, roughness: 1 }),
    skin: standard({ color: 0x9c7c5c, roughness: 0.9 }),
  };

  [M.basalt, M.basaltDressed, M.earth, M.thatch].forEach((material) => SOLID.add(material));

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

  // --- the lake and the air over it ------------------------------------------
  // The water reflects the dome's own sky from its live uniforms, so the hour
  // changes both together; the sky module adds clouds, haze matched to the
  // horizon, dawn mist, the village's smoke and the sky's light on everything.
  // See capernaumWater.js and capernaumSky.js.

  const water = createGalileeWater(THREE, { quality, lighting });
  root.add(water.group);
  const air = createCapernaumSky(THREE, { quality, lighting });
  root.add(air.group);

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
  // Every doorway and window on a lane face, for the lamplight after dark.
  const lampSpots = [];

  function houseBlock(x0, x1, z0, z1, height, { doorFaces = ['south'], name = '' } = {}) {
    // A labelled hotspot behind a house should be hidden by it.
    slab(M.basalt, x0, x1, LEVEL.ground, LEVEL.ground + height, z0, z1, { name, occlude: true });
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
          lampSpots.push({ p: [t, LEVEL.ground + sill + h * 0.5, zz + dir * 0.14], ry: dir < 0 ? Math.PI : 0, s: [w * 1.5, h * 0.8, 1] });
        } else {
          const xx = face === 'west' ? x0 : x1;
          const dir = face === 'west' ? -1 : 1;
          slab(M.timber, xx + dir * 0.06, xx + dir * 0.12, LEVEL.ground + sill, LEVEL.ground + sill + h, t - w, t + w, { cast: false });
          slab(M.timberPale, xx + dir * 0.02, xx + dir * 0.2, LEVEL.ground + sill + h, LEVEL.ground + sill + h + 0.22, t - w - 0.18, t + w + 0.18, { receive: false });
          lampSpots.push({ p: [xx + dir * 0.14, LEVEL.ground + sill + h * 0.5, t], ry: dir > 0 ? Math.PI / 2 : -Math.PI / 2, s: [w * 1.5, h * 0.8, 1] });
        }
      }
    }

    // Things left on a roof: drying figs, a stack of brushwood, a water jar.
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // Resting on the rolled earth (its top is height + 0.18), not above it.
    roofClutter.push({ p: [cx + (random() - 0.5) * (x1 - x0 - 4), LEVEL.ground + height + 0.18 + 0.09, cz + (random() - 0.5) * (z1 - z0 - 4)], ry: random() * 3, s: [1.6, 0.18, 1.2] });
    roofClutter.push({ p: [cx + (random() - 0.5) * (x1 - x0 - 5), LEVEL.ground + height + 0.18 + 0.18, cz + (random() - 0.5) * (z1 - z0 - 5)], ry: random() * 3, s: [1.1, 0.36, 0.9] });
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
  // Lamplight in the doorways and small windows after dark: an oil lamp in a
  // niche, glimpsed through a door left open — a third of the openings, chosen
  // by position rather than by chance so the village is the same every night.
  // Additive and unlit, so the post chain's bloom gives it a glow; its
  // strength follows the hour's `lamps` (sceneLighting.js), zero by day.
  const litSpots = lampSpots.filter((_, i) => i % 3 === 1);
  const lampGlow = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    track(new THREE.MeshBasicMaterial({
      color: 0xffa24a, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })),
    Math.max(1, litSpots.length),
  );
  lampGlow.name = 'lamplight';
  lampGlow.count = litSpots.length;
  litSpots.forEach((spot, i) => {
    dummy.position.set(...spot.p);
    dummy.rotation.set(0, spot.ry, 0);
    dummy.scale.set(...spot.s);
    dummy.updateMatrix();
    lampGlow.setMatrixAt(i, dummy.matrix);
  });
  dummy.scale.set(1, 1, 1);
  lampGlow.visible = false;
  root.add(lampGlow);

  // Under that awning: Matthew 9:9, staged the way the Mark 2 tableau is.
  const matthewTableau = createMatthew9Tableau(THREE, { root });

  // --- the insula ---------------------------------------------------------
  // The one block you can go inside. Built as four wings around the courtyard
  // so the courtyard is genuinely open to the sky, with the roof carried on
  // real beams and a hole cut through it.

  const ROOF_Y = LEVEL.ground + LEVEL.roof;
  // The walking surface IS the top of the rolled earth, so the whole roof build
  // hangs below LEVEL.roof: earth, then reeds and brushwood, then the beams on
  // the wall heads. It used to sit on top of it, which put everyone on the
  // roof sixteen centimetres deep in the marl.
  const EARTH = 0.16;
  const REEDS = 0.14;
  // Masonry, reeds and earth meet at their boundaries; no coplanar skins.
  const WALL_TOP = ROOF_Y - EARTH - REEDS;

  // The east and west wings are solid; the south and north ones have holes cut
  // in them, so they are built as the runs of wall that remain rather than as
  // blocks something is subtracted from afterwards.
  slab(M.basalt, INSULA.x0, COURTYARD.x0, LEVEL.ground, WALL_TOP, COURTYARD.z0, COURTYARD.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD.x1, INSULA.x1, LEVEL.ground, WALL_TOP, COURTYARD.z0, COURTYARD.z1, { name: 'insula-mass' });

  // The floor of the one room that can be entered.
  slab(M.plaster, HOUSE.x0, HOUSE.x1, LEVEL.ground, LEVEL.ground + 0.02, HOUSE.z0, HOUSE.z1, { cast: false, name: 'house-floor' });

  // South wing: walls around the room, with the doorway left open on its
  // courtyard side.
  slab(M.basalt, INSULA.x0, HOUSE.x0, LEVEL.ground, WALL_TOP, INSULA.z0, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x1, INSULA.x1, LEVEL.ground, WALL_TOP, INSULA.z0, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x0, HOUSE.x1, LEVEL.ground, WALL_TOP, INSULA.z0, HOUSE.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.x0, HOUSE.doorX0, LEVEL.ground, WALL_TOP, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.basalt, HOUSE.doorX1, HOUSE.x1, LEVEL.ground, WALL_TOP, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  // The lintel over the door.
  slab(M.basalt, HOUSE.doorX0, HOUSE.doorX1, LEVEL.ground + 2.06, WALL_TOP, HOUSE.z1, COURTYARD.z0, { name: 'insula-mass' });
  slab(M.timber, HOUSE.doorX0 - 0.1, HOUSE.doorX1 + 0.1, LEVEL.ground + 1.94, LEVEL.ground + 2.06, HOUSE.z1 - 0.1, COURTYARD.z0 + 0.1, { receive: false });

  // North wing: the passage from the lane into the courtyard, left open.
  slab(M.basalt, INSULA.x0, COURTYARD_ENTRY.x0, LEVEL.ground, WALL_TOP, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD_ENTRY.x1, INSULA.x1, LEVEL.ground, WALL_TOP, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });
  slab(M.basalt, COURTYARD_ENTRY.x0, COURTYARD_ENTRY.x1, LEVEL.ground + 2.3, WALL_TOP, COURTYARD.z1, INSULA.z1, { name: 'insula-mass' });

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
    slab(M.earth, x0, x1, ROOF_Y - EARTH, ROOF_Y, z0, z1, { name: 'roof-surface' });
    slab(M.thatch, x0, x1, WALL_TOP, ROOF_Y - EARTH, z0, z1, { cast: false, name: 'roof-reeds' });
  }

  // The parapet round the roof (Deuteronomy 22:8): one stone thick and knee
  // high, inside the roof's outer edge and round the open courtyard, and
  // broken on the east edge where the outside stair arrives. The navigation
  // stops a walker at it (capernaumNavigation.js), so what is drawn is what
  // stands in the way.
  {
    const { height: ph, thickness: pt, stairGap } = ROOF_PARAPET;
    const top = ROOF_Y + ph;
    const runs = [
      [INSULA.x0, INSULA.x1, INSULA.z0, INSULA.z0 + pt],
      [INSULA.x0, INSULA.x1, INSULA.z1 - pt, INSULA.z1],
      [INSULA.x0, INSULA.x0 + pt, INSULA.z0 + pt, INSULA.z1 - pt],
      [INSULA.x1 - pt, INSULA.x1, INSULA.z0 + pt, stairGap.z0],
      [INSULA.x1 - pt, INSULA.x1, stairGap.z1, INSULA.z1 - pt],
      [COURTYARD.x0 - pt, COURTYARD.x1 + pt, COURTYARD.z0 - pt, COURTYARD.z0],
      [COURTYARD.x0 - pt, COURTYARD.x1 + pt, COURTYARD.z1, COURTYARD.z1 + pt],
      [COURTYARD.x0 - pt, COURTYARD.x0, COURTYARD.z0, COURTYARD.z1],
      [COURTYARD.x1, COURTYARD.x1 + pt, COURTYARD.z0, COURTYARD.z1],
    ];
    for (const [x0, x1, z0, z1] of runs) slab(M.basalt, x0, x1, ROOF_Y, top, z0, z1, { collide: true });
  }

  // Beams under the roof of the room, visible from inside and through the hole
  // — the layer the four men had to break through.
  const beams = [];
  for (let x = HOUSE.x0 + 0.5; x < HOUSE.x1; x += 0.62) {
    const throughOpening = x > ROOF_OPENING.x0 - 0.2 && x < ROOF_OPENING.x1 + 0.2;
    if (throughOpening) {
      beams.push({ p: [x, WALL_TOP - 0.08, (HOUSE.z0 + ROOF_OPENING.z0) / 2], s: [0.13, 0.16, ROOF_OPENING.z0 - HOUSE.z0] });
      beams.push({ p: [x, WALL_TOP - 0.08, (ROOF_OPENING.z1 + HOUSE.z1) / 2], s: [0.13, 0.16, HOUSE.z1 - ROOF_OPENING.z1] });
    } else {
      beams.push({ p: [x, WALL_TOP - 0.08, (HOUSE.z0 + HOUSE.z1) / 2], s: [0.13, 0.16, HOUSE.z1 - HOUSE.z0] });
    }
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.timber, beams, 'roof-beams');

  // Broken ends around the hole, and the spoil pushed aside on the roof.
  const brokenEnds = [];
  for (let x = ROOF_OPENING.x0; x < ROOF_OPENING.x1; x += 0.62) {
    for (const z of [ROOF_OPENING.z0 - 0.18, ROOF_OPENING.z1 + 0.18]) {
      brokenEnds.push({ p: [x, WALL_TOP - 0.08, z], ry: (random() - 0.5) * 0.3, s: [0.13, 0.15, 0.5] });
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
        ROOF_Y + 0.04 + random() * 0.06,
        (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2 + Math.sin(angle) * distance,
      ],
      ry: random() * 3,
      s: [0.3 + random() * 0.5, 0.09 + random() * 0.12, 0.3 + random() * 0.45],
    });
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.earth, spoil, 'roof-spoil');

  // The outside stair, as solid masonry steps built up from the ground: each
  // one's top is exactly the tread the navigation stands a walker on (see
  // treadHeight in capernaumNavigation.js), and the last is the roof.
  const treads = [];
  const run = (ROOF_STAIR.zBottom - ROOF_STAIR.zTop) / ROOF_STAIR_TREADS;
  for (let i = 0; i < ROOF_STAIR_TREADS; i += 1) {
    const top = LEVEL.ground + ((i + 1) / ROOF_STAIR_TREADS) * LEVEL.roof;
    const zNear = ROOF_STAIR.zBottom - i * run;
    treads.push({
      p: [(ROOF_STAIR.x0 + ROOF_STAIR.x1) / 2, (LEVEL.ground + top) / 2, zNear - run / 2],
      s: [ROOF_STAIR.x1 - ROOF_STAIR.x0, top - LEVEL.ground, run],
    });
  }
  cameraColliders.push(instances(new THREE.BoxGeometry(1, 1, 1), M.basalt, treads, 'roof-stair'));

  // --- inside the room ----------------------------------------------------
  // Lit from the hole above, which is the only reason to come in here.

  const shaftCentre = [
    (ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2,
    (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2,
  ];

  const roomLight = new THREE.PointLight(0xffe6bd, 12, 16, 2);
  roomLight.position.set(shaftCentre[0] - 1.2, LEVEL.ground + 2.75, shaftCentre[1] + 0.9);
  root.add(roomLight);
  // Base intensity, scaled by the hour in update(): daylight drowns a lamp,
  // and at night it is the only thing burning in the whole insula.
  const ROOM_LIGHT_BASE = 12;

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
    shaftGeometry.userData.top = top;
  }

  // The beam falls from wherever the sun actually is: its corners are the
  // hole's corners projected down along the live sun direction onto the
  // floor, re-done whenever the hour changes. Below a low sun there is no
  // beam at all — at dusk and at night the hole is a dark square overhead.
  function aimShaft(direction, time = lighting.current) {
    const top = shaftGeometry.userData.top;
    const position = shaftGeometry.attributes.position;
    const lit = direction.y > 0.12;
    let onFloor = true;
    if (lit) {
      const floorY = LEVEL.ground + 0.03;
      // The room's inner faces: a low sun's beam strikes a wall before it
      // reaches the floor — at the default morning hour the west wall, about
      // two metres up — and the light belongs where it lands.
      const inner = {
        x0: HOUSE.x0 + HOUSE.wall, x1: HOUSE.x1 - HOUSE.wall, z0: HOUSE.z0 + HOUSE.wall, z1: HOUSE.z1 - HOUSE.wall,
      };
      const bottom = top.map(([x, y, z]) => {
        // A little spread for the sky around the sun, as a real beam has.
        const sx = x + (x - shaftCentre[0]) * 0.05;
        const sz = z + (z - shaftCentre[1]) * 0.05;
        let t = (y - floorY) / direction.y;
        if (direction.x > 1e-4) t = Math.min(t, (sx - inner.x0) / direction.x);
        if (direction.x < -1e-4) t = Math.min(t, (sx - inner.x1) / direction.x);
        if (direction.z > 1e-4) t = Math.min(t, (sz - inner.z0) / direction.z);
        if (direction.z < -1e-4) t = Math.min(t, (sz - inner.z1) / direction.z);
        const hit = [sx - direction.x * t, y - direction.y * t, sz - direction.z * t];
        if (hit[1] > floorY + 0.05) onFloor = false;
        return hit;
      });
      let v = 0;
      for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        for (const corner of [top[i], top[j], bottom[j], top[i], bottom[j], bottom[i]]) {
          position.setXYZ(v, corner[0], corner[1], corner[2]);
          v += 1;
        }
      }
      position.needsUpdate = true;
      shaftGeometry.computeBoundingSphere();
      shaftGeometry.computeBoundingBox();
      const cx = bottom.reduce((sum, b) => sum + b[0], 0) / 4;
      const cz = bottom.reduce((sum, b) => sum + b[2], 0) / 4;
      patch.position.set(cx, LEVEL.ground + 0.03, cz);
    }
    // As strong as the light that makes it: full sun by day, and at night the
    // moon, faint and cold, through the same hole.
    const strength = Math.min(1, Math.max(0, (direction.y - 0.12) / 0.33)) * Math.min(1, (time?.sun?.intensity ?? 2.6) / 2.6);
    shaftMaterial.uniforms.uColour.value.set(time?.sun?.color ?? 0xffe0a8).lerp(new THREE.Color(0xffe0a8), 0.35);
    patch.material.color.copy(shaftMaterial.uniforms.uColour.value);
    shaft.visible = lit;
    // The lit square on the floor, only when the beam reaches the floor.
    patch.visible = lit && onFloor;
    patch.material.opacity = 0.5 * strength;
    shaftMaterial.uniforms.uStrength.value = strength;
  }
  const shaftMaterial = track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 }, uColour: { value: new THREE.Color(0xffe0a8) } },
    vertexShader: `
      attribute float aFade;
      varying float vFade;
      void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColour;
      varying float vFade;
      void main() {
        // Dust turning in the beam keeps it from looking like a solid wedge.
        float motes = (0.9 + 0.1 * sin(uTime * 1.7)) * uStrength;
        gl_FragColor = vec4(uColour * 0.30 * vFade * motes, 0.30 * vFade * motes);
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
  const tableau = createMark2Tableau(THREE, { root, onReady: () => { mat.visible = false; } });
  aimShaft(lighting.uniforms.uSun.value);

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

  const stepCount = SYNAGOGUE_STEP_COUNT;
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

  slab(M.basaltDressed, SYNAGOGUE.x0, inX0, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, SYNAGOGUE.z1, { name: 'synagogue-wall-west' });
  slab(M.basaltDressed, inX1, SYNAGOGUE.x1, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, SYNAGOGUE.z1, { name: 'synagogue-wall-east' });
  slab(M.basaltDressed, inX0, inX1, SYN_TOP, SYN_TOP + SYN_HEIGHT, inZ1, SYNAGOGUE.z1, { name: 'synagogue-wall-north' });
  slab(M.basaltDressed, inX0, SYNAGOGUE.doorX0, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0, { name: 'synagogue-wall-south' });
  slab(M.basaltDressed, SYNAGOGUE.doorX1, inX1, SYN_TOP, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0, { name: 'synagogue-wall-south' });
  slab(M.basaltDressed, SYNAGOGUE.doorX0, SYNAGOGUE.doorX1, SYN_TOP + 3.1, SYN_TOP + SYN_HEIGHT, SYNAGOGUE.z0, inZ0, { name: 'synagogue-wall-lintel' });
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
    SYNAGOGUE.z0 - 0.4, SYNAGOGUE.z1 + 0.4, { receive: false, collide: true });

  // Stone benches around the inside walls, where the congregation sat.
  slab(M.basaltDressed, inX0, inX0 + 0.75, SYN_TOP, SYN_TOP + 0.46, inZ0, inZ1);
  slab(M.basaltDressed, inX1 - 0.75, inX1, SYN_TOP, SYN_TOP + 0.46, inZ0, inZ1);
  slab(M.basaltDressed, inX0, inX1, SYN_TOP, SYN_TOP + 0.46, inZ1 - 0.75, inZ1);

  // --- boats --------------------------------------------------------------
  // Proportioned on the first-century hull dug out of the lake mud at Ginosar
  // in 1986, and built in capernaumBoats.js: the two drawn up on the shingle,
  // the one at anchor, one alongside each pier, and the night's fishing fleet
  // coming home across the lake.

  const fleet = createCapernaumFleet(THREE, {
    quality, boats: BOATS, piers: PIERS, levels: LEVEL, reducedMotion,
  });
  root.add(fleet.group);

  // --- the piers ------------------------------------------------------------
  // Basalt fieldstone built out from the promenade into the lake, as Mendel
  // Nun recorded along this shore (see capernaumDimensions.js PIERS for what
  // is and is not certain about their date). The mass rises from the lake bed
  // to the deck; a kerb of larger stones runs round the sides and the end;
  // pierced mooring stones stand along it every few paces.
  const kerbStones = [];
  const mooring = [];
  for (const pier of PIERS) {
    slab(M.basalt, pier.x0, pier.x1, LEVEL.lake - 2.4, PIER_DECK, pier.zEnd, pier.zShore, { collide: true });
    const kerbLine = (x0, z0, x1, z1) => {
      const length = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 0.3; s < length; s += 0.62) {
        const t = s / length;
        kerbStones.push({
          p: [x0 + (x1 - x0) * t, PIER_DECK + 0.08, z0 + (z1 - z0) * t],
          ry: Math.atan2(x1 - x0, z1 - z0) + (random() - 0.5) * 0.12,
          s: [0.34, 0.2 + random() * 0.08, 0.56],
        });
      }
    };
    kerbLine(pier.x0 + 0.17, SHORE.beachNorth, pier.x0 + 0.17, pier.zEnd + 0.2);
    kerbLine(pier.x1 - 0.17, SHORE.beachNorth, pier.x1 - 0.17, pier.zEnd + 0.2);
    kerbLine(pier.x0 + 0.2, pier.zEnd + 0.17, pier.x1 - 0.2, pier.zEnd + 0.17);
    for (let z = SHORE.beachSouth - 3; z > pier.zEnd + 1.5; z -= 6.5) {
      mooring.push({ p: [pier.x0 + 0.22, PIER_DECK + 0.26, z], ry: Math.PI / 2 });
      mooring.push({ p: [pier.x1 - 0.22, PIER_DECK + 0.26, z - 3.2], ry: Math.PI / 2 });
    }
  }
  if (kerbStones.length) instances(new THREE.BoxGeometry(1, 1, 1), M.basalt, kerbStones, 'pier-kerb');
  if (mooring.length) {
    // A mooring stone: a squared basalt block with a hole bored through it for
    // the rope — the one piece of harbour furniture found all round the lake.
    instances(new THREE.BoxGeometry(0.44, 0.52, 0.5), M.basaltDressed, mooring, 'mooring-stones');
    instances(new THREE.TorusGeometry(0.1, 0.035, 6, 12), M.timber, mooring.map((m) => ({
      p: [m.p[0], m.p[1] + 0.08, m.p[2]], ry: m.ry, s: [1, 1, 1],
    })), 'mooring-holes', { cast: false });
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
      // Slung over the frame's bar and sagging between the posts.
      const drape = add(netDrapeGeometry(THREE, item.w - 0.4, item.h * 1.2, 0.18), M.net,
        [item.x, LEVEL.ground + item.h * 0.75, item.z]);
      drape.customDepthMaterial = netShadow;
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
    } else if (thing.id === 'quern') {
      // The bench, the fixed lower stone, the turning upper stone with its
      // feed hole, and the wooden peg it is turned by.
      add(new THREE.BoxGeometry(0.95, 0.36, 0.8), M.basalt, [thing.x, LEVEL.ground + 0.18, thing.z]);
      add(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 18), M.basaltDressed, [thing.x, LEVEL.ground + 0.41, thing.z]);
      add(new THREE.CylinderGeometry(0.25, 0.26, 0.09, 18), M.basaltDressed, [thing.x, LEVEL.ground + 0.505, thing.z]);
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), M.timber, [thing.x + 0.19, LEVEL.ground + 0.6, thing.z]);
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

  // The trees — the village's palms and figs, and everything growing beyond
  // it — are drawn by capernaumLandscape.js, below.

  // --- one draw per material ------------------------------------------------
  // The village is built slab by slab — every door board, lintel, parapet run
  // and bench its own box — which is the right way to write it and the wrong
  // way to draw it: well over a hundred draw calls for a few thousand
  // triangles, on every device. The anonymous static pieces are merged here
  // into one mesh per material and shadow setting, and the merged meshes take
  // their pieces' places in the occluder and camera-collider lists.
  mergeStatic(new Set([mat, patch, shaft]));

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

  // Small groups have complementary roles. Picking independently from a
  // weighted activity list can make every neighbour a basket sorter.
  // Each place gets at most one worker, carrier, or speaker.
  const HAUNTS = [
    {
      id: 'shore-nets', at: [8, -16.5], spread: 2.0, share: 0.16, faceAt: [8, -20],
      activities: ['working', 'sitting', 'attending'],
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
      activities: ['talking', 'attending', 'sitting'],
    },
    {
      id: 'tax-booth-queue', at: [-48, 4], spread: 1.6, share: 0.10, faceAt: [-52, 0],
      activities: ['talking', 'attending', 'sitting'],
    },
    {
      id: 'north-lane', at: [30, 40], spread: 3.2, share: 0.12,
      activities: ['carrying', 'talking', 'attending'],
    },
    {
      id: 'lane-crossing', at: [0, 4], spread: 3.2, share: 0.10,
      activities: ['talking', 'attending', 'standing'],
    },
  ];

  const villagers = [];
  const standingCount = low ? 18 : 34;
  const personalSpace = 1.3;
  const hauntFirstIndex = {};

  // Reserve space as people are accepted; never push a finished placement
  // into a wall, another group, or a different floor to make room.
  const placedSoFar = [];
  const clearOfEveryone = (x, z) => clearAt(x, z) && !inTableauArea(x, z) && !inMatthewTableauArea(x, z)
    && !placedSoFar.some((p) => Math.hypot(p.x - x, p.z - z) < personalSpace);

  for (const haunt of HAUNTS) {
    const count = Math.min(3, Math.max(2, Math.round(standingCount * haunt.share)));
    const spots = knot(random, haunt.at, count, {
      radius: 1.25,
      clearAt: clearOfEveryone, floorAt: groundAt,
      minSeparation: personalSpace, faceAt: haunt.faceAt,
    });
    if (!spots.length) continue;
    hauntFirstIndex[haunt.id] = villagers.length;
    const speakerIndex = haunt.activities.indexOf('talking');
    spots.forEach((spot, index) => {
      let activity = haunt.activities[index];
      // Listeners attend to a person; a worker faces the shore. Avoid the
      // identical headings that made groups look like a row of performers.
      const partner = activity === 'talking' ? spots.find((_, i) => i !== index)
        : spots[Math.max(0, speakerIndex)];
      let facing = spot.facing;
      if (partner && partner !== spot && activity !== 'working') {
        facing = Math.atan2(partner.x - spot.x, partner.z - spot.z) + (random() - 0.5) * 0.3;
      }
      // A stool or sorting stand needs usable floor in front as well as
      // under its owner's feet. Fall back to resting if that space is blocked.
      if (['working', 'sitting'].includes(activity)) {
        const forward = activity === 'working' ? 0.45 : 0;
        for (const side of [-0.3, 0, 0.3]) {
          const x = spot.x + Math.sin(facing) * forward + Math.cos(facing) * side;
          const z = spot.z + Math.cos(facing) * forward - Math.sin(facing) * side;
          if (!clearAt(x, z) || Math.abs(groundAt(x, z) - spot.y) > 0.1) activity = 'standing';
        }
      }
      const figure = {
        ...spot, facing, activity, groupId: haunt.id,
        colour: pick(ROBE_PALETTE),
        phase: random() * 12,
        scale: 0.92 + random() * 0.15,
      };
      villagers.push(figure);
      placedSoFar.push(figure);
    });
  }

  // A handful of loners and pairs along the lanes, facing one of the four
  // roughly-cardinal headings the lanes actually run rather than an
  // arbitrary angle, so they read as walking-and-stopped rather than planted.
  const clearForLoner = (x, z) => clearOfEveryone(x, z)
    && !placedSoFar.some((p) => p.groupId && Math.hypot(p.x - x, p.z - z) < 2.8);
  scatter(random, Math.max(0, standingCount - villagers.length), {
    x0: -VILLAGE.halfX + 4,
    x1: VILLAGE.halfX - 4,
    z0: SHORE.beachNorth,
    z1: VILLAGE.zNorth - 2,
    clearAt: clearForLoner,
    floorAt: groundAt,
  }).forEach((spot) => {
    // scatter samples a batch before this list is updated. Recheck against
    // earlier accepted loners so they cannot overlap each other.
    if (!clearForLoner(spot.x, spot.z)) return;
    const laneHeading = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    villagers.push({
      ...spot,
      facing: laneHeading + (random() - 0.5) * 0.5,
      activity: 'standing',
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

  // Who is who. A village is not all grown men: women at the courtyards and
  // the lanes — grinding, baking and carrying were largely their work — and
  // children about the place. The two figures the named skinned actors stand
  // in for stay men, since those actors are. See sceneFigures.js for how a
  // woman's veil and a child's proportions are drawn.
  const actorStandIns = new Set(['villager-shore-net-0', 'villager-courtyard-grind-0']);
  const WOMEN_AT = new Set(['courtyard', 'lane-crossing', 'north-lane', 'promenade-west']);
  villagers.forEach((figure, index) => {
    if (actorStandIns.has(figure.id)) return;
    // Men commonly went bareheaded; a head cloth was for the sun and the road.
    if (index % 4 === 3) figure.bareheaded = true;
    if (WOMEN_AT.has(figure.groupId) && index % 3 !== 0) figure.kind = 'woman';
    else if (!figure.groupId && index % 4 === 2) {
      figure.kind = 'child';
      figure.scale = 0.58 + random() * 0.14;
    } else if (!figure.groupId && index % 4 === 0) figure.kind = 'woman';
  });
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
    { route: [[-47.6, 2.2], [-47.6, 13]], speed: 1.00 }, // up to the tax booth, stopping short of its queue
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
  walkerFigures.forEach((figure, index) => {
    if (index === 0) return; // stands in for the carrier actor
    if (index % 5 === 4) figure.bareheaded = true;
    if (index % 4 === 1) figure.kind = 'woman';
    else if (index % 6 === 3) {
      figure.kind = 'child';
      figure.scale = 0.6 + random() * 0.12;
    }
  });
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
  const underPier = (x) => PIERS.some((pier) => x > pier.x0 - 2.5 && x < pier.x1 + 2.5);
  for (let i = 0; i < (low ? 3 : 7); i += 1) {
    const x = -34 + random() * 70;
    if (underPier(x)) continue;
    propItems.push({
      kind: 'awning',
      x,
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
  // The real ground, from elevation data, and the true skyline: see
  // capernaumLandscape.js. It replaced three scaled spheres, one of which was
  // underground and one of which sat in the lake due south, where from this
  // shore there is nothing but water to the horizon.

  const landscape = createCapernaumLandscape(THREE, { quality, lighting, reducedMotion });
  root.add(landscape.group);

  // --- life ----------------------------------------------------------------
  // The animals, the birds, and the women, children and old men the haunts
  // above do not reach. See capernaumLife.js.
  const life = createCapernaumLife(THREE, {
    quality, floorAt, terrainHeight: landscape.terrainHeight, reducedMotion,
  });
  root.add(life.group);

  // --- animation ----------------------------------------------------------

  function update(elapsed, delta = 0, frame = null) {
    water.update(elapsed);
    air.update(elapsed, delta, frame);
    landscape.update(elapsed, delta, frame);
    shaftMaterial.uniforms.uTime.value = elapsed;

    // Lamplight tracks the hour, and flickers, because an oil lamp does.
    const flicker = 1 + Math.sin(elapsed * 6.1) * 0.07 + Math.sin(elapsed * 2.7) * 0.04;
    roomLight.intensity = ROOM_LIGHT_BASE * (0.35 + lighting.current.lamps * 1.5) * flicker;
    const glow = Math.min(1, Math.max(0, (lighting.current.lamps - 0.2) / 0.7));
    lampGlow.visible = glow > 0.01;
    lampGlow.material.opacity = glow * 0.55 * (0.92 + (flicker - 1) * 0.8);

    // The villagers shift and gesture where they stand; the walkers walk their
    // routes. Both are sceneFigures.js doing the same job with the same rig —
    // the only difference is whether the figure was given somewhere to go.
    // Who is within the real crowd's reach is settled first, so the stand-ins
    // drawn after it this frame are exactly the people it is not drawing.
    realCrowd.update(elapsed, frame?.camera?.position ?? null);
    // The stand-ins only move while some of them are being drawn.
    if (!realCrowd.ready || Number.isFinite(realCrowd.reach)) {
      villagerCrowd.update(elapsed);
      walkerCrowd.update(elapsed);
    }
    fleet.update(elapsed);
    life.update(elapsed);
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
    fleet.dispose();
    landscape.dispose();
    water.dispose();
    air.dispose();
    life.dispose();
    realCrowd.dispose();
  }

  // --- everyone, as real people ----------------------------------------------
  // The instanced figures above are what the village looks like for the few
  // seconds before its character models arrive. Once they do, every villager,
  // walker, woman and child is drawn with the same MakeHuman models the near
  // actors use, skinned from a baked texture (sceneInstancedHumans.js), and the
  // stand-ins are put away. The full skinned actors below then only cover the
  // few people nearest the camera, where their higher detail shows.
  //
  // Who draws a person is decided per person: a near skinned actor if one
  // stands in, otherwise the real crowd within its reach (everywhere on
  // 'high'; within tens of metres of the camera on lighter settings, to spare
  // a phone), otherwise the stand-in, a few pixels tall at that distance.
  const crowdFigures = [...villagers, ...walkerFigures, ...life.people];
  const nearActor = new Set();
  const standInsHide = (id, hidden) => {
    villagerCrowd.suppress(id, hidden);
    walkerCrowd.suppress(id, hidden);
    life.crowd.suppress(id, hidden);
  };
  const realCrowd = createInstancedCrowd(THREE, {
    figures: crowdFigures,
    quality,
    name: 'villagers-real',
    groundAt: (x, z) => {
      const floor = floorAt(x, z, 0);
      return floor ? floor.height : landscape.terrainHeight(x, z);
    },
    onReach: (id, inReach) => standInsHide(id, inReach || nearActor.has(id)),
  });
  root.add(realCrowd.group);
  const standIns = [villagerCrowd.group, walkerCrowd.group, life.crowd.group];

  const humans = createSceneHumans({
    sceneSlug: 'capernaum',
    THREE,
    root,
    floorAt,
    // The skinned characters are all men; a woman or a child drawn by the
    // instanced crowd stays that way however close the camera comes.
    crowdFigures: [...villagers, ...walkerFigures].filter((figure) => !figure.kind || figure.kind === 'man'),
    qualityProfile: quality,
    reducedMotion,
    actorLimits: { low: 3, balanced: 5, high: 8 },
    actorRange: { low: 10, balanced: 12, high: 15 },
    onFallbackSuppressed: (fallbackId, isSuppressed) => {
      if (isSuppressed) nearActor.add(fallbackId);
      else nearActor.delete(fallbackId);
      realCrowd.suppress(fallbackId, isSuppressed);
      standInsHide(fallbackId, isSuppressed || realCrowd.inReach(fallbackId));
    },
  });

  const updateHumans = humans.update;
  const acceptHumanAssets = humans.acceptAssets;
  const crowdClearance = humans.queryClearance;
  humans.update = (options) => {
    updateHumans(options); tableau.update(options); matthewTableau.update(options);
  };
  humans.acceptAssets = (assets) => {
    acceptHumanAssets(assets); tableau.acceptAssets(assets); matthewTableau.acceptAssets(assets);
    // Everyone real everywhere: the stand-ins are not needed at all.
    if (realCrowd.acceptAssets(assets) && !Number.isFinite(realCrowd.reach)) {
      standIns.forEach((standIn) => { standIn.visible = false; });
    }
  };
  humans.queryClearance = (...args) => {
    for (const query of [tableau.queryClearance, matthewTableau.queryClearance]) {
      const clearance = query(...args);
      if (clearance.collides) return clearance;
    }
    return crowdClearance(...args);
  };

  const assetManager = createCapernaumAssetManager({ root, humans }, THREE);

  return {
    root,
    sun,
    lighting,
    humans,
    tableau,
    matthewTableau,
    update: (elapsed, delta, frame) => update(elapsed, delta, frame),
    onTimeOfDay: (time) => {
      aimShaft(lighting.uniforms.uSun.value, time);
      landscape.onTimeOfDay(time);
      water.onTimeOfDay(time);
      air.onTimeOfDay(time);
    },
    // The haze is the sky's own horizon colour, and thinner than the shared
    // default: the far hills carry their own aerial perspective.
    fogFor: (time) => air.fogFor(time),
    prepareRenderer: (renderer, world) => air.prepareRenderer(renderer, world),
    dispose: () => {
      assetManager.detach();
      tableau.dispose();
      matthewTableau.dispose();
      humans.dispose();
      dispose();
    },
    fog: resolveTimeOfDay(timeOfDay).fog,
    exposure: resolveTimeOfDay(timeOfDay).exposure,
    occluders,
    cameraColliders,
    // The route re-centres a tight sun shadow on the visitor (Scene.jsx
    // followShadow): four centimetres a texel instead of eleven.
    shadowFollow: low ? null : { extent: 40 },
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
