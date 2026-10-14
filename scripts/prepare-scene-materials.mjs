// Rebuild the locally hosted CC0 surface library for every scene after Bethlehem.
// Poly Haven assets only (CC0). No runtime third-party requests: each map is
// downloaded once here, re-encoded as a 1024px WebP, named by content hash and
// indexed in src/components/scene/sceneMaterialAssets.js.
//
// Two tiers are written for every scan: the 1024px maps, and a 512px set for
// phones and the low quality profile (`mapsLow` / `filesLow`; the asset session
// picks one). A quarter of the pixels is a quarter of the download and of the
// GPU memory, and the normal map still carries the surface at that size.
//
// A surface that Bethlehem already ships (matched by its source URL) is reused
// by reference, so a visitor who has seen one scene does not download the same
// plaster again for the next. Everything else lands in shared/materials/, where
// two scenes that want the same scan also share the file.
//
// Requires curl and the project's sharp dependency. Run from any directory:
//   node scripts/prepare-scene-materials.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BETHLEHEM_MATERIAL_ASSETS } from '../src/components/scene/bethlehemMaterialAssets.js';

const root = path.resolve(import.meta.dirname, '..');
const destination = 'public/assets/scenes/shared/materials';
await mkdir(path.join(root, destination), { recursive: true });

// [role, Poly Haven asset, tile size in metres]. The tile size is advice for
// the builder (it passes `metres` to applyScannedSurface); it is recorded so
// the choice is reviewable next to the source.
const SCENE_MATERIALS = {
  'second-temple': [
    ['ashlar', 'white_sandstone_blocks_02', 6],
    ['paving', 'marble_01', 4],
    ['timber', 'weathered_brown_planks', 2],
    ['earth', 'dry_ground_rocks', 3],
  ],
  caesarea: [
    ['masonry', 'seaworn_sandstone_brick', 5],
    ['plaster', 'yellow_plaster', 3],
    ['roof', 'clay_roof_tiles_02', 2.5],
    ['timber', 'weathered_brown_planks', 2],
  ],
  capernaum: [
    ['basalt', 'dark_rock_02', 2],
    ['earth', 'dry_mud_field_001', 3],
    ['plaster', 'clay_plaster', 2.5],
    ['thatch', 'reed_roof_03', 2],
    ['timber', 'weathered_brown_planks', 2],
  ],
  tabernacle: [
    ['sand', 'dense_sand', 5],
    ['granite', 'tiger_rock', 4],
    ['hair', 'hessian_380', 1.2],
    ['timber', 'weathered_brown_planks', 2],
  ],
  'valley-of-elah': [
    ['ground', 'rocks_ground_02', 4],
    ['limestone', 'rocks_ground_06', 4],
    ['cloth', 'hessian_380', 1.2],
  ],
  'mount-of-olives': [
    ['limestone', 'white_sandstone_blocks_02', 5],
    ['rock', 'rock_boulder_dry', 3],
    ['earth', 'rocks_ground_02', 4],
    ['timber', 'weathered_brown_planks', 2],
    ['hair', 'hessian_380', 1.2],
  ],
  sinai: [
    ['granite', 'tiger_rock', 4],
    ['cliff', 'rock_face_03', 4],
    ['earth', 'rocky_trail', 3],
    ['cloth', 'hessian_380', 1.2],
    ['timber', 'weathered_brown_planks', 2],
  ],
};

const MAPS = [
  ['diffuse', ['Diffuse'], 85],
  ['normal', ['nor_gl'], 94],
  ['roughness', ['Rough'], 85],
];

const bethlehemFiles = new Map();
for (const material of BETHLEHEM_MATERIAL_ASSETS)
  for (const [map, file] of Object.entries(material.files))
    bethlehemFiles.set(file.sourceUrl, { url: material.maps[map], ...file });

const curl = (url) => execFileSync('curl', ['-fsSL', '--retry', '3', url], { maxBuffer: 64 * 1024 * 1024 });
const apiCache = new Map();
const files = (asset) => {
  if (!apiCache.has(asset)) apiCache.set(asset, JSON.parse(curl(`https://api.polyhaven.com/files/${asset}`)));
  return apiCache.get(asset);
};
const info = (asset) => JSON.parse(curl(`https://api.polyhaven.com/info/${asset}`));
const built = new Map(); // `${asset}/${map}` -> { full, low }, each { url, sourceUrl, hash, size }

async function encode(original, asset, map, size, quality, sourceUrl) {
  const buffer = await sharp(original).resize(size, size, { fit: 'fill' }).webp({ quality, effort: 6 }).toBuffer();
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  const filename = `${asset}-${map}${size === 1024 ? '' : `-${size}`}-${hash}.webp`;
  await writeFile(path.join(root, destination, filename), buffer);
  return { url: `/assets/scenes/shared/materials/${filename}`, sourceUrl, hash, size: buffer.length };
}

async function prepareMap(asset, map, keys, quality) {
  const id = `${asset}/${map}`;
  if (built.has(id)) return built.get(id);
  const listing = files(asset);
  const key = keys.find((k) => listing[k]);
  if (!key) return null;
  const choice = listing[key]['1k'];
  const source = choice?.jpg ?? choice?.png;
  if (!source) return null;
  const original = curl(source.url);
  const result = {
    // A scan Bethlehem already ships is that file, not a second copy of it.
    full: bethlehemFiles.get(source.url) ?? await encode(original, asset, map, 1024, quality, source.url),
    low: await encode(original, asset, map, 512, map === 'normal' ? 92 : 80, source.url),
  };
  built.set(id, result);
  return result;
}

// Average colour of a diffuse map, in linear light. The runtime uses it to
// keep a surface's palette: applyScannedSurface solves for the tint that makes
// the scan average out to the colour the scene was already tuned around, so the
// scan adds detail without silently re-colouring (or re-lighting) the place.
const lut = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const meanCache = new Map();
async function linearMean(url) {
  if (!meanCache.has(url)) {
    const { data, info: size } = await sharp(path.join(root, 'public', url)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += size.channels) for (let c = 0; c < 3; c++) sum[c] += lut[data[i + c]];
    const pixels = data.length / size.channels;
    meanCache.set(url, sum.map((v) => Math.round((v / pixels) * 10000) / 10000));
  }
  return meanCache.get(url);
}

const library = {};
const credits = new Map();
for (const [slug, definitions] of Object.entries(SCENE_MATERIALS)) {
  library[slug] = [];
  for (const [role, asset, metres] of definitions) {
    if (!credits.has(asset)) credits.set(asset, Object.keys(info(asset).authors ?? {}).join(', '));
    const material = {
      id: `${slug}-${role}`, scale: [metres, metres], roughness: 1, metalness: 0,
      source: `https://polyhaven.com/a/${asset}`, license: 'CC0', authors: credits.get(asset),
      maps: {}, files: {}, mapsLow: {}, filesLow: {},
    };
    for (const [map, keys, quality] of MAPS) {
      const result = await prepareMap(asset, map, keys, quality);
      if (!result) continue;
      material.maps[map] = result.full.url;
      material.files[map] = { sourceUrl: result.full.sourceUrl, hash: result.full.hash, size: result.full.size };
      material.mapsLow[map] = result.low.url;
      material.filesLow[map] = { sourceUrl: result.low.sourceUrl, hash: result.low.hash, size: result.low.size };
    }
    if (!material.maps.diffuse) throw new Error(`${asset} has no diffuse map`);
    material.mean = await linearMean(material.maps.diffuse);
    library[slug].push(material);
  }
}

await writeFile(path.join(root, 'src/components/scene/sceneMaterialAssets.js'),
  '// Generated by scripts/prepare-scene-materials.mjs. Poly Haven assets: CC0.\n'
  + '// Bethlehem keeps its own library (bethlehemMaterialAssets.js); a scan both\n'
  + '// scenes use is the same file, so it is fetched once.\n'
  + `export const SCENE_MATERIAL_ASSETS = ${JSON.stringify(library, null, 2)};\n`);

const unique = new Map();
for (const list of Object.values(library))
  for (const material of list)
    for (const file of [...Object.values(material.files), ...Object.values(material.filesLow)]) unique.set(file.hash, file.size);
const mib = (n) => (n / 1048576).toFixed(2);
const perScene = Object.entries(library).map(([slug, list]) =>
  `${slug}: ${mib(list.flatMap((m) => Object.values(m.files)).reduce((n, f) => n + f.size, 0))} MiB full, `
  + `${mib(list.flatMap((m) => Object.values(m.filesLow)).reduce((n, f) => n + f.size, 0))} MiB small`);
console.log(`Prepared ${Object.values(library).flat().length} material sets, ${unique.size} distinct files `
  + `(${mib([...unique.values()].reduce((n, size) => n + size, 0))} MiB on disk, counting the Bethlehem files these scenes reuse).`);
console.log(perScene.join('\n'));
