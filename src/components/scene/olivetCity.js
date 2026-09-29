// Jerusalem across the Kidron: the Temple, the Antonia, the walls, the city's
// roofs and Herod's towers on the western skyline — the view the Mount of
// Olives exists for in the gospels ("he saw the city"; "opposite the
// temple").
//
// All of it is a backdrop two hundred metres to a kilometre away, and none of
// it is walkable, so it is built for distance: the Temple from the Temple
// scene's own measurements (templeDimensions.js) mapped onto the real
// platform by olivetDimensions.js templeToOlivet, without the detail that
// only shows from inside; the platform's walls at their true line along the
// top of the Kidron's slope; the houses as instanced blocks on the real
// hills. The Herodian ashlar is a shader pattern in world space, so the
// walls read at the right scale without a texture.
//
// three.js is passed in, so the module stays importable in jsdom.

import { LEVEL, INNER, WOMEN, ALTAR, PORCH } from './templeDimensions.js';
import {
  PLATFORM, TEMPLE_FRAME, ANTONIA, HEROD_TOWERS, CITY_WALLS, CITY_QUARTERS, insidePolygon,
} from './olivetDimensions.js';
import { makeRandom } from './sceneLandscape.js';

// Where the altar's smoke rises from, for the scene's air (sceneAir.js).
export const ALTAR_TOP = {
  x: TEMPLE_FRAME.x + ALTAR.z,
  y: PLATFORM.level + LEVEL.inner + ALTAR.height,
  z: TEMPLE_FRAME.z,
};

// Portico depths along each side of the platform, and their roof heights
// above the court. The Royal Portico on the south was a basilica: four rows
// of columns, the middle aisle twice the height of the others (Antiquities
// 15.411-416).
const PORTICO = { depth: 15, height: 13, royalDepth: 34, royalAisle: 15, royalNave: 30 };

function ashlar(THREE, colour) {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 });
  // Courses a little over a metre, joints staggered a few metres apart, and
  // the drafted margin round each stone: in world space, faded with distance.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAshlar;\nvarying vec3 vAshlarNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAshlar = (modelMatrix * vec4(position, 1.0)).xyz;
        vAshlarNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAshlar;\nvarying vec3 vAshlarNormal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = abs(vAshlarNormal);
          float along = n.x > n.z ? vAshlar.z : vAshlar.x;
          float course = vAshlar.y / 1.05;
          float row = floor(course);
          float stone = (along + mod(row, 2.0) * 2.1) / 4.3;
          vec2 f = vec2(fract(stone), fract(course));
          float margin = step(f.x, 0.035) + step(0.965, f.x) + step(f.y, 0.06) + step(0.94, f.y);
          float shade = fract(sin(dot(vec2(floor(stone), row), vec2(12.9898, 78.233))) * 43758.5453);
          float near = 1.0 - smoothstep(250.0, 900.0, length(vAshlar - cameraPosition));
          float vertical = 1.0 - step(0.7, n.y);
          diffuseColor.rgb *= mix(1.0, (0.9 + shade * 0.14) * (1.0 - min(margin, 1.0) * 0.18), near * vertical);
        }`);
  };
  material.customProgramCacheKey = () => 'olivet-ashlar';
  return material;
}

export function createOlivetCity(THREE, { quality = 'high', terrainHeight } = {}) {
  const low = quality === 'low';
  const high = quality === 'high';
  const random = makeRandom(700);
  const group = new THREE.Group();
  group.name = 'olivet-city';
  const geometries = [];
  const materials = [];
  const keepG = (g) => { geometries.push(g); return g; };
  const keepM = (m) => { materials.push(m); return m; };

  const M = {
    ashlar: keepM(ashlar(THREE, 0xd3c6a6)),
    paving: keepM(new THREE.MeshStandardMaterial({ color: 0xcdbf9f, roughness: 0.95 })),
    // Josephus: from a distance, a mountain covered with snow.
    marble: keepM(new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.55 })),
    gold: keepM(new THREE.MeshStandardMaterial({ color: 0xd9a93c, metalness: 0.85, roughness: 0.3 })),
    bronze: keepM(new THREE.MeshStandardMaterial({ color: 0x8a6c38, metalness: 0.7, roughness: 0.45 })),
    roof: keepM(new THREE.MeshStandardMaterial({ color: 0x9a8566, roughness: 0.95 })),
    column: keepM(new THREE.MeshStandardMaterial({ color: 0xe6dfcf, roughness: 0.7 })),
    house: keepM(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })),
    altar: keepM(new THREE.MeshStandardMaterial({ color: 0xc2b598, roughness: 1 })),
  };

  const dummy = new THREE.Object3D();
  const unit = keepG(new THREE.BoxGeometry(1, 1, 1));
  // Boxes by extents, for the walls and buildings that are one of a kind.
  const boxes = [];
  const box = (material, x0, x1, y0, y1, z0, z1, rotation = 0, cx = null, cz = null) => {
    boxes.push({ material, x0, x1, y0, y1, z0, z1, rotation, cx, cz });
  };
  const lift = (y) => PLATFORM.level + y;

  // --- the platform ---
  {
    const shape = new THREE.Shape(PLATFORM.corners.map(([x, z]) => new THREE.Vector2(x, -z)));
    const paving = new THREE.Mesh(keepG(new THREE.ShapeGeometry(shape)), M.paving);
    paving.geometry.rotateX(-Math.PI / 2);
    paving.position.y = PLATFORM.level;
    paving.name = 'temple-platform';
    paving.receiveShadow = !low;
    group.add(paving);
  }

  // The retaining walls, carried up as the back walls of the porticoes: from
  // outside, a sheer face from the valley to the portico roofs. Each is a box
  // along its edge, founded below the lowest ground it stands on.
  const corners = PLATFORM.corners;
  corners.forEach(([ax, az], i) => {
    const [bx, bz] = corners[(i + 1) % corners.length];
    const length = Math.hypot(bx - ax, bz - az);
    let lowest = Infinity;
    for (let t = 0; t <= 1; t += 0.05) lowest = Math.min(lowest, terrainHeight(ax + (bx - ax) * t, az + (bz - az) * t));
    const south = i === 1;
    const top = lift(south ? PORTICO.royalAisle + 1.5 : PORTICO.height + 1.2);
    const angle = Math.atan2(bz - az, bx - ax);
    // Extend each wall a little past its corners so they close.
    boxes.push({ material: M.ashlar, centre: [(ax + bx) / 2, (lowest - 6 + top) / 2, (az + bz) / 2], size: [length + 5, top - lowest + 6, 5], yaw: -angle, name: `platform-wall-${i}` });
  });

  // --- the porticoes ---
  // Colonnades facing into the court on every side, their roofs level with the
  // walls; the Royal Portico's nave standing up through the middle of the
  // south side.
  const columns = [];
  const along = (from, to, inset, spacing, height) => {
    // From corner `from` to corner `to`, a row of columns `inset` metres in.
    const [ax, az] = from;
    const [bx, bz] = to;
    const length = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    // Inward normal: toward the platform's centre.
    const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
    const cz = corners.reduce((s, c) => s + c[1], 0) / 4;
    let nx = -uz;
    let nz = ux;
    if ((cx - ax) * nx + (cz - az) * nz < 0) { nx = -nx; nz = -nz; }
    for (let d = inset + spacing / 2; d < length - inset; d += spacing) {
      columns.push({ x: ax + ux * d + nx * inset, z: az + uz * d + nz * inset, h: height });
    }
    return { ux, uz, nx, nz, length, ax, az };
  };
  const roofOver = (edge, depth, height, material = M.roof) => {
    const { ux, uz, nx, nz, length, ax, az } = edge;
    const mx = ax + ux * length / 2 + nx * depth / 2;
    const mz = az + uz * length / 2 + nz * depth / 2;
    boxes.push({ material, centre: [mx, lift(height + 0.6), mz], size: [length, 1.2, depth], yaw: -Math.atan2(uz, ux) });
  };
  const spacing = low ? 11 : 5.5;
  // East — Solomon's Portico (John 10:23; Acts 3:11).
  const east = along(corners[0], corners[1], PORTICO.depth - 3, spacing, PORTICO.height);
  along(corners[0], corners[1], 7, spacing, PORTICO.height);
  roofOver(east, PORTICO.depth, PORTICO.height);
  // West and north: double colonnades.
  const west = along(corners[2], corners[3], PORTICO.depth - 3, spacing, PORTICO.height);
  along(corners[2], corners[3], 7, spacing, PORTICO.height);
  roofOver(west, PORTICO.depth, PORTICO.height);
  const north = along(corners[3], corners[0], PORTICO.depth - 3, spacing, PORTICO.height);
  along(corners[3], corners[0], 7, spacing, PORTICO.height);
  roofOver(north, PORTICO.depth, PORTICO.height);
  // South — the Royal Portico: four rows, the middle aisle taller.
  const south = along(corners[1], corners[2], PORTICO.royalDepth - 2, spacing, PORTICO.royalAisle);
  along(corners[1], corners[2], PORTICO.royalDepth - 12, spacing, PORTICO.royalNave);
  along(corners[1], corners[2], 12, spacing, PORTICO.royalNave);
  along(corners[1], corners[2], 4, spacing, PORTICO.royalAisle);
  roofOver(south, PORTICO.royalDepth, PORTICO.royalAisle);
  {
    // The nave's clerestory and roof, over the middle two rows.
    const { ux, uz, nx, nz, length, ax, az } = south;
    const mid = PORTICO.royalDepth / 2;
    const mx = ax + ux * length / 2 + nx * mid;
    const mz = az + uz * length / 2 + nz * mid;
    boxes.push({ material: M.ashlar, centre: [mx, lift((PORTICO.royalAisle + PORTICO.royalNave) / 2 + 0.6), mz], size: [length - 8, PORTICO.royalNave - PORTICO.royalAisle, 14], yaw: -Math.atan2(uz, ux) });
    boxes.push({ material: M.roof, centre: [mx, lift(PORTICO.royalNave + 1.2), mz], size: [length - 8, 1.2, 15], yaw: -Math.atan2(uz, ux) });
  }
  const columnMesh = new THREE.InstancedMesh(keepG(new THREE.CylinderGeometry(0.75, 0.85, 1, low ? 6 : 8).translate(0, 0.5, 0)), M.column, columns.length);
  columns.forEach((c, i) => {
    dummy.position.set(c.x, PLATFORM.level, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, c.h, 1);
    dummy.updateMatrix();
    columnMesh.setMatrixAt(i, dummy.matrix);
  });
  columnMesh.name = 'portico-columns';
  columnMesh.castShadow = !low;
  group.add(columnMesh);

  // --- the Temple ---
  // Boxes given in the Temple scene's frame (+X north, +Z east) and heights
  // above the outer court, set down by templeToOlivet.
  const temple = (material, tx0, tx1, y0, y1, tz0, tz1) => {
    box(material, TEMPLE_FRAME.x + tz0, TEMPLE_FRAME.x + tz1, lift(y0), lift(y1), TEMPLE_FRAME.z - tx1, TEMPLE_FRAME.z - tx0);
  };
  // The women's court, raised, walled to twelve metres, the Beautiful Gate in
  // its east wall.
  const womenTop = LEVEL.women + 12;
  temple(M.ashlar, -WOMEN.halfX, WOMEN.halfX, 0, LEVEL.women, INNER.zEast, WOMEN.zEast);
  temple(M.ashlar, -WOMEN.halfX - 1.5, -WOMEN.halfX, 0, womenTop, INNER.zEast, WOMEN.zEast);
  temple(M.ashlar, WOMEN.halfX, WOMEN.halfX + 1.5, 0, womenTop, INNER.zEast, WOMEN.zEast);
  temple(M.ashlar, -WOMEN.halfX - 1.5, -5, 0, womenTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  temple(M.ashlar, 5, WOMEN.halfX + 1.5, 0, womenTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  temple(M.ashlar, -5, 5, LEVEL.women + 9, womenTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  temple(M.bronze, -4.6, 4.6, LEVEL.women, LEVEL.women + 9, WOMEN.zEast + 0.5, WOMEN.zEast + 0.9);
  // The four chambers in the corners of the women's court.
  for (const tx of [-WOMEN.halfX + 10, WOMEN.halfX - 10]) {
    for (const tz of [INNER.zEast + 10, WOMEN.zEast - 10]) temple(M.ashlar, tx - 10, tx + 10, LEVEL.women, LEVEL.women + 8, tz - 10, tz + 10);
  }
  // The inner court: raised, walled, the Nicanor Gate on the women's court.
  const gateTop = LEVEL.inner + 11;
  temple(M.ashlar, -INNER.halfX, INNER.halfX, 0, LEVEL.inner, INNER.zWest, INNER.zEast);
  temple(M.ashlar, -INNER.halfX - 2, -INNER.halfX, 0, gateTop, INNER.zWest, INNER.zEast);
  temple(M.ashlar, INNER.halfX, INNER.halfX + 2, 0, gateTop, INNER.zWest, INNER.zEast);
  temple(M.ashlar, -INNER.halfX - 2, INNER.halfX + 2, 0, gateTop, INNER.zWest - 2, INNER.zWest);
  temple(M.ashlar, -INNER.halfX, -5, LEVEL.inner, gateTop, INNER.zEast - 2, INNER.zEast);
  temple(M.ashlar, 5, INNER.halfX, LEVEL.inner, gateTop, INNER.zEast - 2, INNER.zEast);
  temple(M.ashlar, -5, 5, LEVEL.inner + 11, gateTop, INNER.zEast - 2, INNER.zEast);
  temple(M.bronze, -4.7, 4.7, LEVEL.inner, LEVEL.inner + 11, INNER.zEast - 1.6, INNER.zEast - 1.2);
  temple(M.gold, -5.4, 5.4, LEVEL.inner + 11, LEVEL.inner + 11.9, INNER.zEast - 2.2, INNER.zEast + 0.2);
  // The altar of burnt offering.
  const altarBase = LEVEL.inner;
  temple(M.altar, -ALTAR.half, ALTAR.half, altarBase, altarBase + 2.5, ALTAR.z - ALTAR.half, ALTAR.z + ALTAR.half);
  temple(M.altar, -7, 7, altarBase + 2.5, altarBase + 4.6, ALTAR.z - 7, ALTAR.z + 7);
  temple(M.altar, -6, 6, altarBase + 4.6, altarBase + ALTAR.height, ALTAR.z - 6, ALTAR.z + 6);
  // The sanctuary: the body sixty cubits wide and forty high, the porch a
  // hundred by a hundred, facing east, with its twenty-by-forty-cubit door.
  const base = LEVEL.inner;
  temple(M.marble, -15, 15, base, base + 40, -52, PORCH.zEast);
  temple(M.marble, -PORCH.halfX, -5, base, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);
  temple(M.marble, 5, PORCH.halfX, base, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);
  temple(M.marble, -5, 5, base + 20, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);
  // Gold: the doorway surround, the cornice, and the crown of the porch.
  temple(M.gold, -6.4, -5, base, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3);
  temple(M.gold, 5, 6.4, base, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3);
  temple(M.gold, -6.4, 6.4, base + 20, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3);
  temple(M.gold, -PORCH.halfX - 1, PORCH.halfX + 1, base + PORCH.height - 3, base + PORCH.height, PORCH.zEast - PORCH.depth - 0.6, PORCH.zEast + 0.6);
  temple(M.gold, -PORCH.halfX - 1, PORCH.halfX + 1, base + PORCH.height, base + PORCH.height + 1.4, PORCH.zEast - PORCH.depth - 1.2, PORCH.zEast + 1.2);
  temple(M.gold, -16, 16, base + 40, base + 41, -52, PORCH.zEast - PORCH.depth);
  // The door's darkness: the curtain behind it, deep in the doorway.
  temple(M.roof, -5, 5, base, base + 20, PORCH.zEast - PORCH.depth - 0.2, PORCH.zEast - PORCH.depth + 0.1);

  // The eastern gate in the platform's east wall, on the sanctuary's axis: a
  // gatehouse standing proud of the wall.
  box(M.ashlar, corners[0][0] - 6, corners[0][0] + 3, lift(-6), lift(PORTICO.height + 5), TEMPLE_FRAME.z - 12, TEMPLE_FRAME.z + 12);
  box(M.roof, corners[0][0] + 2.9, corners[0][0] + 3.1, lift(0), lift(8), TEMPLE_FRAME.z - 3.5, TEMPLE_FRAME.z + 3.5);

  // --- the Antonia on its rock ---
  {
    const { x0, x1, z0, z1 } = ANTONIA;
    const ground = Math.max(terrainHeight(x0, z0), terrainHeight(x1, z0), terrainHeight(x0, z1), terrainHeight(x1, z1));
    const foot = Math.min(terrainHeight(x0, z0), terrainHeight(x1, z0), terrainHeight(x0, z1), terrainHeight(x1, z1), PLATFORM.level) - 4;
    box(M.ashlar, x0, x1, foot, ground + ANTONIA.body, z0, z1);
    const towers = [[x0, z0, ANTONIA.tower], [x0, z1, ANTONIA.tower], [x1, z0, ANTONIA.tower], [x1, z1, ANTONIA.tallTower]];
    for (const [tx, tz, height] of towers) box(M.ashlar, tx - 7, tx + 7, foot, ground + height, tz - 7, tz + 7);
  }

  // --- Herod's palace and towers ---
  for (const tower of HEROD_TOWERS) {
    const g = terrainHeight(tower.x, tower.z);
    box(M.ashlar, tower.x - tower.half, tower.x + tower.half, g - 4, g + tower.height, tower.z - tower.half, tower.z + tower.half);
  }
  {
    const g = terrainHeight(-1105, 460);
    box(M.ashlar, -1150, -1060, g - 4, g + 14, 360, 560);
  }

  // --- the city walls ---
  for (const wall of CITY_WALLS) {
    for (let i = 0; i < wall.points.length - 1; i += 1) {
      const [ax, az] = wall.points[i];
      const [bx, bz] = wall.points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const pieces = Math.max(1, Math.round(length / 40));
      for (let k = 0; k < pieces; k += 1) {
        const t0 = k / pieces;
        const t1 = (k + 1) / pieces;
        const px = ax + (bx - ax) * (t0 + t1) / 2;
        const pz = az + (bz - az) * (t0 + t1) / 2;
        const g0 = terrainHeight(ax + (bx - ax) * t0, az + (bz - az) * t0);
        const g1 = terrainHeight(ax + (bx - ax) * t1, az + (bz - az) * t1);
        const top = Math.max(g0, g1) + wall.height;
        const bottom = Math.min(g0, g1) - 3;
        boxes.push({ material: M.ashlar, centre: [px, (top + bottom) / 2, pz], size: [length / pieces + 0.5, top - bottom, 4], yaw: -Math.atan2(bz - az, bx - ax) });
        // A tower every other piece.
        if (k % 2 === 0) {
          boxes.push({ material: M.ashlar, centre: [px, (top + 4 + bottom) / 2, pz], size: [9, top + 4 - bottom, 9], yaw: -Math.atan2(bz - az, bx - ax) });
        }
      }
    }
  }

  // All the one-off boxes: one geometry, instanced per material.
  const byMaterial = new Map();
  for (const b of boxes) {
    if (!byMaterial.has(b.material)) byMaterial.set(b.material, []);
    byMaterial.get(b.material).push(b);
  }
  for (const [material, list] of byMaterial) {
    const mesh = new THREE.InstancedMesh(unit, material, list.length);
    list.forEach((b, i) => {
      if (b.centre) {
        dummy.position.set(...b.centre);
        dummy.rotation.set(0, b.yaw || 0, 0);
        dummy.scale.set(...b.size);
      } else {
        dummy.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere();
    mesh.name = `city-${material === M.ashlar ? 'stone' : material === M.marble ? 'sanctuary' : material === M.gold ? 'gold' : 'parts'}-${list.length}`;
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    group.add(mesh);
  }

  // --- the houses ---
  // Flat-roofed limestone blocks on the real hills, packed tight in the lower
  // city on the ridge facing the Mount, looser in the upper city, sparse in
  // the new suburb north of the walls; some with a room on the roof.
  const houses = [];
  const total = low ? 500 : high ? 2200 : 1200;
  const weights = CITY_QUARTERS.map((q) => q.density);
  const sum = weights.reduce((a, b) => a + b, 0);
  const avoid = (x, z) => insidePolygon(x, z, PLATFORM.corners)
    || (x > ANTONIA.x0 - 14 && x < ANTONIA.x1 + 14 && z > ANTONIA.z0 - 14 && z < ANTONIA.z1 + 14)
    || (x > -1165 && x < -1045 && z > 300 && z < 575);
  CITY_QUARTERS.forEach((quarter) => {
    const want = Math.round((total * quarter.density) / sum);
    const xs = quarter.points.map((p) => p[0]);
    const zs = quarter.points.map((p) => p[1]);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const grid = quarter.id === 'upper' ? 0.1 : quarter.id === 'lower' ? -0.2 : 0.35;
    let placed = 0;
    for (let tries = 0; tries < want * 8 && placed < want; tries += 1) {
      const x = minX + random() * (maxX - minX);
      const z = minZ + random() * (maxZ - minZ);
      if (!insidePolygon(x, z, quarter.points) || avoid(x, z)) continue;
      const w = 6 + random() * 9;
      const d = 6 + random() * 8;
      const h = 3.5 + random() * (quarter.id === 'upper' ? 6 : 4);
      houses.push({ x, z, w, d, h, y: terrainHeight(x, z), r: grid + (random() - 0.5) * 0.25, q: quarter.id, tint: random() });
      placed += 1;
    }
  });
  const houseMesh = new THREE.InstancedMesh(unit, M.house, houses.length);
  const roofRooms = houses.filter((h) => h.tint > 0.72);
  const roomMesh = new THREE.InstancedMesh(unit, M.house, Math.max(1, roofRooms.length));
  roomMesh.count = roofRooms.length;
  const colour = new THREE.Color();
  const tintOf = (h) => colour.setHSL(0.1 + h.tint * 0.03, 0.18 + h.tint * 0.12, 0.62 + h.tint * 0.16);
  houses.forEach((h, i) => {
    // Sunk into the slope so the uphill side does not float.
    dummy.position.set(h.x, h.y + h.h / 2 - 1.5, h.z);
    dummy.rotation.set(0, h.r, 0);
    dummy.scale.set(h.w, h.h + 3, h.d);
    dummy.updateMatrix();
    houseMesh.setMatrixAt(i, dummy.matrix);
    houseMesh.setColorAt(i, tintOf(h));
  });
  roofRooms.forEach((h, i) => {
    dummy.position.set(h.x + h.w * 0.2, h.y + h.h + 1.1, h.z - h.d * 0.15);
    dummy.rotation.set(0, h.r, 0);
    dummy.scale.set(h.w * 0.4, 2.6, h.d * 0.45);
    dummy.updateMatrix();
    roomMesh.setMatrixAt(i, dummy.matrix);
    roomMesh.setColorAt(i, tintOf(h));
  });
  houseMesh.name = 'city-houses';
  roomMesh.name = 'city-roof-rooms';
  for (const mesh of [houseMesh, roomMesh]) {
    mesh.computeBoundingSphere();
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  return {
    group,
    counts: { houses: houses.length, columns: columns.length, boxes: boxes.length },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
}
