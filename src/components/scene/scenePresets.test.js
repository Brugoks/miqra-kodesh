import { describe, expect, it } from 'vitest';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import {
  HUMAN_VARIANTS, CROWD_VARIANTS, PRESET_POOLS, AGE_WEIGHTS, FALLBACK_MODEL, ADULT_HEIGHT,
} from './sceneHumanManifest.js';
import { humanVariantId, bodyScale, humanAppearance } from './sceneHumanAppearance.js';
import { isWomanModel } from './sceneHumanDress.js';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest.js';

// The identity presets: more faces, ages and builds for the crowd (scripts/humans/build_characters.py
// PRESETS). What these hold is the data the build recorded, how a person is given one of them, and what
// happens to a person's size and body when the preset is a child or fails to arrive.

// MakeHuman's age slider is not linear in years: 0.1875 is 11, 0.5 is 25, 1.0 is 90.
const years = (age) => (age < 0.1875 ? 1 + (age / 0.1875) * 10 : age < 0.5 ? 11 + ((age - 0.1875) / 0.3125) * 14 : 25 + ((age - 0.5) / 0.5) * 65);

// Where each preset should land, from the stature and age it was built to represent. These are the only
// numbers that say a build came out as intended, since nobody is looking at the result here.
const INTENT = {
  'woman-young': { sex: 'woman', years: [18, 27], height: [1.52, 1.65] },
  'woman-adult': { sex: 'woman', years: [32, 48], height: [1.48, 1.62] },
  'woman-elder': { sex: 'woman', years: [60, 75], height: [1.42, 1.56] },
  'man-young': { sex: 'man', years: [18, 27], height: [1.66, 1.78] },
  'man-lean': { sex: 'man', years: [35, 48], height: [1.74, 1.88] },
  'man-elder': { sex: 'man', years: [60, 75], height: [1.58, 1.72] },
  'child-boy': { sex: 'man', years: [6, 12], height: [1.15, 1.42] },
  'child-girl': { sex: 'woman', years: [6, 12], height: [1.05, 1.38] },
};
const key = (asset) => asset.id.replace('human-', '');

describe('the preset assets', () => {
  it('are exactly the presets the build defines, each with a variant on its own model', () => {
    expect(HUMAN_PRESET_ASSETS.map(key).sort()).toEqual(Object.keys(INTENT).sort());
    for (const asset of HUMAN_PRESET_ASSETS) {
      const variant = HUMAN_VARIANTS[`${key(asset)}-a`];
      expect(variant, asset.id).toBeTruthy();
      expect(variant.modelId).toBe(asset.id);
      expect(variant.heightMeters).toBe(asset.bodyHeightMeters);
      expect(variant.child).toBe(key(asset).startsWith('child-'));
    }
  });

  it('are CC0, shipped as the optimized file with the plain build as their fallback', () => {
    for (const asset of HUMAN_PRESET_ASSETS) {
      expect(asset.license, asset.id).toBe('CC0');
      expect(asset.compression, asset.id).toBe('meshopt');
      expect(asset.fallback, asset.id).toBeTruthy();
      expect(asset.fallback).not.toBe(asset.url);
    }
  });

  it('record the body as built and every authored input that made it', () => {
    for (const asset of HUMAN_PRESET_ASSETS) {
      const { preset } = asset;
      expect(preset, asset.id).toBeTruthy();
      for (const field of ['gender', 'age', 'muscle', 'weight', 'height', 'skin', 'hair', 'brows', 'eyes']) expect(preset[field], `${asset.id} ${field}`).toBeDefined();
      expect(preset.targets.length, asset.id).toBeGreaterThan(2);
      // Every morph target was resolved to a real file at build time; each carries a weight in 0..1.
      for (const [name, weight] of preset.targets) {
        expect(name).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
      for (const field of ['bodyHeightMeters', 'hipHeightMeters', 'shoulderWidthMeters']) expect(asset[field], `${asset.id} ${field}`).toBeGreaterThan(0.2);
    }
  });

  it('are the age, sex and stature each was built to be', () => {
    for (const asset of HUMAN_PRESET_ASSETS) {
      const want = INTENT[key(asset)];
      const age = years(asset.preset.age);
      expect(age, `${asset.id} is ${age.toFixed(0)} years`).toBeGreaterThanOrEqual(want.years[0]);
      expect(age, `${asset.id} is ${age.toFixed(0)} years`).toBeLessThanOrEqual(want.years[1]);
      expect(asset.bodyHeightMeters, `${asset.id} stands ${asset.bodyHeightMeters} m`).toBeGreaterThanOrEqual(want.height[0]);
      expect(asset.bodyHeightMeters, `${asset.id} stands ${asset.bodyHeightMeters} m`).toBeLessThanOrEqual(want.height[1]);
      expect(asset.preset.gender).toBe(want.sex === 'woman' ? 0 : 1);
    }
  });

  it('are not the same face: no two share a head shape and the same mix of features', () => {
    const faces = HUMAN_PRESET_ASSETS.map((a) => JSON.stringify(a.preset.targets));
    expect(new Set(faces).size).toBe(faces.length);
    const heights = HUMAN_PRESET_ASSETS.filter((a) => !key(a).startsWith('child')).map((a) => a.bodyHeightMeters);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.25);
  });

  it('keep triangle counts within the shared characters’ own limit: 65,000 near, 12,000 far', () => {
    for (const asset of HUMAN_PRESET_ASSETS) {
      const [near, far] = asset.triangles;
      expect(near, asset.id).toBeLessThanOrEqual(65000);
      expect(far, asset.id).toBeLessThanOrEqual(12000);
      expect(far, asset.id).toBeLessThan(near / 3);
    }
  });
});

describe('who a scene draws its people as', () => {
  const pools = PRESET_POOLS.capernaum;
  const everyone = (kind, count = 4000, extra = {}) => Array.from({ length: count }, (_, i) => humanVariantId({ id: `person-${kind}-${i}`, kind, ...extra }, i, 'capernaum'));
  const used = (list) => new Set(list);

  it('only names variants that exist, and keeps the sexes on the right bodies', () => {
    for (const [kind, ages] of Object.entries(pools)) {
      for (const [age, list] of Object.entries(ages)) {
        for (const id of list) {
          const variant = HUMAN_VARIANTS[id];
          expect(variant, `${kind}/${age}/${id}`).toBeTruthy();
          if (kind === 'woman') expect(isWomanModel(variant.modelId), id).toBe(true);
          if (kind === 'man') expect(isWomanModel(variant.modelId), id).toBe(false);
          if (kind === 'child') expect(variant.child, id).toBe(true);
        }
      }
    }
  });

  it('puts every man, woman and child on a body of their own kind, and uses every body in the pool', () => {
    const body = (list) => new Set(Object.values(list).flat());
    const men = used(everyone('man'));
    const women = used(everyone('woman'));
    const children = used(everyone('child'));
    for (const id of men) expect(body(pools.man).has(id), `man on ${id}`).toBe(true);
    for (const id of women) expect(body(pools.woman).has(id), `woman on ${id}`).toBe(true);
    for (const id of children) expect(body(pools.child).has(id), `child on ${id}`).toBe(true);
    expect(men).toEqual(body(pools.man));
    expect(women).toEqual(body(pools.woman));
    expect(children).toEqual(body(pools.child));
  });

  it('respects a figure that says how old it is', () => {
    for (const age of ['young', 'adult', 'elder']) {
      for (const kind of ['man', 'woman']) {
        for (const id of used(everyone(kind, 400, { age }))) expect(pools[kind][age], `${kind} ${age} on ${id}`).toContain(id);
      }
    }
  });

  it('draws the village’s old man in the doorway as its old man', async () => {
    const { VILLAGE_PEOPLE } = await import('./capernaumLife.js');
    const elder = VILLAGE_PEOPLE.find((p) => p.id === 'elder');
    expect(elder.age).toBe('elder');
    expect(humanVariantId(elder, 0, 'capernaum')).toBe('man-elder-a');
    // and the people who are children are drawn on child bodies, at the height the village gave them
    for (const child of VILLAGE_PEOPLE.filter((p) => p.kind === 'child')) {
      const variant = HUMAN_VARIANTS[humanVariantId(child, 0, 'capernaum')];
      expect(variant.child, child.id).toBe(true);
      expect(bodyScale(child, 0, 'capernaum') * variant.heightMeters, child.id).toBeCloseTo(child.scale * ADULT_HEIGHT, 6);
    }
  });

  it('draws ages from the village’s own mix: mostly grown, few old', () => {
    const total = AGE_WEIGHTS.reduce((n, [, w]) => n + w, 0);
    const counts = { young: 0, adult: 0, elder: 0 };
    const count = 6000;
    for (let i = 0; i < count; i++) {
      const id = humanVariantId({ id: `m-${i}`, kind: 'man' }, i, 'capernaum');
      for (const age of Object.keys(counts)) if (pools.man[age].includes(id)) counts[age] += 1;
    }
    // A body in two age pools is counted in both, so compare the elder share, which no other pool shares.
    const elder = counts.elder / count;
    const wanted = AGE_WEIGHTS.find(([age]) => age === 'elder')[1] / total;
    expect(Math.abs(elder - wanted)).toBeLessThan(0.025);
    expect(elder).toBeLessThan(0.15);
  });

  it('gives an unmarked figure a sex, and men and women both appear', () => {
    const list = everyone(undefined);
    const women = list.filter((id) => isWomanModel(HUMAN_VARIANTS[id].modelId)).length;
    expect(women / list.length).toBeGreaterThan(0.4);
    expect(women / list.length).toBeLessThan(0.6);
  });

  it('is the same person on the same body wherever they are drawn', () => {
    for (let i = 0; i < 300; i++) {
      const figure = { id: `walker-${i}`, kind: i % 3 === 0 ? 'woman' : i % 3 === 1 ? 'man' : 'child' };
      const first = humanVariantId(figure, 0, 'capernaum');
      expect(humanVariantId(figure, 17, 'capernaum')).toBe(first);
      // The near actor is built from the figure with a prefixed id and the original as its fallback identity.
      expect(humanVariantId({ ...figure, id: `human-${figure.id}`, fallbackId: figure.id }, 99, 'capernaum')).toBe(first);
      expect(humanAppearance(figure, 'capernaum', 0)).toEqual(humanAppearance({ ...figure, id: `human-${figure.id}`, fallbackId: figure.id }, 'capernaum', 5));
    }
  });

  it('leaves an authored or explicit body alone', () => {
    expect(humanVariantId({ id: 'x', variantId: 'tabernacle-priest-a' }, 0, 'capernaum')).toBe('tabernacle-priest-a');
    expect(humanVariantId({ id: 'x', variantId: 'man-elder-a' }, 0, 'capernaum')).toBe('man-elder-a');
  });

  it('changes nothing for a scene that has no pool', () => {
    // The rule these scenes have always used, restated: women are the camp woman, an unmarked person is one
    // of the three crowd bodies, and a man is the fisherman or the carrier.
    const hash = (value) => {
      let n = 2166136261;
      for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
      return n >>> 0;
    };
    for (const scene of ['caesarea', 'second-temple', 'bethlehem', 'sinai', 'mount-of-olives', 'tabernacle', '']) {
      for (let i = 0; i < 200; i++) {
        for (const kind of ['man', 'woman', 'child', undefined]) {
          const figure = { id: `f-${i}`, kind };
          const seed = hash(figure.id);
          const expected = kind === 'woman' ? 'tabernacle-camp-woman-a'
            : (kind === 'man' ? ['galilee-fisherman-a', 'galilee-carrier-a'] : CROWD_VARIANTS)[seed % (kind === 'man' ? 2 : CROWD_VARIANTS.length)];
          expect(humanVariantId(figure, i, scene), `${scene || '(none)'} ${kind} ${i}`).toBe(expected);
        }
      }
    }
  });
});

describe('size', () => {
  it('leaves a grown person’s scale as the figure says', () => {
    for (const kind of ['man', 'woman']) {
      for (let i = 0; i < 100; i++) expect(bodyScale({ id: `a-${i}`, kind, scale: 0.97 }, i, 'capernaum')).toBe(0.97);
    }
    expect(bodyScale({ id: 'a' }, 0, 'capernaum')).toBe(1);
  });

  it('makes a child preset as tall as the figure asks for, in fractions of an adult', () => {
    for (const fraction of [0.56, 0.6, 0.7]) {
      for (let i = 0; i < 40; i++) {
        const figure = { id: `child-${i}`, kind: 'child', scale: fraction };
        const variant = HUMAN_VARIANTS[humanVariantId(figure, i, 'capernaum')];
        expect(variant.child).toBe(true);
        expect(bodyScale(figure, i, 'capernaum') * variant.heightMeters).toBeCloseTo(fraction * ADULT_HEIGHT, 6);
      }
    }
  });

  it('leaves a child alone in a scene that still draws children as small adults', () => {
    expect(bodyScale({ id: 'c', kind: 'child', scale: 0.6 }, 0, 'caesarea')).toBe(0.6);
  });
});

describe('when a preset does not arrive', () => {
  const legacy = new Set([...HUMAN_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS].map((a) => a.id));

  it('each one has a body of the same kind to stand in for it, which is not itself a preset', () => {
    for (const asset of HUMAN_PRESET_ASSETS) {
      const stand = FALLBACK_MODEL[asset.id];
      expect(stand, asset.id).toBeTruthy();
      expect(legacy.has(stand), `${asset.id} -> ${stand}`).toBe(true);
      const woman = INTENT[key(asset)].sex === 'woman' && !key(asset).startsWith('child');
      expect(isWomanModel(stand), asset.id).toBe(woman);
    }
  });

  it('is loaded with the people, in Capernaum only', () => {
    const ids = HUMAN_PRESET_ASSETS.map((a) => a.id);
    const capernaum = SCENE_ASSET_MANIFEST.capernaum;
    for (const id of ids) {
      expect(capernaum.groups.actors.models).toContain(id);
      expect(capernaum.models.some((m) => m.id === id)).toBe(true);
    }
    for (const [slug, scene] of Object.entries(SCENE_ASSET_MANIFEST)) {
      if (slug === 'capernaum' || slug === 'shared') continue;
      for (const id of ids) expect((scene.models || []).some((m) => m.id === id), `${slug} must not download ${id}`).toBe(false);
    }
  });
});
