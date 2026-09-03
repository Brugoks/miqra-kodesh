// Generate src/assets/bible-atlas.json for the Ancient World Atlas (/atlas).
//
// Reads the existing wiki foundation assets — never modifies them — and
// derives a lean, map-focused payload: eras, tiered places, and events
// resolved to place(s) via chapter-overlap scoring. See docs/ancient-atlas-plan.md
// for the full design.
//
// Usage:
//   node scripts/build-atlas.js            # writes src/assets/bible-atlas.json
//   node scripts/build-atlas.js --check     # rebuilds in memory and diffs
//                                            # against the committed asset (CI drift check)

import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), 'src/assets');
const OUT_PATH = path.join(ASSETS_DIR, 'bible-atlas.json');
const REVIEW_PATH = path.resolve(process.cwd(), 'scripts/atlas-review.json');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, file), 'utf8'));

const bibleEvents = readJson('bible-events.json');
const biblePlaces = readJson('bible-places.json');
const bibleWiki = readJson('bible-wiki.json');
const atlasOverrides = readJson('atlas-overrides.json');
const atlasPolities = readJson('atlas-polities.json');
const politySlugSet = new Set(atlasPolities.features.map((f) => f.properties.s));

// Equal-width scrubber segments; `window` is the +/- year range considered
// "current" at a given scrub position within that era (see docs/ancient-atlas-plan.md §Time).
const ERAS = [
  { s: 'primeval', n: 'Primeval', from: -4003, to: -2100, window: 150 },
  { s: 'patriarchs', n: 'Patriarchs', from: -2100, to: -1500, window: 60 },
  { s: 'exodus-conquest', n: 'Exodus & Conquest', from: -1500, to: -1050, window: 50 },
  { s: 'united-kingdom', n: 'United Kingdom', from: -1050, to: -930, window: 25 },
  { s: 'divided-kingdom', n: 'Divided Kingdom', from: -930, to: -586, window: 30 },
  { s: 'exile-return', n: 'Exile & Return', from: -586, to: -400, window: 40 },
  { s: 'intertestamental', n: 'Between the Testaments', from: -400, to: -5, window: 50 },
  { s: 'gospels', n: 'The Gospels', from: -5, to: 33, window: 3 },
  { s: 'acts-church', n: 'Acts & the Church', from: 33, to: 100, window: 8 },
];

function eraForYear(year) {
  for (const era of ERAS) {
    if (year >= era.from && year <= era.to) return era.s;
  }
  return year < ERAS[0].from ? ERAS[0].s : ERAS[ERAS.length - 1].s;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function tierFor(chapterCount) {
  if (chapterCount >= 21) return 1;
  if (chapterCount >= 6) return 2;
  if (chapterCount >= 2) return 3;
  return 4;
}

// ── Places ───────────────────────────────────────────────────────────────

const wikiPlaceByNorm = new Map(bibleWiki.places.map((p) => [norm(p.n), p.s]));

const places = biblePlaces
  .map((place) => {
    const wikiSlug = wikiPlaceByNorm.get(norm(place.n));
    const slug = wikiSlug || `map-${norm(place.n)}`;
    return {
      s: slug,
      n: place.n,
      la: Number(place.la.toFixed(4)),
      lo: Number(place.lo.toFixed(4)),
      t: tierFor(place.p.length),
      cc: place.p.length,
      w: !!wikiSlug,
      _chapters: place.p, // internal only — stripped before write
    };
  })
  .sort((a, b) => a.s.localeCompare(b.s));

const matchedWikiSlugs = new Set(places.filter((p) => p.w).map((p) => p.s));
if (matchedWikiSlugs.size !== bibleWiki.places.length) {
  throw new Error(
    `Expected every wiki place (${bibleWiki.places.length}) to match a geocoded place by name, `
    + `but only ${matchedWikiSlugs.size} matched. The wiki build likely changed underneath — `
    + 'investigate before shipping a silently smaller atlas.',
  );
}

// Chapter -> place indices, so event resolution only scores real candidates
// instead of scanning all 1,252 places per event.
const chapterToPlaceIdx = new Map();
places.forEach((p, i) => {
  for (const ch of p._chapters) {
    let list = chapterToPlaceIdx.get(ch);
    if (!list) { list = []; chapterToPlaceIdx.set(ch, list); }
    list.push(i);
  }
});

// ── Event -> place resolution (TF-IDF-style; see docs/ancient-atlas-plan.md §04) ──

function chapterOf(fv) {
  if (!fv) return null;
  const parts = fv.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

function resolvePlaces(event) {
  const eventChapters = new Set(event.p || []);
  const fvChapter = chapterOf(event.fv);
  const candidateIdx = new Set();
  for (const ch of eventChapters) {
    for (const idx of chapterToPlaceIdx.get(ch) || []) candidateIdx.add(idx);
  }

  const scored = [];
  for (const idx of candidateIdx) {
    const place = places[idx];
    let overlap = 0;
    for (const ch of place._chapters) if (eventChapters.has(ch)) overlap += 1;
    if (overlap === 0) continue;
    const coverage = overlap / eventChapters.size;
    const specificity = 1 / Math.log2(place._chapters.length + 2);
    const fvBonus = fvChapter && place._chapters.includes(fvChapter) ? 1.5 : 1.0;
    const score = coverage * specificity * fvBonus;
    if (score >= 0.15) scored.push({ slug: place.s, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  return {
    pl: top.map((t) => t.slug),
    cf: top.length ? Math.min(1, Number(top[0].score.toFixed(3))) : 0,
  };
}

const placeSlugSet = new Set(places.map((p) => p.s));
const tier1Slugs = new Set(places.filter((p) => p.t === 1).map((p) => p.s));

const reviewQueue = [];
const events = [];

for (const raw of bibleEvents.events) {
  if (raw.y == null) continue; // undated events are excluded from the atlas, not forced onto it

  const override = atlasOverrides[raw.s];
  let resolution = resolvePlaces(raw);

  if (override) {
    for (const slug of override.pl || []) {
      if (!placeSlugSet.has(slug)) {
        throw new Error(`atlas-overrides.json: "${raw.s}" references unknown place slug "${slug}"`);
      }
    }
    for (const key of ['att', 'def']) {
      if (override[key] && !politySlugSet.has(override[key])) {
        throw new Error(`atlas-overrides.json: "${raw.s}".${key} references unknown polity slug "${override[key]}"`);
      }
    }
    resolution = {
      pl: override.pl !== undefined ? override.pl : resolution.pl,
      cf: override.cf !== undefined ? override.cf : resolution.cf,
    };
  } else if (
    resolution.pl.length > 0
    && resolution.pl.every((s) => tier1Slugs.has(s))
    && resolution.cf < 0.3
  ) {
    // Resolves only to a mega-place (Jerusalem, Egypt, ...) with low confidence —
    // queue for a manual/LLM review pass rather than shipping a probable miss.
    reviewQueue.push({ s: raw.s, n: raw.n, fv: raw.fv, cf: resolution.cf, pl: resolution.pl });
  }

  const event = {
    s: raw.s,
    n: raw.n,
    y: raw.y,
    fv: raw.fv,
    era: eraForYear(raw.y),
    pl: resolution.pl,
    cf: resolution.cf,
    pe: raw.pe || [],
  };
  if (override?.k) event.k = override.k;
  if (override?.att) event.att = override.att;
  if (override?.def) event.def = override.def;

  events.push(event);
}

events.sort((a, b) => a.s.localeCompare(b.s));

const resolvedCount = events.filter((e) => e.pl.length > 0).length;

// ── Assemble & write ─────────────────────────────────────────────────────

const atlas = {
  meta: {
    events: events.length,
    eventsResolved: resolvedCount,
    places: places.length,
    chronology: 'traditional',
  },
  eras: ERAS,
  places: places.map((p) => ({ s: p.s, n: p.n, la: p.la, lo: p.lo, t: p.t, cc: p.cc, w: p.w })),
  events,
};

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const output = stableStringify(atlas);

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
  if (existing !== output) {
    console.error('bible-atlas.json is out of date. Run `node scripts/build-atlas.js` and commit the result.');
    process.exit(1);
  }
  console.log('bible-atlas.json is up to date.');
  process.exit(0);
}

fs.writeFileSync(OUT_PATH, output);
console.log(`Wrote ${OUT_PATH}`);
console.log(`  ${places.length} places (${matchedWikiSlugs.size} with wiki pages)`);
console.log(`  ${events.length} dated events, ${resolvedCount} resolved to a place (${((resolvedCount / events.length) * 100).toFixed(1)}%)`);

if (reviewQueue.length) {
  fs.writeFileSync(REVIEW_PATH, stableStringify(reviewQueue));
  console.log(`  ${reviewQueue.length} low-confidence resolutions queued for review -> ${REVIEW_PATH}`);
} else if (fs.existsSync(REVIEW_PATH)) {
  fs.unlinkSync(REVIEW_PATH);
}
