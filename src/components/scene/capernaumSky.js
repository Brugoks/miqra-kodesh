// The air over Capernaum: clouds, haze, mist on the water, smoke from the
// village's fires, dust in the sunbeam, and the sky's own light on everything.
//
// sceneLighting.js owns the sky dome and the sun for every scene and is not
// touched here. This module layers on what one lakeside village at one season
// needs, reading the dome's live uniforms so that changing the hour changes
// all of it at once:
//
//   Clouds. Late spring on the Kinneret is mostly fair: a scatter of cumulus
//   building over the Golan and the hills by day, a little high cirrus, pink
//   and gold underneath at the ends of the day. One draw, fbm in the fragment
//   shader, drifting with the land breeze.
//
//   Haze. The fog colour is derived from the sky's own horizon colour, so the
//   distance dissolves into the sky rather than into a separately chosen
//   brown that sat a quarter darker than it. It is also thinner than the
//   shared default: the far hills carry their own aerial perspective now (see
//   capernaumLandscape.js), and scene fog that thick would swallow them.
//
//   Mist. At dawn the lake breathes a thin mist that lies on the water and
//   burns off through the morning.
//
//   Smoke. A village that bakes its bread at first light sends up smoke from
//   every courtyard oven, and it leans out over the water on the morning land
//   breeze. Built in the vertex shader from time alone: nothing per particle
//   is touched on the CPU.
//
//   Light. A small environment map baked from the same sky, so dark basalt,
//   water jars and timber pick up the sky's colour in their shade and a little
//   of its sheen, instead of reading as matte plastic.
//
// The machinery is sceneAir.js; this module is what is particular to the
// lake. three.js is passed in, so the module stays importable in jsdom.

import { WIND } from './capernaumWeather.js';
import { createSceneAir, makeFogFor } from './sceneAir.js';
import { ROOF_OPENING, LEVEL } from './capernaumDimensions.js';

// Per hour: cloud cover and how hazy the air is. Densities are FogExp2's.
export const WEATHER = {
  dawn: { cover: 0.36, fog: 0.0011, mist: 1, smoke: 1 },
  morning: { cover: 0.3, fog: 0.0007, mist: 0.45, smoke: 0.75 },
  noon: { cover: 0.24, fog: 0.0006, mist: 0, smoke: 0.35 },
  dusk: { cover: 0.42, fog: 0.0009, mist: 0.1, smoke: 1 },
  night: { cover: 0.2, fog: 0.0008, mist: 0.25, smoke: 0.55 },
};
// The haze's colour in linear RGB: the sky just above the horizon.
export const fogFor = makeFogFor(WEATHER);

// Where the village's fires are: the courtyard ovens and hearths, and a fire
// on the beach where the night's catch is being cooked. Heights are the
// ground the fire stands on.
export const SMOKE_SOURCES = [
  { x: -12, y: 0.9, z: 26, strength: 1 }, // tabun in the yard west of the synagogue lane
  { x: -2, y: 0.9, z: 34, strength: 0.9 }, // tabun north of the lane crossing
  { x: 27, y: 0.4, z: 18, strength: 0.8 }, // the insula courtyard hearth
  { x: 16, y: 1.5, z: 47, strength: 0.7 }, // a court inside the north block
  { x: 49, y: 1.5, z: 11, strength: 0.7 }, // a court inside the east block
  { x: -13, y: 1.5, z: 12, strength: 0.6 }, // a court inside the west block
  { x: -24, y: -0.4, z: -15.5, strength: 0.8 }, // the fishermen's fire on the beach
];

export function createCapernaumSky(THREE, ctx = {}) {
  return createSceneAir(THREE, {
    name: 'capernaum-sky',
    names: { smoke: 'village-smoke', mist: 'lake-mist', motes: 'house-motes' },
    weather: WEATHER,
    wind: WIND,
    // Cumulus builds over land — the hills to the north, the Golan east —
    // more than over the open water south and south-west.
    land: { x: 0.6, z: 0.8 },
    smokeSources: SMOKE_SOURCES,
    // Mist on the lake, a little way out from the beach.
    mist: { level: LEVEL.lake, heights: [0.2, 0.9, 1.8], heightsLow: [0.25], centre: [0, -519], size: [1800, 1000], shoreZ: -19, reach: [0, 0, 300] },
    // Dust turning in the sunbeam through the hole in the roof.
    motes: {
      centre: [(ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2 - 0.9, LEVEL.ground + 0.2, (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2 + 0.6],
      spread: [3.2, 2.9, 2.8],
    },
    ...ctx,
  });
}
