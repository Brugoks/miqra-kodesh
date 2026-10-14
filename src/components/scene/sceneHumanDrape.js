// A veil or head cloth as a piece of cloth that was actually laid over this
// person's head: a flat rectangle, pinned across the brow, dropped over the
// skull and left to fall onto the neck, the shoulders, the hair and the arms
// until it comes to rest. The settled shape is what ships — geometry in the
// model's rest pose, skinned to the head and spine like any other part — so
// nothing is simulated while the scene runs.
//
// It replaces a bent sphere, and for the same reason it exists: a sphere is
// round and smooth everywhere, and cloth is not. A drape has an edge that
// hangs at a different length on each side, a fold where it crosses the
// shoulder, and a weave that follows the cloth because the texture
// coordinates are the flat rectangle's own.
//
// The solve is position-based dynamics with friction, run once per body and
// cached, in a few tens of milliseconds. It is deterministic: the same body
// gives the same cloth, so two people of one model wear the same veil and the
// crowd and the people who stand in for it agree.

import { WEAVE_TILE, ensureClothAttributes, smoothstep } from './sceneHumanCloth.js';

// The two things worn on the head. Metres. `pin` is the half-width of the
// stretch of the front edge that is held at the brow, as a veil is held by a
// hand or tied; everything else falls. `thickness` is how far the cloth is
// held off whatever it lies on.
export const DRAPES = {
  veil: { width: 0.78, length: 0.68, columns: 18, rows: 16, pin: 0.085, thickness: 0.014 },
  cloth: { width: 0.5, length: 0.5, columns: 12, rows: 12, pin: 0.08, thickness: 0.012 },
};

// Cloth is let down, not dropped. Each step it is moved a few millimetres
// toward the floor and the constraints and the body then put it right; there
// is no velocity to carry over. A falling cloth with momentum tears itself
// apart at this resolution, and only where it comes to rest matters.
const STEPS = 150;
const ITERATIONS = 10;
const DROP = 0.005;
// Coulomb friction: cloth sticks to a surface until the slope is steeper than
// atan(FRICTION), so it stays on the crown of the head and slides off the sides.
const FRICTION = 0.6;
// How far below the jaw the body is gathered as something the cloth can land on.
const BODY_DEPTH = 0.62;
// The farthest a point of the body is looked for from a piece of cloth.
const NEAR = 0.05;
const CELL = NEAR;

// --- the body the cloth falls on ------------------------------------------------

const HAIR = /hair|long|short|beard/i;

// Points on the surface of the neck, the shoulders, the chest, the arms and the
// hair below the jaw, with the direction each faces: what a fall of cloth
// lands on that the smooth ellipsoid of the skull does not describe. Taken
// from the dense mesh where there is one. Hair is a set of flat cards whose
// own normals mean nothing, so a hair point faces away from the neck instead.
export function collectBody(THREE, root, skull) {
  root.updateMatrixWorld(true);
  const lowest = skull.jaw - BODY_DEPTH;
  const highest = skull.jaw + 0.05;
  const meshes = [];
  root.traverse((node) => {
    if (node.isSkinnedMesh && node.geometry.attributes.normal && /^Skin/.test(node.name) && !/low-poly|eyebrow/i.test(node.name)) meshes.push(node);
  });
  const dense = meshes.filter((node) => node.name.endsWith('_LOD0'));
  const used = dense.length ? dense : meshes;
  const [cx, , cz] = skull.centre;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const matrix = new THREE.Matrix3();
  const found = [];
  for (const node of used) {
    const hair = HAIR.test(node.name);
    matrix.getNormalMatrix(node.matrixWorld);
    const { count } = node.geometry.attributes.position;
    for (let i = 0; i < count; i += 1) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      if (point.y < lowest || point.y > highest) continue;
      if (hair) {
        normal.set(point.x - cx, 0, point.z - cz);
      } else {
        normal.fromBufferAttribute(node.geometry.attributes.normal, i).applyMatrix3(matrix);
      }
      const length = normal.length();
      if (length < 1e-6) continue;
      found.push(point.x, point.y, point.z, normal.x / length, normal.y / length, normal.z / length);
    }
  }
  return new Float32Array(found);
}

// The points laid in a dense grid of cells NEAR wide, in typed arrays, so
// the nearest point to a piece of cloth is found among a few and without a
// lookup table: this is the inner loop of the solve.
function gridOf(points) {
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < points.length; i += 6) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]); y1 = Math.max(y1, points[i + 1]);
    z0 = Math.min(z0, points[i + 2]); z1 = Math.max(z1, points[i + 2]);
  }
  const nx = Math.floor((x1 - x0) / CELL) + 1; const ny = Math.floor((y1 - y0) / CELL) + 1; const nz = Math.floor((z1 - z0) / CELL) + 1;
  const cellOf = (i) => (Math.floor((points[i + 2] - z0) / CELL) * ny + Math.floor((points[i + 1] - y0) / CELL)) * nx + Math.floor((points[i] - x0) / CELL);
  const start = new Int32Array(nx * ny * nz + 1);
  for (let i = 0; i < points.length; i += 6) start[cellOf(i) + 1] += 1;
  for (let c = 0; c < nx * ny * nz; c += 1) start[c + 1] += start[c];
  const fill = start.slice(0, -1);
  const order = new Int32Array(points.length / 6);
  for (let i = 0; i < points.length; i += 6) order[fill[cellOf(i)]++] = i;
  return { x0, y0, z0, nx, ny, nz, start, order, points };
}

// The squared distance to, and the offset in `points` of, the nearest point
// within `radius` of (x, y, z); offset -1 if there is none.
const found = { at: -1, squared: 0 };
function nearest(grid, x, y, z, radius) {
  const { x0, y0, z0, nx, ny, nz, start, order, points } = grid;
  let best = radius * radius;
  let at = -1;
  const lo = (v, o) => Math.max(0, Math.floor((v - radius - o) / CELL));
  const hi = (v, o, n) => Math.min(n - 1, Math.floor((v + radius - o) / CELL));
  const ax = hi(x, x0, nx); const ay = hi(y, y0, ny); const az = hi(z, z0, nz);
  for (let cz = lo(z, z0); cz <= az; cz += 1) {
    for (let cy = lo(y, y0); cy <= ay; cy += 1) {
      const row = (cz * ny + cy) * nx;
      for (let cx = lo(x, x0); cx <= ax; cx += 1) {
        for (let k = start[row + cx]; k < start[row + cx + 1]; k += 1) {
          const p = order[k];
          const dx = x - points[p]; const dy = y - points[p + 1]; const dz = z - points[p + 2];
          const dd = dx * dx + dy * dy + dz * dz;
          if (dd < best) { best = dd; at = p; }
        }
      }
    }
  }
  found.at = at;
  found.squared = best;
  return at;
}

// --- the solve ------------------------------------------------------------------

// Lays out `spec` over the body and lets it fall. Returns the settled grid.
export function solveDrape(skull, body, spec) {
  const { width, length, columns, rows, pin, thickness } = spec;
  const stride = columns + 1;
  const count = stride * (rows + 1);
  const cellX = width / columns;
  const cellZ = length / rows;
  const [cx, cy, cz] = skull.centre;
  const [rx, ry, rz] = skull.radii.map((r) => r + thickness);
  const browY = skull.top - 0.075;
  const pos = new Float64Array(count * 3);
  const pinned = new Uint8Array(count);

  // The brow: the skull's cross-section at the height the cloth is held at.
  // Pinned particles are spaced along it by distance, as the cloth's own
  // threads are, so a held edge is not stretched by the head's curve.
  const browLevel = (browY - cy) / ry;
  const browX = rx * Math.sqrt(Math.max(0.01, 1 - browLevel * browLevel));
  const browZ = rz * Math.sqrt(Math.max(0.01, 1 - browLevel * browLevel));
  const browArc = [0];
  const browSteps = 64;
  for (let k = 1; k <= browSteps; k += 1) {
    const t = ((k - 0.5) / browSteps) * (Math.PI / 2);
    browArc.push(browArc[k - 1] + Math.hypot(browX * Math.cos(t), browZ * Math.sin(t)) * (Math.PI / 2 / browSteps));
  }
  const browQuarter = browArc[browSteps];
  const pinHalf = Math.min(pin, 0.92 * browQuarter);
  const browAt = (distance) => {
    const d = Math.min(Math.abs(distance), browQuarter);
    let k = 1;
    while (k < browSteps && browArc[k] < d) k += 1;
    const t = ((k - 1 + (d - browArc[k - 1]) / (browArc[k] - browArc[k - 1] || 1e-9)) / browSteps) * (Math.PI / 2);
    return [cx + Math.sign(distance) * browX * Math.sin(t), cz + browZ * Math.cos(t)];
  };

  // Where the cloth starts: laid over the skull, so that it is already most of
  // the way to where it will rest and only the part that falls onto the
  // shoulders has far to go. Distance on the flat cloth from the crown becomes
  // distance along the skull from the crown, in the direction the cloth lies;
  // cloth beyond the skull's widest point is spread out flat at that height,
  // like the brim of a hat, and left to fall.
  const meridian = (azimuth) => {
    // The skull's ellipse in the plane of one azimuth: its arc length from the
    // crown to the widest point, to a given polar angle, and the polar angle at
    // which a given arc length is reached.
    const h = Math.hypot(rx * Math.sin(azimuth), rz * Math.cos(azimuth));
    const n = 48;
    const table = [0];
    for (let k = 1; k <= n; k += 1) {
      const a = ((k - 0.5) / n) * (Math.PI / 2);
      table.push(table[k - 1] + Math.hypot(h * Math.cos(a), ry * Math.sin(a)) * (Math.PI / 2 / n));
    }
    return {
      equator: table[n],
      arc: (theta) => table[Math.min(n, Math.round((theta / (Math.PI / 2)) * n))],
      angleAt: (distance) => {
        let k = 1;
        while (k < n && table[k] < distance) k += 1;
        const span = table[k] - table[k - 1] || 1e-9;
        return ((k - 1 + (distance - table[k - 1]) / span) / n) * (Math.PI / 2);
      },
    };
  };
  const frontAngle = Math.acos(Math.min(1, Math.max(-1, (browY - cy) / ry)));
  const frontArc = meridian(0).arc(frontAngle);
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      const id = j * stride + i;
      const a = (i / columns - 0.5) * width;
      const b = frontArc - j * cellZ;
      const reach = Math.hypot(a, b);
      const azimuth = Math.atan2(a, b);
      const m = meridian(azimuth);
      let x; let y; let z;
      if (reach <= m.equator) {
        const theta = m.angleAt(reach);
        x = cx + rx * Math.sin(theta) * Math.sin(azimuth);
        y = cy + ry * Math.cos(theta);
        z = cz + rz * Math.sin(theta) * Math.cos(azimuth);
      } else {
        const gx = Math.sin(azimuth) / rx; const gz = Math.cos(azimuth) / rz;
        const gl = Math.hypot(gx, gz);
        const out = reach - m.equator;
        x = cx + rx * Math.sin(azimuth) + (gx / gl) * out;
        y = cy + 0.01;
        z = cz + rz * Math.cos(azimuth) + (gz / gl) * out;
      }
      if (j === 0 && Math.abs(a) <= pinHalf) {
        pinned[id] = 1;
        [x, z] = browAt(a);
        y = browY;
      }
      pos.set([x, y, z], id * 3);
    }
  }

  // Structure, shear and bend, each held at the length the flat cloth had.
  const links = [];
  const link = (a, b, ax, az, bx, bz) => links.push(a, b, Math.hypot((ax - bx) * cellX, (az - bz) * cellZ));
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      const id = j * stride + i;
      if (i < columns) link(id, id + 1, i, j, i + 1, j);
      if (j < rows) link(id, id + stride, i, j, i, j + 1);
      if (i < columns && j < rows) {
        link(id, id + stride + 1, i, j, i + 1, j + 1);
        link(id + 1, id + stride, i + 1, j, i, j + 1);
      }
      if (i + 2 <= columns) link(id, id + 2, i, j, i + 2, j);
      if (j + 2 <= rows) link(id, id + 2 * stride, i, j, i, j + 2);
    }
  }

  const grid = gridOf(body);
  const start = new Float64Array(count * 3);
  const pushed = new Float64Array(count);

  const hold = (id) => {
    // Out of the skull's ellipsoid, then off the nearest point of the body.
    let x = pos[id * 3]; let y = pos[id * 3 + 1]; let z = pos[id * 3 + 2];
    let nx = 0; let ny = 0; let nz = 0; let push = 0;
    const qx = (x - cx) / rx; const qy = (y - cy) / ry; const qz = (z - cz) / rz;
    const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (d < 1 && y > skull.jaw - 0.01) {
      const k = 1 / (d || 1e-6);
      const ox = x; const oy = y; const oz = z;
      x = cx + qx * k * rx; y = cy + qy * k * ry; z = cz + qz * k * rz;
      push = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2 + (z - oz) ** 2);
      const gx = qx / rx; const gy = qy / ry; const gz = qz / rz;
      const g = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      nx = gx / g; ny = gy / g; nz = gz / g;
    }
    const at = nearest(grid, x, y, z, NEAR);
    if (at >= 0) {
      const signed = (x - body[at]) * body[at + 3] + (y - body[at + 1]) * body[at + 4] + (z - body[at + 2]) * body[at + 5];
      if (signed < thickness) {
        const lift = thickness - signed;
        x += body[at + 3] * lift; y += body[at + 4] * lift; z += body[at + 5] * lift;
        nx = body[at + 3]; ny = body[at + 4]; nz = body[at + 5];
        push += lift;
      }
    }
    if (push <= 0) return;
    pushed[id] += push;
    // Friction: of what this step has moved the cloth along the surface, the
    // surface keeps what its grip on the cloth can hold.
    const o = id * 3;
    const mx = x - start[o]; const my = y - start[o + 1]; const mz = z - start[o + 2];
    const along = mx * nx + my * ny + mz * nz;
    const tx = mx - nx * along; const ty = my - ny * along; const tz = mz - nz * along;
    const slide = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (slide > 1e-12) {
      const grip = Math.min(1, (FRICTION * pushed[id]) / slide);
      x -= tx * grip; y -= ty * grip; z -= tz * grip;
    }
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
  };

  // Swept forward and then back, so the order the links were made in does not
  // lean the whole drape to one side.
  let forward = true;
  const satisfy = () => {
    forward = !forward;
    for (let n = 0; n < links.length / 3; n += 1) {
      const k = (forward ? n : links.length / 3 - 1 - n) * 3;
      const a = links[k]; const b = links[k + 1]; const rest = links[k + 2];
      const dx = pos[b * 3] - pos[a * 3]; const dy = pos[b * 3 + 1] - pos[a * 3 + 1]; const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const wa = pinned[a] ? 0 : 1; const wb = pinned[b] ? 0 : 1;
      if (wa + wb === 0) continue;
      const correction = (distance - rest) / (distance * (wa + wb));
      pos[a * 3] += dx * correction * wa; pos[a * 3 + 1] += dy * correction * wa; pos[a * 3 + 2] += dz * correction * wa;
      pos[b * 3] -= dx * correction * wb; pos[b * 3 + 1] -= dy * correction * wb; pos[b * 3 + 2] -= dz * correction * wb;
    }
  };

  for (let step = 0; step < STEPS; step += 1) {
    start.set(pos);
    pushed.fill(0);
    for (let id = 0; id < count; id += 1) if (!pinned[id]) pos[id * 3 + 1] -= DROP;
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      satisfy();
      for (let id = 0; id < count; id += 1) if (!pinned[id]) hold(id);
    }
  }
  // Rest without gravity or friction, so the last of the stretch goes and
  // nothing is left inside the body.
  for (let iteration = 0; iteration < 40; iteration += 1) {
    start.set(pos);
    pushed.fill(0);
    satisfy();
    for (let id = 0; id < count; id += 1) if (!pinned[id]) hold(id);
  }

  // How far each piece of cloth is from the body it lies on, for the part
  // that is free to move in the air.
  const clearance = new Float32Array(count);
  for (let id = 0; id < count; id += 1) {
    const x = pos[id * 3]; const y = pos[id * 3 + 1]; const z = pos[id * 3 + 2];
    const e = (Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz) - 1) * Math.min(rx, ry, rz);
    nearest(grid, x, y, z, 0.15);
    const best = found.at >= 0 ? found.squared : 0.15 * 0.15;
    clearance[id] = Math.min(e > 0 ? e : 0, Math.sqrt(best));
  }

  const index = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * stride + i; const b = a + 1; const c = a + stride; const d = c + 1;
      // Wound so the outer face of cloth lying over the crown faces up.
      index.push(a, b, c, b, d, c);
    }
  }
  const uv = new Float32Array(count * 2);
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      uv[(j * stride + i) * 2] = (i * cellX) / WEAVE_TILE;
      uv[(j * stride + i) * 2 + 1] = (j * cellZ) / WEAVE_TILE;
    }
  }
  return {
    positions: Float32Array.from(pos),
    uv,
    index: Uint32Array.from(index),
    clearance,
    pinned,
    columns,
    rows,
    cellX,
    cellZ,
    links: Float32Array.from(links),
  };
}

// --- the geometry -----------------------------------------------------------------

const drapes = new Map();
// How many bodies have been solved, for the tests that hold the cache to account.
export const drapeStats = { solved: 0 };

// Fingerprint of a body, so the cloth is solved once for everyone of one model.
function fingerprint(THREE, skull, kind) {
  const mm = (v) => Math.round(v * 1000);
  const arm = (name) => {
    const bone = skull.root.getObjectByName(`mixamorig${name}`) || skull.root.getObjectByName(`mixamorig:${name}`);
    if (!bone) return '-';
    const p = bone.getWorldPosition(new THREE.Vector3());
    return `${mm(p.x)},${mm(p.y)},${mm(p.z)}`;
  };
  return [kind, ...skull.centre.map(mm), ...skull.radii.map(mm), mm(skull.jaw), mm(skull.top), arm('LeftArm'), arm('RightArm')].join(':');
}

// The draped cloth for a body, as { shell, spineWeight } in the same terms
// shapeHeadwear has always returned them: a geometry in the model's rest
// pose, and for each vertex how much of it follows the shoulders and how
// much the head. Null where the body cannot be measured; the caller keeps
// the shape it had.
export function drapedHeadwear(THREE, skull, kind) {
  const spec = DRAPES[kind === 'veil' ? 'veil' : 'cloth'];
  if (!skull?.root || !skull.top) return null;
  const id = fingerprint(THREE, skull, kind);
  let solved = drapes.get(id);
  if (!solved) {
    const body = collectBody(THREE, skull.root, skull);
    if (body.length < 6 * 200) return null;
    solved = solveDrape(skull, body, spec);
    drapeStats.solved += 1;
    drapes.set(id, solved);
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.BufferAttribute(solved.positions.slice(), 3));
  shell.setAttribute('uv', new THREE.BufferAttribute(solved.uv.slice(), 2));
  shell.setIndex(new THREE.BufferAttribute(solved.index.slice(), 1));
  shell.computeVertexNormals();
  // Occlusion where the cloth lies in a hollow; then, on top of it, the
  // freedom to move: none where the cloth rests on the body, all of it where
  // it hangs in the air.
  ensureClothAttributes(THREE, shell, 'belt');
  const cloth = shell.attributes.aCloth;
  for (let i = 0; i < cloth.count; i += 1) {
    const hang = smoothstep(0.02, 0.09, solved.clearance[i]);
    cloth.setY(i, solved.pinned[i] ? 0 : hang);
  }
  const position = shell.attributes.position;
  const spineWeight = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    // The head carries cloth above the jaw; the shoulders, below the neck.
    spineWeight[i] = 1 - smoothstep(skull.jaw - 0.14, skull.jaw + 0.01, position.getY(i));
  }
  return { shell, spineWeight };
}

export function clearDrapes() {
  drapes.clear();
}
