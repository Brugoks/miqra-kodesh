export const CITY = { x0: -112, x1: 112, z0: -104, z1: 104 };
// The walkable world includes the Kidron and the lower western slope of the
// Mount of Olives. The city itself remains intentionally compressed.
export const BOUNDS = { x0: -220, x1: 235, z0: -145, z1: 175 };

// Buildings are kept off the narrative plazas and roads. Navigation and the
// builder share this list so the visible city is the city a visitor meets.
const HOUSE_BLOCKS = [
  [-102, -82, -92, -62, 'house'], [-76, -54, -96, -72, 'house'],
  [2, 22, -94, -68, 'house'], [78, 102, -92, -65, 'house'],
  [-106, -86, -46, -18, 'house'], [-82, -62, -45, -20, 'house'],
  [-29, -19, -48, -24, 'house'], [98, 106, -50, -22, 'house'],
  [-107, -88, 10, 22, 'house'],
  [-28, -20, 12, 37, 'house'], [3, 24, 30, 46, 'house'], [98, 106, -16, 5, 'house'],
  [-106, -88, 67, 94, 'house'], [-56, -34, 69, 96, 'house'],
  [-10, 12, 69, 95, 'house'], [25, 47, 62, 91, 'house'], [72, 101, 65, 94, 'house'],
];

// These are neighbourhood parcels, not individual 30-metre houses. Split
// them into domestic rooms with real lanes; render and collision share them.
export const BUILDINGS = HOUSE_BLOCKS.flatMap(([x0, x1, z0, z1]) => {
  const columns = Math.max(1, Math.ceil((x1 - x0) / 11));
  const rows = Math.max(1, Math.ceil((z1 - z0) / 12));
  const width = (x1 - x0) / columns, depth = (z1 - z0) / rows;
  return Array.from({ length: columns * rows }, (_, i) => {
    const x = x0 + (i % columns) * width, z = z0 + Math.floor(i / columns) * depth;
    return [x, x + width - 1.1, z, z + depth - 1.1, 'house'];
  });
});

export const TEMPLE_COURT = [16, 92, -66, 8];
export const TEMPLE_STAIRS = [42, 56, 8, 24];
export const UPPER_ROOM = [-56, -44, 20, 30.8];
export const UPPER_STAIRS = [-61, -56, 23.6, 40];
export const UPPER_LANDING = [-61, -56, 20, 23.6];
// The west doorway meets the stair landing. Window sills are solid to a walker.
export const UPPER_DOOR = [-56, -55.55, 20.4, 22.8];
export const UPPER_WALLS = [
  [-56, -44, 20, 20.45, 'upper-room'],
  [-56, -44, 30.35, 30.8, 'upper-room'],
  [-44.45, -44, 20.45, 30.35, 'upper-room'],
  [-56, -55.55, 20, 20.4, 'upper-room'],
  [-56, -55.55, 22.8, 30.35, 'upper-room'],
];
export const PORTICO_COLUMNS = [-62, 5].flatMap((z) =>
  Array.from({ length: 18 }, (_, i) => 20 + i * 4)
    .filter((x) => z !== 5 || x < 40 || x > 60).map((x) => [x, z]));
export const UPPER_COLUMNS = [-55.7, -44.3].flatMap((x) => [20.3, 30.5].map((z) => [x, z]));
export const TOWERS = [[-112, -104], [112, -104], [-112, 104], [112, 104],
  [112, 17], [112, 39], [-112, 17], [-112, 39]]
  .map(([x, z]) => [x - 3.2, x + 3.2, z - 3.2, z + 3.2, 'city-wall']);

export const SPECIAL_BUILDINGS = [
  // Courtyard buildings are wings around an OPEN event space.
  [-80, -60, 45, 49, 'high-priest-house'],
  [-80, -77, 49, 65, 'high-priest-house'],
  [-61, -58, 49, 65, 'high-priest-house'],
  [-45, -20, -88, -81, 'praetorium'],
  [-49, -45, -81, -60, 'praetorium'],
  [-22, -18, -81, -60, 'praetorium'],
  [52, 72, -56, -36, 'temple-platform'],
];

export const TOMB_WALLS = [
  [-174, -171.6, -82, -76.4, 'tomb'],
  [-170.4, -168, -82, -76.4, 'tomb'],
  [-174, -168, -82, -81.5, 'tomb'],
];

export const WALL_RECTS = [
  [-114, -110, -104, 18, 'city-wall'], [-114, -110, 38, 104, 'city-wall'],
  [110, 114, -104, 18, 'city-wall'], [110, 114, 38, 104, 'city-wall'],
  [-112, -42, -108, -104, 'city-wall'], [-22, 112, -108, -104, 'city-wall'],
  [-112, -42, 104, 108, 'city-wall'], [-22, 112, 104, 108, 'city-wall'],
];
