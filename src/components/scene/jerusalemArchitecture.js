import { BUILDINGS, SPECIAL_BUILDINGS, WALL_RECTS, TOWERS, TEMPLE_COURT, TEMPLE_STAIRS, UPPER_ROOM, UPPER_STAIRS, UPPER_LANDING, UPPER_WALLS, UPPER_DOOR, TOMB_WALLS, PORTICO_COLUMNS, UPPER_COLUMNS } from './jerusalemDimensions';
import { terrainHeight, surfaceHeight, templePlatformLevel, UPPER_ROOM_LEVEL, stairHeight } from './jerusalemTopography';

// All dimensions here are metres. Occupied floors and solid footprints are
// exported by the layout modules and used by the walker and event casts too.
export function buildJerusalemArchitecture(THREE, { add, M }) {
  const box = (name, rect, bottom, top, mat = M.limestone, collide = true) => {
    const [x0, x1, z0, z1] = rect;
    const mesh = add(new THREE.BoxGeometry(x1 - x0, top - bottom, z1 - z0), mat,
      [(x0 + x1) / 2, (bottom + top) / 2, (z0 + z1) / 2], { name, collide });
    mesh.userData.footprint = rect.slice(0, 4);
    return mesh;
  };
  const baseOf = (rect) => {
    const [x0, x1, z0, z1] = rect, samples = [];
    for (let x = x0; x <= x1 + 0.001; x += (x1 - x0) / 4) {
      for (let z = z0; z <= z1 + 0.001; z += (z1 - z0) / 4) samples.push(terrainHeight(x, z));
    }
    return { bottom: Math.min(...samples) - 0.25, top: Math.max(...samples) };
  };

  // Split only the LONG axis. The old implementation interpolated both axes,
  // turning a 4m-thick wall into a diagonal row of 30cm strips.
  for (const [x0, x1, z0, z1] of WALL_RECTS) {
    const alongX = x1 - x0 > z1 - z0;
    const length = alongX ? x1 - x0 : z1 - z0;
    const count = Math.ceil(length / 5);
    for (let i = 0; i < count; i += 1) {
      const rect = alongX
        ? [x0 + length * i / count, x0 + length * (i + 1) / count, z0, z1]
        : [x0, x1, z0 + length * i / count, z0 + length * (i + 1) / count];
      const base = baseOf(rect), top = base.top + 6.2;
      box('city-wall', rect, base.bottom, top);
      box('wall-coping', rect, top, top + 0.22, M.pale, false);
    }
  }
  for (const rect of TOWERS) {
    const [x0, x1, z0, z1] = rect, base = baseOf(rect), top = base.top + 8.6;
    box('wall-tower', rect, base.bottom, top);
    box('tower-cornice', [x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15], top, top + 0.3, M.pale, false);
    for (const x of [x0 + 0.5, (x0 + x1) / 2, x1 - 0.5]) {
      for (const z of [z0 + 0.5, z1 - 0.5]) box('tower-merlon', [x - 0.45, x + 0.45, z - 0.45, z + 0.45], top + 0.3, top + 1.1, M.pale, false);
    }
    for (const z of [z0 + 1.6, z1 - 1.6]) box('gate-arrow-slit', [x1 + 0.005, x1 + 0.035, z - 0.12, z + 0.12], top - 3.2, top - 2.3, M.dark, false);
  }

  function house(rect, index, name = 'jerusalem-house') {
    const [x0, x1, z0, z1] = rect, base = baseOf(rect);
    const height = 3.1 + (index % 3) * 0.35, roof = base.top + height;
    box(name, rect, base.bottom, roof, index % 3 ? M.plaster : M.limestone);
    box('house-roof', [x0 - 0.1, x1 + 0.1, z0 - 0.1, z1 + 0.1], roof, roof + 0.16, M.roof, false);
    for (const edge of [[x0, x1, z0, z0 + 0.2], [x0, x1, z1 - 0.2, z1], [x0, x0 + 0.2, z0, z1], [x1 - 0.2, x1, z0, z1]]) {
      box('roof-parapet', edge, roof + 0.16, roof + 0.62, M.plaster, false);
    }
    const doorX = (x0 + x1) / 2, doorBase = terrainHeight(doorX, z1);
    box('shadowed-door', [doorX - 0.53, doorX + 0.53, z1, z1 + 0.035], doorBase, doorBase + 1.95, M.dark, false);
    box('door-lintel', [doorX - 0.68, doorX + 0.68, z1, z1 + 0.16], doorBase + 1.95, doorBase + 2.14, M.timber, false);
    for (const x of [x0 + 1.15, x1 - 1.15]) {
      box('lattice-window', [x - 0.28, x + 0.28, z1, z1 + 0.04], roof - 1.4, roof - 0.7, M.dark, false);
      for (const dx of [-0.14, 0.14]) box('window-bar', [x + dx - 0.025, x + dx + 0.025, z1 + 0.04, z1 + 0.065], roof - 1.4, roof - 0.7, M.timber, false);
    }
  }
  BUILDINGS.forEach((rect, i) => house(rect, i));
  SPECIAL_BUILDINGS.filter((rect) => rect[4] !== 'temple-platform').forEach((rect, i) => house(rect, i, rect[4]));

  function stairs(name, rect, top) {
    const [x0, x1, z0, z1] = rect;
    const bottom = terrainHeight((x0 + x1) / 2, z1);
    const count = Math.ceil((top - bottom) / 0.18), depth = (z1 - z0) / count;
    for (let i = 0; i < count; i += 1) {
      const front = z1 - depth * i, back = front - depth;
      const stepRect = [x0, x1, back, front];
      const height = stairHeight(rect, top, (x0 + x1) / 2, (back + front) / 2);
      box(name, stepRect, Math.min(baseOf(stepRect).bottom, bottom - 0.2), height, M.paving, false);
    }
  }

  const temple = templePlatformLevel();
  box('temple-platform', TEMPLE_COURT, baseOf(TEMPLE_COURT).bottom, temple, M.limestone, false);
  stairs('temple-approach-step', TEMPLE_STAIRS, temple);
  // Sanctuary and forecourt have deliberately distinct architectural scale.
  const sanctuary = box('temple-sanctuary', [52, 72, -56, -36], temple, temple + 20, M.pale);
  sanctuary.userData.landmark = true;
  box('temple-golden-facade', [56, 68, -36.12, -35.9], temple + 1, temple + 17, M.gold, false);
  box('temple-door', [59, 65, -35.88, -35.82], temple + 1, temple + 10, M.dark, false);
  box('temple-cornice', [51.4, 72.6, -56.6, -35.4], temple + 20, temple + 20.7, M.pale, false);
  for (const z of [-62, 5]) {
    for (const [x] of PORTICO_COLUMNS.filter((column) => column[1] === z)) {
      add(new THREE.CylinderGeometry(0.27, 0.34, 4.5, 12), M.pale, [x, temple + 2.25, z], { name: 'temple-portico-column' });
      add(new THREE.BoxGeometry(0.85, 0.22, 0.85), M.pale, [x, temple + 4.5, z], { name: 'column-capital', cast: false });
    }
    for (const [a, b] of z === 5 ? [[17, 39], [61, 91]] : [[17, 91]]) {
      box('temple-portico-roof', [a, b, z - 1.5, z + 1.5], temple + 4.6, temple + 4.95, M.roof, false);
    }
  }

  // An enclosed domestic guest room, not an open pavilion or modern Cenacle
  // replica. The floor plan is interpretive; its doorway is genuinely walkable.
  const [ux0, ux1, uz0, uz1] = UPPER_ROOM;
  box('upper-room-base', UPPER_ROOM, baseOf(UPPER_ROOM).bottom, UPPER_ROOM_LEVEL - 0.18, M.plaster, false);
  box('upper-room-floor', UPPER_ROOM, UPPER_ROOM_LEVEL - 0.18, UPPER_ROOM_LEVEL, M.roof, false);
  stairs('upper-room-stair', UPPER_STAIRS, UPPER_ROOM_LEVEL);
  box('upper-room-landing', UPPER_LANDING, baseOf(UPPER_LANDING).bottom, UPPER_ROOM_LEVEL, M.paving, false);
  function roomWall(rect, alongX, openings = []) {
    const [x0, x1, z0, z1] = rect, floor = UPPER_ROOM_LEVEL;
    if (!openings.length) return box('upper-room-wall', rect, floor, floor + 3.1, M.plaster);
    box('upper-room-window-sill-wall', rect, floor, floor + 1.15, M.plaster);
    box('upper-room-window-head-wall', rect, floor + 2.25, floor + 3.1, M.plaster);
    const strip = (a, b) => alongX ? [a, b, z0, z1] : [x0, x1, a, b];
    let start = alongX ? x0 : z0;
    for (const [a, b] of openings) {
      box('upper-room-window-pier', strip(start, a), floor + 1.15, floor + 2.25, M.plaster);
      box('upper-room-window-lintel', strip(a - 0.1, b + 0.1), floor + 2.2, floor + 2.32, M.timber, false);
      for (let p = a + 0.25; p < b; p += 0.3) {
        box('upper-room-window-lattice', strip(p, p + 0.035), floor + 1.15, floor + 2.2, M.timber, false);
      }
      start = b;
    }
    box('upper-room-window-pier', strip(start, alongX ? x1 : z1), floor + 1.15, floor + 2.25, M.plaster);
  }
  roomWall(UPPER_WALLS[0], true, [[-53.8, -52.6], [-47.4, -46.2]]);
  roomWall(UPPER_WALLS[1], true, [[-53.8, -52.6], [-47.4, -46.2]]);
  roomWall(UPPER_WALLS[2], false, [[23.2, 24.4], [27.2, 28.4]]);
  UPPER_WALLS.slice(3).forEach((rect) => roomWall(rect, false));
  box('upper-room-door-head', UPPER_DOOR, UPPER_ROOM_LEVEL + 2.15, UPPER_ROOM_LEVEL + 3.1, M.plaster);
  box('upper-room-door-lintel', UPPER_DOOR, UPPER_ROOM_LEVEL + 2.1, UPPER_ROOM_LEVEL + 2.26, M.timber, false);
  for (const [x, z] of UPPER_COLUMNS) {
    add(new THREE.CylinderGeometry(0.16, 0.19, 3.1, 10), M.timber, [x, UPPER_ROOM_LEVEL + 1.55, z], { name: 'upper-room-column' });
  }
  box('upper-room-canopy', UPPER_ROOM, UPPER_ROOM_LEVEL + 3.1, UPPER_ROOM_LEVEL + 3.3, M.roof, false);
  for (let z = uz0 + 0.8; z < uz1; z += 1.5) {
    box('upper-room-ceiling-beam', [ux0 + 0.2, ux1 - 0.2, z, z + 0.22], UPPER_ROOM_LEVEL + 2.86, UPPER_ROOM_LEVEL + 3.1, M.timber, false);
  }

  // A human-sized cut-rock entrance, with actual space behind the opening.
  const tombFloor = terrainHeight(-171, -78);
  TOMB_WALLS.forEach((rect) => box('garden-tomb-rock', rect, tombFloor - 0.3, tombFloor + 2.5, M.rock));
  box('tomb-lintel', [-174, -168, -82, -76.4], tombFloor + 1.75, tombFloor + 2.6, M.rock);
  box('tomb-floor', [-174, -168, -82, -75.8], tombFloor - 0.12, tombFloor, M.paving, false);
  box('tomb-opening', [-171.59, -170.41, -81.48, -81.44], tombFloor, tombFloor + 1.72, M.dark, false);
  const rolled = add(new THREE.CylinderGeometry(0.88, 0.88, 0.28, 24), M.rock,
    [-168.7, surfaceHeight(-168.7, -75.9) + 0.88, -75.9], { name: 'rolled-stone', collide: true });
  rolled.rotation.x = Math.PI / 2;
  return { rolled };
}
