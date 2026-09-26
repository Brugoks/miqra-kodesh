// The boats of Capernaum, and the nets that go with them.
//
// Built on the one first-century hull anyone has held in their hands: the boat
// that a drought in 1986 exposed in the lake mud near Ginosar, a few miles down
// this shore. It is 8.27 m long, 2.3 m in the beam and 1.25 m deep; planked
// edge to edge with mortise-and-tenon joints over oak frames; patched and
// repatched for decades out of reused timber; with a mast step, so it sailed,
// and room for four rowers and a helmsman (Wachsmann, The Sea of Galilee Boat,
// 1995). Mark's fishermen are "in the boat mending the nets" (1:19) and Luke's
// have "toiled all night and taken nothing" (5:5), so at this hour the lake
// has boats coming home.
//
// Three things the previous boat got wrong, and a camera behind the visitor
// would show all three: its hull was wound inside out, so from outside you saw
// the far side's inner face; a solid board the size of the whole boat lay on
// top of it as a "gunwale"; and it sat half a metre deep in the shingle.
//
// three.js is passed in, so the module stays importable in jsdom.

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { swellAt, swellSlopeAt, WIND } from './capernaumWeather.js';

export const HULL = { length: 8.2, beam: 2.3, depth: 1.25 };

// Undressed cedar and oak, and the pitch that sealed the seams below the
// waterline. The Ginosar hull was caulked and coated; nothing about it was
// painted for show.
const TIMBER = 0x6b5334;
const TIMBER_PALE = 0x8f7552;
const PITCH = 0x2a221b;
const LINEN = 0xd6ccb4;
const NET_TAR = 0x4d4538;

const RINGS = 18;
const SIDES = 10;

// Half-beam and draught of the hull at a fraction t (0 stern … 1 bow) along
// its length: fine at the ends, full amidships, the bow a little sharper.
function section(t) {
  const fullness = Math.sin(Math.PI * t) ** 0.62;
  const bowPinch = t > 0.5 ? 1 - (t - 0.5) * 0.18 : 1;
  return {
    halfBeam: (HULL.beam / 2) * fullness * bowPinch,
    draft: HULL.depth * (0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.5),
  };
}

// The rise of the sheer toward the ends — a working hull is not a flat-topped
// box, and the upswept ends are most of what makes it read as a boat.
const sheerRise = (t) => 0.22 * (2 * t - 1) ** 4;

// A point on the hull's skin at length fraction t and around-fraction u (0 is
// one sheer, 1 the other, 0.5 the keel), in the boat's own frame: +Z toward
// the bow, +Y up, the keel's lowest point at y = 0.
function skin(t, u, out) {
  const { halfBeam, draft } = section(t);
  const angle = Math.PI * (u - 0.5);
  out.x = Math.sin(angle) * halfBeam;
  out.y = HULL.depth - Math.cos(angle) * draft + sheerRise(t) * Math.abs(Math.sin(angle)) ** 3;
  out.z = (t - 0.5) * HULL.length;
  return out;
}

function hullGeometry(THREE) {
  const positions = [];
  const colors = [];
  const indices = [];
  const pitch = new THREE.Color(PITCH);
  const wood = new THREE.Color(TIMBER);
  const colour = new THREE.Color();
  const point = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= RINGS; i += 1) {
    for (let j = 0; j <= SIDES; j += 1) {
      skin(i / RINGS, j / SIDES, point);
      positions.push(point.x, point.y, point.z);
      // Pitched below the waterline, bare timber above it.
      colour.copy(pitch).lerp(wood, Math.min(1, Math.max(0, (point.y - 0.5) / 0.25)));
      // Planks: a faint band every strake, which is what reads at a distance.
      const strake = 0.92 + 0.08 * Math.sin((j / SIDES) * Math.PI * 14);
      colors.push(colour.r * strake, colour.g * strake, colour.b * strake);
    }
  }
  for (let i = 0; i < RINGS; i += 1) {
    for (let j = 0; j < SIDES; j += 1) {
      const a = i * (SIDES + 1) + j;
      const b = a + SIDES + 1;
      // Wound so the faces point OUT of the boat.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The rail along one sheer, as a tube following the skin's top edge.
function railGeometry(THREE, side) {
  const points = [];
  const point = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= RINGS; i += 1) {
    skin(i / RINGS, side < 0 ? 0 : 1, point);
    points.push(new THREE.Vector3(point.x, point.y + 0.03, point.z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, 0.055, 5, false);
}

// One frame: the inside of a section, inset from the skin.
function ribGeometry(THREE, t) {
  const points = [];
  const point = { x: 0, y: 0, z: 0 };
  for (let j = 0; j <= 8; j += 1) {
    skin(t, 0.02 + (j / 8) * 0.96, point);
    points.push(new THREE.Vector3(point.x * 0.94, point.y + 0.03, point.z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.035, 4, false);
}

// A knotted net as pixels: diamond mesh, tarred linen, transparent between
// the cords. A DataTexture, so it works wherever three does, jsdom included.
export function netTexture(THREE, { size = 64, cells = 4 } = {}) {
  const data = new Uint8Array(size * size * 4);
  const tar = new THREE.Color(NET_TAR);
  const step = size / cells;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Two sets of diagonal cords, and a knot where they cross.
      const u = ((x + y) % step) / step;
      const v = ((x - y + size) % step) / step;
      const cord = Math.min(u, 1 - u) < 0.07 || Math.min(v, 1 - v) < 0.07;
      const knot = Math.min(u, 1 - u) < 0.12 && Math.min(v, 1 - v) < 0.12;
      const i = (y * size + x) * 4;
      data[i] = tar.r * 255;
      data[i + 1] = tar.g * 255;
      data[i + 2] = tar.b * 255;
      data[i + 3] = cord || knot ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// A net hung to dry: a sheet sagging between its supports. `sag` is how far
// the middle drops; the plane is subdivided so the sag is a curve.
export function netDrapeGeometry(THREE, width, height, sag = 0.25) {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 6);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / (width / 2);
    const v = 0.5 - position.getY(i) / height; // 0 at the top, 1 at the hem
    position.setZ(i, Math.sin(v * Math.PI) * 0.06 * (1 - u * u));
    position.setY(i, position.getY(i) - sag * (1 - u * u) * (0.35 + 0.65 * (1 - v)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// The crew of a boat on the lake: a few seated or standing figures merged
// into one small mesh. They are a hundred metres off and more; this is the
// resolution that distance deserves.
function crewGeometry(THREE, count, seed) {
  const parts = [];
  const tunics = [0xd8cdb4, 0xa8967d, 0x8d7f6c, 0xc4b79a];
  const add = (geometry, colour) => {
    const c = new THREE.Color(colour);
    const n = geometry.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(geometry.toNonIndexed ? geometry.toNonIndexed() : geometry);
  };
  for (let k = 0; k < count; k += 1) {
    const z = -2.4 + (k / Math.max(1, count - 1)) * 4.4;
    const x = (k % 2 ? 0.35 : -0.35) * (count > 2 ? 1 : 0);
    const standing = (k + seed) % 4 === 0;
    const h = standing ? 1.05 : 0.62;
    const body = new THREE.CylinderGeometry(0.15, 0.2, h, 6);
    body.translate(x, 0.55 + h / 2, z);
    add(body, tunics[(k + seed) % tunics.length]);
    const head = new THREE.SphereGeometry(0.1, 6, 5);
    head.translate(x, 0.55 + h + 0.1, z);
    add(head, 0x9c7c5f);
  }
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, offset * 3);
    col.set(g.attributes.color.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeVertexNormals();
  return merged;
}

// Everything a set of boats shares: one hull, one pair of rails, the frames,
// the materials. Built once per scene and disposed with it.
export function createBoatKit(THREE, { quality = 'high' } = {}) {
  const low = quality === 'low';
  const geometries = [];
  const materials = [];
  const textures = [];
  const g = (geometry) => { geometries.push(geometry); return geometry; };
  const m = (material) => { materials.push(material); return material; };

  const kit = {
    hull: g(hullGeometry(THREE)),
    rails: [g(railGeometry(THREE, -1)), g(railGeometry(THREE, 1))],
    ribs: low ? [] : [0.2, 0.32, 0.44, 0.56, 0.68, 0.8].map((t) => g(ribGeometry(THREE, t))),
    thwart: g(new THREE.BoxGeometry(1.9, 0.07, 0.3)),
    deck: g(new THREE.BoxGeometry(1.5, 0.06, 1.3)),
    oar: g(new THREE.CylinderGeometry(0.035, 0.035, 4.2, 5)),
    blade: g(new THREE.BoxGeometry(0.16, 0.03, 0.7)),
    mast: g(new THREE.CylinderGeometry(0.07, 0.1, 6.2, 6)),
    yard: g(new THREE.CylinderGeometry(0.045, 0.045, 5.2, 5)),
    sail: g(new THREE.PlaneGeometry(4.6, 3.6, 6, 4)),
    sailFurled: g(new THREE.CylinderGeometry(0.16, 0.16, 4.8, 6)),
    materials: {
      hull: m(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })),
      timber: m(new THREE.MeshStandardMaterial({ color: TIMBER, roughness: 0.88 })),
      pale: m(new THREE.MeshStandardMaterial({ color: TIMBER_PALE, roughness: 0.86 })),
      sail: m(new THREE.MeshStandardMaterial({ color: LINEN, roughness: 0.95, side: THREE.DoubleSide })),
      crew: m(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })),
    },
  };
  // The belly of a sail full of the land breeze.
  {
    const position = kit.sail.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const u = position.getX(i) / 2.3;
      const v = position.getY(i) / 1.8;
      position.setZ(i, 0.45 * (1 - u * u) * (1 - v * v * 0.6));
    }
    kit.sail.computeVertexNormals();
  }
  const net = netTexture(THREE);
  textures.push(net);
  net.repeat.set(3, 2);
  kit.materials.net = m(new THREE.MeshStandardMaterial({
    map: net, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xffffff,
  }));
  // Netted shadows rather than solid ones.
  kit.materials.netDepth = m(new THREE.MeshDepthMaterial({ map: net, alphaTest: 0.4, depthPacking: THREE.RGBADepthPacking }));

  kit.dispose = () => {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  };
  kit.track = g;
  return kit;
}

// One boat. `rig`: 'beached' (oars shipped, net over the side), 'moored'
// (mast up, sail furled), 'sailing' (sail set, crew aboard) or 'repair'
// (propped on timbers, stripped).
export function createGinosarBoat(THREE, kit, { rig = 'beached', crew = 0, seed = 0, low = false } = {}) {
  const boat = new THREE.Group();
  // Parts are collected per material and merged at the end, so a boat of
  // twenty pieces costs one draw per material rather than twenty. A part that
  // moves on its own (the sail, which turns with the wind) stays a mesh.
  const pending = new Map();
  const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    if (!pending.has(material)) pending.set(material, []);
    pending.get(material).push(part);
    return part;
  };
  const live = (geometry, material, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.castShadow = !low;
    boat.add(part);
    return part;
  };
  const finish = () => {
    for (const [material, parts] of pending) {
      const pieces = parts.map((part) => {
        part.updateMatrix();
        const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
        }
        return g.applyMatrix4(part.matrix);
      });
      const merged = kit.track(mergeGeometries(pieces, false));
      pieces.forEach((piece) => piece.dispose());
      const whole = new THREE.Mesh(merged, material);
      whole.name = material === kit.materials.hull ? 'boat-hull' : `boat-${material.name || 'parts'}`;
      if (!low) {
        whole.castShadow = true;
        whole.receiveShadow = true;
      }
      boat.add(whole);
    }
    pending.clear();
  };
  mesh(kit.hull, kit.materials.hull);
  kit.rails.forEach((rail) => mesh(rail, kit.materials.pale));
  kit.ribs.forEach((rib) => mesh(rib, kit.materials.timber));
  for (const z of [-1.9, 0.1, 2.0]) mesh(kit.thwart, kit.materials.pale, 0, HULL.depth - 0.22, z);
  // Decks at bow and stern, where the helmsman stood and the net was worked.
  mesh(kit.deck, kit.materials.pale, 0, HULL.depth - 0.12, -HULL.length / 2 + 1.05);
  mesh(kit.deck, kit.materials.pale, 0, HULL.depth - 0.12, HULL.length / 2 - 0.95).scale.set(0.8, 1, 0.7);

  if (rig !== 'repair') {
    // The steering oar over the stern quarter.
    const steer = mesh(kit.oar, kit.materials.timber, 0.95, HULL.depth + 0.1, -HULL.length / 2 + 0.6);
    steer.rotation.set(0.9, 0, -0.25);
  }
  if (rig === 'beached' || rig === 'moored') {
    // Oars shipped along the thwarts.
    for (const x of [-0.45, 0.45]) {
      const oar = mesh(kit.oar, kit.materials.timber, x, HULL.depth - 0.12, 0.2);
      oar.rotation.x = Math.PI / 2;
    }
  }
  if (rig === 'moored' || rig === 'sailing') {
    mesh(kit.mast, kit.materials.timber, 0, HULL.depth + 2.7, 0.9);
    if (rig === 'sailing') {
      const yard = mesh(kit.yard, kit.materials.timber, 0, HULL.depth + 5.4, 0.95);
      yard.rotation.z = Math.PI / 2;
      const sail = live(kit.sail, kit.materials.sail, 0, HULL.depth + 3.55, 0.95);
      sail.name = 'boat-sail';
    } else {
      // Brailed up to the yard, which is how a sail spends the day in harbour.
      const furled = mesh(kit.sailFurled, kit.materials.sail, 0, HULL.depth + 5.3, 0.95);
      furled.rotation.z = Math.PI / 2;
    }
  }
  if (crew > 0) mesh(kit.track(crewGeometry(THREE, crew, seed)), kit.materials.crew);
  finish();
  return boat;
}

// --- the fleet ------------------------------------------------------------------

// The keel sits this far below the boat's origin line when it rests on
// shingle: bedded a few centimetres, not buried.
const BEDDING = 0.06;

// Where a beached boat lies: drawn up and left to lean, as a round-bottomed
// hull does out of water. Shared with anything staged in or beside one, so
// the people sitting on its thwarts sit on the thwarts that are drawn.
export function beachedPose(spec, beach) {
  return { position: [spec.x, beach - BEDDING, spec.z], rotation: [0.02, spec.rotation, 0.09] };
}
// The top of the thwarts, and where they cross the hull, in the boat's frame.
export const THWARTS = { top: HULL.depth - 0.22 + 0.035, z: [-1.9, 0.1, 2.0] };

// Boats out on the lake coming home, each on a long slow loop well offshore
// (the waterline is at z ≈ −19; nothing comes within sixty metres of it).
const LAKE_COURSES = [
  { cx: -40, cz: -140, rx: 70, rz: 26, period: 360, phase: 0.1, crew: 4, rig: 'sailing' },
  { cx: 90, cz: -210, rx: 60, rz: 34, period: 420, phase: 0.55, crew: 3, rig: 'sailing' },
  { cx: 10, cz: -95, rx: 34, rz: 12, period: 300, phase: 0.8, crew: 5, rig: 'beached' },
];

// Places a boat on the water: height from the swell under its middle, and
// pitch and roll from the swell's slope, damped because a hull averages the
// water under its whole length.
function float(boat, x, z, heading, t, lake, slope) {
  swellSlopeAt(x, z, t, slope);
  boat.position.set(x, lake + 0.3 + swellAt(x, z, t) * 0.8, z);
  const along = { x: Math.sin(heading), z: Math.cos(heading) };
  const pitch = -(slope.x * along.x + slope.z * along.z) * 0.6;
  const roll = (slope.x * along.z - slope.z * along.x) * 0.9;
  boat.rotation.set(pitch, heading, roll, 'YXZ');
}

// Every boat in the scene. `beached` are BOATS entries the navigation blocks;
// `moored` sit alongside the piers; the anchored one rides the swell; and the
// lake boats are the fishing fleet coming in.
export function createCapernaumFleet(THREE, {
  quality = 'high', boats = [], piers = [], levels, reducedMotion = false,
} = {}) {
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'capernaum-fleet';
  const kit = createBoatKit(THREE, { quality });
  const floating = [];
  const slope = { x: 0, z: 0 };

  for (const spec of boats) {
    if (spec.beached) {
      const boat = createGinosarBoat(THREE, kit, { rig: 'beached', low });
      boat.name = spec.id;
      const pose = beachedPose(spec, levels.beach);
      boat.position.fromArray(pose.position);
      boat.rotation.set(...pose.rotation, 'YXZ');
      // The net spread over the side to dry — which is what the Zebedees were
      // doing when they were called (Mark 1:19).
      const net = new THREE.Mesh(netDrapeGeometry(THREE, 3.2, 2.2, 0.3), kit.materials.net);
      kit.track(net.geometry);
      net.customDepthMaterial = kit.materials.netDepth;
      net.position.set(HULL.beam / 2 - 0.05, HULL.depth - 0.35, 0.8);
      net.rotation.set(0, Math.PI / 2, -0.35);
      net.castShadow = !low;
      boat.add(net);
      group.add(boat);
    } else {
      const boat = createGinosarBoat(THREE, kit, { rig: 'moored', low });
      boat.name = spec.id;
      group.add(boat);
      floating.push({ boat, x: spec.x, z: spec.z, heading: spec.rotation, drift: 0 });
    }
  }

  // One boat alongside each pier's lake end, bow toward the shore.
  piers.forEach((pier, index) => {
    const boat = createGinosarBoat(THREE, kit, { rig: 'moored', low });
    boat.name = `boat-moored-${pier.id}`;
    const side = index % 2 ? -1 : 1;
    const x = (side > 0 ? pier.x1 + HULL.beam / 2 + 0.35 : pier.x0 - HULL.beam / 2 - 0.35);
    const z = pier.zEnd + HULL.length / 2 + 2;
    group.add(boat);
    floating.push({ boat, x, z, heading: Math.PI, drift: 0 });
  });

  const lake = low ? LAKE_COURSES.slice(0, 1) : LAKE_COURSES;
  const sailing = lake.map((course, index) => {
    const boat = createGinosarBoat(THREE, kit, { rig: course.rig, crew: course.crew, seed: index, low: true });
    boat.name = `boat-lake-${index}`;
    group.add(boat);
    return { boat, course };
  });

  function place(t) {
    for (const f of floating) float(f.boat, f.x, f.z, f.heading, t, levels.lake, slope);
    for (const { boat, course } of sailing) {
      const angle = ((t / course.period + course.phase) % 1) * Math.PI * 2;
      const x = course.cx + Math.cos(angle) * course.rx;
      const z = course.cz + Math.sin(angle) * course.rz;
      // Heading along the loop, and a sail leaning with the land breeze.
      const heading = Math.atan2(-Math.sin(angle) * course.rx, Math.cos(angle) * course.rz);
      float(boat, x, z, heading, t, levels.lake, slope);
      const sail = boat.getObjectByName('boat-sail');
      if (sail) sail.rotation.y = Math.atan2(WIND.x, WIND.z) - heading;
    }
  }
  place(0);

  return {
    group,
    // Where the lake boats are, for tests and anything that wants to avoid them.
    lakeBoats: sailing.map(({ boat }) => boat),
    update(elapsed) {
      if (reducedMotion) return;
      place(elapsed);
    },
    dispose() {
      kit.dispose();
      group.removeFromParent();
    },
  };
}
