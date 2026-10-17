// Shared, stable identity at both render distances. These are interpretive
// wardrobe palettes, not assertions about a person's ethnicity or status.
import { HUMAN_VARIANTS, CROWD_VARIANTS, PRESET_POOLS, AGE_WEIGHTS, ADULT_HEIGHT } from './sceneHumanManifest.js';
import { SCENE_HUMAN_PLACEMENTS } from './sceneHumanPlacements.js';
import { clothify } from './sceneHumanCloth.js';
import { DRESS, dressFor, isWomanModel, menHeadwear } from './sceneHumanDress.js';

export const WOMAN_MODEL = 'human-tabernacle-camp-woman';
const EARTH = [0xe0cfaf, 0xc8b28a, 0xa28b6b, 0x89745d, 0xd8d1bc, 0xb8aa91];
const DYES = [0x8e5245, 0x556b7c, 0xa17d48, 0x79694f];
const ACCENTS = [0x6d4637, 0x4d6175, 0x9b7750, 0x73644e, 0xb19b77, 0x704b54];
const SKIN = [0xffffff, 0xf5e6d7, 0xe5cab0, 0xf1dcc6, 0xd4b99f];
const HAIR = [0xffffff, 0xbaa99a, 0x81746a, 0xd9d1c7];
const hash = (value) => {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};
// What a headwear of each kind is dyed: a felt cap is felt-coloured, a band is
// cord, a helmet is bronze, a priest's turban is white linen; a cloth or a veil
// is any dye, as before.
const FELT = [0x8b7a5e, 0x6f604a, 0x9a8668, 0x7a6a52];
const CORD = [0x8b6f4e, 0x6d4637, 0xb19b77, 0x4d6175];
const LINEN = [0xe9e2cf, 0xd8d1bc, 0xcfc4a8];

export function humanAppearance(figure = {}, sceneSlug = '', index = 0) {
  const identity = figure.fallbackId || figure.id || `${figure.x ?? figure.position?.[0]}:${figure.z ?? figure.position?.[2]}:${index}`;
  const seed = hash(`${sceneSlug}:${identity}`);
  const pick = (values, salt) => values[hash(`${seed}:${salt}`) % values.length];
  // Sacred vestments and armour have authored meaning: preserve them.
  const ceremonial = /priest|levite|soldier|goliath|david/.test(`${figure.role || ''} ${figure.variantId || ''}`);
  const wilderness = ['tabernacle', 'mount-sinai', 'sinai', 'valley-of-elah'].includes(sceneSlug);
  const dyed = !wilderness && seed % (sceneSlug === 'caesarea' ? 3 : 5) === 0;
  // A woman is whoever is drawn on a woman's body, or said to be one. Her
  // veil is hers alone; a man is dressed by the group he belongs to.
  const woman = figure.kind === 'woman' || isWomanModel(HUMAN_VARIANTS[humanVariantId(figure, index, sceneSlug)]?.modelId);
  const dress = dressFor(figure, sceneSlug);
  const office = DRESS[dress].office ? DRESS[dress] : null;
  let headwear = null;
  if (!ceremonial && !figure.bareheaded && figure.kind !== 'child') {
    if (woman) headwear = 'veil';
    else if (office) headwear = menHeadwear(dress, 0);
    else if (figure.headcloth != null) headwear = 'cloth';
    else headwear = menHeadwear(dress, hash(`${seed}:headwear`) % 100);
  }
  let wrap = figure.veil ?? figure.headcloth ?? pick([...EARTH, ...DYES], 'wrap');
  if (figure.veil == null && figure.headcloth == null) {
    if (headwear === 'cap') wrap = pick(FELT, 'felt');
    else if (headwear === 'band') wrap = pick(CORD, 'cord');
    else if (headwear === 'turban') wrap = office?.wrap ?? pick(LINEN, 'linen');
    else if (headwear === 'helmet') wrap = office?.wrap ?? 0xa8813f;
  }
  return {
    seed, ceremonial, headwear, dress,
    tunic: figure.tunicTint ?? pick(dyed ? DYES : EARTH, 'tunic'),
    sash: office?.sash ?? pick(ACCENTS, 'sash'),
    wrap,
    skin: pick(SKIN, 'skin'), hair: pick(HAIR, 'hair'),
    // Small differences in build retain rig proportions and grounded feet.
    build: ceremonial || figure.kind === 'child' ? 1 : 0.94 + (seed % 7) * 0.02,
    sashWorn: !ceremonial,
    // A mantle over the shoulder: not for work, and not over an office's dress.
    shoulderWrap: !ceremonial && !office && figure.kind !== 'child' && !figure.props?.length
      && !['working', 'sitting', 'kneeling', 'bowing'].includes(figure.activity) && seed % 3 === 1,
  };
}

// For a scene with identity presets: the bodies this person could be, by who they are. Sex follows the
// figure's `kind` (an unmarked figure is a man or a woman by identity), and age its `age` ('young', 'adult',
// 'elder'), or is drawn by identity from AGE_WEIGHTS. Everything comes from the figure's own identity, so
// the near actor and the far crowd choose the same body for the same person.
function presetPool(figure, seed, sceneSlug) {
  const pools = PRESET_POOLS[sceneSlug];
  if (!pools) return null;
  const kind = ['woman', 'man', 'child'].includes(figure.kind) ? figure.kind : hash(`${seed}:sex`) % 2 ? 'woman' : 'man';
  if (kind === 'child') return pools.child.any;
  let age = figure.age;
  if (!pools[kind][age]) {
    let roll = hash(`${seed}:age`) % AGE_WEIGHTS.reduce((n, [, w]) => n + w, 0);
    age = AGE_WEIGHTS.find(([, w]) => (roll -= w) < 0)[0];
  }
  return pools[kind][age];
}

// What a figure's `scale` comes to for the body it is drawn on. For anyone grown it is the figure's own
// scale. A child is a body built at child height, so a figure's 0.6 (a child 60% of an adult) is turned into
// the scale that makes that child body that tall.
export function bodyScale(figure, index = 0, sceneSlug = '') {
  const variant = HUMAN_VARIANTS[humanVariantId(figure, index, sceneSlug)];
  const scale = figure.scale || 1;
  return variant?.child ? scale * ADULT_HEIGHT / variant.heightMeters : scale;
}

export function humanVariantId(figure, index = 0, sceneSlug = '') {
  // An explicit assignment is authoritative at every distance.
  if (HUMAN_VARIANTS[figure.variantId]) return figure.variantId;
  const authored = SCENE_HUMAN_PLACEMENTS[sceneSlug]?.find((p) => p.fallbackId === (figure.fallbackId || figure.id));
  if (HUMAN_VARIANTS[authored?.variantId]) return authored.variantId;
  const seed = hash(figure.fallbackId || figure.id || index);
  const pool = presetPool(figure, seed, sceneSlug);
  if (pool) return pool[hash(`${seed}:body`) % pool.length];
  if (figure.kind === 'woman') return 'tabernacle-camp-woman-a';
  const variants = figure.kind === 'man' ? ['galilee-fisherman-a', 'galilee-carrier-a'] : CROWD_VARIANTS;
  return variants[seed % variants.length];
}

export function humanMaterialRole(name = '', partName = '') {
  if (/sash|girdle/i.test(`${name} ${partName}`)) return 'sash';
  if (/cloth|tunic|skirt|robe/i.test(`${name} ${partName}`)) return 'tunic';
  if (/^skin/i.test(name)) return 'skin';
  if (/hair|brows|beard/i.test(name)) return 'hair';
  return null;
}

// Retain the imported textile's weave and folds while removing its baked dye.
// Both rendering paths compose this hook with their own skinning shader.
export function wardrobeMaterial(material, role, appearance = null) {
  if (appearance?.ceremonial) return material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  if (role === 'tunic' || role === 'sash') {
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        #ifdef USE_MAP
          float textileValue = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = diffuse * clamp(textileValue * 2.8, 0.12, 0.95);
        #endif
      `);
    };
    material.customProgramCacheKey = () => `${previousKey}-woven-dye-v1`;
    material.roughness = 0.94;
    // The tunic keeps its own weave; what it gains is the way light handles
    // cloth — a fuzz at grazing angles, shade in the hollows, a stir at the hem.
    clothify(null, material, 'tunic');
  }
  if (appearance && role) material.color.setHex(appearance[role]);
  return material;
}
