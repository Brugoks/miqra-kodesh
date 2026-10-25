export const CITY = { x0: -112, x1: 112, z0: -104, z1: 104 };
// The walkable world includes the Kidron and the lower western slope of the
// Mount of Olives. The city itself remains intentionally compressed.
export const BOUNDS = { x0: -220, x1: 235, z0: -145, z1: 175 };

// Buildings are kept off the narrative plazas and roads. Navigation and the
// builder share this list so the visible city is the city a visitor meets.
export const BUILDINGS = [
  [-102, -82, -92, -62, 'house'], [-76, -54, -96, -72, 'house'],
  [2, 22, -94, -68, 'house'], [78, 102, -92, -65, 'house'],
  [-106, -86, -46, -18, 'house'], [-82, -62, -45, -20, 'house'],
  [-18, 2, -48, -24, 'house'], [84, 105, -50, -22, 'house'],
  [-107, -88, 10, 34, 'house'],
  [-28, -8, 12, 37, 'house'], [3, 24, 18, 43, 'house'], [76, 101, 10, 35, 'house'],
  [-106, -88, 67, 94, 'house'], [-56, -34, 69, 96, 'house'],
  [-10, 12, 69, 95, 'house'], [25, 47, 62, 91, 'house'], [72, 101, 65, 94, 'house'],
];

export const SPECIAL_BUILDINGS = [
  [-72, -44, 18, 38, 'upper-room'],
  [-80, -58, 48, 70, 'high-priest-house'],
  [-44, -20, -88, -60, 'praetorium'],
  [22, 88, -59, -17, 'temple-platform'],
];

export const WALL_RECTS = [
  [-114, -110, -104, 18, 'city-wall'], [-114, -110, 38, 104, 'city-wall'],
  [110, 114, -104, 18, 'city-wall'], [110, 114, 38, 104, 'city-wall'],
  [-112, -42, -108, -104, 'city-wall'], [-22, 112, -108, -104, 'city-wall'],
  [-112, -42, 104, 108, 'city-wall'], [-22, 112, 104, 108, 'city-wall'],
];
