import { ELAH_CHARACTER_ASSETS } from './elahCharacterAssets.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { addHumanAssetGroups } from './sceneHumanManifest.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';

// Declarative asset manifest for immersive 3D scenes in miqra-kodesh.
// Content-addressed and verified by scripts/validate-scene-assets.js.

export const SCENE_ASSET_MANIFEST = {
  capernaum: {
    groups: {
      props: {
        id: 'capernaum-props',
        priority: 3,
        models: ['prop-galilean-jar', 'prop-basket', 'prop-fish-net', 'prop-stone-anchor'],
      },
      actors: {
        id: 'capernaum-actors',
        priority: 1,
        models: HUMAN_MODEL_ASSETS.map((model) => model.id),
      },
    },
    // The four PBR texture sets that used to load first here had pure-black
    // diffuse maps and were applied to nothing; the basalt, earth, timber and
    // reed surfaces are shaders in buildCapernaum.js. The doorway, Ginosar-boat
    // and Galilee-ridge models went with them: the doorway was unused, the boat
    // was malformed and replaced a better procedural one, and the ridge hid the
    // horizon. The landscape and boats are now built procedurally.
    materials: [],
    models: [
      {
        id: 'prop-galilean-jar',
        url: '/assets/scenes/capernaum/models/jar-85d866df.glb',
        size: 14676,
        hash: '85d866df',
        source: 'CAP-PROP-POTTERY-01',
        license: 'CC0',
      },
      {
        id: 'prop-basket',
        url: '/assets/scenes/capernaum/models/basket-60af0c09.glb',
        size: 9844,
        hash: '60af0c09',
        source: 'CAP-PROP-BASKET-01',
        license: 'CC0',
      },
      {
        id: 'prop-fish-net',
        url: '/assets/scenes/capernaum/models/fish-net-e645e1a9.glb',
        size: 16584,
        hash: 'e645e1a9',
        source: 'CAP-FISH-NETS-01',
        license: 'CC0',
      },
      {
        id: 'prop-stone-anchor',
        url: '/assets/scenes/capernaum/models/stone-anchor-089bc55a.glb',
        size: 7080,
        hash: '089bc55a',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC0',
      },
    ],
  },
  shared: {
    audio: [
      {
        id: 'snd-galilee-water-lap',
        url: '/assets/scenes/capernaum/audio/water-lap-c8ed8717.ogg',
        size: 35400,
        hash: 'c8ed8717',
        type: 'loop',
        source: 'CAP-GEO-SHORE-01',
        license: 'CC0',
      },
      {
        id: 'snd-reeds-breeze',
        url: '/assets/scenes/capernaum/audio/reeds-breeze-76098d6c.ogg',
        size: 46039,
        hash: '76098d6c',
        type: 'loop',
        source: 'CAP-GEO-SHORE-01',
        license: 'CC0',
      },
      {
        id: 'snd-timber-creak',
        url: '/assets/scenes/capernaum/audio/timber-creak-be4490df.ogg',
        size: 6504,
        hash: 'be4490df',
        type: 'loop',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC0',
      },
      {
        id: 'snd-step-stone',
        url: '/assets/scenes/shared/audio/step-stone-24cc9ef2.ogg',
        size: 5513,
        hash: '24cc9ef2',
        type: 'step',
        surface: 'stone',
        license: 'CC0',
      },
      {
        id: 'snd-step-earth',
        url: '/assets/scenes/shared/audio/step-earth-787d73dd.ogg',
        size: 5529,
        hash: '787d73dd',
        type: 'step',
        surface: 'earth',
        license: 'CC0',
      },
      {
        id: 'snd-step-sand',
        url: '/assets/scenes/shared/audio/step-sand-b7194fde.ogg',
        size: 5658,
        hash: 'b7194fde',
        type: 'step',
        surface: 'sand',
        license: 'CC0',
      },
    ],
  },
};

// One shared, locally hosted character library for every scene entry point.
// Replace the earlier static actor assemblies rather than downloading both.
addHumanAssetGroups(SCENE_ASSET_MANIFEST, HUMAN_MODEL_ASSETS);

// Principal cast assets are local to Capernaum; other scenes reuse only the
// ambient library. Include this after shared groups are assembled.
SCENE_ASSET_MANIFEST.capernaum.models.push(...TABLEAU_MODEL_ASSETS);
SCENE_ASSET_MANIFEST.capernaum.groups.actors.models.push(...TABLEAU_MODEL_ASSETS.map((model) => model.id));
// The one female model the project ships, for the village's women: the crowd
// draws every woman with it (sceneInstancedHumans.js), veiled.
{
  const woman = TABERNACLE_CHARACTER_ASSETS.find((asset) => asset.id === 'human-tabernacle-camp-woman');
  if (woman) {
    SCENE_ASSET_MANIFEST.capernaum.models.push(woman);
    SCENE_ASSET_MANIFEST.capernaum.groups.actors.models.push(woman.id);
  }
}

// Dedicated Elah principals do not download the shared village cast.
SCENE_ASSET_MANIFEST['valley-of-elah'] = {
  groups: { principals: { id: 'elah-principals', priority: 1, models: ELAH_CHARACTER_ASSETS.map((asset) => asset.id) } },
  models: ELAH_CHARACTER_ASSETS, materials: [], textures: [], audio: [],
};
