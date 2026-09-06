// The things lying about.
//
// The scenes were built landmark-first: a platform, a sanctuary, a colonnade,
// a synagogue. That is the right order to build in and it leaves a
// characteristic gap — walk up to anything and it is a smooth untextured box,
// because nothing was ever modelled at the scale of a person's reach. Real
// places are full of objects nobody planned: jars against a wall, a coil of
// rope, baskets stacked where somebody put them down, an awning tied off
// between two posts.
//
// None of it is load-bearing for the history. All of it is load-bearing for
// believing you are standing somewhere.
//
// Every prop is a lathe, a cone or a box — a few dozen triangles each — and
// they are instanced by kind, so a hundred jars across a scene cost one draw
// call. They are deliberately *not* in the collision model: walking through a
// basket is a smaller lie than a scene with nothing in it, and adding a hundred
// colliders would make every step cost a hundred more tests.

// --- profiles -------------------------------------------------------------

// A storage jar. Lathed from a profile because that is what a wheel-thrown pot
// is, and because the silhouette — wide shoulder, narrow foot, short neck — is
// the whole recognisability of the object.
const JAR_PROFILE = [
  [0.03, 0.00], [0.10, 0.02], [0.16, 0.09], [0.18, 0.20],
  [0.16, 0.30], [0.11, 0.38], [0.07, 0.42], [0.08, 0.47], [0.055, 0.50],
];

// A squatter, wider vessel: the water jar that stands by a door.
const WATER_JAR_PROFILE = [
  [0.05, 0.00], [0.16, 0.03], [0.24, 0.14], [0.25, 0.30],
  [0.19, 0.46], [0.13, 0.55], [0.15, 0.60], [0.12, 0.63],
];

const lathe = (THREE, profile, segments) => new THREE.LatheGeometry(
  profile.map(([x, y]) => new THREE.Vector2(x, y)),
  segments,
);

// Each kind knows how to build its geometry and what it is made of. `height`
// is only documentation — how tall the thing stands — but it is the number a
// caller needs when deciding whether a prop fits under an awning.
export const PROP_KINDS = {
  jar: {
    height: 0.5,
    material: { color: 0xa5744f, roughness: 0.85 },
    geometry: (THREE, low) => lathe(THREE, JAR_PROFILE, low ? 6 : 9),
  },
  waterJar: {
    height: 0.63,
    material: { color: 0x8d6247, roughness: 0.88 },
    geometry: (THREE, low) => lathe(THREE, WATER_JAR_PROFILE, low ? 6 : 10),
  },
  // Open baskets, woven from palm. Wider at the rim than the base.
  basket: {
    height: 0.3,
    material: { color: 0xb99a63, roughness: 0.95, side: 'double' },
    geometry: (THREE, low) => new THREE.CylinderGeometry(0.22, 0.15, 0.3, low ? 6 : 9, 1, true),
  },
  crate: {
    height: 0.36,
    material: { color: 0x7a5f3e, roughness: 0.9 },
    geometry: (THREE) => new THREE.BoxGeometry(0.52, 0.36, 0.4),
  },
  // A grain sack, slumped. A sphere squashed on two axes is a surprisingly
  // good sack.
  sack: {
    height: 0.38,
    material: { color: 0xc8b48c, roughness: 0.96 },
    geometry: (THREE, low) => {
      const g = new THREE.SphereGeometry(0.26, low ? 6 : 8, low ? 5 : 6);
      g.scale(1, 0.74, 0.86);
      return g;
    },
  },
  ropeCoil: {
    height: 0.1,
    material: { color: 0xa3906b, roughness: 0.95 },
    // A torus is authored standing up in the XY plane, which would make every
    // coil of rope on the quay a wheel leaning against nothing. Laid flat here
    // rather than by each caller remembering to tilt it.
    geometry: (THREE, low) => {
      const g = new THREE.TorusGeometry(0.2, 0.05, low ? 4 : 6, low ? 8 : 12);
      g.rotateX(-Math.PI / 2);
      return g;
    },
  },
  // A stack of firewood or a bundle of reeds, as one leaning mass.
  bundle: {
    height: 0.6,
    material: { color: 0x8a6f43, roughness: 0.96 },
    geometry: (THREE, low) => new THREE.CylinderGeometry(0.13, 0.16, 0.6, low ? 5 : 7),
  },
  // A stone bench, which is what these sites actually had: a solid block
  // against a wall, not a plank on legs. Synagogues were benched all round.
  bench: {
    height: 0.42,
    material: { color: 0xb5a88e, roughness: 0.96 },
    geometry: (THREE) => new THREE.BoxGeometry(1.5, 0.42, 0.42),
  },
  post: {
    height: 2.1,
    material: { color: 0x6d573a, roughness: 0.92 },
    geometry: (THREE, low) => new THREE.CylinderGeometry(0.055, 0.07, 2.1, low ? 5 : 7),
  },
  // A stretched cloth: an awning over a stall, a sail laid out, a net drying.
  // Double-sided because you walk under it and look up.
  awning: {
    height: 0.04,
    material: { color: 0xd9c9a8, roughness: 0.95, side: 'double' },
    // Laid flat for the same reason as the rope: a stretched cloth is a
    // horizontal thing, and a PlaneGeometry is authored vertical. `tilt` is
    // then free to mean what it means everywhere else — a slight sag or slope.
    geometry: (THREE) => {
      const g = new THREE.PlaneGeometry(2.4, 1.8, 1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    },
  },
  // The shallow charcoal bowl that stands in every courtyard — the fire the
  // servants and officers were warming themselves at when Peter joined them.
  brazier: {
    height: 0.26,
    material: { color: 0x4a4239, roughness: 0.8, metalness: 0.25 },
    geometry: (THREE, low) => new THREE.CylinderGeometry(0.22, 0.1, 0.26, low ? 6 : 9),
  },
  // A millstone, a threshold block, a mounting step: the flat stone objects
  // that are everywhere and that nobody notices until they are missing.
  block: {
    height: 0.28,
    material: { color: 0xbdb096, roughness: 0.98 },
    geometry: (THREE) => new THREE.BoxGeometry(0.7, 0.28, 0.55),
  },
};

export const PROP_NAMES = Object.keys(PROP_KINDS);

// --- placement helpers ----------------------------------------------------

// Props against a wall, which is where things actually end up: nobody leaves a
// jar in the middle of a room. `along` is the run of the wall, `at` its line.
export function alongWall(random, kinds, options) {
  const {
    from, to, at, axis = 'x', y = 0, count = 6, offset = 0.4, jitter = 0.25,
  } = options;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const slide = from + ((i + 0.5) / count) * (to - from) + (random() - 0.5) * jitter;
    const push = offset + (random() - 0.5) * 0.12;
    items.push({
      kind: kinds[Math.floor(random() * kinds.length)],
      x: axis === 'x' ? slide : at + push,
      z: axis === 'x' ? at + push : slide,
      y,
      rotation: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.35,
    });
  }
  return items;
}

// A pile: things stacked and leaned where they were unloaded.
export function heap(random, kinds, options) {
  const {
    at, y = 0, count = 5, radius = 0.7,
  } = options;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const around = random() * Math.PI * 2;
    const distance = random() * radius;
    items.push({
      kind: kinds[Math.floor(random() * kinds.length)],
      x: at[0] + Math.cos(around) * distance,
      z: at[1] + Math.sin(around) * distance,
      y,
      rotation: random() * Math.PI * 2,
      // A heap has things on top of other things.
      lift: i > count / 2 ? random() * 0.3 : 0,
      scale: 0.8 + random() * 0.4,
      tilt: (random() - 0.5) * 0.35,
    });
  }
  return items;
}

// --- building -------------------------------------------------------------

export function createProps(THREE, options = {}) {
  const { items = [], quality = 'high', castShadow = true } = options;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'props';
  const geometries = [];
  const materials = [];

  // Group by kind first, because the point of the exercise is one draw call
  // per kind rather than one per object.
  const byKind = new Map();
  for (const item of items) {
    if (!PROP_KINDS[item.kind]) continue;
    const bucket = byKind.get(item.kind);
    if (bucket) bucket.push(item);
    else byKind.set(item.kind, [item]);
  }

  const dummy = new THREE.Object3D();

  for (const [kind, bucket] of byKind) {
    const spec = PROP_KINDS[kind];
    const geometry = spec.geometry(THREE, low);
    geometries.push(geometry);

    const { side, ...parameters } = spec.material;
    const material = new THREE.MeshStandardMaterial(parameters);
    if (side === 'double') material.side = THREE.DoubleSide;
    materials.push(material);

    const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
    if (!low && castShadow) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    bucket.forEach((item, i) => {
      dummy.position.set(item.x, (item.y || 0) + (item.lift || 0), item.z);
      dummy.rotation.set(item.tilt || 0, item.rotation || 0, item.roll || 0);
      const scale = item.scale || 1;
      dummy.scale.set(scale, item.scaleY || scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return {
    group,
    kinds: [...byKind.keys()],
    count: items.filter((item) => PROP_KINDS[item.kind]).length,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
