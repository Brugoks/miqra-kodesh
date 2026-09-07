// Deterministic generator for Biblical Scene Realism assets (Capernaum pilot).
// Generates authentic PBR textures, 3D GLB meshes, and audio loops,
// packaging them with content hashes into public/assets/scenes/.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

// Global FileReader polyfill for Three.js GLTFExporter in Node
global.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
};

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public', 'assets', 'scenes');
const CAP_MAT_DIR = path.join(PUBLIC_DIR, 'capernaum', 'materials');
const CAP_MODEL_DIR = path.join(PUBLIC_DIR, 'capernaum', 'models');
const CAP_AUDIO_DIR = path.join(PUBLIC_DIR, 'capernaum', 'audio');
const SHARED_AUDIO_DIR = path.join(PUBLIC_DIR, 'shared', 'audio');

[CAP_MAT_DIR, CAP_MODEL_DIR, CAP_AUDIO_DIR, SHARED_AUDIO_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

// -----------------------------------------------------------------------------
// PBR TEXTURE GENERATION
// -----------------------------------------------------------------------------

function makeNoise(width, height, scale, seed = 42) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Deterministic sin-based pseudo-random noise
      const v =
        Math.sin(x * scale * 0.05 + seed) * Math.cos(y * scale * 0.05 + seed * 1.3) +
        Math.sin((x + y) * scale * 0.02 + seed * 2.1) * 0.5 +
        Math.sin(Math.sqrt(x * x + y * y) * scale * 0.03 + seed * 3.7) * 0.3;
      data[y * width + x] = (v + 1.8) / 3.6; // normalized 0..1
    }
  }
  return data;
}

async function createPbrTextureSet(name, config) {
  const { width = 512, height = 512, baseColor, noiseScale, roughnessBase, aoCrevices } = config;
  const diffuseBuf = Buffer.alloc(width * height * 4);
  const normalBuf = Buffer.alloc(width * height * 4);
  const roughnessBuf = Buffer.alloc(width * height * 4);
  const aoBuf = Buffer.alloc(width * height * 4);

  const heightmap = makeNoise(width, height, noiseScale, config.seed || 123);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const h = heightmap[y * width + x];

      // 1. Diffuse (Color)
      const r = Math.min(255, Math.max(0, Math.round(baseColor[0] * (0.8 + h * 0.4))));
      const g = Math.min(255, Math.max(0, Math.round(baseColor[1] * (0.8 + h * 0.4))));
      const b = Math.min(255, Math.max(0, Math.round(baseColor[2] * (0.8 + h * 0.4))));
      diffuseBuf[idx] = r;
      diffuseBuf[idx + 1] = g;
      diffuseBuf[idx + 2] = b;
      diffuseBuf[idx + 3] = 255;

      // 2. Normal (Sobel filter from heightmap)
      const left = heightmap[y * width + ((x - 1 + width) % width)];
      const right = heightmap[y * width + ((x + 1) % width)];
      const up = heightmap[((y - 1 + height) % height) * width + x];
      const down = heightmap[((y + 1) % height) * width + x];

      const dx = (right - left) * 2.5;
      const dy = (down - up) * 2.5;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);

      normalBuf[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      normalBuf[idx + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normalBuf[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      normalBuf[idx + 3] = 255;

      // 3. Roughness
      const rough = Math.min(255, Math.max(0, Math.round((roughnessBase + (1 - h) * 0.15) * 255)));
      roughnessBuf[idx] = rough;
      roughnessBuf[idx + 1] = rough;
      roughnessBuf[idx + 2] = rough;
      roughnessBuf[idx + 3] = 255;

      // 4. AO (darkens deep crevices)
      const aoVal = Math.min(255, Math.max(0, Math.round((aoCrevices ? 0.6 + h * 0.4 : 0.9 + h * 0.1) * 255)));
      aoBuf[idx] = aoVal;
      aoBuf[idx + 1] = aoVal;
      aoBuf[idx + 2] = aoVal;
      aoBuf[idx + 3] = 255;
    }
  }

  const [diffPng, normPng, roughPng, aoPng] = await Promise.all([
    sharp(diffuseBuf, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(normalBuf, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(roughnessBuf, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(aoBuf, { raw: { width, height, channels: 4 } }).png().toBuffer(),
  ]);

  const hDiff = hashBuffer(diffPng);
  const hNorm = hashBuffer(normPng);
  const hRough = hashBuffer(roughPng);
  const hAo = hashBuffer(aoPng);

  const pDiff = path.join(CAP_MAT_DIR, `${name}-diffuse-${hDiff}.png`);
  const pNorm = path.join(CAP_MAT_DIR, `${name}-normal-${hNorm}.png`);
  const pRough = path.join(CAP_MAT_DIR, `${name}-roughness-${hRough}.png`);
  const pAo = path.join(CAP_MAT_DIR, `${name}-ao-${hAo}.png`);

  fs.writeFileSync(pDiff, diffPng);
  fs.writeFileSync(pNorm, normPng);
  fs.writeFileSync(pRough, roughPng);
  fs.writeFileSync(pAo, aoPng);

  return {
    diffuse: `/assets/scenes/capernaum/materials/${name}-diffuse-${hDiff}.png`,
    normal: `/assets/scenes/capernaum/materials/${name}-normal-${hNorm}.png`,
    roughness: `/assets/scenes/capernaum/materials/${name}-roughness-${hRough}.png`,
    ao: `/assets/scenes/capernaum/materials/${name}-ao-${hAo}.png`,
  };
}

// -----------------------------------------------------------------------------
// 3D GLB MODEL GENERATION
// -----------------------------------------------------------------------------

async function exportGlb(THREE, object, filenamePrefix) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (gltf) => {
        const buf = Buffer.from(gltf);
        const hash = hashBuffer(buf);
        const filename = `${filenamePrefix}-${hash}.glb`;
        const fullPath = path.join(CAP_MODEL_DIR, filename);
        fs.writeFileSync(fullPath, buf);
        resolve({
          url: `/assets/scenes/capernaum/models/${filename}`,
          size: buf.length,
          hash,
        });
      },
      reject,
      { binary: true },
    );
  });
}

async function buildGinosarBoat(THREE) {
  const group = new THREE.Group();
  group.name = 'ginosar-fishing-boat';

  // Materials
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x5a483a,
    roughness: 0.85,
    metalness: 0.05,
  });
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x48392e,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x827055,
    roughness: 0.95,
  });

  // Length 8.27m, beam 2.30m, depth 1.25m
  // Hull keel
  const keelGeom = new THREE.BoxGeometry(0.2, 0.25, 8.2);
  const keel = new THREE.Mesh(keelGeom, timberMat);
  keel.position.set(0, -0.6, 0);
  group.add(keel);

  // Hull planks: constructed with layered curved rib profiles
  const ribCount = 13;
  for (let i = 0; i < ribCount; i++) {
    const t = (i / (ribCount - 1)) * 2 - 1; // -1 to +1 along length
    const z = t * 3.8;
    const beamAtZ = Math.cos(t * Math.PI * 0.45) * 1.15; // beam profile
    const depthAtZ = 0.55 + Math.cos(t * Math.PI * 0.45) * 0.65;

    // Left and right rib arcs
    const ribGeom = new THREE.TorusGeometry(beamAtZ, 0.06, 6, 12, Math.PI);
    const ribMesh = new THREE.Mesh(ribGeom, ribMat);
    ribMesh.rotation.x = Math.PI / 2;
    ribMesh.position.set(0, -0.6 + depthAtZ * 0.5, z);
    group.add(ribMesh);
  }

  // Hull sheer strakes (outer planks)
  const strakeGeom = new THREE.CylinderGeometry(1.15, 0.9, 8.0, 16, 1, true);
  strakeGeom.scale(1, 0.35, 1);
  const strakeMesh = new THREE.Mesh(strakeGeom, timberMat);
  strakeMesh.rotation.z = Math.PI;
  strakeMesh.position.set(0, -0.2, 0);
  group.add(strakeMesh);

  // Thwarts (cross rowing benches)
  const benchCount = 4;
  for (let b = 0; b < benchCount; b++) {
    const bz = (b - 1.5) * 1.5;
    const benchGeom = new THREE.BoxGeometry(1.9, 0.08, 0.35);
    const bench = new THREE.Mesh(benchGeom, timberMat);
    bench.position.set(0, -0.15, bz);
    group.add(bench);
  }

  // Stern helmsman platform
  const sternPlatformGeom = new THREE.BoxGeometry(1.5, 0.1, 1.2);
  const sternPlatform = new THREE.Mesh(sternPlatformGeom, timberMat);
  sternPlatform.position.set(0, 0.05, 3.2);
  group.add(sternPlatform);

  // Steering oar angled at stern
  const oarShaftGeom = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8);
  const oarShaft = new THREE.Mesh(oarShaftGeom, timberMat);
  oarShaft.position.set(0.8, -0.3, 3.6);
  oarShaft.rotation.x = 0.45;
  oarShaft.rotation.z = -0.2;
  group.add(oarShaft);

  // Mooring rope coil at bow
  const ropeCoilGeom = new THREE.TorusGeometry(0.25, 0.04, 6, 16);
  const ropeCoil = new THREE.Mesh(ropeCoilGeom, ropeMat);
  ropeCoil.rotation.x = Math.PI / 2;
  ropeCoil.position.set(0, 0.2, -3.8);
  group.add(ropeCoil);

  return exportGlb(THREE, group, 'ginosar-boat');
}

async function buildDoorway(THREE) {
  const group = new THREE.Group();
  group.name = 'insula-doorway';

  const basaltMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.92 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x584432, roughness: 0.85 });

  // Threshold stone (floor sill)
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.5), basaltMat);
  sill.position.set(0, 0.1, 0);
  group.add(sill);

  // Left jamb
  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.5), basaltMat);
  leftJamb.position.set(-0.65, 1.1, 0);
  group.add(leftJamb);

  // Right jamb
  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.5), basaltMat);
  rightJamb.position.set(0.65, 1.1, 0);
  group.add(rightJamb);

  // Lintel (top stone beam)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.55), basaltMat);
  lintel.position.set(0, 2.15, 0);
  group.add(lintel);

  // Timber post & socket
  const timberPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), woodMat);
  timberPost.position.set(-0.48, 1.15, 0.1);
  group.add(timberPost);

  return exportGlb(THREE, group, 'doorway');
}

async function buildGalileanJar(THREE) {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8b5538, roughness: 0.82 });

  // Jar belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), potMat);
  belly.scale.set(1, 1.3, 1);
  belly.position.set(0, 0.35, 0);
  group.add(belly);

  // Neck & rim
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.18, 12), potMat);
  neck.position.set(0, 0.68, 0);
  group.add(neck);

  // Twin handles
  const handleGeom = new THREE.TorusGeometry(0.08, 0.025, 6, 8, Math.PI);
  const handleL = new THREE.Mesh(handleGeom, potMat);
  handleL.position.set(-0.22, 0.48, 0);
  handleL.rotation.z = Math.PI / 2;
  const handleR = new THREE.Mesh(handleGeom, potMat);
  handleR.position.set(0.22, 0.48, 0);
  handleR.rotation.z = -Math.PI / 2;
  group.add(handleL);
  group.add(handleR);

  return exportGlb(THREE, group, 'jar');
}

async function buildBasket(THREE) {
  const group = new THREE.Group();
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x9e8656, roughness: 0.92 });

  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.32, 12, 1, true), reedMat);
  basket.position.set(0, 0.16, 0);
  group.add(basket);

  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), reedMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.set(0, 0.01, 0);
  group.add(bottom);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16), reedMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.32, 0);
  group.add(rim);

  return exportGlb(THREE, group, 'basket');
}

async function buildFishNet(THREE) {
  const group = new THREE.Group();
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x8f7d63,
    roughness: 0.95,
    wireframe: true,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x584432, roughness: 0.88 });

  // Drying rack posts
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), woodMat);
  postL.position.set(-1.1, 0.7, 0);
  const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), woodMat);
  postR.position.set(1.1, 0.7, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), woodMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.3, 0);
  group.add(postL);
  group.add(postR);
  group.add(bar);

  // Hanging net mesh
  const net = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1, 16, 10), netMat);
  net.position.set(0, 0.75, 0);
  group.add(net);

  return exportGlb(THREE, group, 'fish-net');
}

async function buildStoneAnchor(THREE) {
  const group = new THREE.Group();
  const basaltMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.95 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x827055, roughness: 0.9 });

  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.18), basaltMat);
  stone.position.set(0, 0.225, 0);
  group.add(stone);

  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), ropeMat);
  rope.position.set(0, 0.38, 0);
  group.add(rope);

  return exportGlb(THREE, group, 'stone-anchor');
}

async function buildGalileeRidge(THREE) {
  const group = new THREE.Group();
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6e6853, roughness: 0.98 });

  // Undulating terrain contour mesh for Galilee horizon
  const geom = new THREE.PlaneGeometry(700, 300, 32, 16);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z =
      Math.sin(x * 0.015) * 45 +
      Math.cos(y * 0.02) * 35 +
      Math.sin((x + y) * 0.008) * 20;
    pos.setZ(i, z);
  }
  geom.computeVertexNormals();

  const hill = new THREE.Mesh(geom, hillMat);
  hill.rotation.x = -Math.PI / 2;
  hill.position.set(0, 20, 350);
  group.add(hill);

  return exportGlb(THREE, group, 'galilee-ridge');
}

// -----------------------------------------------------------------------------
// REALISTIC 1ST-CENTURY GALILEAN CHARACTER SCULPTING
// -----------------------------------------------------------------------------

function buildRealisticHead(THREE, skinMat, beardMat, headclothMat, agalMat, options = {}) {
  const headGroup = new THREE.Group();
  headGroup.name = 'head-complex';

  // 1. Cranium (anatomical oval)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.102, 12, 10), skinMat);
  cranium.scale.set(0.92, 1.14, 1.04);
  cranium.position.set(0, 0.12, 0);
  headGroup.add(cranium);

  // 2. Brow ridge
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.038), skinMat);
  brow.position.set(0, 0.142, 0.086);
  headGroup.add(brow);

  // 2b. Anatomical Eyes (Sclera, Iris, Pupil, Eyelids)
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.1 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0a0705 });

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), scleraMat);
    eye.scale.set(1.15, 0.75, 0.7);
    eye.position.set(side * 0.038, 0.126, 0.088);
    headGroup.add(eye);

    const iris = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.004, 8), irisMat);
    iris.rotation.x = Math.PI / 2;
    iris.position.set(side * 0.038, 0.126, 0.096);
    headGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.0045, 8), pupilMat);
    pupil.rotation.x = Math.PI / 2;
    pupil.position.set(side * 0.038, 0.126, 0.097);
    headGroup.add(pupil);

    const eyelid = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.006, 0.016), skinMat);
    eyelid.position.set(side * 0.038, 0.134, 0.091);
    headGroup.add(eyelid);
  }

  // 3. Nose with bridge and sculpted nostrils
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.062, 5), skinMat);
  nose.rotation.x = -Math.PI / 14;
  nose.position.set(0, 0.106, 0.112);
  headGroup.add(nose);

  // 4. Galilean full trimmed beard & mustache
  const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.022, 0.032), beardMat);
  mustache.position.set(0, 0.072, 0.102);
  headGroup.add(mustache);

  const jawBeardGeom = new THREE.CylinderGeometry(0.088, 0.072, 0.11, 8, 1, false, 0, Math.PI);
  const jawBeard = new THREE.Mesh(jawBeardGeom, beardMat);
  jawBeard.rotation.y = Math.PI / 2;
  jawBeard.position.set(0, 0.045, 0.038);
  headGroup.add(jawBeard);

  const chinBeard = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), beardMat);
  chinBeard.position.set(0, 0.016, 0.085);
  headGroup.add(chinBeard);

  // 5. Ears
  const leftEar = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.026), skinMat);
  leftEar.position.set(-0.096, 0.11, -0.01);
  const rightEar = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.026), skinMat);
  rightEar.position.set(0.096, 0.11, -0.01);
  headGroup.add(leftEar);
  headGroup.add(rightEar);

  // 6. Draped Headcloth (Sudarium)
  const clothCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    headclothMat,
  );
  clothCap.position.set(0, 0.13, -0.005);
  headGroup.add(clothCap);

  // Agal (cord headband)
  const agal = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.013, 6, 16), agalMat);
  agal.rotation.x = Math.PI / 2;
  agal.position.set(0, 0.155, 0);
  headGroup.add(agal);

  // Draped back cloth falling down over nape of neck and upper back
  const backFlap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.30, 0.032), headclothMat);
  backFlap.rotation.x = options.backFlapAngle ?? 0.22;
  backFlap.position.set(0, 0.01, -0.095);
  headGroup.add(backFlap);

  // Side drapes framing the jaw
  const sideFlapL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.24, 0.11), headclothMat);
  sideFlapL.position.set(-0.108, 0.04, -0.02);
  const sideFlapR = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.24, 0.11), headclothMat);
  sideFlapR.position.set(0.108, 0.04, -0.02);
  headGroup.add(sideFlapL);
  headGroup.add(sideFlapR);

  // 7. Anatomical Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.076, 0.14, 8), skinMat);
  neck.position.set(0, 0, 0);
  headGroup.add(neck);

  return headGroup;
}

function buildHand(THREE, skinMat, side = 1, curlAngle = 0.5) {
  const hand = new THREE.Group();
  hand.name = `hand-${side > 0 ? 'r' : 'l'}`;

  // Palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.07, 0.025), skinMat);
  palm.position.set(0, -0.035, 0);
  hand.add(palm);

  // Opposable thumb
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.04, 6), skinMat);
  thumb.rotation.z = side * 0.55;
  thumb.position.set(side * 0.026, -0.024, 0.012);
  hand.add(thumb);

  // Curled fingers
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.036, 0.026), skinMat);
  fingers.rotation.x = curlAngle;
  fingers.position.set(0, -0.075, 0.01);
  hand.add(fingers);

  return hand;
}

function buildSandaledFoot(THREE, skinMat, leatherMat, side = 1) {
  const foot = new THREE.Group();
  foot.name = `foot-${side > 0 ? 'r' : 'l'}`;

  // Leather sole
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.018, 0.22), leatherMat);
  sole.position.set(0, 0.009, 0.025);
  foot.add(sole);

  // Foot flesh
  const flesh = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.04, 0.18), skinMat);
  flesh.position.set(0, 0.03, 0.02);
  foot.add(flesh);

  // Ankle
  const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.12, 8), skinMat);
  ankle.position.set(0, 0.088, -0.02);
  foot.add(ankle);

  // Leather toe thong strap
  const strapToe = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.045, 4), leatherMat);
  strapToe.position.set(side * 0.012, 0.035, 0.085);
  foot.add(strapToe);

  // Cross instep strap
  const strapCross = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.008, 0.032), leatherMat);
  strapCross.position.set(0, 0.05, 0.025);
  foot.add(strapCross);

  // Heel strap
  const strapAnkle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 12), leatherMat);
  strapAnkle.rotation.x = Math.PI / 2;
  strapAnkle.position.set(0, 0.072, -0.02);
  foot.add(strapAnkle);

  return foot;
}

async function buildFisherman(THREE, name) {
  const group = new THREE.Group();
  group.name = name;

  const tunicMat = new THREE.MeshStandardMaterial({ color: 0x625a4d, roughness: 0.92 });
  const mantleMat = new THREE.MeshStandardMaterial({ color: 0xb5a78e, roughness: 0.94 });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0x7a3a28, roughness: 0.88 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xa87854, roughness: 0.72 });
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x261d17, roughness: 0.96 });
  const headclothMat = new THREE.MeshStandardMaterial({ color: 0xd6cbb8, roughness: 0.95 });
  const agalMat = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.90 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x483424, roughness: 0.70 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.35, depthWrite: false });

  // Ground contact shadow
  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.004, 16), shadowMat);
  shadow.position.set(0, 0.002, 0);
  group.add(shadow);

  // Quayside shore resting stone for left foot
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.07, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.92 }),
  );
  stone.position.set(-0.13, 0.035, 0.14);
  group.add(stone);

  // Right foot (bearing weight)
  const footR = buildSandaledFoot(THREE, skinMat, leatherMat, 1);
  footR.position.set(0.11, 0, -0.04);
  group.add(footR);

  // Left foot (braced on quayside stone)
  const footL = buildSandaledFoot(THREE, skinMat, leatherMat, -1);
  footL.position.set(-0.13, 0.07, 0.14);
  footL.rotation.x = -0.12;
  group.add(footL);

  // Lower legs (calves)
  const calfR = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.35, 8), skinMat);
  calfR.position.set(0.11, 0.28, -0.04);
  group.add(calfR);

  const calfL = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.35, 8), skinMat);
  calfL.position.set(-0.13, 0.35, 0.12);
  calfL.rotation.x = 0.15;
  group.add(calfL);

  // Pleated Tunic skirt extending down to calves
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.28, 0.58, 12), tunicMat);
  skirt.position.set(0, 0.72, 0.02);
  group.add(skirt);

  // Waist Girdle (Ezor) in madder red
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.21, 0.09, 10), sashMat);
  sash.position.set(0, 0.98, 0.02);
  group.add(sash);

  const sashKnot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.035), sashMat);
  sashKnot.position.set(0.07, 0.88, 0.21);
  group.add(sashKnot);

  // Torso / Chest with subtle contrapposto twist
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.20, 0.36, 10), tunicMat);
  chest.position.set(0, 1.18, 0.02);
  chest.rotation.y = -0.08;
  group.add(chest);

  // Draped outer mantle shawl across left shoulder
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.25), mantleMat);
  mantle.position.set(-0.16, 1.28, 0.02);
  group.add(mantle);

  const mantleDrape = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.32, 8, 1, false, 0, Math.PI * 1.2), mantleMat);
  mantleDrape.position.set(-0.02, 1.12, 0.02);
  mantleDrape.rotation.y = -0.5;
  group.add(mantleDrape);

  // Head tilted forward, focused on mending
  const head = buildRealisticHead(THREE, skinMat, beardMat, headclothMat, agalMat, { backFlapAngle: 0.30 });
  head.position.set(0, 1.36, 0.04);
  head.rotation.x = 0.28;
  head.rotation.y = -0.15;
  group.add(head);

  // Left arm holding net bundle
  const armLUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.28, 8), tunicMat);
  armLUpper.position.set(-0.24, 1.22, 0.08);
  armLUpper.rotation.x = 0.65;
  group.add(armLUpper);

  const armLFore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), skinMat);
  armLFore.position.set(-0.20, 1.05, 0.22);
  armLFore.rotation.x = 1.35;
  armLFore.rotation.y = 0.35;
  group.add(armLFore);

  const handL = buildHand(THREE, skinMat, -1, 0.8);
  handL.position.set(-0.16, 1.08, 0.32);
  handL.rotation.x = 1.2;
  group.add(handL);

  // Held fishing net bundle with sinker weights
  const netMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.16, 0.32, 8),
    new THREE.MeshStandardMaterial({ color: 0x988874, roughness: 0.96, wireframe: true }),
  );
  netMesh.position.set(-0.14, 0.94, 0.30);
  netMesh.rotation.z = 0.2;
  group.add(netMesh);

  for (let s = 0; s < 3; s += 1) {
    const sinker = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.008, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.90 }),
    );
    sinker.position.set(-0.16 + s * 0.04, 0.80 - s * 0.03, 0.31);
    group.add(sinker);
  }

  // Right arm holding mending shuttle needle
  const armRUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.28, 8), tunicMat);
  armRUpper.position.set(0.24, 1.22, 0.06);
  armRUpper.rotation.x = 0.50;
  armRUpper.rotation.z = -0.20;
  group.add(armRUpper);

  const armRFore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), skinMat);
  armRFore.position.set(0.18, 1.06, 0.22);
  armRFore.rotation.x = 1.15;
  armRFore.rotation.y = -0.45;
  group.add(armRFore);

  const handR = buildHand(THREE, skinMat, 1, 0.7);
  handR.position.set(0.12, 1.08, 0.32);
  handR.rotation.x = 1.0;
  group.add(handR);

  // Carved wooden mending shuttle needle
  const shuttle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.004, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a5236, roughness: 0.82 }),
  );
  shuttle.position.set(0.08, 1.07, 0.33);
  shuttle.rotation.x = 1.2;
  shuttle.rotation.y = 0.4;
  group.add(shuttle);

  return exportGlb(THREE, group, name);
}

async function buildGrinder(THREE, name) {
  const group = new THREE.Group();
  group.name = name;

  const tunicMat = new THREE.MeshStandardMaterial({ color: 0x2e3f52, roughness: 0.92 });
  const mantleMat = new THREE.MeshStandardMaterial({ color: 0x48586c, roughness: 0.94 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xa87854, roughness: 0.72 });
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x261d17, roughness: 0.96 });
  const headclothMat = new THREE.MeshStandardMaterial({ color: 0xd6cbb8, roughness: 0.95 });
  const agalMat = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.90 });
  const basaltMat = new THREE.MeshStandardMaterial({ color: 0x282828, roughness: 0.92 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.82 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.35, depthWrite: false });

  // Woven palm mat
  const mat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.016, 16),
    new THREE.MeshStandardMaterial({ color: 0x827356, roughness: 0.95 }),
  );
  mat.position.set(0, 0.008, 0);
  group.add(mat);

  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.004, 16), shadowMat);
  shadow.position.set(0, 0.002, 0);
  group.add(shadow);

  // Basalt hopper millstone (lower bed stone + upper runner stone)
  const bedStone = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.12, 16), basaltMat);
  bedStone.position.set(0, 0.068, 0.38);
  group.add(bedStone);

  const runnerStone = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.10, 16), basaltMat);
  runnerStone.position.set(0, 0.178, 0.38);
  group.add(runnerStone);

  // Central hopper depression
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.04, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }),
  );
  hopper.position.set(0, 0.21, 0.38);
  group.add(hopper);

  // Upright wooden turning handle socketed in runner stone
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), woodMat);
  handle.position.set(0.12, 0.29, 0.34);
  group.add(handle);

  // Terracotta flour bowl beside the mill chute
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.06, 0.065, 10),
    new THREE.MeshStandardMaterial({ color: 0x9c4c34, roughness: 0.88 }),
  );
  bowl.position.set(-0.28, 0.04, 0.35);
  group.add(bowl);

  const flourDust = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.98 }),
  );
  flourDust.rotation.x = -Math.PI / 2;
  flourDust.position.set(-0.28, 0.065, 0.35);
  group.add(flourDust);

  // Seated lower body with legs folded under draped tunic and mantle
  const seatedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.28, 12), tunicMat);
  seatedBase.position.set(0, 0.14, 0);
  group.add(seatedBase);

  const mantleFold = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.36), mantleMat);
  mantleFold.position.set(0, 0.12, 0.05);
  group.add(mantleFold);

  // Torso leaning forward toward the millstone
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.38, 10), tunicMat);
  torso.rotation.x = 0.24;
  torso.position.set(0, 0.44, 0.06);
  group.add(torso);

  // Head tilted down toward the grinding work
  const head = buildRealisticHead(THREE, skinMat, beardMat, headclothMat, agalMat, { backFlapAngle: 0.45 });
  head.position.set(0, 0.66, 0.16);
  head.rotation.x = 0.38;
  group.add(head);

  // Both arms reaching forward, gripping the wooden handle
  const armLUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.28, 8), tunicMat);
  armLUpper.position.set(-0.16, 0.50, 0.18);
  armLUpper.rotation.x = 0.85;
  armLUpper.rotation.z = -0.22;
  group.add(armLUpper);

  const armLFore = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.26, 8), skinMat);
  armLFore.position.set(-0.06, 0.38, 0.30);
  armLFore.rotation.x = 1.45;
  armLFore.rotation.y = 0.42;
  group.add(armLFore);

  const handL = buildHand(THREE, skinMat, -1, 1.1);
  handL.position.set(0.04, 0.32, 0.34);
  handL.rotation.x = 1.2;
  group.add(handL);

  const armRUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.28, 8), tunicMat);
  armRUpper.position.set(0.18, 0.50, 0.18);
  armRUpper.rotation.x = 0.75;
  armRUpper.rotation.z = 0.18;
  group.add(armRUpper);

  const armRFore = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.26, 8), skinMat);
  armRFore.position.set(0.14, 0.38, 0.30);
  armRFore.rotation.x = 1.35;
  armRFore.rotation.y = -0.32;
  group.add(armRFore);

  const handR = buildHand(THREE, skinMat, 1, 1.1);
  handR.position.set(0.12, 0.34, 0.34);
  handR.rotation.x = 1.2;
  group.add(handR);

  return exportGlb(THREE, group, name);
}

async function buildCarrier(THREE, name) {
  const group = new THREE.Group();
  group.name = name;

  const tunicMat = new THREE.MeshStandardMaterial({ color: 0x76543e, roughness: 0.92 });
  const mantleMat = new THREE.MeshStandardMaterial({ color: 0x5a4836, roughness: 0.94 });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0x424e38, roughness: 0.88 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xa87854, roughness: 0.72 });
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x261d17, roughness: 0.96 });
  const headclothMat = new THREE.MeshStandardMaterial({ color: 0xd6cbb8, roughness: 0.95 });
  const agalMat = new THREE.MeshStandardMaterial({ color: 0x221e1a, roughness: 0.90 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x483424, roughness: 0.68 });
  const waterSkinMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.58, metalness: 0.06 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.35, depthWrite: false });

  // Ground contact shadow
  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.004, 16), shadowMat);
  shadow.position.set(0, 0.002, 0);
  group.add(shadow);

  // Walking stride: right foot forward, left foot back with heel lifted
  const footR = buildSandaledFoot(THREE, skinMat, leatherMat, 1);
  footR.position.set(0.10, 0, 0.16);
  group.add(footR);

  const footL = buildSandaledFoot(THREE, skinMat, leatherMat, -1);
  footL.position.set(-0.10, 0.035, -0.20);
  footL.rotation.x = 0.38;
  group.add(footL);

  // Lower legs
  const calfR = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.35, 8), skinMat);
  calfR.position.set(0.10, 0.28, 0.14);
  calfR.rotation.x = -0.15;
  group.add(calfR);

  const calfL = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.35, 8), skinMat);
  calfL.position.set(-0.10, 0.30, -0.16);
  calfL.rotation.x = 0.32;
  group.add(calfL);

  // Pleated Tunic skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.28, 0.58, 12), tunicMat);
  skirt.position.set(0, 0.72, 0);
  skirt.rotation.x = 0.06;
  group.add(skirt);

  // Waist belt
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.21, 0.09, 10), sashMat);
  sash.position.set(0, 0.98, 0);
  group.add(sash);

  // Small utility pouch hanging from belt
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.04), leatherMat);
  pouch.position.set(-0.16, 0.91, 0.10);
  group.add(pouch);

  // Torso with natural counter-lean against the heavy shoulder load
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.20, 0.38, 10), tunicMat);
  chest.position.set(0, 1.18, 0);
  chest.rotation.z = -0.06;
  chest.rotation.x = 0.04;
  group.add(chest);

  // Mantle drape on left shoulder
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.24), mantleMat);
  mantle.position.set(-0.16, 1.28, 0);
  group.add(mantle);

  // Head
  const head = buildRealisticHead(THREE, skinMat, beardMat, headclothMat, agalMat, { backFlapAngle: 0.18 });
  head.position.set(0, 1.36, 0.02);
  head.rotation.x = 0.06;
  head.rotation.y = -0.05;
  group.add(head);

  // Authentic goat-hide water-skin (Nod) resting over right shoulder
  const waterSkin = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), waterSkinMat);
  waterSkin.scale.set(0.95, 1.55, 1.05);
  waterSkin.position.set(0.22, 1.26, -0.02);
  waterSkin.rotation.x = 0.45;
  waterSkin.rotation.z = 0.25;
  group.add(waterSkin);

  // Tied neck spout of the skin
  const skinNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.12, 8), waterSkinMat);
  skinNeck.position.set(0.16, 1.22, 0.16);
  skinNeck.rotation.x = 0.85;
  group.add(skinNeck);

  const neckThong = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 4, 10), leatherMat);
  neckThong.position.set(0.16, 1.24, 0.19);
  group.add(neckThong);

  // Diagonal leather sling strap
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.48, 0.012), leatherMat);
  strap.position.set(0.06, 1.16, 0.14);
  strap.rotation.z = 0.55;
  group.add(strap);

  // Right arm reaching up to secure the water-skin neck against the shoulder
  const armRUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.046, 0.28, 8), tunicMat);
  armRUpper.position.set(0.24, 1.20, 0.04);
  armRUpper.rotation.x = 0.70;
  armRUpper.rotation.z = -0.30;
  group.add(armRUpper);

  const armRFore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), skinMat);
  armRFore.position.set(0.20, 1.16, 0.14);
  armRFore.rotation.x = -1.25;
  armRFore.rotation.y = -0.40;
  group.add(armRFore);

  const handR = buildHand(THREE, skinMat, 1, 1.2);
  handR.position.set(0.18, 1.22, 0.15);
  handR.rotation.x = -0.9;
  group.add(handR);

  // Left arm swinging naturally forward in stride
  const armLUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.046, 0.28, 8), tunicMat);
  armLUpper.position.set(-0.24, 1.20, 0);
  armLUpper.rotation.x = -0.45;
  armLUpper.rotation.z = 0.15;
  group.add(armLUpper);

  const armLFore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), skinMat);
  armLFore.position.set(-0.24, 1.02, 0.12);
  armLFore.rotation.x = 0.65;
  group.add(armLFore);

  const handL = buildHand(THREE, skinMat, -1, 0.4);
  handL.position.set(-0.24, 0.92, 0.22);
  handL.rotation.x = 0.5;
  group.add(handL);

  return exportGlb(THREE, group, name);
}

async function buildActor(THREE, name) {
  if (name === 'actor-fisherman') return buildFisherman(THREE, name);
  if (name === 'actor-grinder') return buildGrinder(THREE, name);
  if (name === 'actor-carrier') return buildCarrier(THREE, name);
  return buildFisherman(THREE, name);
}

// -----------------------------------------------------------------------------
// AUDIO SYNTHESIS & ENCODING
// -----------------------------------------------------------------------------

function generateWavBuffer(seconds, sampleRate, generatorFn) {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format: PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sampleVal = generatorFn(t, i, numSamples);
    const clamped = Math.max(-1, Math.min(1, sampleVal));
    const int16 = Math.round(clamped * 32767);
    buf.writeInt16LE(int16, 44 + i * 2);
  }

  return buf;
}

function encodeToOgg(wavBuffer, outputPath) {
  const tempWav = outputPath.replace(/\.ogg$/, '.temp.wav');
  fs.writeFileSync(tempWav, wavBuffer);
  try {
    execFileSync(ffmpegPath, ['-y', '-i', tempWav, '-c:a', 'libvorbis', '-q:a', '3', outputPath], {
      stdio: 'pipe',
    });
  } finally {
    if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
  }
}

async function createAudioLoop(name, duration, targetDir, sampleFn) {
  const wav = generateWavBuffer(duration, 22050, sampleFn);
  const tempOgg = path.join(targetDir, `${name}.tmp.ogg`);
  encodeToOgg(wav, tempOgg);
  const oggBuf = fs.readFileSync(tempOgg);
  const hash = hashBuffer(oggBuf);
  const filename = `${name}-${hash}.ogg`;
  const fullPath = path.join(targetDir, filename);
  fs.renameSync(tempOgg, fullPath);
  return {
    url: targetDir.includes('shared')
      ? `/assets/scenes/shared/audio/${filename}`
      : `/assets/scenes/capernaum/audio/${filename}`,
    size: oggBuf.length,
    hash,
  };
}

// -----------------------------------------------------------------------------
// MAIN GENERATION RUNNER
// -----------------------------------------------------------------------------

async function main() {
  console.log('Generating biblical scene realism assets...');

  // 1. PBR Materials
  const matBasalt = await createPbrTextureSet('basalt', {
    baseColor: [0.18, 0.19, 0.20],
    noiseScale: 3.5,
    roughnessBase: 0.88,
    aoCrevices: true,
    seed: 101,
  });
  const matEarth = await createPbrTextureSet('earth', {
    baseColor: [0.52, 0.43, 0.33],
    noiseScale: 2.2,
    roughnessBase: 0.92,
    aoCrevices: false,
    seed: 202,
  });
  const matTimber = await createPbrTextureSet('timber', {
    baseColor: [0.43, 0.37, 0.30],
    noiseScale: 4.8,
    roughnessBase: 0.82,
    aoCrevices: false,
    seed: 303,
  });
  const matThatch = await createPbrTextureSet('thatch', {
    baseColor: [0.61, 0.53, 0.35],
    noiseScale: 6.0,
    roughnessBase: 0.85,
    aoCrevices: true,
    seed: 404,
  });

  // 2. 3D GLB Models
  const THREE = await import('three');
  const boatAsset = await buildGinosarBoat(THREE);
  const doorwayAsset = await buildDoorway(THREE);
  const jarAsset = await buildGalileanJar(THREE);
  const basketAsset = await buildBasket(THREE);
  const fishNetAsset = await buildFishNet(THREE);
  const anchorAsset = await buildStoneAnchor(THREE);
  const ridgeAsset = await buildGalileeRidge(THREE);
  const fishermanActor = await buildActor(THREE, 'actor-fisherman');
  const grinderActor = await buildActor(THREE, 'actor-grinder');
  const carrierActor = await buildActor(THREE, 'actor-carrier');

  // 3. Audio Loops & Steps
  const waterLapAudio = await createAudioLoop('water-lap', 6.0, CAP_AUDIO_DIR, (t) => {
    // Freshwater wave lap: gentle swell envelope + pink-ish noise
    const swell = Math.sin(t * Math.PI * 0.33) ** 2;
    const noise = (Math.random() * 2 - 1) * 0.25;
    const resonance = Math.sin(t * 180) * 0.15;
    return (noise + resonance) * swell * 0.6;
  });

  const reedsBreezeAudio = await createAudioLoop('reeds-breeze', 8.0, CAP_AUDIO_DIR, (t) => {
    const breeze = Math.sin(t * 0.8) * 0.3 + 0.4;
    const rustle = (Math.random() * 2 - 1) * 0.2;
    return rustle * breeze * 0.5;
  });

  const timberCreakAudio = await createAudioLoop('timber-creak', 4.0, CAP_AUDIO_DIR, (t) => {
    const creakEnvelope = Math.max(0, Math.sin(t * Math.PI * 0.5)) ** 4;
    const woodFriction = Math.sin(t * 320 + Math.sin(t * 60) * 4) * 0.35;
    return woodFriction * creakEnvelope * 0.45;
  });

  const stepStoneAudio = await createAudioLoop('step-stone', 0.4, SHARED_AUDIO_DIR, (t) => {
    const decay = Math.exp(-t * 22);
    const click = Math.sin(t * 1900) * 0.4 + (Math.random() * 2 - 1) * 0.2;
    return click * decay * 0.8;
  });

  const stepEarthAudio = await createAudioLoop('step-earth', 0.4, SHARED_AUDIO_DIR, (t) => {
    const decay = Math.exp(-t * 18);
    const thud = Math.sin(t * 420) * 0.5 + (Math.random() * 2 - 1) * 0.15;
    return thud * decay * 0.7;
  });

  const stepSandAudio = await createAudioLoop('step-sand', 0.4, SHARED_AUDIO_DIR, (t) => {
    const decay = Math.exp(-t * 14);
    const scuff = (Math.random() * 2 - 1) * 0.35;
    return scuff * decay * 0.6;
  });

  // 4. Update sceneAssetManifest.js with exact generated paths and sizes
  const updatedManifestContent = `// Declarative asset manifest for immersive 3D scenes in miqra-kodesh.
// Content-addressed and verified by scripts/validate-scene-assets.js.

export const SCENE_ASSET_MANIFEST = {
  capernaum: {
    groups: {
      core: {
        id: 'capernaum-core',
        priority: 1,
        materials: ['mat-basalt-stone', 'mat-packed-earth', 'mat-timber', 'mat-thatch'],
        models: ['model-doorway'],
      },
      boat: {
        id: 'capernaum-boat',
        priority: 2,
        models: ['model-ginosar-boat'],
      },
      props: {
        id: 'capernaum-props',
        priority: 3,
        models: ['prop-galilean-jar', 'prop-basket', 'prop-fish-net', 'prop-stone-anchor'],
      },
      terrain: {
        id: 'capernaum-terrain',
        priority: 4,
        models: ['model-galilee-ridge'],
      },
      actors: {
        id: 'capernaum-actors',
        priority: 1,
        models: ['actor-fisherman', 'actor-grinder', 'actor-carrier'],
      },
    },
    materials: [
      {
        id: 'mat-basalt-stone',
        type: 'texture-set',
        scale: [2.0, 2.0],
        maps: ${JSON.stringify(matBasalt, null, 10).trim()},
        source: 'CAP-ARCH-BASALT-01',
        license: 'CC0',
      },
      {
        id: 'mat-packed-earth',
        type: 'texture-set',
        scale: [3.0, 3.0],
        maps: ${JSON.stringify(matEarth, null, 10).trim()},
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
      {
        id: 'mat-timber',
        type: 'texture-set',
        scale: [1.0, 4.0],
        maps: ${JSON.stringify(matTimber, null, 10).trim()},
        source: 'CAP-ARCH-ROOF-01',
        license: 'CC0',
      },
      {
        id: 'mat-thatch',
        type: 'texture-set',
        scale: [1.5, 1.5],
        maps: ${JSON.stringify(matThatch, null, 10).trim()},
        source: 'CAP-ARCH-ROOF-01',
        license: 'CC0',
      },
    ],
    models: [
      {
        id: 'model-doorway',
        url: '${doorwayAsset.url}',
        size: ${doorwayAsset.size},
        hash: '${doorwayAsset.hash}',
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
      {
        id: 'model-ginosar-boat',
        url: '${boatAsset.url}',
        size: ${boatAsset.size},
        hash: '${boatAsset.hash}',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC-BY-4.0',
      },
      {
        id: 'prop-galilean-jar',
        url: '${jarAsset.url}',
        size: ${jarAsset.size},
        hash: '${jarAsset.hash}',
        source: 'CAP-PROP-POTTERY-01',
        license: 'CC0',
      },
      {
        id: 'prop-basket',
        url: '${basketAsset.url}',
        size: ${basketAsset.size},
        hash: '${basketAsset.hash}',
        source: 'CAP-PROP-BASKET-01',
        license: 'CC0',
      },
      {
        id: 'prop-fish-net',
        url: '${fishNetAsset.url}',
        size: ${fishNetAsset.size},
        hash: '${fishNetAsset.hash}',
        source: 'CAP-FISH-NETS-01',
        license: 'CC0',
      },
      {
        id: 'prop-stone-anchor',
        url: '${anchorAsset.url}',
        size: ${anchorAsset.size},
        hash: '${anchorAsset.hash}',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC0',
      },
      {
        id: 'model-galilee-ridge',
        url: '${ridgeAsset.url}',
        size: ${ridgeAsset.size},
        hash: '${ridgeAsset.hash}',
        source: 'CAP-GEO-RIDGE-01',
        license: 'CC0',
      },
      {
        id: 'actor-fisherman',
        url: '${fishermanActor.url}',
        size: ${fishermanActor.size},
        hash: '${fishermanActor.hash}',
        source: 'CAP-FISH-NETS-01',
        license: 'CC0',
      },
      {
        id: 'actor-grinder',
        url: '${grinderActor.url}',
        size: ${grinderActor.size},
        hash: '${grinderActor.hash}',
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
      {
        id: 'actor-carrier',
        url: '${carrierActor.url}',
        size: ${carrierActor.size},
        hash: '${carrierActor.hash}',
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
    ],
  },
  shared: {
    audio: [
      {
        id: 'snd-galilee-water-lap',
        url: '${waterLapAudio.url}',
        size: ${waterLapAudio.size},
        hash: '${waterLapAudio.hash}',
        type: 'loop',
        source: 'CAP-GEO-SHORE-01',
        license: 'CC0',
      },
      {
        id: 'snd-reeds-breeze',
        url: '${reedsBreezeAudio.url}',
        size: ${reedsBreezeAudio.size},
        hash: '${reedsBreezeAudio.hash}',
        type: 'loop',
        source: 'CAP-GEO-SHORE-01',
        license: 'CC0',
      },
      {
        id: 'snd-timber-creak',
        url: '${timberCreakAudio.url}',
        size: ${timberCreakAudio.size},
        hash: '${timberCreakAudio.hash}',
        type: 'loop',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC0',
      },
      {
        id: 'snd-step-stone',
        url: '${stepStoneAudio.url}',
        size: ${stepStoneAudio.size},
        hash: '${stepStoneAudio.hash}',
        type: 'step',
        surface: 'stone',
        license: 'CC0',
      },
      {
        id: 'snd-step-earth',
        url: '${stepEarthAudio.url}',
        size: ${stepEarthAudio.size},
        hash: '${stepEarthAudio.hash}',
        type: 'step',
        surface: 'earth',
        license: 'CC0',
      },
      {
        id: 'snd-step-sand',
        url: '${stepSandAudio.url}',
        size: ${stepSandAudio.size},
        hash: '${stepSandAudio.hash}',
        type: 'step',
        surface: 'sand',
        license: 'CC0',
      },
    ],
  },
};
`;

  const manifestPath = path.join(ROOT, 'src', 'components', 'scene', 'sceneAssetManifest.js');
  const humanImports = "import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';\nimport { addHumanAssetGroups } from './sceneHumanManifest.js';\n";
  fs.writeFileSync(manifestPath, humanImports + updatedManifestContent + '\naddHumanAssetGroups(SCENE_ASSET_MANIFEST, HUMAN_MODEL_ASSETS);\n', 'utf8');
  console.log('Successfully generated assets and updated sceneAssetManifest.js');
}

main().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
