import { describe, expect, it } from 'vitest';
import { humanAppearance } from './sceneHumanAppearance.js';
import {
  DRESS, HEADWEAR_ORDER, dressFor, isWomanModel, menHeadwear, profileTotal,
} from './sceneHumanDress.js';

// Who wears what on the head. These hold the rules, and the places where a
// wrong answer would be anachronistic or plain wrong: a veil on a man, a
// Roman cap in the wilderness, a priest without his linen cap.

const SCENES = ['capernaum', 'caesarea', 'second-temple', 'olivet', 'sinai', 'tabernacle', 'bethlehem'];
const men = (count, extra = {}, scene = 'capernaum') => Array.from({ length: count }, (_, i) => (
  humanAppearance({ id: `${extra.dress || scene}-man-${i}`, kind: 'man', ...extra }, scene, i)
));
const share = (appearances, kind) => appearances.filter((a) => a.headwear === kind).length / appearances.length;

describe('the wardrobe table', () => {
  it('weighs every profile out of a hundred, and says why', () => {
    for (const [id, profile] of Object.entries(DRESS)) {
      expect(profileTotal(profile), id).toBe(100);
      expect(profile.basis?.length, id).toBeGreaterThan(40);
      for (const key of Object.keys(profile)) {
        expect([...HEADWEAR_ORDER, 'basis', 'office', 'sash', 'wrap'], `${id}.${key}`).toContain(key);
      }
    }
  });

  it('gives a roll of 0–99 one answer, in order, and bareheaded for none', () => {
    expect(menHeadwear('priest', 0)).toBe('turban');
    expect(menHeadwear('priest', 99)).toBe('turban');
    expect(menHeadwear('soldier', 50)).toBe('helmet');
    // villager: none 55, cloth 30, band 5, cap 10
    expect(menHeadwear('villager', 0)).toBe(null);
    expect(menHeadwear('villager', 54)).toBe(null);
    expect(menHeadwear('villager', 55)).toBe('cloth');
    expect(menHeadwear('villager', 84)).toBe('cloth');
    expect(menHeadwear('villager', 85)).toBe('band');
    expect(menHeadwear('villager', 90)).toBe('cap');
    expect(menHeadwear('villager', 99)).toBe('cap');
    expect(menHeadwear('no-such-profile', 0)).toBe(null);
  });

  it('finds a person’s profile: theirs, then their group’s, then their scene’s', () => {
    expect(dressFor({ dress: 'priest', groupId: 'shore-nets' }, 'capernaum')).toBe('priest');
    expect(dressFor({ groupId: 'shore-nets' }, 'capernaum')).toBe('fisherman');
    expect(dressFor({ groupId: 'north-lane' }, 'capernaum')).toBe('traveller');
    expect(dressFor({}, 'capernaum')).toBe('villager');
    expect(dressFor({}, 'caesarea')).toBe('townsman');
    expect(dressFor({}, 'sinai')).toBe('camp');
    expect(dressFor({}, 'tabernacle')).toBe('camp');
    expect(dressFor({}, 'second-temple')).toBe('pilgrim');
    expect(dressFor({ dress: 'not-a-profile' }, 'olivet')).toBe('pilgrim');
    expect(dressFor({}, 'nowhere')).toBe('villager');
  });
});

describe('a veil is for women', () => {
  it('is worn by every woman, however she is bodied or labelled, unless she is bareheaded', () => {
    for (const scene of SCENES) {
      for (let i = 0; i < 40; i += 1) {
        expect(humanAppearance({ id: `w-${i}`, kind: 'woman' }, scene, i).headwear, `${scene} kind woman`).toBe('veil');
        // Drawn on a woman's body without being called one.
        expect(humanAppearance({ id: `v-${i}`, variantId: 'galilee-grinder-a' }, scene, i).headwear, `${scene} on the villager`).toBe('veil');
        expect(humanAppearance({ id: `c-${i}`, variantId: 'tabernacle-camp-woman-a' }, scene, i).headwear, `${scene} camp woman`).toBe('veil');
      }
    }
    expect(humanAppearance({ id: 'sick', kind: 'woman', bareheaded: true }).headwear).toBe(null);
  });

  it('is never worn by a man, in any scene, in any group', () => {
    for (const scene of SCENES) {
      for (const dress of [undefined, ...Object.keys(DRESS)]) {
        for (const a of men(300, dress ? { dress } : {}, scene)) expect(a.headwear, `${scene} ${dress}`).not.toBe('veil');
      }
    }
  });

  it('is not worn by a child, and a woman is known by the model, not only the label', () => {
    expect(humanAppearance({ id: 'child', kind: 'child' }, 'capernaum').headwear).toBe(null);
    expect(isWomanModel('human-villager')).toBe(true);
    expect(isWomanModel('human-tabernacle-camp-woman')).toBe(true);
    for (const id of ['human-artisan', 'human-traveler', 'human-tabernacle-camp-man', 'human-tabernacle-priest']) expect(isWomanModel(id), id).toBe(false);
  });
});

describe('men are dressed by their group', () => {
  it('follow each profile’s weighting, to within sampling', () => {
    for (const [id, profile] of Object.entries(DRESS)) {
      if (profile.office) continue;
      const sample = men(3000, { dress: id });
      for (const key of HEADWEAR_ORDER) {
        const wanted = (profile[key] || 0) / 100;
        const got = share(sample, key === 'none' ? null : key);
        expect(Math.abs(got - wanted), `${id} ${key}: wanted ${wanted}, got ${got}`).toBeLessThan(0.045);
      }
    }
  });

  it('have some of each: bareheaded and capped in a village, and not all alike', () => {
    for (const dress of ['villager', 'fisherman', 'traveller', 'pilgrim', 'townsman']) {
      const sample = men(600, { dress });
      const kinds = new Set(sample.map((a) => a.headwear));
      expect(kinds.has(null), dress).toBe(true);
      expect(kinds.has('cloth'), dress).toBe(true);
      expect(kinds.size, dress).toBeGreaterThanOrEqual(3);
    }
  });

  it('keep to their age: the wilderness camp wears no Roman cap, turban or helmet', () => {
    for (const scene of ['sinai', 'tabernacle']) {
      const sample = men(1500, {}, scene);
      for (const kind of ['cap', 'turban', 'helmet', 'veil']) expect(share(sample, kind), `${scene} ${kind}`).toBe(0);
      expect(share(sample, 'band'), scene).toBeGreaterThan(0.2);
      expect(share(sample, 'cloth'), scene).toBeGreaterThan(0.4);
    }
  });

  it('keep to their place: no helmet or turban among ordinary pilgrims and villagers', () => {
    for (const scene of ['capernaum', 'second-temple', 'olivet', 'bethlehem']) {
      const sample = men(1500, {}, scene);
      expect(share(sample, 'helmet'), scene).toBe(0);
      expect(share(sample, 'turban'), scene).toBe(0);
    }
  });

  it('wear the harbour’s caps at the harbour, more than anywhere else in the cities', () => {
    expect(share(men(2000, { dress: 'harbour' }), 'cap')).toBeGreaterThan(share(men(2000, { dress: 'townsman' }), 'cap'));
    expect(share(men(2000, { dress: 'harbour' }), 'cap')).toBeGreaterThan(share(men(2000, { dress: 'villager' }), 'cap'));
  });

  it('are the same man every time, whichever distance they are seen from', () => {
    const figure = { id: 'repeat', kind: 'man', groupId: 'shore-nets' };
    expect(humanAppearance(figure, 'capernaum', 3)).toEqual(humanAppearance({ ...figure, id: 'human-repeat', fallbackId: 'repeat' }, 'capernaum', 17));
  });
});

describe('offices keep their dress', () => {
  it('a priest in the Temple wears the linen cap, white, with a pale girdle and no mantle', () => {
    for (const a of men(200, { dress: 'priest' }, 'second-temple')) {
      expect(a.headwear).toBe('turban');
      expect(a.wrap).toBe(DRESS.priest.wrap);
      expect(a.sash).toBe(DRESS.priest.sash);
      expect(a.shoulderWrap).toBe(false);
      expect(a.dress).toBe('priest');
    }
  });

  it('a soldier on post wears a bronze helmet and a leather belt', () => {
    for (const a of men(200, { dress: 'soldier' }, 'caesarea')) {
      expect(a.headwear).toBe('helmet');
      expect(a.wrap).toBe(DRESS.soldier.wrap);
      expect(a.sash).toBe(DRESS.soldier.sash);
      expect(a.shoulderWrap).toBe(false);
    }
  });

  it('what is authored is left alone, and an explicit choice is respected', () => {
    expect(humanAppearance({ id: 'p', variantId: 'tabernacle-priest-a' }, 'tabernacle').headwear).toBe(null);
    expect(humanAppearance({ id: 'l', role: 'levite' }, 'tabernacle').headwear).toBe(null);
    expect(humanAppearance({ id: 'b', kind: 'man', bareheaded: true, dress: 'harbour' }, 'caesarea').headwear).toBe(null);
    const elder = humanAppearance({ id: 'elder', kind: 'man', headcloth: 0xd6c6a6 }, 'capernaum');
    expect(elder.headwear).toBe('cloth');
    expect(elder.wrap).toBe(0xd6c6a6);
  });
});

describe('each kind of headwear is the colour of what it is', () => {
  it('felt for a cap, cord for a band, linen for a turban, bronze for a helmet', () => {
    const sample = men(1500, { dress: 'merchant' }, 'caesarea');
    const felt = new Set([0x8b7a5e, 0x6f604a, 0x9a8668, 0x7a6a52]);
    const linen = new Set([0xe9e2cf, 0xd8d1bc, 0xcfc4a8]);
    for (const a of sample) {
      if (a.headwear === 'cap') expect(felt.has(a.wrap)).toBe(true);
      if (a.headwear === 'turban') expect(linen.has(a.wrap)).toBe(true);
    }
    expect(sample.some((a) => a.headwear === 'cap')).toBe(true);
    expect(sample.some((a) => a.headwear === 'turban')).toBe(true);
    const camp = men(1500, {}, 'sinai');
    const cord = new Set([0x8b6f4e, 0x6d4637, 0xb19b77, 0x4d6175]);
    for (const a of camp) if (a.headwear === 'band') expect(cord.has(a.wrap)).toBe(true);
  });
});
