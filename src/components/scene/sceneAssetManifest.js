import { SCENE_AUDIO_ASSETS } from './sceneAudioManifest.js';
import { ELAH_CHARACTER_ASSETS } from './elahCharacterAssets.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { addHumanAssetGroups } from './sceneHumanManifest.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { BETHLEHEM_MATERIAL_ASSETS } from './bethlehemMaterialAssets.js';
import { SCENE_MATERIAL_ASSETS } from './sceneMaterialAssets.js';

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
    // horizon. The landscape and boats are now built procedurally. The scanned
    // surfaces that sit under those shaders are added at the foot of this file
    // (sceneMaterialAssets.js) and were checked, this time, to be real colour.
    materials: [],
    models: [
      {
        id: 'prop-galilean-jar',
        // The Phase 1 pilot for compressed models: meshopt, lossless (float32
        // kept), made by scripts/optimize-scene-glb.mjs. The original file is the
        // explicit fallback, fetched only if this one fails to load or decode.
        url: '/assets/scenes/capernaum/models/jar-155276fb.glb',
        size: 12356,
        hash: '155276fb',
        compression: 'meshopt',
        fallback: '/assets/scenes/capernaum/models/jar-85d866df.glb',
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
    audio: SCENE_AUDIO_ASSETS,
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

// Identity presets: more faces, ages and builds for the crowd, Capernaum first (the pilot). They are in the
// actors group, so they arrive with the people and a person whose preset has not loaded wears the body it is a
// variation on (sceneHumanManifest.js FALLBACK_MODEL). A scene opts in by having a pool in PRESET_POOLS too.
SCENE_ASSET_MANIFEST.capernaum.models.push(...HUMAN_PRESET_ASSETS);
SCENE_ASSET_MANIFEST.capernaum.groups.actors.models.push(...HUMAN_PRESET_ASSETS.map((model) => model.id));

// The Temple's staged events (templeEvents.js) need Jesus and, for Mary,
// Anna, the widow and the woman brought to him, the one female model.
{
  const jesus = TABLEAU_MODEL_ASSETS.find((asset) => asset.id === 'human-jesus');
  const woman = TABERNACLE_CHARACTER_ASSETS.find((asset) => asset.id === 'human-tabernacle-camp-woman');
  for (const asset of [jesus, woman].filter(Boolean)) {
    SCENE_ASSET_MANIFEST['second-temple'].models.push(asset);
    SCENE_ASSET_MANIFEST['second-temple'].groups.actors.models.push(asset.id);
  }
}

// The Mount of Olives: the shared character library for its pilgrims and
// camps, and — as at the Temple — Jesus and the one female model for its
// staged moments (olivetEvents.js).
{
  const jesus = TABLEAU_MODEL_ASSETS.find((asset) => asset.id === 'human-jesus');
  const woman = TABERNACLE_CHARACTER_ASSETS.find((asset) => asset.id === 'human-tabernacle-camp-woman');
  SCENE_ASSET_MANIFEST['mount-of-olives'] = {
    groups: { actors: { id: 'mount-of-olives-actors', priority: 2, models: [] } },
    models: [], materials: [], textures: [], audio: [],
  };
  for (const asset of [...HUMAN_MODEL_ASSETS, jesus, woman].filter(Boolean)) {
    SCENE_ASSET_MANIFEST['mount-of-olives'].models.push(asset);
    SCENE_ASSET_MANIFEST['mount-of-olives'].groups.actors.models.push(asset.id);
  }
}

// Dedicated Elah principals do not download the shared village cast.
SCENE_ASSET_MANIFEST['valley-of-elah'] = {
  groups: { principals: { id: 'elah-principals', priority: 1, models: ELAH_CHARACTER_ASSETS.map((asset) => asset.id) } },
  models: ELAH_CHARACTER_ASSETS, materials: [], textures: [], audio: [],
};

// Bethlehem reuses the shared adult cast and the existing female rig for Mary.
{
  const woman = TABERNACLE_CHARACTER_ASSETS.find((asset) => asset.id === 'human-tabernacle-camp-woman');
  const models = [...HUMAN_MODEL_ASSETS, woman].filter(Boolean);
  SCENE_ASSET_MANIFEST.bethlehem = {
    groups: {
      surfaces: { id: 'bethlehem-surfaces', priority: 0, materials: BETHLEHEM_MATERIAL_ASSETS.map((asset) => asset.id) },
      actors: { id: 'bethlehem-actors', priority: 1, models: models.map((asset) => asset.id) },
    },
    models, materials: BETHLEHEM_MATERIAL_ASSETS, textures: [], audio: [],
  };
}

// Sinai shares the wilderness-period robes and priestly garments.
{
  const models = TABERNACLE_CHARACTER_ASSETS.filter((asset) =>
    ['human-tabernacle-camp-man', 'human-tabernacle-camp-woman', 'human-tabernacle-high-priest'].includes(asset.id),
  );
  models.push(HUMAN_MODEL_ASSETS.find(asset => asset.id === 'human-traveler'));
  SCENE_ASSET_MANIFEST.sinai = {
    groups: { actors: { id: 'sinai-actors', priority: 1, models: models.map((asset) => asset.id) } },
    models, materials: [], textures: [], audio: [],
  };
}

// Scanned surfaces (Poly Haven, CC0), first in every scene's queue: they are
// what the walls, ground and rock are wearing, so they should be down before
// the people. Each builder's `applyAssets` binds them (sceneSurfaces.js); a
// scene whose scans fail to load simply keeps its procedural surfaces.
for (const [slug, materials] of Object.entries(SCENE_MATERIAL_ASSETS)) {
  const entry = SCENE_ASSET_MANIFEST[slug];
  entry.materials = materials;
  entry.groups.surfaces = { id: `${slug}-surfaces`, priority: 0, materials: materials.map((asset) => asset.id) };
}
