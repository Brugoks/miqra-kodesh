// Actual contract of the shipped MakeHuman-derived GLBs. No fabricated facial
// morphs or role-specific work clips are advertised here. Socket names are
// semantic aliases onto real bones already present in every shipped rig.
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
export const HUMAN_VARIANTS = {
  'galilee-fisherman-a': variant('galilee-fisherman-a', 'human-artisan'),
  'galilee-grinder-a': variant('galilee-grinder-a', 'human-villager'),
  'galilee-carrier-a': variant('galilee-carrier-a', 'human-traveler'),
  'caesarea-merchant-a': variant('caesarea-merchant-a', 'human-artisan'),
  'temple-pilgrim-a': variant('temple-pilgrim-a', 'human-traveler'),
  'tabernacle-camp-dweller-a': variant('tabernacle-camp-dweller-a', 'human-artisan'),
};

export const CROWD_VARIANTS = ['galilee-fisherman-a', 'galilee-carrier-a', 'galilee-grinder-a'];

// Also called by the scenery generator so rebuilding terrain assets cannot
// silently revert the shared character library to static actor assemblies.
export function addHumanAssetGroups(manifest, humanAssets) {
  for (const slug of ['capernaum', 'caesarea', 'second-temple', 'tabernacle']) {
    const entry = manifest[slug] ||= { groups: {}, models: [], materials: [] };
    entry.models = [...entry.models.filter((model) => !model.id.startsWith('actor-')), ...humanAssets];
    entry.groups.actors = { id: `${slug}-actors`, priority: 2, models: humanAssets.map((model) => model.id) };
  }
  return manifest;
}
