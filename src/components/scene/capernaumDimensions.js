// The plan of Capernaum, c. AD 28 — the lakeside village where Jesus based
// his Galilean ministry. Both the geometry (buildCapernaum.js) and the
// collision model (capernaumNavigation.js) read from here, so what is drawn
// and what is solid cannot drift apart.
//
// Axes: +Z north, inland toward the hills. -Z south, to the lake. +X east.
// +Y up. Metres. Ground level in the village is y = 0.
//
// On the archaeology. Capernaum was built almost entirely of local black
// basalt: unworked fieldstone walls, mud mortar, and roofs of beams, brushwood
// and packed earth — which is precisely why four men could dig through one
// (Mark 2:4). Houses were grouped into insulae, blocks of small rooms sharing
// open courtyards, reached by narrow lanes. There was no grand public
// architecture; the synagogue was the one substantial building.
//
// The white limestone synagogue every photograph shows is fourth or fifth
// century. It stands directly on the black basalt foundation of the earlier
// one, and that basalt is what this scene builds — a plainer, darker hall than
// the postcard, which is the point. The scene says so on screen.
//
// Scale is honest but compact: the excavated village core runs a few hundred
// metres along the shore, and this reconstruction takes the part of it the
// gospels actually happen in rather than surveying the whole site.

export const EYE_HEIGHT = 1.7;

// Walkable heights. A village on a shore has more of these than either earlier
// scene had: you go down to the water, up onto the synagogue platform, and —
// the reason this site was chosen — up onto a roof and back down into a room.
export const LEVEL = {
  lake: -1.15, // the water surface, not walkable
  beach: -0.55,
  ground: 0, // promenade, lanes, courtyards, house interiors
  platform: 0.9, // the synagogue stands on a low basalt podium
  roof: 3.3, // the roofs of the insula
};

export const SHORE = {
  // The lake fills everything south of the beach.
  beachSouth: -19,
  beachNorth: -13.2,
  rampNorth: -11.6, // beach ramps up to the promenade across this strip
  promenadeNorth: -6,
};

export const VILLAGE = { halfX: 62, zSouth: SHORE.beachSouth, zNorth: 74 };

// The insula containing the room the gospels keep returning to: Peter's house,
// where the fever leaves Simon's mother-in-law, where the whole town gathers at
// the door after sundown, and where the roof comes off.
export const INSULA = { x0: 10, x1: 32, z0: 6, z1: 28 };

// The room itself, ~7 x 6.5m, entered from the courtyard on its north side.
export const HOUSE = {
  x0: 12,
  x1: 19,
  z0: 9,
  z1: 15.5,
  wall: 0.6,
  doorX0: 14.4,
  doorX1: 16.8,
};

// The open court the insula's rooms are arranged around — where the cooking
// and the work happened, and where the crowd stood when the whole town came to
// the door after sundown. Open to the sky, so no roof passes over it.
export const COURTYARD = { x0: 12, x1: 30, z0: 16.5, z1: 26 };

// The passage from the lane into the courtyard, on the north side.
export const COURTYARD_ENTRY = { x0: 20, x1: 24 };

// The hole in the roof. Big enough to lower a man through on a mat, which is
// the only dimension that matters.
export const ROOF_OPENING = { x0: 14.5, x1: 17.5, z0: 11, z1: 14 };

// The outside stair up the east wall — how anyone got onto a roof, and how the
// four men got up there carrying a fifth. It reaches back over the wall line so
// the top of the flight and the roof are genuinely the same surface; without
// that overlap there is a 20cm gap at the top that nothing can cross.
export const ROOF_STAIR = { x0: 31.4, x1: 34.8, zBottom: 22, zTop: 10 };

export const SYNAGOGUE = {
  x0: -28,
  x1: -10,
  z0: 31,
  z1: 45,
  wall: 1.5,
  doorX0: -20.2,
  doorX1: -17.6,
  // The podium it stands on, and the steps up to it from the south.
  podiumX0: -30,
  podiumX1: -8,
  podiumZ0: 30,
  podiumZ1: 46.5,
  stepsZ0: 26.8,
  stepsZ1: 30,
};

// The other blocks of the village. Solid — they give the lanes their shape and
// the place its density, but only the two buildings above can be entered.
export const BLOCKS = [
  { id: 'insula-west', x0: -22, x1: -4, z0: 2, z1: 22, height: 3.3 },
  { id: 'insula-north', x0: 6, x1: 26, z0: 38, z1: 56, height: 3.3 },
  { id: 'insula-far-north', x0: 34, x1: 54, z0: 30, z1: 48, height: 3.1 },
  { id: 'insula-east', x0: 40, x1: 58, z0: 2, z1: 20, height: 3.3 },
  { id: 'insula-shore-west', x0: -46, x1: -28, z0: -2, z1: 14, height: 3.1 },
  { id: 'insula-shore-east', x0: 40, x1: 56, z0: -4, z1: 4, height: 3.0 },
  { id: 'store-west', x0: -40, x1: -30, z0: 22, z1: 32, height: 2.8 },
];

// The customs post on the Via Maris, which ran along this shore. Capernaum sat
// on the border of Herod Antipas's territory, which is why there was a tax
// booth here at all, and why Matthew was sitting at it.
export const TAX_BOOTH = { x0: -60, x1: -50, z0: -5, z1: 1, height: 2.6 };

// Boats drawn up on the beach, and one at anchor. The proportions follow the
// first-century hull found in the lake mud at Ginosar in 1986: 8.2m by 2.3m.
export const BOATS = [
  { id: 'boat-beach-a', x: -8, z: -16.4, rotation: 0.22, beached: true },
  { id: 'boat-beach-b', x: 14, z: -17.1, rotation: -0.3, beached: true },
  { id: 'boat-anchored', x: 34, z: -30, rotation: 0.6, beached: false },
];

// Fishing gear on the promenade: net frames, stone anchors, baskets. Small
// enough to walk round, solid enough to be worth walking round.
export const QUAYSIDE = [
  { id: 'nets-a', x: -20, z: -8.5, w: 5, d: 2.2, h: 1.5 },
  { id: 'nets-b', x: 4, z: -8.8, w: 4.4, d: 2, h: 1.4 },
  { id: 'baskets', x: 24, z: -8.2, w: 2.4, d: 2.4, h: 0.9 },
  { id: 'anchors', x: -34, z: -9, w: 2.2, d: 1.8, h: 0.7 },
];

// Millstones, ovens and storage jars in the courtyards — the furniture of a
// village, and the thing that makes a lane feel lived in rather than swept.
export const YARD_THINGS = [
  { x: 22, z: 20, radius: 0.9, id: 'millstone' },
  { x: -12, z: 26, radius: 1.1, id: 'oven' },
  { x: 36, z: 24, radius: 0.8, id: 'jars' },
  { x: -2, z: 34, radius: 1.0, id: 'oven' },
  { x: 30, z: 60, radius: 0.9, id: 'millstone' },
];

// Palms and a fig, for shade and for silhouette against the water.
export const TREES = [
  { x: -26, z: -3, kind: 'palm' },
  { x: 30, z: 34, kind: 'palm' },
  { x: -6, z: 48, kind: 'palm' },
  { x: 36, z: -6, kind: 'fig' },
  { x: -38, z: 40, kind: 'fig' },
];
