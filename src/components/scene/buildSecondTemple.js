// Procedural geometry for the Herod's Temple scene (/scene/second-temple).
//
// Everything here is built from primitives in code — no downloaded models, no
// generated art, no external textures. That is a deliberate trade: a stylised
// parametric reconstruction can be checked against Middot and Josephus line by
// line, ships as ~20KB of JavaScript instead of tens of megabytes of assets,
// and never invents a detail nobody can source. The look is "architectural
// model in morning light", not photorealism.
//
// three.js is passed in rather than imported so this module stays trivially
// importable in jsdom (where there is no WebGL) and so the 3D chunk is only
// ever fetched by the route that actually renders it.
//
// Axes match src/lib/scenes.js: -Z west toward the sanctuary, +Z east toward
// the gates, +X north, +Y up. Metres throughout; 1 cubit = 0.5m.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { ROBE_PALETTE, createCrowd, gather, scatter } from './sceneFigures';
import { alongWall, createProps, heap } from './sceneProps';
import {
  LEVEL,
  PLATFORM,
  INNER,
  WOMEN,
  ALTAR,
  PORCH,
  SOREG,
  COLONNADE,
  colonnadePositions,
  soregSegments,
} from './templeDimensions';

// Every measurement lives in templeDimensions.js so that the geometry drawn
// here and the collision model in templeNavigation.js cannot drift apart.

// --- small helpers --------------------------------------------------------

// Canvas textures keep the whole scene self-contained. Nothing here is fetched.
function canvasTexture(THREE, size, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (repeat) texture.repeat.set(repeat[0], repeat[1]);
  return texture;
}

// Deterministic pseudo-random so the crowd, the rooftops and the stone
// mottling land in the same place on every visit — a scene that reshuffles
// itself each time you open it reads as noise rather than as a place.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export default function buildSecondTemple(THREE, options = {}) {
  const { quality = 'high', maxAnisotropy = 1, timeOfDay } = options;
  const low = quality === 'low';

  const root = new THREE.Group();
  const textures = [];
  const random = makeRandom(20300414);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Every mesh added through here gets shadows wired consistently, and lands in
  // `root` so a single traverse can dispose the lot.
  const add = (geometry, material, [x, y, z], { cast = true, receive = true, parent = root } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
    parent.add(mesh);
    return mesh;
  };

  // A box positioned by its extents rather than its centre — the way the
  // sources give measurements, so the code reads like the measurements do.
  const slab = (material, x0, x1, y0, y1, z0, z1, opts) =>
    add(box(x1 - x0, y1 - y0, z1 - z0), material, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], opts);

  // --- materials ----------------------------------------------------------

  const pavingMap = canvasTexture(THREE, 256, (ctx, size) => {
    ctx.fillStyle = '#cbbfa2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const shade = 190 + Math.floor(random() * 26);
        ctx.fillStyle = `rgb(${shade}, ${shade - 10}, ${shade - 38})`;
        ctx.fillRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
      }
    }
  }, [90, 70]);
  pavingMap.anisotropy = maxAnisotropy;
  textures.push(pavingMap);

  // Herodian ashlar: long courses, offset joints, and the wide drafted margin
  // that makes the surviving Western Wall stones instantly recognisable.
  const ashlarMap = canvasTexture(THREE, 256, (ctx, size) => {
    ctx.fillStyle = '#b9ac8d';
    ctx.fillRect(0, 0, size, size);
    const courseH = 32;
    for (let row = 0; row * courseH < size; row += 1) {
      const offset = row % 2 ? 32 : 0;
      for (let col = -1; col * 64 < size + 64; col += 1) {
        const shade = 206 + Math.floor(random() * 22);
        ctx.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 32})`;
        ctx.fillRect(col * 64 + offset + 2, row * courseH + 2, 60, courseH - 4);
        ctx.strokeStyle = 'rgba(120, 108, 84, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(col * 64 + offset + 6, row * courseH + 5, 52, courseH - 10);
      }
    }
  }, [1, 1]);
  ashlarMap.anisotropy = maxAnisotropy;
  textures.push(ashlarMap);

  const smokeMap = canvasTexture(THREE, 64, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(0.45, 'rgba(240, 236, 226, 0.22)');
    gradient.addColorStop(1, 'rgba(230, 226, 216, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
  textures.push(smokeMap);

  const stoneMap = ashlarMap.clone();
  stoneMap.repeat.set(8, 2);
  textures.push(stoneMap);

  const M = {
    paving: new THREE.MeshStandardMaterial({ map: pavingMap, roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneMap, color: 0xd8cdb2, roughness: 0.92 }),
    // The sanctuary was famously white — Josephus compares it to a snow-covered
    // mountain from a distance.
    marble: new THREE.MeshStandardMaterial({ color: 0xefe9dc, roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd6a63c, metalness: 0.85, roughness: 0.32 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6e5a33, metalness: 0.75, roughness: 0.45 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x7a6142, roughness: 0.85 }),
    altar: new THREE.MeshStandardMaterial({ color: 0xbdb096, roughness: 1 }),
    hill: new THREE.MeshStandardMaterial({ color: 0x8e8a63, roughness: 1 }),
    valley: new THREE.MeshStandardMaterial({ color: 0xa3906b, roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xa08a68, roughness: 0.95 }),
  };

  // --- sky and light ------------------------------------------------------
  // Both come from sceneLighting.js, which places the sun by compass bearing
  // rather than by hand — the temple has +X north and +Z east, and a sun
  // positioned in raw coordinates is wrong in any scene built the other way
  // round. The shadow camera is sized here, because only this file knows that
  // the platform is 345 metres long.

  const lighting = applyLighting(THREE, root, {
    slug: 'second-temple',
    timeOfDay,
    skyRadius: 1600,
    low,
  });
  const { sun } = lighting;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 40;
    sun.shadow.camera.far = 620;
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.08;
  }

  // --- the platform -------------------------------------------------------

  const paving = add(
    new THREE.PlaneGeometry(PLATFORM.halfX * 2, PLATFORM.zEast - PLATFORM.zWest),
    M.paving,
    [0, 0, (PLATFORM.zWest + PLATFORM.zEast) / 2],
    { cast: false },
  );
  paving.rotation.x = -Math.PI / 2;

  // The retaining walls, and the valley floor a long way below them. Without
  // this drop the platform reads as a courtyard rather than as the artificial
  // mountain it was.
  const DROP = -46;
  slab(M.stone, -PLATFORM.halfX - 4, PLATFORM.halfX + 4, DROP, 0, PLATFORM.zEast, PLATFORM.zEast + 4, { cast: false });
  slab(M.stone, -PLATFORM.halfX - 4, PLATFORM.halfX + 4, DROP, 0, PLATFORM.zWest - 4, PLATFORM.zWest, { cast: false });
  slab(M.stone, PLATFORM.halfX, PLATFORM.halfX + 4, DROP, 0, PLATFORM.zWest, PLATFORM.zEast, { cast: false });
  slab(M.stone, -PLATFORM.halfX - 4, -PLATFORM.halfX, DROP, 0, PLATFORM.zWest, PLATFORM.zEast, { cast: false });

  const valley = add(new THREE.PlaneGeometry(3000, 3000), M.valley, [0, DROP, 0], { cast: false });
  valley.rotation.x = -Math.PI / 2;

  // --- porticoes ----------------------------------------------------------
  // Colonnades ran round the entire platform; the eastern one is Solomon's
  // Portico. Two rows of columns under a flat timber roof.

  // Identical at every quality on purpose: the visitor can walk here, and a
  // colonnade that is solid on a laptop but passable on a phone is a worse
  // problem than a few hundred extra instances of a cylinder. Low quality
  // spends its savings on shadows, the crowd and the smoke instead.
  const colHeight = COLONNADE.height;
  const positions = colonnadePositions();

  const shaftGeo = new THREE.CylinderGeometry(0.72, 0.85, colHeight, low ? 8 : 12);
  const columns = new THREE.InstancedMesh(shaftGeo, M.marble, positions.length);
  const capGeo = new THREE.BoxGeometry(2.1, 1.1, 2.1);
  const capitals = new THREE.InstancedMesh(capGeo, M.marble, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], i) => {
    dummy.position.set(x, colHeight / 2, z);
    dummy.updateMatrix();
    columns.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, colHeight + 0.55, z);
    dummy.updateMatrix();
    capitals.setMatrixAt(i, dummy.matrix);
  });
  if (!low) {
    columns.castShadow = true;
    columns.receiveShadow = true;
    capitals.castShadow = true;
  }
  root.add(columns, capitals);

  // Portico roofs — one long slab per side, sitting on the capitals.
  const roofY = colHeight + 1.1;
  const span = [COLONNADE.rows[0] - 3, COLONNADE.rows[COLONNADE.rows.length - 1] + 3];
  slab(M.roof, -PLATFORM.halfX, PLATFORM.halfX, roofY, roofY + 1.6, PLATFORM.zEast - span[1], PLATFORM.zEast - span[0], { receive: false });
  slab(M.roof, -PLATFORM.halfX, PLATFORM.halfX, roofY, roofY + 1.6, PLATFORM.zWest + span[0], PLATFORM.zWest + span[1], { receive: false });
  slab(M.roof, PLATFORM.halfX - span[1], PLATFORM.halfX - span[0], roofY, roofY + 1.6, PLATFORM.zWest, PLATFORM.zEast, { receive: false });
  slab(M.roof, -PLATFORM.halfX + span[0], -PLATFORM.halfX + span[1], roofY, roofY + 1.6, PLATFORM.zWest, PLATFORM.zEast, { receive: false });

  // --- the soreg ----------------------------------------------------------
  // The waist-high screen (3 cubits) marking the limit for Gentiles, with the
  // warning notices set into it at intervals.

  // A closed ring, because a barrier you can stroll around is not a barrier.
  // The east face is broken by the openings Middot records, generated from the
  // same list templeNavigation.js lets the visitor walk through.
  const soregParts = [
    ...soregSegments().map(([x0, x1]) => [x0, x1, SOREG.zEast, SOREG.zEast + SOREG.thickness]),
    [-SOREG.halfX, -SOREG.halfX + SOREG.thickness, SOREG.zWest, SOREG.zEast],
    [SOREG.halfX - SOREG.thickness, SOREG.halfX, SOREG.zWest, SOREG.zEast],
    [-SOREG.halfX, SOREG.halfX, SOREG.zWest, SOREG.zWest + SOREG.thickness],
  ];
  for (const [x0, x1, z0, z1] of soregParts) {
    slab(M.stone, x0, x1, LEVEL.outer + 0.4, LEVEL.outer + SOREG.height, z0, z1);
  }
  // The warning notices, standing either side of every opening — which is
  // where anyone about to cross would actually read one.
  for (const [from, to] of SOREG.gaps) {
    for (const x of [from - 1.4, to + 1.4]) {
      slab(M.marble, x - 1.1, x + 1.1, LEVEL.outer + 0.9, LEVEL.outer + SOREG.height + 0.5,
        SOREG.zEast - 0.1, SOREG.zEast + 0.45);
    }
  }

  // --- women's court ------------------------------------------------------

  // Substructure, then the floor it presents.
  slab(M.stone, -WOMEN.halfX, WOMEN.halfX, LEVEL.outer, LEVEL.women, INNER.zEast, WOMEN.zEast, { cast: false });

  // Twelve steps up through the Beautiful Gate.
  for (let i = 0; i < 12; i += 1) {
    const y = LEVEL.outer + (LEVEL.women * i) / 12;
    slab(M.stone, -40, 40, y, y + LEVEL.women / 12, WOMEN.zEast + 1 + (11 - i) * 0.9, WOMEN.zEast + 2 + (11 - i) * 0.9, { cast: false });
  }

  // Court walls, 12m, with the corner chambers Middot places at each angle.
  const wallTop = LEVEL.women + 12;
  slab(M.stone, -WOMEN.halfX - 1.5, -WOMEN.halfX, LEVEL.outer, wallTop, INNER.zEast, WOMEN.zEast);
  slab(M.stone, WOMEN.halfX, WOMEN.halfX + 1.5, LEVEL.outer, wallTop, INNER.zEast, WOMEN.zEast);
  // East wall, split around the gate opening.
  slab(M.stone, -WOMEN.halfX - 1.5, -5, LEVEL.outer, wallTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  slab(M.stone, 5, WOMEN.halfX + 1.5, LEVEL.outer, wallTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  slab(M.stone, -5, 5, LEVEL.women + 9, wallTop, WOMEN.zEast, WOMEN.zEast + 1.5);
  slab(M.bronze, -4.6, 4.6, LEVEL.women, LEVEL.women + 9, WOMEN.zEast + 0.5, WOMEN.zEast + 0.9, { receive: false });

  for (const cx of [-WOMEN.halfX + 6, WOMEN.halfX - 6]) {
    for (const cz of [WOMEN.zWest + 6, WOMEN.zEast - 6]) {
      slab(M.stone, cx - 6, cx + 6, LEVEL.women, LEVEL.women + 8, cz - 6, cz + 6);
    }
  }

  // The thirteen trumpet-mouthed chests of the treasury, along the north and
  // south walls. Cone on a plinth — the shape is what gave them their name.
  const chestGeo = new THREE.CylinderGeometry(0.55, 0.16, 1.5, 10, 1, true);
  const chests = new THREE.InstancedMesh(chestGeo, M.bronze, 13);
  const plinths = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), M.stone, 13);
  for (let i = 0; i < 13; i += 1) {
    const side = i < 7 ? -1 : 1;
    const along = WOMEN.zWest + 10 + ((i % 7) * (WOMEN.zEast - WOMEN.zWest - 20)) / 6;
    const x = side * (WOMEN.halfX - 2.4);
    dummy.position.set(x, LEVEL.women + 0.55, along);
    dummy.updateMatrix();
    plinths.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, LEVEL.women + 1.85, along);
    dummy.updateMatrix();
    chests.setMatrixAt(i, dummy.matrix);
  }
  if (!low) {
    chests.castShadow = true;
    plinths.castShadow = true;
  }
  root.add(chests, plinths);

  // --- the fifteen steps --------------------------------------------------
  // Semicircular, bulging east into the women's court. Modelled as full
  // cylinders whose western halves are buried inside the inner-court
  // substructure — cheaper than arc geometry and indistinguishable in view.

  const stepRise = (LEVEL.inner - LEVEL.women) / 15;
  for (let i = 0; i < 15; i += 1) {
    const radius = 10.5 - i * 0.62;
    const y = LEVEL.women + i * stepRise;
    const step = add(
      new THREE.CylinderGeometry(radius, radius, stepRise, low ? 16 : 40),
      M.stone,
      [0, y + stepRise / 2, INNER.zEast],
      { cast: false },
    );
    step.renderOrder = 1;
  }

  // --- inner precinct -----------------------------------------------------

  slab(M.stone, -INNER.halfX, INNER.halfX, LEVEL.outer, LEVEL.inner, INNER.zWest, INNER.zEast, { cast: false });

  // The Nicanor Gate: two towers, a lintel, and the Corinthian bronze doors.
  const gateTop = LEVEL.inner + 15;
  slab(M.stone, -INNER.halfX, -5, LEVEL.inner, gateTop, INNER.zEast - 2, INNER.zEast);
  slab(M.stone, 5, INNER.halfX, LEVEL.inner, gateTop, INNER.zEast - 2, INNER.zEast);
  slab(M.stone, -5, 5, LEVEL.inner + 11, gateTop, INNER.zEast - 2, INNER.zEast);
  slab(M.bronze, -4.7, 4.7, LEVEL.inner, LEVEL.inner + 11, INNER.zEast - 1.6, INNER.zEast - 1.2, { receive: false });
  slab(M.gold, -5.4, 5.4, LEVEL.inner + 11, LEVEL.inner + 11.9, INNER.zEast - 2.2, INNER.zEast + 0.2, { receive: false });

  // North and south walls of the inner precinct, with their chambers.
  slab(M.stone, -INNER.halfX - 2, -INNER.halfX, LEVEL.outer, LEVEL.inner + 11, INNER.zWest, INNER.zEast);
  slab(M.stone, INNER.halfX, INNER.halfX + 2, LEVEL.outer, LEVEL.inner + 11, INNER.zWest, INNER.zEast);
  slab(M.stone, -INNER.halfX - 2, INNER.halfX + 2, LEVEL.outer, LEVEL.inner + 11, INNER.zWest - 2, INNER.zWest);

  // The rail dividing the Court of Israel from the Court of the Priests.
  slab(M.timber, -INNER.halfX + 2, INNER.halfX - 2, LEVEL.inner + 0.9, LEVEL.inner + 1.05, 19.6, 20);

  // --- altar of burnt offering --------------------------------------------

  const altarBase = LEVEL.inner;
  slab(M.altar, -ALTAR.half, ALTAR.half, altarBase, altarBase + 2.5, ALTAR.z - ALTAR.half, ALTAR.z + ALTAR.half);
  slab(M.altar, -7, 7, altarBase + 2.5, altarBase + 4.6, ALTAR.z - 7, ALTAR.z + 7);
  slab(M.altar, -6, 6, altarBase + 4.6, altarBase + ALTAR.height, ALTAR.z - 6, ALTAR.z + 6);
  for (const hx of [-5.4, 5.4]) {
    for (const hz of [ALTAR.z - 5.4, ALTAR.z + 5.4]) {
      slab(M.altar, hx - 0.6, hx + 0.6, altarBase + ALTAR.height, altarBase + ALTAR.height + 1, hz - 0.6, hz + 0.6);
    }
  }

  // The ramp on the south side: Exodus forbids steps up to an altar, so the
  // approach had to be an incline. Extruded triangle, 32 cubits long.
  const rampShape = new THREE.Shape();
  rampShape.moveTo(-ALTAR.half - 16, 0);
  rampShape.lineTo(-ALTAR.half, 0);
  rampShape.lineTo(-ALTAR.half, ALTAR.height);
  rampShape.lineTo(-ALTAR.half - 16, 0);
  add(
    new THREE.ExtrudeGeometry(rampShape, { depth: 8, bevelEnabled: false }),
    M.altar,
    [0, altarBase, ALTAR.z - 4],
  );

  // A laver, and the slaughtering rings north of the altar.
  add(new THREE.CylinderGeometry(1.6, 1.4, 2.2, 14), M.bronze, [13, altarBase + 1.1, ALTAR.z + 4]);

  // --- the sanctuary ------------------------------------------------------

  const base = LEVEL.inner;

  // Twelve steps up to the porch.
  for (let i = 0; i < 12; i += 1) {
    const y = base + i * 0.3;
    slab(M.marble, -PORCH.halfX, PORCH.halfX, y, y + 0.3, PORCH.zEast + (11 - i) * 0.7, PORCH.zEast + 0.7 + (11 - i) * 0.7, { cast: false });
  }

  // Hekhal — the sanctuary body behind the porch, 60 cubits wide.
  slab(M.marble, -15, 15, base, base + 40, -52, PORCH.zEast);
  // Porch (Ulam): 100 cubits square, built around a 20 x 40 cubit doorway so
  // the opening is real geometry rather than a painted-on rectangle.
  slab(M.marble, -PORCH.halfX, -5, base, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);
  slab(M.marble, 5, PORCH.halfX, base, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);
  slab(M.marble, -5, 5, base + 20, base + PORCH.height, PORCH.zEast - PORCH.depth, PORCH.zEast);

  // Gold: the doorway surround, the cornice, and the great vine over the door.
  slab(M.gold, -6.4, -5, base, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3, { receive: false });
  slab(M.gold, 5, 6.4, base, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3, { receive: false });
  slab(M.gold, -6.4, 6.4, base + 20, base + 21.4, PORCH.zEast - 0.4, PORCH.zEast + 0.3, { receive: false });
  slab(M.gold, -PORCH.halfX - 1, PORCH.halfX + 1, base + PORCH.height - 3, base + PORCH.height, PORCH.zEast - PORCH.depth - 0.6, PORCH.zEast + 0.6, { receive: false });
  slab(M.gold, -PORCH.halfX - 1, PORCH.halfX + 1, base + PORCH.height, base + PORCH.height + 1.4, PORCH.zEast - PORCH.depth - 1.2, PORCH.zEast + 1.2, { receive: false });

  // Golden spikes along the roofline. Josephus says they were there to stop
  // birds fouling the roof, and they catch the morning sun beautifully.
  const spikeGeo = new THREE.ConeGeometry(0.16, 1.8, 6);
  const spikeCount = low ? 14 : 27;
  const spikes = new THREE.InstancedMesh(spikeGeo, M.gold, spikeCount);
  for (let i = 0; i < spikeCount; i += 1) {
    const x = -PORCH.halfX + (i * (PORCH.halfX * 2)) / (spikeCount - 1);
    dummy.position.set(x, base + PORCH.height + 2.3, PORCH.zEast - PORCH.depth / 2);
    dummy.updateMatrix();
    spikes.setMatrixAt(i, dummy.matrix);
  }
  if (!low) spikes.castShadow = true;
  root.add(spikes);

  // --- the crowd ----------------------------------------------------------
  // Nothing communicates the scale of these courts like people standing in
  // them, and nothing wrecks it like people standing in them *evenly*. The
  // pilgrims come in knots — families, parties up from Galilee, a circle round
  // whoever is teaching — with loose individuals between, and the middle of
  // the ascent left clear because that is where everybody is walking.

  const crowdFigures = [];
  const pick = (list) => list[Math.floor(random() * list.length)];
  const commonRobe = () => pick(ROBE_PALETTE);

  // Outer court: the biggest, loosest crowd, thickest toward the eastern gates
  // where everyone comes in.
  const outerGroups = low ? 5 : 11;
  for (let g = 0; g < outerGroups; g += 1) {
    const centre = [(random() - 0.5) * 280, 128 + random() * 96];
    const size = 2 + Math.floor(random() * 4);
    // A knot has one person talking and the rest listening, which is what a
    // knot is.
    gather(random, centre, size, { radius: 0.9 + random() * 0.8, y: LEVEL.outer })
      .forEach((spot, i) => crowdFigures.push({
        ...spot,
        activity: i === 0 ? 'talking' : 'attending',
        colour: commonRobe(),
        phase: random() * 12,
        scale: 0.94 + random() * 0.12,
      }));
  }
  scatter(random, low ? 12 : 26, {
    x0: -150, x1: 150, z0: 118, z1: 232, y: LEVEL.outer, clearX: 9,
  }).forEach((spot) => crowdFigures.push({
    ...spot,
    activity: pick(['standing', 'standing', 'carrying', 'sitting']),
    colour: commonRobe(),
    phase: random() * 12,
    scale: 0.93 + random() * 0.14,
  }));

  // Court of the Women. Its four corners had chambers and its walls had the
  // treasury chests, so this is where people stop rather than pass through —
  // and where Mark puts Jesus sitting down opposite the treasury to watch.
  const womenGroups = low ? 3 : 7;
  for (let g = 0; g < womenGroups; g += 1) {
    const centre = [
      (random() - 0.5) * 52,
      WOMEN.zWest + 6 + random() * (WOMEN.zEast - WOMEN.zWest - 14),
    ];
    gather(random, centre, 2 + Math.floor(random() * 3), { radius: 0.8, y: LEVEL.women })
      .forEach((spot, i) => crowdFigures.push({
        ...spot,
        activity: i === 0 ? 'talking' : 'attending',
        colour: commonRobe(),
        phase: random() * 12,
      }));
  }
  // Individuals at prayer along the walls, and someone at the chests.
  scatter(random, low ? 6 : 14, {
    x0: -WOMEN.halfX + 4, x1: WOMEN.halfX - 4, z0: WOMEN.zWest + 4, z1: WOMEN.zEast - 6, y: LEVEL.women,
  }).forEach((spot) => crowdFigures.push({
    ...spot,
    activity: pick(['praying', 'standing', 'carrying', 'sitting']),
    colour: commonRobe(),
    phase: random() * 12,
  }));

  // The fifteen steps, where the Levites sang the Songs of Ascents. People sit
  // on steps; it is the most reliable fact about steps.
  for (let i = 0; i < (low ? 4 : 9); i += 1) {
    const tier = Math.floor(random() * 12);
    crowdFigures.push({
      x: (random() - 0.5) * 15,
      z: INNER.zEast + 7 - tier * 0.55,
      y: LEVEL.women + tier * ((LEVEL.inner - LEVEL.women) / 15),
      facing: Math.PI + (random() - 0.5) * 0.9,
      activity: 'sitting',
      colour: commonRobe(),
      phase: random() * 12,
    });
  }

  // The inner court: priests, in white, and fewer of them. Some at the altar
  // ramp, the rest about the business of the offering.
  for (let i = 0; i < (low ? 5 : 11); i += 1) {
    crowdFigures.push({
      x: (random() - 0.5) * 38,
      z: -4 + random() * 26,
      y: LEVEL.inner,
      facing: random() * Math.PI * 2,
      activity: pick(['standing', 'bowing', 'working', 'praying']),
      colour: 0xf4f1e8, // priestly linen
      phase: random() * 12,
    });
  }

  const crowd = createCrowd(THREE, { figures: crowdFigures, quality, headcloth: 0xece5d6 });
  root.add(crowd.group);

  // --- what people leave lying about --------------------------------------
  // The outer court was a market as much as a sanctuary — Josephus has stalls
  // under the porticoes, and all four gospels have Jesus overturning tables in
  // it. This is that trade, at rest.

  const propItems = [];
  for (let i = 0; i < (low ? 4 : 9); i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    propItems.push(...heap(random, ['basket', 'crate', 'jar', 'sack'], {
      at: [side * (86 + random() * 46), 132 + random() * 82],
      y: LEVEL.outer,
      count: 3 + Math.floor(random() * 4),
      radius: 0.9,
    }));
  }
  // Water jars and benches against the wall of the women's court, where anyone
  // waiting would put them down.
  propItems.push(...alongWall(random, ['waterJar', 'jar', 'basket'], {
    from: WOMEN.zWest + 8, to: WOMEN.zEast - 10, at: -WOMEN.halfX, axis: 'z',
    y: LEVEL.women, count: low ? 4 : 8, offset: 1.1,
  }));
  propItems.push(...alongWall(random, ['jar', 'sack'], {
    from: WOMEN.zWest + 8, to: WOMEN.zEast - 10, at: WOMEN.halfX, axis: 'z',
    y: LEVEL.women, count: low ? 3 : 6, offset: -1.1,
  }));

  const props = createProps(THREE, { items: propItems, quality });
  root.add(props.group);

  // --- the world beyond ---------------------------------------------------

  // The Mount of Olives across the Kidron, squashed into a ridge.
  const olivet = add(new THREE.SphereGeometry(260, 24, 14), M.hill, [10, DROP - 128, 700], { cast: false });
  olivet.scale.set(1.7, 0.78, 1);
  const northHill = add(new THREE.SphereGeometry(210, 20, 12), M.hill, [-420, DROP - 118, 520], { cast: false });
  northHill.scale.set(1.4, 0.66, 1);

  // The lower city crowding up against the platform on the west and south.
  const houseCount = low ? 70 : 190;
  const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.roof, houseCount);
  for (let i = 0; i < houseCount; i += 1) {
    const west = random() < 0.55;
    const x = west ? -PLATFORM.halfX - 20 - random() * 240 : (random() - 0.5) * 620;
    const z = west ? PLATFORM.zWest + random() * 340 : PLATFORM.zWest - 20 - random() * 260;
    const h = 5 + random() * 9;
    dummy.position.set(x, DROP + h / 2, z);
    dummy.rotation.set(0, random() * 0.5, 0);
    dummy.scale.set(7 + random() * 9, h, 7 + random() * 9);
    dummy.updateMatrix();
    houses.setMatrixAt(i, dummy.matrix);
  }
  dummy.scale.set(1, 1, 1);
  root.add(houses);

  // --- altar smoke --------------------------------------------------------
  // The one thing in the scene that moves. The fire was never allowed to go
  // out, so the column of smoke is the site's resting state, not an event.

  const smokeCount = low ? 90 : 220;
  const smokePositions = new Float32Array(smokeCount * 3);
  const smokeSeeds = new Float32Array(smokeCount);
  for (let i = 0; i < smokeCount; i += 1) {
    smokeSeeds[i] = random();
    smokePositions[i * 3] = 0;
    smokePositions[i * 3 + 1] = altarBase + ALTAR.height;
    smokePositions[i * 3 + 2] = ALTAR.z;
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = new THREE.Points(
    smokeGeo,
    new THREE.PointsMaterial({
      map: smokeMap,
      size: 6,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      blending: THREE.NormalBlending,
    }),
  );
  smoke.frustumCulled = false;
  root.add(smoke);

  const SMOKE_LIFE = 14;
  const smokeAttr = smokeGeo.getAttribute('position');

  function update(elapsed) {
    crowd.update(elapsed);
    for (let i = 0; i < smokeCount; i += 1) {
      const t = ((elapsed + smokeSeeds[i] * SMOKE_LIFE) % SMOKE_LIFE) / SMOKE_LIFE;
      const drift = smokeSeeds[i] * 6.2831;
      smokeAttr.setXYZ(
        i,
        Math.sin(drift + t * 2.2) * (1.4 + t * 11),
        altarBase + ALTAR.height + t * 44,
        ALTAR.z + Math.cos(drift * 1.7 + t * 1.6) * (1.2 + t * 7),
      );
    }
    smokeAttr.needsUpdate = true;
    smoke.material.opacity = 0.5;
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    crowd.dispose();
    props.dispose();
  }

  return {
    root,
    sun,
    lighting,
    update,
    dispose,
    fog: resolveTimeOfDay(timeOfDay).fog,
    exposure: resolveTimeOfDay(timeOfDay).exposure,
  };
}
