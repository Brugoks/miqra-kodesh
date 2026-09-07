import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCENES } from './scenes';
import { fitForSpeech } from './sceneNarration';
import { NARRATION_VOICE, SCENE_NARRATION, narrationFor } from './sceneNarrationManifest';

// The narration is a build artefact, and the failure it can have is a quiet
// one: edit a blurb, forget to re-run scripts/build-scene-narration.js, and the
// tour silently drops to the read-along fallback for that stop. Nothing throws
// and nothing looks broken — the visitor just stops being spoken to halfway
// round. These are the checks that notice.

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

// SCENES is a list; the manifest is keyed by slug.
const bySlug = new Map(Object.values(SCENES).map((scene) => [scene.slug, scene]));

describe('scene narration manifest', () => {
  it('has a recording for every vantage of every scene', () => {
    const missing = [];
    for (const scene of Object.values(SCENES)) {
      for (const vantage of scene.vantages) {
        if (!narrationFor(scene.slug, vantage.id)) missing.push(`${scene.slug}/${vantage.id}`);
      }
    }
    expect(missing, 'run: node scripts/build-scene-narration.js').toEqual([]);
  });

  it('points at files that are actually committed', () => {
    const absent = [];
    for (const stops of Object.values(SCENE_NARRATION)) {
      for (const { file } of Object.values(stops)) {
        if (!fs.existsSync(path.join(PUBLIC_DIR, file.replace(/^\//, '')))) absent.push(file);
      }
    }
    expect(absent).toEqual([]);
  });

  it('records the length of the line it actually spoke', () => {
    // `chars` is what the manifest claims was read aloud. If it drifts from the
    // blurb, the recording is of older words — the same thing the filename hash
    // catches, checked here in a form a human can read in the diff.
    for (const scene of Object.values(SCENES)) {
      for (const vantage of scene.vantages) {
        expect(narrationFor(scene.slug, vantage.id).chars)
          .toBe(fitForSpeech(vantage.blurb).length);
      }
    }
  });

  it('names the voice the fallback should try to match', () => {
    expect(NARRATION_VOICE).toBeTruthy();
  });

  it('has no entries for scenes or vantages that no longer exist', () => {
    for (const [slug, stops] of Object.entries(SCENE_NARRATION)) {
      const scene = bySlug.get(slug);
      expect(scene, `${slug} is recorded but not a scene`).toBeTruthy();
      const ids = new Set(scene.vantages.map((v) => v.id));
      for (const id of Object.keys(stops)) {
        expect(ids.has(id), `${slug}/${id} is recorded but not a vantage`).toBe(true);
      }
    }
  });
});
