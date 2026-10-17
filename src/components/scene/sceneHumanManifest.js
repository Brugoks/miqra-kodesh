// Actual contract of the shipped MakeHuman-derived GLBs. No fabricated facial
// morphs or role-specific work clips are advertised here. Socket names are
// semantic aliases onto real bones already present in every shipped rig.
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
export const RIG_DEFINITIONS = {
  'makehuman-mixamo-v1': {
    id: 'makehuman-mixamo-v1',
    boneNames: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand',
      'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']
      .map((name) => `mixamorig:${name}`),
    morphs: {},
    sockets: {
      leftGrip: { bone: 'mixamorig:LeftHand' },
      rightGrip: { bone: 'mixamorig:RightHand' },
      shoulderStrap: { bone: 'mixamorig:Spine2' },
      back: { bone: 'mixamorig:Spine2' },
      hip: { bone: 'mixamorig:Hips' },
      head: { bone: 'mixamorig:Head' },
    },
  },
};

const variant = (id, modelId) => ({
  id, modelId, rigId: 'makehuman-mixamo-v1',
  forwardAxis: '+Z', heightMeters: 1.70,
  // Names into the baked GLB clips — used only as a fallback when a rig
  // doesn't have the bones sceneHumanClips.js needs to author procedurally,
  // which every shipped character does. `talk`, `listen` and `carry` have no
  // baked equivalent (the baked clips predate those activities); the
  // fallback simply has nothing for them and idle is used instead.
  clips: { idle: 'idle', walk: 'walk', work: 'work', prayer: 'prayer', sit: 'sit', kneel: 'kneel' },
  morphs: {}, sockets: {},
  // Ankle-to-ankle stride distance for one full gait cycle. Tuned to what
  // the procedural walk cycle's authored hip/knee angles actually produce
  // against the real leg lengths (~0.65m per step) — not an arbitrary
  // number the animation then has to match.
  locomotion: { walkMetersPerCycle: 1.30 },
  sources: ['makehuman-system-cc0', 'wdg-mycenaean-tunic-cc0'],
});
// A grown person's height, what a figure's `scale` is a fraction of. A child preset is built at child
// proportions and its own height, so a figure's 0.6 means "a child 60% of an adult", not "this body at 0.6".
export const ADULT_HEIGHT = 1.70;

// Identity presets (scripts/humans/build_characters.py PRESETS): further bodies for the crowd, with their own
// faces, ages and builds. Who a preset is for, and the body a person wears if theirs never arrives.
const PRESET_ROLES = {
  'woman-young': { kind: 'woman', age: 'young' }, 'woman-adult': { kind: 'woman', age: 'adult' }, 'woman-elder': { kind: 'woman', age: 'elder' },
  'man-young': { kind: 'man', age: 'young' }, 'man-lean': { kind: 'man', age: 'adult' }, 'man-elder': { kind: 'man', age: 'elder' },
  'child-boy': { kind: 'child', age: 'any' }, 'child-girl': { kind: 'child', age: 'any' },
};
const FALLBACK_BODY = { woman: 'human-tabernacle-camp-woman', man: 'human-artisan', child: 'human-traveler' };
const presetVariants = Object.fromEntries(HUMAN_PRESET_ASSETS.map((asset) => {
  const key = asset.id.replace('human-', '');
  const id = `${key}-a`;
  const role = PRESET_ROLES[key];
  return [id, {
    ...variant(id, asset.id), ...role, preset: key, child: role.kind === 'child',
    // Its own measured height, and a stride that grows with the legs.
    heightMeters: asset.bodyHeightMeters,
    locomotion: { walkMetersPerCycle: 1.30 * (asset.bodyHeightMeters / ADULT_HEIGHT) },
    sources: ['makehuman-system-cc0', 'makehuman-targets-cc0', 'wdg-mycenaean-tunic-cc0'],
  }];
}));
// modelId -> the body that stands in for it when it is not among the loaded assets (a failed download).
export const FALLBACK_MODEL = Object.fromEntries(Object.values(presetVariants).map((v) => [v.modelId, FALLBACK_BODY[v.kind]]));

export const HUMAN_VARIANTS = {
  ...presetVariants,
  'galilee-fisherman-a': variant('galilee-fisherman-a', 'human-artisan'),
  'galilee-grinder-a': variant('galilee-grinder-a', 'human-villager'),
  'galilee-carrier-a': variant('galilee-carrier-a', 'human-traveler'),
  'caesarea-merchant-a': variant('caesarea-merchant-a', 'human-artisan'),
  'temple-pilgrim-a': variant('temple-pilgrim-a', 'human-traveler'),
  ...Object.fromEntries(TABERNACLE_CHARACTER_ASSETS.map((asset) => {
    const id = asset.id.replace('human-', '') + '-a';
    return [id, { ...variant(id, asset.id), heightMeters: asset.bodyHeightMeters,
      sources: ['makehuman-system-cc0', 'tabernacle-costumes-authored'] }];
  })),
};

export const CROWD_VARIANTS = ['galilee-fisherman-a', 'galilee-carrier-a', 'galilee-grinder-a'];

// Who a scene's people are drawn as, by sex and age, for the scenes that have identity presets. A scene
// without an entry here keeps CROWD_VARIANTS and its older rules (sceneHumanAppearance.js humanVariantId).
// The original bodies stay in the mix: the artisan is a man of about thirty-five, the traveler and the
// villager are about twenty, the camp woman is a grown woman.
export const PRESET_POOLS = {
  capernaum: {
    woman: { young: ['woman-young-a', 'galilee-grinder-a'], adult: ['tabernacle-camp-woman-a', 'woman-adult-a'], elder: ['woman-elder-a'] },
    man: { young: ['man-young-a', 'galilee-carrier-a'], adult: ['galilee-fisherman-a', 'man-lean-a'], elder: ['man-elder-a'] },
    child: { any: ['child-boy-a', 'child-girl-a'] },
  },
};
// How a person's age is drawn when their figure does not say: a village is mostly grown, and few live to old age.
export const AGE_WEIGHTS = [['young', 35], ['adult', 55], ['elder', 10]];

// Also called by the scenery generator so rebuilding terrain assets cannot
// silently revert the shared character library to static actor assemblies.
export function addHumanAssetGroups(manifest, humanAssets) {
  for (const slug of ['capernaum', 'caesarea', 'second-temple', 'tabernacle']) {
    const entry = manifest[slug] ||= { groups: {}, models: [], materials: [] };
    const assets = slug === 'tabernacle' ? TABERNACLE_CHARACTER_ASSETS : humanAssets;
    entry.models = [...entry.models.filter((model) => !model.id.startsWith('actor-')
      && !(slug === 'tabernacle' && model.id.startsWith('human-'))
      && !assets.some((asset) => asset.id === model.id)), ...assets];
    entry.groups.actors = { id: `${slug}-actors`, priority: 2, models: assets.map((model) => model.id) };
  }
  return manifest;
}
