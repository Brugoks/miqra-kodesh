// Stable actor placement definitions and crowd fallback suppression mapping for biblical scenes.
// Links individual historical characters to spatial coordinates, routes, activities,
// and procedural crowd fallback identities.

import { LEVEL } from './capernaumDimensions.js';

export const SCENE_HUMAN_PLACEMENTS = {
  capernaum: [
    {
      id: 'cap-actor-fisherman',
      variantId: 'galilee-fisherman-a',
      position: [2.0, LEVEL.beach, -18.0],
      facing: -0.4,
      activity: 'working',
      fallbackCrowd: 'villagers',
      fallbackIndex: 0,
      fallbackId: 'villager-shore-net-0',
      // Reuse the locally hosted CC0 basket already shipped with Capernaum.
      // Hip mounting keeps it stable while the generic work gesture moves the
      // hands; a future net-mending clip can promote it to a hand interaction.
      props: [
        { modelId: 'prop-basket', socket: 'hip', position: [0.18, -0.42, 0.08], rotation: [0, 0, 0.12], scale: 0.82 },
      ],
    },
    {
      id: 'cap-actor-grinder',
      variantId: 'galilee-grinder-a',
      position: [18.2, LEVEL.ground, 22.0],
      facing: Math.PI * 0.7,
      activity: 'working',
      fallbackCrowd: 'villagers',
      fallbackIndex: 1,
      fallbackId: 'villager-courtyard-grind-0',
      // No pretend hand prop: the scene does not ship a mill handle asset yet.
      props: [],
    },
    {
      id: 'cap-actor-carrier',
      variantId: 'galilee-carrier-a',
      position: [12.0, LEVEL.ground, 28.0],
      facing: -Math.PI * 0.5,
      activity: 'walking',
      route: [[12.0, 32.0], [12.0, 12.0]],
      speed: 0.95, // m/s — carrying pottery, not sprinting the lane

      fallbackCrowd: 'walkers',
      fallbackIndex: 0,
      fallbackId: 'walker-north-lane-0',
      // The jar is a real locally hosted CC0 GLB from the Capernaum prop group.
      props: [
        { modelId: 'prop-galilean-jar', socket: 'rightGrip', position: [0, -0.28, 0.04], scale: 1 },
      ],
    },
  ],

  caesarea: [
    {
      id: 'cae-actor-merchant',
      variantId: 'caesarea-merchant-a',
      position: [25.0, 1.2, 40.0],
      facing: 0.2,
      activity: 'talking',
      fallbackCrowd: 'merchants',
      fallbackIndex: 0,
      fallbackId: 'cae-crowd-merchant-0',
    },
  ],

  'second-temple': [
    {
      id: 'temple-actor-pilgrim',
      variantId: 'temple-pilgrim-a',
      position: [0.0, 0.0, -25.0],
      facing: 0.0,
      activity: 'praying',
      fallbackCrowd: 'worshippers',
      fallbackIndex: 0,
      fallbackId: 'temple-crowd-pilgrim-0',
    },
  ],

  tabernacle: [
    {
      id: 'tab-actor-dweller',
      variantId: 'tabernacle-camp-dweller-a',
      position: [15.0, 0.0, -10.0],
      facing: -1.2,
      activity: 'working',
      fallbackCrowd: 'encampment',
      fallbackIndex: 0,
      fallbackId: 'tab-crowd-dweller-0',
    },
  ],
};
