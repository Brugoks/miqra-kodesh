import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { WEAVE_TILE } from './sceneHumanCloth.js';
import { measureSkull, shapeHeadwear } from './sceneHumanWardrobe.js';
import { DRAPES, clearDrapes, collectBody, drapeStats, solveDrape } from './sceneHumanDrape.js';

// What a drape has to be, measured on the real bodies. These are the checks
// that stand in for looking at it: that the cloth is on the head and not in it,
// leaves the face open, reaches the shoulders, and is cloth — not stretched,
// not lopsided, not different from one run to the next.

const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  // Children are bareheaded by rule, so a drape is solved for every grown body and not for them.
  for (const asset of [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS.filter((a) => !a.id.includes('child-')), TABERNACLE_CHARACTER_ASSETS.find((a) => a.id.endsWith('camp-woman'))]) {
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 30000);

const bodies = () => Object.entries(models).map(([id, gltf]) => {
  gltf.scene.updateMatrixWorld(true);
  const skull = measureSkull(THREE, gltf.scene);
  return { id, skull, body: collectBody(THREE, gltf.scene, skull) };
});

describe.each(['veil', 'cloth'])('a %s laid over each body', (kind) => {
  const spec = DRAPES[kind];
  let drapes;
  beforeAll(() => { drapes = bodies().map((b) => ({ ...b, result: solveDrape(b.skull, b.body, spec) })); }, 60000);

  it('is every number, and the same on every run', () => {
    for (const { id, skull, body, result } of drapes) {
      expect(result.positions.every(Number.isFinite), id).toBe(true);
      const again = solveDrape(skull, body, spec);
      expect(Array.from(again.positions), id).toEqual(Array.from(result.positions));
    }
  }, 60000);

  it('rests on the body and never in it', () => {
    for (const { id, skull, body, result } of drapes) {
      const [cx, cy, cz] = skull.centre;
      const p = result.positions;
      let deepest = 0;
      for (let v = 0; v < p.length / 3; v += 1) {
        // Against the skull's own ellipsoid, where the head is.
        if (p[v * 3 + 1] > skull.jaw) {
          const d = Math.hypot((p[v * 3] - cx) / skull.radii[0], (p[v * 3 + 1] - cy) / skull.radii[1], (p[v * 3 + 2] - cz) / skull.radii[2]);
          expect(d, `${id} vertex ${v} inside the skull`).toBeGreaterThan(0.98);
        }
        // Against the nearest point of the neck, shoulders, hair and arms.
        let best = Infinity; let at = -1;
        for (let q = 0; q < body.length; q += 6) {
          const dd = (p[v * 3] - body[q]) ** 2 + (p[v * 3 + 1] - body[q + 1]) ** 2 + (p[v * 3 + 2] - body[q + 2]) ** 2;
          if (dd < best) { best = dd; at = q; }
        }
        if (Math.sqrt(best) < 0.05) {
          const signed = (p[v * 3] - body[at]) * body[at + 3] + (p[v * 3 + 1] - body[at + 1]) * body[at + 4] + (p[v * 3 + 2] - body[at + 2]) * body[at + 5];
          deepest = Math.min(deepest, signed);
        }
      }
      expect(deepest, `${id} deepest into the body`).toBeGreaterThan(-0.004);
    }
  });

  it('leaves the face open', () => {
    for (const { id, skull, result } of drapes) {
      const [cx, , cz] = skull.centre;
      const browY = skull.top - 0.075;
      const p = result.positions;
      for (let v = 0; v < p.length / 3; v += 1) {
        const inFace = Math.abs(p[v * 3] - cx) < 0.06 && p[v * 3 + 1] > skull.jaw + 0.03 && p[v * 3 + 1] < browY - 0.015 && p[v * 3 + 2] > cz + 0.02;
        expect(inFace, `${id} vertex ${v} across the face`).toBe(false);
      }
    }
  });

  it('is over the crown and no more than a cloth’s depth above it', () => {
    for (const { id, skull, result } of drapes) {
      const p = result.positions;
      let highest = -Infinity;
      for (let v = 0; v < p.length / 3; v += 1) highest = Math.max(highest, p[v * 3 + 1]);
      expect(highest, id).toBeGreaterThan(skull.top - 0.01);
      expect(highest, id).toBeLessThan(skull.top + 0.05);
    }
  });

  it('is not stretched, nor torn at a seam', () => {
    for (const { id, result } of drapes) {
      const p = result.positions;
      let sum = 0; let over = 0; let worst = 0; const n = result.links.length / 3;
      for (let k = 0; k < result.links.length; k += 3) {
        const a = result.links[k]; const b = result.links[k + 1];
        const strain = Math.abs(Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]) / result.links[k + 2] - 1);
        sum += strain; worst = Math.max(worst, strain);
        if (strain > 0.1) over += 1;
      }
      expect(sum / n, `${id} mean strain`).toBeLessThan(0.05);
      expect(over / n, `${id} share of links over 10%`).toBeLessThan(0.06);
      expect(worst, `${id} worst link`).toBeLessThan(0.6);
    }
  });

  it('hangs evenly on both sides, as far as the body does', () => {
    for (const { id, skull, result } of drapes) {
      const [cx] = skull.centre;
      const p = result.positions;
      const stride = result.columns + 1;
      let sum = 0;
      for (let j = 0; j <= result.rows; j += 1) {
        for (let i = 0; i <= result.columns; i += 1) {
          const a = (j * stride + i) * 3; const b = (j * stride + (result.columns - i)) * 3;
          sum += Math.hypot(p[a] - cx + (p[b] - cx), p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
        }
      }
      expect(sum / (p.length / 3), id).toBeLessThan(0.09);
    }
  });

  it('is woven at one scale: the weave’s coordinates are the flat cloth’s, in metres', () => {
    for (const { id, result } of drapes) {
      const { uv, columns, rows } = result;
      const stride = columns + 1;
      expect(uv[columns * 2], id).toBeCloseTo(spec.width / WEAVE_TILE, 3);
      expect(uv[rows * stride * 2 + 1], id).toBeCloseTo(spec.length / WEAVE_TILE, 3);
    }
  });
});

describe('how far down it falls', () => {
  it('a veil reaches the shoulders and wider; a man’s head cloth stops at the nape', () => {
    for (const { id, skull, body } of bodies()) {
      const veil = solveDrape(skull, body, DRAPES.veil).positions;
      const cloth = solveDrape(skull, body, DRAPES.cloth).positions;
      const range = (p, axis) => {
        let lo = Infinity; let hi = -Infinity;
        for (let v = 0; v < p.length / 3; v += 1) { lo = Math.min(lo, p[v * 3 + axis]); hi = Math.max(hi, p[v * 3 + axis]); }
        return [lo, hi];
      };
      expect(range(veil, 1)[0], `${id} veil`).toBeLessThan(skull.jaw - 0.15);
      expect(range(veil, 1)[0], `${id} veil`).toBeGreaterThan(skull.jaw - 0.5);
      expect(range(veil, 0)[1] - range(veil, 0)[0], `${id} veil width`).toBeGreaterThan(skull.radii[0] * 2 * 2);
      expect(range(cloth, 1)[0], `${id} cloth`).toBeLessThan(skull.jaw + 0.02);
      expect(range(cloth, 1)[0], `${id} cloth`).toBeGreaterThan(skull.jaw - 0.3);
    }
  }, 30000);
});

describe('as geometry for the people who wear it', () => {
  it('is solved once for a body, and handed out as a fresh geometry each time', () => {
    clearDrapes();
    const [{ skull }] = bodies();
    const before = drapeStats.solved;
    const first = shapeHeadwear(THREE, skull, 'veil');
    const second = shapeHeadwear(THREE, skull, 'veil');
    expect(drapeStats.solved).toBe(before + 1);
    expect(second.shell).not.toBe(first.shell);
    expect(second.shell.attributes.position.array).not.toBe(first.shell.attributes.position.array);
    expect(Array.from(second.shell.attributes.position.array)).toEqual(Array.from(first.shell.attributes.position.array));
    // A veil and a cloth are different cloth.
    shapeHeadwear(THREE, skull, 'cloth');
    expect(drapeStats.solved).toBe(before + 2);
  });

  it('carries what the material needs, and what the skinning needs', () => {
    for (const { id, skull } of bodies()) {
      const { shell, spineWeight } = shapeHeadwear(THREE, skull, 'veil');
      const { position, uv, aCloth, normal } = shell.attributes;
      expect(uv.count, id).toBe(position.count);
      expect(aCloth.count, id).toBe(position.count);
      expect(normal.count, id).toBe(position.count);
      expect(spineWeight.length, id).toBe(position.count);
      let freeCloth = 0; let darkest = 0;
      for (let i = 0; i < position.count; i += 1) {
        expect(aCloth.getX(i)).toBeGreaterThanOrEqual(0);
        expect(aCloth.getX(i)).toBeLessThanOrEqual(0.7 + 1e-6);
        expect(aCloth.getY(i)).toBeGreaterThanOrEqual(0);
        expect(aCloth.getY(i)).toBeLessThanOrEqual(1);
        if (aCloth.getY(i) > 0.5) freeCloth += 1;
        darkest = Math.max(darkest, aCloth.getX(i));
        // The head carries the cloth above the jaw and the shoulders what hangs below the neck.
        if (position.getY(i) > skull.jaw + 0.011) expect(spineWeight[i]).toBe(0);
        if (position.getY(i) < skull.jaw - 0.141) expect(spineWeight[i]).toBe(1);
        expect(Number.isFinite(normal.getY(i))).toBe(true);
      }
      // Some of it is in the air and some of it is not.
      expect(freeCloth, id).toBeGreaterThan(position.count * 0.1);
      expect(freeCloth, id).toBeLessThan(position.count * 0.9);
      expect(darkest, id).toBeGreaterThan(0);
    }
  }, 30000);

  it('faces up over the crown, so its outer side is the one that is lit', () => {
    for (const { id, skull } of bodies()) {
      const { shell } = shapeHeadwear(THREE, skull, 'veil');
      const { position, normal } = shell.attributes;
      let top = 0;
      for (let i = 0; i < position.count; i += 1) if (position.getY(i) > position.getY(top)) top = i;
      expect(normal.getY(top), id).toBeGreaterThan(0.5);
    }
  });

  it('is solved in tens of milliseconds, not seconds, the first time', () => {
    clearDrapes();
    const [{ skull }] = bodies();
    const started = performance.now();
    shapeHeadwear(THREE, skull, 'veil');
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
