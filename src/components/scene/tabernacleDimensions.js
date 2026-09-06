// The plan of the Tabernacle, as pitched at Sinai (Exodus 40).
//
// This is the one structure in Scripture that does not need guessing at. Exodus
// 25-27 gives the instructions and 36-38 records them being carried out, twice
// over, in cubits — so nearly every number below is quoted rather than
// reconstructed, and the file says which is which. Where the text is silent or
// disputed (the shape of the roof, the exact count of the court pillars, the
// identity of the outermost skins) the comment says so and the scene says so on
// screen. That honesty is most of the reason this site is worth building.
//
// Axes: -Z west, toward the Most Holy Place. +Z east, the way in — the
// tabernacle faced east, like the temple, and this scene keeps the temple's
// convention so both sanctuaries read the same way. +X north, -X south, +Y up.
//
// A cubit is taken as 0.5m, the convention the other scenes use. Estimates for
// the common cubit run from about 0.44m to 0.53m, so the whole scene is within
// a few percent of any of them.

export const CUBIT = 0.5;
const c = (cubits) => cubits * CUBIT;

export const EYE_HEIGHT = 1.7;

// Everything stands on the desert floor. Unlike Capernaum there are no stacked
// surfaces here: the interest is in the thresholds, not the levels.
export const LEVEL = { ground: 0 };

// --- the court (Exodus 27:9-19) -------------------------------------------
// A hundred cubits by fifty, hangings of fine twined linen five cubits high.

export const COURT = {
  halfX: c(25), // 50 cubits across, north to south
  zWest: -c(50),
  zEast: c(50), // 100 cubits long, east to west
  height: c(5), // the hangings
  postHeight: c(5) + 0.32, // capitals and hooks stand a little proud
  postSpacing: c(5),
  postRadius: 0.11,
};

// The gate: twenty cubits of embroidered screen in the middle of the east end,
// with fifteen cubits of plain hanging either side (27:14-16).
export const COURT_GATE = { halfX: c(10), z: COURT.zEast };

// --- the tabernacle itself (Exodus 26) ------------------------------------
// Boards ten cubits high and a cubit and a half wide: twenty a side, and eight
// across the west end. Thirty cubits long, ten wide, ten high.

export const TENT = {
  halfX: c(5), // 10 cubits wide
  zWest: -c(30),
  zEast: 0, // 30 cubits long, set 20 cubits in from the west end of the court
  height: c(10),
  boardWidth: c(1.5),
  boardThickness: 0.16,
};

// The veil hangs ten cubits from the west end, making the Most Holy Place a
// perfect ten-cubit cube (26:33).
export const VEIL_Z = TENT.zWest + c(10);

// The screen at the door of the tent, on five pillars (26:36-37).
export const TENT_DOOR = { z: TENT.zEast, halfX: c(5) };

// The four coverings, innermost first (26:1-14). Their edges are visible where
// they overlap at the eaves, which is the only place the layering can be seen —
// so the thicknesses here are for drawing that edge, not from the text.
export const COVERINGS = [
  { id: 'linen', thickness: 0.05, colour: 0xe8e2d2 }, // fine twined linen with cherubim
  { id: 'goats-hair', thickness: 0.07, colour: 0x6c6152 },
  { id: 'rams-skins', thickness: 0.06, colour: 0x8f3f34 }, // dyed red
  { id: 'outer-skins', thickness: 0.06, colour: 0x4f4740 }, // tachash: the word is uncertain
];

// --- furniture ------------------------------------------------------------

// Bronze altar: five cubits square, three high, horns at the corners (27:1-2).
export const BRONZE_ALTAR = { x: 0, z: c(20), half: c(2.5), height: c(3) };

// The laver stood between the tent and the altar (30:18). Scripture gives it no
// dimensions at all, so this size is invented and the scene says so.
export const LAVER = { x: 0, z: c(8), radius: 0.62, height: 1.05 };

// Inside the Holy Place. The table on the north side, the lampstand opposite it
// on the south, the altar of incense before the veil (26:35, 30:6).
export const TABLE = { x: c(3), z: VEIL_Z + c(6), width: c(2), depth: c(1), height: c(1.5) };
export const LAMPSTAND = { x: -c(3), z: VEIL_Z + c(6), height: c(3.4) };
export const INCENSE_ALTAR = { x: 0, z: VEIL_Z + c(2), half: c(0.5), height: c(2) };

// Behind the veil, and therefore never seen. It is built anyway: the room is
// dark and stays dark, which is the point of it.
export const ARK = {
  x: 0,
  z: TENT.zWest + c(5),
  length: c(2.5),
  width: c(1.5),
  height: c(1.5),
};

// --- the camp (Numbers 2) -------------------------------------------------
// Three tribes to each quarter, at a distance, with the Levites between them
// and the tent. Positions are illustrative; the text gives an order, not a map.

export const CAMP = [
  { id: 'east', standard: 'Judah', x: 0, z: c(150), spread: c(90) },
  { id: 'south', standard: 'Reuben', x: -c(150), z: 0, spread: c(90) },
  { id: 'west', standard: 'Ephraim', x: 0, z: -c(150), spread: c(90) },
  { id: 'north', standard: 'Dan', x: c(150), z: 0, spread: c(90) },
];

// How far out the desert floor runs before the walk stops.
export const DESERT = { halfX: c(210), zNorth: c(210), zSouth: -c(210) };

// The tents of the camp, generated once and shared by the geometry and the
// collision, so the tents you can see are the tents you walk round. Numbers 2
// gives an order of march and a direction for each standard, not a plan, so the
// arrangement is illustrative — but a camp with nothing in it would say
// something false about how many people were out here.
export function campTents() {
  let state = 40340219;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const tents = [];
  for (const quarter of CAMP) {
    for (let i = 0; i < 26; i += 1) {
      const alongX = quarter.id === 'north' || quarter.id === 'south';
      const drift = (random() - 0.5) * quarter.spread * 2;
      const depth = (random() - 0.5) * quarter.spread * 0.8;
      tents.push({
        id: quarter.id,
        x: quarter.x + (alongX ? depth : drift),
        z: quarter.z + (alongX ? drift : depth),
        radius: 2.4 + random() * 1.4,
        rotation: random() * Math.PI,
      });
    }
  }
  return tents;
}
