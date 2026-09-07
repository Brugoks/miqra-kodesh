import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { addHumanAssetGroups } from './sceneHumanManifest.js';

// Declarative asset manifest for immersive 3D scenes in miqra-kodesh.
// Content-addressed and verified by scripts/validate-scene-assets.js.

export const SCENE_ASSET_MANIFEST = {
  capernaum: {
    groups: {
      core: {
        id: 'capernaum-core',
        priority: 1,
        materials: ['mat-basalt-stone', 'mat-packed-earth', 'mat-timber', 'mat-thatch'],
        models: ['model-doorway'],
      },
      boat: {
        id: 'capernaum-boat',
        priority: 2,
        models: ['model-ginosar-boat'],
      },
      props: {
        id: 'capernaum-props',
        priority: 3,
        models: ['prop-galilean-jar', 'prop-basket', 'prop-fish-net', 'prop-stone-anchor'],
      },
      terrain: {
        id: 'capernaum-terrain',
        priority: 4,
        models: ['model-galilee-ridge'],
      },
      actors: {
        id: 'capernaum-actors',
        priority: 1,
        models: HUMAN_MODEL_ASSETS.map((model) => model.id),
      },
    },
    materials: [
      {
        id: 'mat-basalt-stone',
        type: 'texture-set',
        scale: [2.0, 2.0],
        maps: {
          "diffuse": "/assets/scenes/capernaum/materials/basalt-diffuse-386916ab.png",
          "normal": "/assets/scenes/capernaum/materials/basalt-normal-618b9b1e.png",
          "roughness": "/assets/scenes/capernaum/materials/basalt-roughness-ae99af68.png",
          "ao": "/assets/scenes/capernaum/materials/basalt-ao-76d99ef6.png"
},
        source: 'CAP-ARCH-BASALT-01',
        license: 'CC0',
      },
      {
        id: 'mat-packed-earth',
        type: 'texture-set',
        scale: [3.0, 3.0],
        maps: {
          "diffuse": "/assets/scenes/capernaum/materials/earth-diffuse-441c6d08.png",
          "normal": "/assets/scenes/capernaum/materials/earth-normal-3799f871.png",
          "roughness": "/assets/scenes/capernaum/materials/earth-roughness-bbd365df.png",
          "ao": "/assets/scenes/capernaum/materials/earth-ao-3d17cc2c.png"
},
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
      {
        id: 'mat-timber',
        type: 'texture-set',
        scale: [1.0, 4.0],
        maps: {
          "diffuse": "/assets/scenes/capernaum/materials/timber-diffuse-6e52a4e2.png",
          "normal": "/assets/scenes/capernaum/materials/timber-normal-bfa4b894.png",
          "roughness": "/assets/scenes/capernaum/materials/timber-roughness-1b51f675.png",
          "ao": "/assets/scenes/capernaum/materials/timber-ao-565314c5.png"
},
        source: 'CAP-ARCH-ROOF-01',
        license: 'CC0',
      },
      {
        id: 'mat-thatch',
        type: 'texture-set',
        scale: [1.5, 1.5],
        maps: {
          "diffuse": "/assets/scenes/capernaum/materials/thatch-diffuse-51967dcf.png",
          "normal": "/assets/scenes/capernaum/materials/thatch-normal-d10dbc54.png",
          "roughness": "/assets/scenes/capernaum/materials/thatch-roughness-c01be42e.png",
          "ao": "/assets/scenes/capernaum/materials/thatch-ao-09662462.png"
},
        source: 'CAP-ARCH-ROOF-01',
        license: 'CC0',
      },
    ],
    models: [
      {
        id: 'model-doorway',
        url: '/assets/scenes/capernaum/models/doorway-bdb84a63.glb',
        size: 10388,
        hash: 'bdb84a63',
        source: 'CAP-ARCH-INSULA-01',
        license: 'CC0',
      },
      {
        id: 'model-ginosar-boat',
        url: '/assets/scenes/capernaum/models/ginosar-boat-4f628a4f.glb',
        size: 85148,
        hash: '4f628a4f',
        source: 'CAP-BOAT-GINOSAR-01',
        license: 'CC-BY-4.0',
      },
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
      {
        id: 'model-galilee-ridge',
        url: '/assets/scenes/capernaum/models/galilee-ridge-35568028.glb',
        size: 25524,
        hash: '35568028',
        source: 'CAP-GEO-RIDGE-01',
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
