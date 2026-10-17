import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { CLOTH_KINDS } from './sceneHumanCloth.js';
import { BAND, HATS, hatGeometry } from './sceneHumanHats.js';
import { DRAPES } from './sceneHumanDrape.js';
import { HEADWEAR_PARTS, measureSkull, shapeHeadwear } from './sceneHumanWardrobe.js';
import { createInstancedCrowd } from './sceneInstancedHumans.js';
import { createSceneHumans } from './sceneHumans.js';

const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  for (const asset of [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS.filter((a) => !a.id.includes('child-')), TABERNACLE_CHARACTER_ASSETS.find((a) => a.id.endsWith('camp-woman'))]) {
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 30000);

const skulls = () => Object.entries(models).map(([id, gltf]) => { gltf.scene.updateMatrixWorld(true); return { id, skull: measureSkull(THREE, gltf.scene) }; });

describe.each([...HATS])('a %s', (kind) => {
  it('is whole, finite and light enough to put on a crowd', () => {
    for (const { id, skull } of skulls()) {
      const { shell } = hatGeometry(THREE, skull, kind);
      const { position, normal, uv, aCloth } = shell.attributes;
      for (const attribute of [position, normal, uv, aCloth]) expect(attribute.array.every(Number.isFinite), `${id} ${attribute.itemSize}`).toBe(true);
      expect(uv.count).toBe(position.count);
      expect(aCloth.count).toBe(position.count);
      expect(shell.index.count / 3, `${id} triangles`).toBeLessThan(1100);
      expect(Math.max(...shell.index.array)).toBeLessThan(position.count);
    }
  });

  it('rides the head and nothing else', () => {
    for (const { skull } of skulls()) {
      const { spineWeight, shell } = hatGeometry(THREE, skull, kind);
      expect(spineWeight.length).toBe(shell.attributes.position.count);
      expect(spineWeight.every((w) => w === 0)).toBe(true);
    }
  });

  it('is outside the head it is on and leaves the face open', () => {
    for (const { id, skull } of skulls()) {
      const [cx, cy, cz] = skull.centre;
      const { position } = hatGeometry(THREE, skull, kind).shell.attributes;
      const browY = skull.top - 0.075;
      for (let i = 0; i < position.count; i += 1) {
        const d = Math.hypot((position.getX(i) - cx) / skull.radii[0], (position.getY(i) - cy) / skull.radii[1], (position.getZ(i) - cz) / skull.radii[2]);
        // Never inside the skull (the band, below the brow's widest part, is a cord round it).
        expect(d, `${id} vertex ${i}`).toBeGreaterThan(0.97);
        const inFace = Math.abs(position.getX(i) - cx) < 0.06 && position.getY(i) > skull.jaw + 0.03 && position.getY(i) < browY - 0.015 && position.getZ(i) > cz + 0.02;
        expect(inFace, `${id} vertex ${i} across the face`).toBe(false);
      }
    }
  });

  it('keeps to its own part of the head', () => {
    for (const { id, skull } of skulls()) {
      const { position } = hatGeometry(THREE, skull, kind).shell.attributes;
      const browY = skull.top - 0.075;
      let lowest = Infinity; let highest = -Infinity;
      for (let i = 0; i < position.count; i += 1) { lowest = Math.min(lowest, position.getY(i)); highest = Math.max(highest, position.getY(i)); }
      if (kind === 'band') {
        // Round the brow, with the ends hanging down the back of the head to the nape.
        expect(highest, id).toBeLessThan(browY + 0.04);
        expect(lowest, id).toBeLessThan(browY - 0.1);
        expect(lowest, id).toBeGreaterThan(skull.jaw - 0.06);
      } else {
        // Over the crown, and no lower than the ears — except a helmet's neck guard.
        expect(highest, id).toBeGreaterThan(skull.top);
        expect(highest, id).toBeLessThan(skull.top + 0.07);
        if (kind === 'helmet') {
          expect(lowest, id).toBeLessThan(skull.jaw + 0.08);
          expect(lowest, id).toBeGreaterThan(skull.jaw);
        } else {
          expect(lowest, id).toBeGreaterThan(browY - 0.075);
        }
      }
    }
  });

  it('faces outward, so the side that is lit is the one that is seen', () => {
    for (const { id, skull } of skulls()) {
      const [cx, cy, cz] = skull.centre;
      const { position, normal } = hatGeometry(THREE, skull, kind).shell.attributes;
      if (kind === 'band') {
        // A tube faces out from its own axis, not from the head: against the
        // centre of each ring of it.
        const { segments, around } = BAND;
        const stride = around + 1;
        for (let s = 0; s <= segments; s += 1) {
          let mx = 0; let my = 0; let mz = 0;
          for (let k = 0; k < around; k += 1) { mx += position.getX(s * stride + k); my += position.getY(s * stride + k); mz += position.getZ(s * stride + k); }
          mx /= around; my /= around; mz /= around;
          for (let k = 0; k < around; k += 1) {
            const at = s * stride + k;
            const dot = normal.getX(at) * (position.getX(at) - mx) + normal.getY(at) * (position.getY(at) - my) + normal.getZ(at) * (position.getZ(at) - mz);
            expect(dot, `${id} ring ${s}.${k}`).toBeGreaterThan(0);
          }
        }
        return;
      }
      let outward = 0;
      for (let i = 0; i < position.count; i += 1) {
        const dot = normal.getX(i) * (position.getX(i) - cx) + normal.getY(i) * (position.getY(i) - cy) + normal.getZ(i) * (position.getZ(i) - cz);
        if (dot > 0) outward += 1;
      }
      expect(outward / position.count, id).toBeGreaterThan(0.9);
    }
  });

  it('has a material kind of its own', () => {
    expect(CLOTH_KINDS[kind]).toBeTruthy();
    expect(Object.values(HEADWEAR_PARTS).some((entry) => entry.cloth === kind)).toBe(true);
    expect(HEADWEAR_PARTS[kind].cloth).toBe(kind);
  });
});

describe('the band’s free ends', () => {
  it('move in the air and the band itself does not', () => {
    const [{ skull }] = skulls();
    const { aCloth, position } = hatGeometry(THREE, skull, 'band').shell.attributes;
    let moving = 0; let still = 0;
    for (let i = 0; i < aCloth.count; i += 1) { if (aCloth.getY(i) > 0.5) moving += 1; else still += 1; }
    expect(moving).toBeGreaterThan(0);
    expect(still).toBeGreaterThan(moving);
    // And the ones that move are the low ones.
    let lowestMoving = Infinity; let highestStill = -Infinity;
    for (let i = 0; i < aCloth.count; i += 1) {
      if (aCloth.getY(i) > 0.5) lowestMoving = Math.min(lowestMoving, position.getY(i));
      else highestStill = Math.max(highestStill, position.getY(i));
    }
    expect(lowestMoving).toBeLessThan(highestStill - 0.05);
  });
});

describe('hats on the people who wear them', () => {
  it('shapeHeadwear hands out each one, and a veil is still a draped cloth', () => {
    const [{ skull }] = skulls();
    for (const kind of HATS) expect(shapeHeadwear(THREE, skull, kind).shell.attributes.position.count).toBeGreaterThan(50);
    expect(shapeHeadwear(THREE, skull, 'veil').shell.attributes.position.count).toBe((DRAPES.veil.columns + 1) * (DRAPES.veil.rows + 1));
  });

  it('the crowd draws a priest’s turban and a soldier’s helmet on exactly those who wear them', () => {
    const figures = [
      { id: 'priest-a', kind: 'man', dress: 'priest', x: 0, z: 0 },
      { id: 'priest-b', kind: 'man', dress: 'priest', x: 1, z: 0 },
      { id: 'guard', kind: 'man', dress: 'soldier', x: 2, z: 0 },
      { id: 'woman', kind: 'woman', x: 3, z: 0 },
      { id: 'nobody', kind: 'man', bareheaded: true, x: 4, z: 0 },
    ];
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'second-temple' });
    try {
      crowd.acceptAssets({ models });
      const visible = (part, slot) => {
        const m = new THREE.Matrix4(); part.mesh.getMatrixAt(slot, m);
        return new THREE.Vector3().setFromMatrixScale(m).length() > 0;
      };
      const worn = Object.values(HEADWEAR_PARTS).map((entry) => entry.part);
      for (const person of crowd.people) {
        const id = person.figure.id;
        const parts = crowd.models.get(person.model).meshes.filter((p) => worn.includes(p.partName));
        const showing = parts.filter((p) => visible(p, person.slot)).map((p) => p.partName);
        const expected = person.appearance.headwear ? [HEADWEAR_PARTS[person.appearance.headwear].part] : [];
        expect(showing, id).toEqual(expected);
      }
      const byId = (id) => crowd.people.find((p) => p.figure.id === id).appearance.headwear;
      expect(byId('priest-a')).toBe('turban');
      expect(byId('guard')).toBe('helmet');
      expect(byId('woman')).toBe('veil');
      expect(byId('nobody')).toBe(null);
      // The helmet is metal.
      const helmet = crowd.models.get(crowd.people.find((p) => p.figure.id === 'guard').model).meshes.find((p) => p.partName === 'helmet');
      expect(helmet.mesh.material.metalness).toBeGreaterThan(0.5);
      expect(helmet.mesh.material.map).toBe(null);
      const turban = crowd.models.get(crowd.people.find((p) => p.figure.id === 'priest-a').model).meshes.find((p) => p.partName === 'turban');
      expect(turban.mesh.material.map).toBeTruthy();
    } finally { crowd.dispose(); }
  }, 30000);

  it('a near actor wears the same, as one part named for what it is made of', () => {
    const figures = [
      { id: 'near-priest', kind: 'man', dress: 'priest', x: 0, z: 0 },
      { id: 'near-guard', kind: 'man', dress: 'soldier', x: 0.6, z: 0 },
    ];
    const near = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'second-temple', crowdFigures: figures, qualityProfile: 'high', actorLimits: { high: 4 } });
    try {
      near.acceptAssets({ models });
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 2);
      near.update({ camera, elapsed: 0, delta: 0 });
      const actor = (id) => near.getActors().get(`human-${id}`);
      const priest = actor('near-priest').root.getObjectByName('headwrap');
      const guard = actor('near-guard').root.getObjectByName('headwrap');
      expect(priest.material.customProgramCacheKey()).toContain('cloth-turban');
      expect(guard.material.customProgramCacheKey()).toContain('cloth-helmet');
      expect(guard.material.metalness).toBeGreaterThan(0.5);
      expect(priest.material.metalness).toBe(0);
    } finally { near.dispose(); }
  }, 30000);
});
