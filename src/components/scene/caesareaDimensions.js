// Metres. West is -X, north +Z. Deliberately compact interpretive district.
export const EYE_HEIGHT = 1.7;
export const GROUND = 2;
export const BOUNDS = { x0: 0, x1: 110, z0: -100, z1: 110 };
// Every solid that rises from the walkable ground is described here and drawn
// from these same extents. Decoration is attached above, never hidden collision.
export const BUILDINGS = [
  { id: 'palace', x0: 24, x1: 57, z0: -89, z1: -53, height: 13 },
  { id: 'store-a', x0: 43, x1: 62, z0: -34, z1: -6, height: 7 },
  { id: 'store-b', x0: 43, x1: 62, z0: 26, z1: 44, height: 8 },
  { id: 'house-east', x0: 78, x1: 94, z0: 49, z1: 83, height: 6 },
  { id: 'house-north', x0: 48, x1: 78, z0: 91, z1: 103, height: 6 },
  { id: 'house-south', x0: 67, x1: 78, z0: 32, z1: 49, height: 5 },
];
export const COLUMNS = [];
for (const x of [23, 37]) {
  for (let z = -39; z <= 45; z += 7) COLUMNS.push({ x, z, radius: 0.65, height: 7 });
}
export const PALMS = [{ x: 19, z: 66 }, { x: 19, z: -47 }, { x: 99, z: 64 }, { x: 55, z: 77 }];
export const CARGO = [{ x: 3, z: 30, w: 2.4, d: 3, h: 1.5 }, { x: 5, z: 96, w: 3, d: 3, h: 2 }, { x: 17, z: -14, w: 2, d: 2, h: 1.4 }];
