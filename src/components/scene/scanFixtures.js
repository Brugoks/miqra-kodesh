// Test helpers for the scanned-surface layer: stand-in textures shaped exactly
// like what the asset session hands a builder, and the shader text a material
// would compile to. Not a test file (no `.test.`), so vitest does not run it.
import { SCENE_MATERIAL_ASSETS } from './sceneMaterialAssets';
import { BETHLEHEM_MATERIAL_ASSETS } from './bethlehemMaterialAssets';
import { createPbrMaterial } from './sceneMaterials';

// The group a scene's `surfaces` asset group resolves to, with blank textures.
// `disposed` collects any texture something freed: a builder must never free a
// map the asset session owns.
export function fakeScanGroup(THREE, slug) {
  const defs = slug === 'bethlehem' ? BETHLEHEM_MATERIAL_ASSETS : SCENE_MATERIAL_ASSETS[slug];
  const textures = [];
  const disposed = new Set();
  const texture = () => {
    const t = new THREE.Texture();
    t.addEventListener('dispose', () => disposed.add(t));
    textures.push(t);
    return t;
  };
  const materials = Object.fromEntries(defs.map((def) => [
    def.id, createPbrMaterial(THREE, def, { diffuse: texture(), normal: texture(), roughness: texture() }),
  ]));
  return { group: { groupKey: 'surfaces', id: `${slug}-surfaces`, materials, models: {} }, textures, disposed };
}

export function scannedMaterials(root) {
  const found = new Set();
  root.traverse((object) => {
    for (const material of [].concat(object.material || []))
      if (material?.userData?.scanned) found.add(material);
  });
  return found;
}

// What three would hand the GPU for this material's fragment and vertex stages
// once `onBeforeCompile` has run and every `#include` is expanded.
export function shaderSketch(THREE, material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  const baseline = { vertex: shader.vertexShader, fragment: shader.fragmentShader };
  material.onBeforeCompile(shader, {});
  const expand = (source) => {
    let out = source;
    for (let pass = 0; pass < 10 && /^[ \t]*#include/m.test(out); pass += 1)
      out = out.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name) => THREE.ShaderChunk[name] ?? `/*MISSING ${name}*/`);
    return out;
  };
  return {
    vertex: expand(shader.vertexShader),
    fragment: expand(shader.fragmentShader),
    uniforms: shader.uniforms,
    baseline: { vertex: expand(baseline.vertex), fragment: expand(baseline.fragment) },
  };
}

// Opening minus closing delimiters. three's own chunks are not balanced in
// isolation (an `#ifdef` can open a block that its `#else` branch closes), so
// the check that means something is that an edit leaves the count where the
// untouched shader had it.
export const imbalance = (source, open, close) => source.split(open).length - source.split(close).length;
export function sameBalanceAsBaseline(sketch) {
  return ['vertex', 'fragment'].every((stage) => ['{}', '()', '[]'].every(([open, close]) =>
    imbalance(sketch[stage], open, close) === imbalance(sketch.baseline[stage], open, close)));
}
