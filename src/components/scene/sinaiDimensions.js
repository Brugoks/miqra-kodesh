// Interpretive Sinai/Horeb landscape. +X east, -Z north; metres throughout.
// The route joins narrative settings, not claimed archaeological coordinates.
export const BOUNDS = { x0: -150, x1: 150, z0: -178, z1: 160 };
export const GRID = 2;
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rawHeight = (x, z) =>
  2 +
  88 * smooth(5, 185, -z) +
  64 * smooth(42, 135, Math.abs(x)) * smooth(-5, 175, -z + 35) +
  (Math.sin(x * 0.055 + z * 0.026) * 2 + Math.cos(z * 0.07) * 1.3) * smooth(15, 95, -z) +
  smooth(165, 360, Math.hypot(x, z)) * (70 + 30 * Math.sin(x / 77) * Math.cos(z / 82));
export const SITES = {
  bush: { x: -70, z: 36, radius: 12 },
  water: { x: -109, z: 12, radius: 12 },
  camp: { x: 0, z: 68, radius: 19 },
  altar: { x: 6, z: 9, radius: 16 },
  elders: { x: 4, z: -55, radius: 13 },
  summit: { x: -3, z: -150, radius: 16 },
  cleft: { x: -28, z: -115, radius: 12 },
  cave: { x: 47, z: -95, radius: 15 },
  tent: { x: -125, z: 87, radius: 13 },
  sanctuary: { x: 48, z: 86, radius: 24 },
  workshop: { x: 64, z: 38, radius: 13 },
  calf: { x: -23, z: 45, radius: 12 },
  departure: { x: 7, z: 137, radius: 17 },
};
for (const s of Object.values(SITES)) s.height = rawHeight(s.x, s.z);
function height(x, z) {
  let y = rawHeight(x, z);
  for (const s of Object.values(SITES)) {
    const influence = 1 - smooth(s.radius, s.radius + 9, Math.hypot(x - s.x, z - s.z));
    y += (s.height - y) * influence;
  }
  return y;
}
// Matches the a,c,b / b,c,d diagonal of the render mesh at every quality.
export function groundAt(x, z) {
  const ax = Math.floor(x / GRID) * GRID,
    az = Math.floor(z / GRID) * GRID;
  const u = (x - ax) / GRID,
    v = (z - az) / GRID;
  const a = height(ax, az),
    b = height(ax + GRID, az),
    c = height(ax, az + GRID),
    d = height(ax + GRID, az + GRID);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export const PATHS = [
  [
    [7, 149],
    [0, 119],
    [0, 71],
    [6, 24],
    [7, -14],
    [-9, -35],
    [4, -49],
    [20, -73],
    [25, -106],
    [-3, -140],
  ],
  [
    [0, 71],
    [-28, 69],
    [-50, 57],
    [-69, 42],
    [-90, 27],
    [-107, 20],
  ],
  [
    [-28, 69],
    [-54, 88],
    [-92, 89],
    [-123, 80],
  ],
  [
    [0, 101],
    [23, 103],
    [48, 108],
  ],
  [
    [0, 71],
    [29, 53],
    [61, 45],
  ],
  [
    [-28, 69],
    [-24, 54],
  ],
  [
    [20, -73],
    [45, -85],
    [47, -95],
  ],
  [
    [25, -106],
    [2, -108],
    [-27, -110],
  ],
];
export const TENTS = [-79, -59, -39, 27, 87, 108].flatMap((x, i) =>
  [66, 111, 135].map((z, j) => ({
    id: `camp-tent-${i}-${j}`,
    x,
    z,
    width: 8 + (i % 3),
    depth: 7,
    height: 2.6,
  })),
);
// These permanent envelopes keep camera and walking geometry in agreement.
// Camp tents are handled separately so a solitary Elijah sees no camp walls.
export const CAVE_WALLS = [
  { id: 'cave-left', x0: 40, x1: 41.5, z0: -102, z1: -90, height: 4.8 },
  { id: 'cave-right', x0: 52.5, x1: 54, z0: -102, z1: -90, height: 4.8 },
  { id: 'cave-back', x0: 40, x1: 54, z0: -104, z1: -101.5, height: 4.8 },
];
export const ROCKS = [
  { x: -109, z: 9, radius: 2.6, height: 4.7 },
  { x: -32, z: -117, radius: 2.3, height: 5.6 },
  { x: -23, z: -117, radius: 2.3, height: 6.2 },
];
export function pathDistance(x, z) {
  let d = Infinity;
  for (const points of PATHS)
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1],
        [bx, bz] = points[i];
      const dx = bx - ax,
        dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  return d;
}
