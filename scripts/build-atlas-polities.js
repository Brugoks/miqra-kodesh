// Generate src/assets/atlas-polities.json for the Ancient World Atlas (/atlas).
//
// The hand-authored source is src/assets/atlas-polity-extents.json: one coarse,
// CONVEX box per polity. Those read as obvious rectangles on the map — a
// territory's edge runs straight out to sea, ignoring the coastline the
// basemap draws underneath it. This script clips each extent to real land, so
// the seaward edges follow the actual coast and the Dead Sea and Sea of Galilee
// punch through as holes, while the inland edges stay the deliberately
// approximate teaching shapes they always were.
//
// Land comes from Natural Earth 10m (public domain — which also sidesteps the
// ODbL derivative question the way docs/ancient-atlas-plan.md §Phase 5 does for
// tiles). Fetched at build time only, cached under scripts/.cache/, and never
// touched at runtime: the app loads the generated asset like any other.
//
// Usage:
//   node scripts/build-atlas-polities.js          # writes the asset
//   node scripts/build-atlas-polities.js --check  # CI drift check
//
// Why clipping is safe without a polygon-boolean dependency: Sutherland-Hodgman
// clips an arbitrary (concave, many-ringed) SUBJECT against a CONVEX clip
// region, exactly. Land is the subject; the extent is the clip. That is the
// whole reason extents must stay convex, and why assertConvex below fails the
// build rather than quietly emitting a wrong territory — a concave extent
// silently loses area, which is how Jerusalem briefly fell outside Judah.

import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), 'src/assets');
const CACHE_DIR = path.resolve(process.cwd(), 'scripts/.cache');
const EXTENTS_PATH = path.join(ASSETS_DIR, 'atlas-polity-extents.json');
const OUT_PATH = path.join(ASSETS_DIR, 'atlas-polities.json');

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = { land: 'ne_10m_land.geojson', lakes: 'ne_10m_lakes.geojson' };

// Islands and lakes below these areas (square degrees; ~0.01 is roughly a
// 10km box at this latitude) are specks at the zooms this layer is read at.
// Without them Persia alone picks up 70 Gulf islets.
const MIN_PIECE_AREA = 0.01;
const MIN_HOLE_AREA = 0.004;

// Douglas-Peucker tolerance, scaled to the extent's own size: Judah is read at
// z8+ and needs a coast you can recognise, while Persia spans the Iranian
// plateau and is only ever seen zoomed out. A single tolerance either bloats
// the payload for the empires or blurs the Levant, which is where every reader
// actually looks.
const MIN_TOLERANCE = 0.004;
const MAX_TOLERANCE = 0.03;
const TOLERANCE_PER_DEGREE = 0.004;

async function loadSource(file) {
  const cached = path.join(CACHE_DIR, file);
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  process.stdout.write(`  fetching ${file} …`);
  const response = await fetch(`${NE_BASE}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const text = await response.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, text);
  process.stdout.write(` ${(text.length / 1e6).toFixed(1)}MB, cached\n`);
  return JSON.parse(text);
}

// ── Geometry ─────────────────────────────────────────────────────────────

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum / 2;
}

// GeoJSON wants exterior rings counter-clockwise and holes clockwise (RFC 7946).
const ccw = (ring) => (signedArea(ring) < 0 ? ring.slice().reverse() : ring);
const cw = (ring) => (signedArea(ring) > 0 ? ring.slice().reverse() : ring);

const bbox = (ring) => ring.reduce(
  (b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])],
  [Infinity, Infinity, -Infinity, -Infinity],
);
const bboxHit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

function assertConvex(ring, slug) {
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const turn = cross(ring[i], ring[(i + 1) % ring.length], ring[(i + 2) % ring.length]);
    if (turn > 1e-9) positive += 1;
    else if (turn < -1e-9) negative += 1;
  }
  if (positive && negative) {
    throw new Error(
      `atlas-polity-extents.json: "${slug}" is not convex. The coastline clip is exact only for `
      + 'a convex clip region — a concave extent silently loses area. Straighten the reflex '
      + 'vertex, or split the polity into two convex extents.',
    );
  }
}

// Clip an arbitrary subject ring against a convex clip ring, keeping the part
// inside the clip. `clip` must be counter-clockwise so "inside" is "left of
// every directed edge".
function clipRing(subject, clip) {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    const inside = (p) => cross(a, b, p) >= 0;
    const intersect = (p, q) => {
      const dp = cross(a, b, p);
      const dq = cross(a, b, q);
      const t = dp / (dp - dq);
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    };
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(intersect(previous, current));
        output.push(current);
      } else if (inside(previous)) {
        output.push(intersect(previous, current));
      }
    }
  }
  return output;
}

function simplify(ring, tolerance) {
  if (ring.length < 4) return ring;
  const distanceSq = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (!dx && !dy) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
  };
  const keep = new Array(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack = [[0, ring.length - 1]];
  const toleranceSq = tolerance * tolerance;
  while (stack.length) {
    const [start, end] = stack.pop();
    let worst = 0;
    let worstIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = distanceSq(ring[i], ring[start], ring[end]);
      if (d > worst) { worst = d; worstIndex = i; }
    }
    if (worst > toleranceSq && worstIndex > 0) {
      keep[worstIndex] = true;
      stack.push([start, worstIndex], [worstIndex, end]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const close = (ring) => [...ring, ring[0]];
const round = (ring) => ring.map(([lon, lat]) => [
  Number(lon.toFixed(4)), Number(lat.toFixed(4)),
]);

function toleranceFor(extent) {
  const [minLon, minLat, maxLon, maxLat] = bbox(extent);
  const span = Math.max(maxLon - minLon, maxLat - minLat);
  return Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, span * TOLERANCE_PER_DEGREE));
}

// ── Build ────────────────────────────────────────────────────────────────

const extentsAsset = JSON.parse(fs.readFileSync(EXTENTS_PATH, 'utf8'));
const [land, lakes] = await Promise.all([loadSource(SOURCES.land), loadSource(SOURCES.lakes)]);

const polygonsOf = (feature) => (feature.geometry.type === 'Polygon'
  ? [feature.geometry.coordinates]
  : feature.geometry.coordinates);

const features = [];
const summary = [];

for (const extentFeature of extentsAsset.features) {
  const { s: slug } = extentFeature.properties;
  const extent = ccw(extentFeature.geometry.coordinates[0].slice(0, -1));
  assertConvex(extent, slug);
  const extentBox = bbox(extent);
  const tolerance = toleranceFor(extent);

  const polygons = [];
  for (const landFeature of land.features) {
    for (const polygon of polygonsOf(landFeature)) {
      if (!bboxHit(bbox(polygon[0]), extentBox)) continue;
      const outer = clipRing(ccw(polygon[0].slice(0, -1)), extent);
      if (outer.length < 3 || Math.abs(signedArea(outer)) < MIN_PIECE_AREA) continue;
      const rings = [round(simplify(close(outer), tolerance))];
      // Holes the land layer already carries (inland seas, e.g. the Caspian).
      for (let h = 1; h < polygon.length; h += 1) {
        const hole = clipRing(ccw(polygon[h].slice(0, -1)), extent);
        if (hole.length < 3 || Math.abs(signedArea(hole)) < MIN_HOLE_AREA) continue;
        rings.push(round(cw(simplify(close(hole), tolerance))));
      }
      polygons.push(rings);
    }
  }

  if (!polygons.length) {
    throw new Error(`"${slug}" clipped to nothing — its extent covers no land. Check its coordinates.`);
  }

  // Lakes become holes in whichever land piece contains them. The Dead Sea and
  // the Sea of Galilee are the two that genuinely read on a map of this region,
  // and a territory painted straight over them looks wrong at any zoom.
  let lakeHoles = 0;
  for (const lakeFeature of lakes.features) {
    for (const polygon of polygonsOf(lakeFeature)) {
      if (!bboxHit(bbox(polygon[0]), extentBox)) continue;
      const hole = clipRing(ccw(polygon[0].slice(0, -1)), extent);
      if (hole.length < 3 || Math.abs(signedArea(hole)) < MIN_HOLE_AREA) continue;
      polygons[0].push(round(cw(simplify(close(hole), tolerance))));
      lakeHoles += 1;
    }
  }

  // Largest piece first, so a consumer that only wants one ring gets the
  // mainland rather than an island, and so the output order is deterministic.
  polygons.sort((a, b) => Math.abs(signedArea(b[0])) - Math.abs(signedArea(a[0])));

  features.push({
    type: 'Feature',
    properties: extentFeature.properties,
    geometry: polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons },
  });

  const points = polygons.reduce((n, rings) => n + rings.reduce((m, r) => m + r.length, 0), 0);
  summary.push({ slug, pieces: polygons.length, lakeHoles, points, tolerance });
}

const output = `${JSON.stringify({
  type: 'FeatureCollection',
  // The editorial disclaimer travels verbatim from the extents file; only the
  // provenance line is added here, so the caveat can never be lost in a build.
  note: `GENERATED by scripts/build-atlas-polities.js from atlas-polity-extents.json — do not edit. ${extentsAsset.caveat}`,
  features,
}, null, 1)}\n`;

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
  if (existing !== output) {
    console.error('atlas-polities.json is out of date. Run `node scripts/build-atlas-polities.js` and commit the result.');
    process.exit(1);
  }
  console.log('atlas-polities.json is up to date.');
  process.exit(0);
}

fs.writeFileSync(OUT_PATH, output);
console.log(`Wrote ${OUT_PATH}`);
for (const row of summary) {
  console.log(
    `  ${row.slug.padEnd(11)} ${String(row.pieces).padStart(2)} piece(s)`
    + `  ${String(row.lakeHoles).padStart(2)} lake hole(s)`
    + `  ${String(row.points).padStart(4)} pts  tol ${row.tolerance.toFixed(3)}`,
  );
}
const totalPoints = summary.reduce((n, r) => n + r.points, 0);
console.log(`  ${features.length} polities, ${totalPoints} points, ${(output.length / 1024).toFixed(1)}KB`);
