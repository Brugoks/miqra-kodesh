// An interpretive village, not an excavated street plan. +X east, -Z north.
// One height function and obstacle list serve rendering, walking and staging.
export const BOUNDS = { x0: -96, x1: 96, z0: -90, z1: 108 };
export const VILLAGE_LEVEL = 7;
export const GRID_STEP = 2;
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const height = (x, z) =>
  VILLAGE_LEVEL -
  8 * smooth(18, 96, x) +
  2.2 * Math.sin(z / 48) * smooth(24, 100, Math.abs(x)) +
  3 * smooth(65, 150, -z) +
  2 * smooth(80, 180, -x) +
  smooth(130, 320, Math.hypot(x, z)) *
    (18 + 12 * Math.sin(x / 88) * Math.cos(z / 73) + 8 * Math.cos((x + z) / 120));

// The same diagonal as the rendered grid: continuous even on low quality.
export function groundAt(x, z) {
  const ax = Math.floor(x / GRID_STEP) * GRID_STEP,
    az = Math.floor(z / GRID_STEP) * GRID_STEP;
  const u = (x - ax) / GRID_STEP,
    v = (z - az) / GRID_STEP;
  const a = height(ax, az),
    b = height(ax + GRID_STEP, az),
    c = height(ax, az + GRID_STEP),
    d = height(ax + GRID_STEP, az + GRID_STEP);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export const HOUSES = [
  { id: 'north-house', x0: -18, x1: -2, z0: -56, z1: -43, height: 4.1 },
  { id: 'west-upper', x0: -40, x1: -25, z0: -46, z1: -33, height: 3.8 },
  { id: 'weavers-house', x0: -38, x1: -24, z0: -20, z1: -7, height: 3.5 },
  { id: 'east-house', x0: 7, x1: 21, z0: -25, z1: -11, height: 4.4 },
  { id: 'potters-house', x0: 18, x1: 31, z0: 0, z1: 13, height: 3.6 },
  { id: 'south-west-house', x0: -35, x1: -21, z0: 13, z1: 26, height: 4.2 },
  { id: 'arrival-house', x0: -13, x1: 1, z0: 33, z1: 44, height: 3.5 },
  { id: 'magi-house', x0: 7, x1: 23, z0: -57, z1: -43, height: 4.3 },
];
export const SHELTER = { x0: -18, x1: -2, z0: -41, z1: -24, level: 7 };
export const MANGER = { x: -10, z: -35, width: 1.65, depth: 0.8, height: 0.7 };
export const WELL = { x: -10, z: 8, radius: 1.25 };
export const FIELD = { x: 60, z: 39 };
export const PATHS = [
  [
    [3, 96],
    [3, 63],
    [7, 34],
    [1, 12],
    [0, -5],
    [-10, -23],
    [-10, -30],
  ],
  [
    [0, -5],
    [1, -34],
    [14, -36],
    [31, -36],
  ],
  [
    [6, 34],
    [28, 28],
    [43, 32],
    [60, 39],
    [84, 66],
  ],
  [
    [-13, 8],
    [-17, 2],
    [-20, -26],
    [-35, -28],
  ],
];
export const WALLS = [
  { id: 'shelter-west', x0: -19, x1: -17.5, z0: -42, z1: -24, height: 4.7 },
  { id: 'shelter-east', x0: -2.5, x1: -1, z0: -42, z1: -24, height: 4.7 },
  { id: 'shelter-back', x0: -19, x1: -1, z0: -43, z1: -40, height: 4.7 },
  { id: 'shelter-front-west', x0: -19, x1: -14, z0: -25, z1: -23.7, height: 3.8 },
  { id: 'shelter-front-east', x0: -6, x1: -1, z0: -25, z1: -23.7, height: 3.8 },
];
export const OLIVES = [
  [-56, -56],
  [-69, -40],
  [-53, -23],
  [-64, -4],
  [-53, 18],
  [-58, 36],
  [-42, 49],
  [-38, 67],
  [-22, 72],
  [39, -61],
  [50, -48],
  [68, -33],
  [74, -7],
  [85, 16],
  [84, 49],
  [40, 63],
  [55, 78],
  [74, 89],
  [-71, 68],
].map(([x, z], i) => ({ x, z, radius: 0.45, height: 4.2 + (i % 4) * 0.4 }));
export const CAMP = { x: 59, z: 36 };
export function pathDistance(x, z) {
  let distance = Infinity;
  for (const points of PATHS)
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1],
        [bx, bz] = points[i];
      const dx = bx - ax,
        dz = bz - az,
        t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      distance = Math.min(distance, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  return distance;
}
