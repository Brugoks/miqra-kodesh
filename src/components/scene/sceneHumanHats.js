// What men wear on the head, other than a cloth: a close cap, a wound turban,
// a twisted headband with its ends hanging, and a soldier's helmet. Each is
// made from the measured skull of the person who wears it, in the model's
// rest pose, and skinned to the head alone — a hat does not follow the
// shoulders the way a veil does. (The draped cloths, the veil and the sun
// cloth, are sceneHumanDrape.js.)
//
// Shapes, not likenesses: each is the plain outline of the thing, held a fixed
// distance off the skull so the hair under it is not in it.

import { WEAVE_TILE, gridWeaveUv, smoothstep } from './sceneHumanCloth.js';

export const HATS = new Set(['cap', 'turban', 'band', 'helmet']);

const COLUMNS = 28;
const ROWS = 12;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The brow: the height a hat sits at, and the skull's cross-section there.
function brow(skull) {
  const [cx, cy, cz] = skull.centre;
  const [rx, ry, rz] = skull.radii;
  const browY = skull.top - 0.075;
  const level = clamp((browY - cy) / ry, -0.95, 0.95);
  const k = Math.sqrt(1 - level * level);
  return { cx, cy, cz, rx, ry, rz, browY, x: rx * k, z: rz * k };
}

// Normals at a seam are the average of both sides, and at a pole of all of
// them, so a closed shape has no crease where its grid was cut.
function weldNormals(geometry, stride, rows, { poleRow = false, seamColumns = true } = {}) {
  const normal = geometry.attributes.normal;
  if (seamColumns) {
    for (let r = 0; r <= rows; r += 1) {
      const a = r * stride;
      const b = r * stride + stride - 1;
      const x = normal.getX(a) + normal.getX(b); const y = normal.getY(a) + normal.getY(b); const z = normal.getZ(a) + normal.getZ(b);
      const length = Math.hypot(x, y, z) || 1;
      normal.setXYZ(a, x / length, y / length, z / length);
      normal.setXYZ(b, x / length, y / length, z / length);
    }
  }
  if (poleRow) {
    let x = 0; let y = 0; let z = 0;
    for (let c = 0; c < stride; c += 1) { x += normal.getX(c); y += normal.getY(c); z += normal.getZ(c); }
    const length = Math.hypot(x, y, z) || 1;
    for (let c = 0; c < stride; c += 1) normal.setXYZ(c, x / length, y / length, z / length);
  }
}

// A dome over the skull, cut at a rim whose height varies round the head.
//   rim(a)      height of the rim at angle `a` from the front, 0 to π
//   bulge(t, p) metres added to the radius, down the dome (t 0 to 1) and round (p)
//   flare(t, a) metres added to the radius, for a brim or a neck guard
//   peak        how far the crown is drawn up
function dome(THREE, skull, { offset, rim, bulge = null, flare = null, peak = 0, shade = 0.35 }) {
  const { cx, cy, cz } = brow(skull);
  const rx = skull.radii[0] + offset;
  const ry = skull.radii[1] + offset;
  const rz = skull.radii[2] + offset;
  const mean = (rx + rz) / 2;
  const stride = COLUMNS + 1;
  const count = stride * (ROWS + 1);
  const position = new Float32Array(count * 3);
  const cloth = new Float32Array(count * 2);
  for (let c = 0; c <= COLUMNS; c += 1) {
    const phi = (c / COLUMNS) * Math.PI * 2;
    const around = Math.min(phi, Math.PI * 2 - phi);
    const thetaRim = Math.acos(clamp((rim(around) - cy) / ry, -1, 1));
    for (let r = 0; r <= ROWS; r += 1) {
      const t = r / ROWS;
      const theta = thetaRim * t;
      let scale = 1;
      if (bulge) scale += bulge(t, phi) / mean;
      if (flare) scale += flare(t, around) / mean;
      const radial = Math.sin(theta) * scale;
      const k = (r * stride + c) * 3;
      position[k] = cx + rx * radial * Math.sin(phi);
      position[k + 1] = cy + ry * Math.cos(theta) + peak * (1 - t) ** 3;
      position[k + 2] = cz + rz * radial * Math.cos(phi);
      // Darker toward the rim, where the inside of the dome shows.
      cloth[(r * stride + c) * 2] = shade * smoothstep(0.75, 1, t);
    }
  }
  const index = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLUMNS; c += 1) {
      const a = r * stride + c; const b = a + 1; const d = a + stride; const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aCloth', new THREE.BufferAttribute(cloth, 2));
  geometry.setIndex(index);
  gridWeaveUv(THREE, geometry, stride, ROWS + 1);
  geometry.computeVertexNormals();
  weldNormals(geometry, stride, ROWS, { poleRow: true });
  return geometry;
}

// A skullcap of felt, drawn up to a small point at the crown: a pilos, the
// brimless cap of sailors and workmen in the Hellenistic and Roman world. It
// sits just above the ear at the sides and dips behind.
function cap(THREE, skull) {
  const { browY } = brow(skull);
  return dome(THREE, skull, {
    offset: 0.011,
    rim: (a) => browY + 0.002 - 0.012 * smoothstep(0, Math.PI * 0.5, a) - 0.03 * smoothstep(Math.PI * 0.5, Math.PI, a),
    peak: 0.03,
  });
}

// A linen turban, wound round and round: the dome is ridged on a spiral and
// swells at the rim where the last turns lie.
function turban(THREE, skull) {
  const { browY } = brow(skull);
  return dome(THREE, skull, {
    offset: 0.018,
    rim: (a) => browY + 0.004 - 0.014 * ((1 - Math.cos(a)) / 2),
    peak: 0.018,
    bulge: (t, phi) => (0.009 + 0.012 * smoothstep(0.55, 1, t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (6.5 * t + phi / (2 * Math.PI)))) + 0.012 * smoothstep(0.7, 1, t),
    shade: 0.45,
  });
}

// A helmet: a dome with a brow ridge, and a neck guard that flares out and
// down behind. Metal, so it carries no weave.
function helmet(THREE, skull) {
  const { browY } = brow(skull);
  const guard = skull.jaw + 0.05;
  return dome(THREE, skull, {
    offset: 0.012,
    rim: (a) => {
      const side = browY - 0.02;
      return a < Math.PI * 0.45 ? browY - 0.006 - 0.014 * smoothstep(0, Math.PI * 0.45, a)
        : side - (side - guard) * smoothstep(Math.PI * 0.45, Math.PI * 0.9, a);
    },
    flare: (t, a) => 0.032 * smoothstep(Math.PI * 0.55, Math.PI, a) * t ** 3 + 0.008 * smoothstep(0.85, 1, t),
    shade: 0.2,
  });
}

// A twisted headband tied at the back, its two ends hanging: a tube round the
// brow whose thickness runs in a rope's turns, and two short ribbons that are
// free to stir. A fillet, the commonest way to keep hair and sun off in the
// ancient Near East.
export const BAND = { segments: 56, around: 8 };

function band(THREE, skull) {
  const [cx, cy, cz] = skull.centre;
  const [rx, ry, rz] = skull.radii;
  const browY = skull.top - 0.075;
  const { segments, around } = BAND;
  const stride = around + 1;
  const stand = 0.016;
  // The skull's cross-section at a height: the band lies lower at the back,
  // where the head is wider, so it is measured where the band is.
  const section = (y) => {
    const level = clamp((y - cy) / ry, -0.95, 0.95);
    const k = Math.sqrt(1 - level * level);
    return { x: rx * k, z: rz * k };
  };
  const radiusAt = (s) => 0.0125 + 0.0028 * Math.sin((s / segments) * Math.PI * 2 * 14);
  const centreAt = (s) => {
    const phi = (s / segments) * Math.PI * 2;
    const dip = (1 - Math.cos(phi)) / 2;
    const y = browY + 0.012 - 0.022 * dip;
    const wide = section(y);
    return {
      phi, wide,
      x: cx + (wide.x + stand) * Math.sin(phi),
      y,
      z: cz + (wide.z + stand) * Math.cos(phi),
    };
  };
  const position = new Float32Array((segments + 1) * stride * 3);
  const uv = new Float32Array((segments + 1) * stride * 2);
  const cloth = new Float32Array((segments + 1) * stride * 2);
  let length = 0;
  let previous = centreAt(0);
  const arc = [0];
  for (let s = 1; s <= segments; s += 1) {
    const p = centreAt(s);
    length += Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z);
    arc.push(length);
    previous = p;
  }
  // Whole tiles along the band, so the weave meets itself where it closes.
  const tiles = Math.max(1, Math.round(length / WEAVE_TILE));
  for (let s = 0; s <= segments; s += 1) {
    const p = centreAt(s);
    const nx = Math.sin(p.phi) / p.wide.x; const nz = Math.cos(p.phi) / p.wide.z;
    const nl = Math.hypot(nx, nz);
    const radius = radiusAt(s);
    for (let k = 0; k <= around; k += 1) {
      const a = (k / around) * Math.PI * 2;
      const at = s * stride + k;
      position[at * 3] = p.x + radius * Math.cos(a) * (nx / nl);
      position[at * 3 + 1] = p.y + radius * Math.sin(a);
      position[at * 3 + 2] = p.z + radius * Math.cos(a) * (nz / nl);
      uv[at * 2] = (arc[s] / length) * tiles;
      uv[at * 2 + 1] = (k / around) * (2 * Math.PI * 0.0125) / WEAVE_TILE;
      // Shaded on the underside, where it lies against the head.
      cloth[at * 2] = 0.3 * smoothstep(0, 0.5, -Math.sin(a) * 0.5 + 0.5);
    }
  }
  const index = [];
  for (let s = 0; s < segments; s += 1) {
    for (let k = 0; k < around; k += 1) {
      const a = s * stride + k; const b = a + 1; const d = a + stride; const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.BufferAttribute(position, 3));
  tube.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  tube.setAttribute('aCloth', new THREE.BufferAttribute(cloth, 2));
  tube.setIndex(index);
  tube.computeVertexNormals();
  weldNormals(tube, stride, segments, { seamColumns: true });
  // The path closes on itself too: the first ring and the last are one.
  const normal = tube.attributes.normal;
  for (let k = 0; k <= around; k += 1) {
    const a = k; const b = segments * stride + k;
    const x = normal.getX(a) + normal.getX(b); const y = normal.getY(a) + normal.getY(b); const z = normal.getZ(a) + normal.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    normal.setXYZ(a, x / l, y / l, z / l);
    normal.setXYZ(b, x / l, y / l, z / l);
  }

  // The ends: two ribbons from the knot, a little apart, hanging down the
  // back of the head and in toward the nape, as the head's own curve takes them.
  const knot = centreAt(segments / 2);
  const ribbonRows = 5;
  const ribbonLength = 0.11;
  const ribbonWidth = 0.022;
  const parts = [tube];
  for (const side of [-1, 1]) {
    const ribbon = new THREE.BufferGeometry();
    const rp = []; const ru = []; const rc = []; const ri = [];
    for (let r = 0; r <= ribbonRows; r += 1) {
      const t = r / ribbonRows;
      const y = knot.y - 0.005 - ribbonLength * t;
      const behind = cz - (section(y).z + 0.014);
      for (let c = 0; c <= 1; c += 1) {
        rp.push(knot.x + side * (0.012 + 0.025 * t) + (c - 0.5) * ribbonWidth, y, behind);
        ru.push((c * ribbonWidth) / WEAVE_TILE, (t * ribbonLength) / WEAVE_TILE);
        rc.push(0.15 * (1 - t), smoothstep(0, 1, t));
      }
    }
    for (let r = 0; r < ribbonRows; r += 1) {
      const a = r * 2; const b = a + 1; const d = a + 2; const e = d + 1;
      ri.push(a, d, b, b, d, e, a, b, d, b, e, d);
    }
    ribbon.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    ribbon.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
    ribbon.setAttribute('aCloth', new THREE.Float32BufferAttribute(rc, 2));
    ribbon.setIndex(ri);
    ribbon.computeVertexNormals();
    parts.push(ribbon);
  }
  return merged(THREE, parts);
}

// Several indexed geometries with the same attributes, as one.
function merged(THREE, parts) {
  const names = ['position', 'normal', 'uv', 'aCloth'];
  const size = { position: 3, normal: 3, uv: 2, aCloth: 2 };
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const array = new Float32Array(total * size[name]);
    let offset = 0;
    for (const g of parts) { array.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(array, size[name]));
  }
  const index = [];
  let base = 0;
  for (const g of parts) {
    for (const i of g.index.array) index.push(i + base);
    base += g.attributes.position.count;
    g.dispose();
  }
  out.setIndex(index);
  return out;
}

const BUILDERS = { cap, turban, helmet, band };

// The geometry of a hat for this skull, and for each vertex how much of it
// follows the shoulders: none — a hat rides the head.
export function hatGeometry(THREE, skull, kind) {
  const shell = BUILDERS[kind](THREE, skull);
  return { shell, spineWeight: new Float32Array(shell.attributes.position.count) };
}
