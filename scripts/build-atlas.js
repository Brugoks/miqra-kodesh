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
import { NO_TRACE, TRACE_MIN_EVENTS } from '../src/lib/atlas.js';

const ASSETS_DIR = path.resolve(process.cwd(), 'src/assets');
const OUT_PATH = path.join(ASSETS_DIR, 'bible-atlas.json');
const REVIEW_PATH = path.resolve(process.cwd(), 'scripts/atlas-review.json');
const TRACEABLE_PATH = path.join(ASSETS_DIR, 'atlas-traceable-people.json');

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

// ── Event -> place resolution ────────────────────────────────────────────
//
// Three sources, in descending order of authority:
//
//   1. atlas-overrides.json          hand corrections, merged last, always win
//   2. bible-events.json's own `pl`  curated upstream, covers 241/400 events
//   3. chapter-overlap scoring       the inferred fallback, for the rest
//
// (2) was previously ignored entirely, which is how "Abraham goes to Egypt"
// ended up pinned at Moreh and every Divided-Kingdom reign at Janoah. The
// curated slugs use bare names ('babel', 'machpelah') while atlas place slugs
// carry a `map-` prefix wherever no wiki page matched, so they need
// reconciling — all 92 distinct curated slugs resolve by exact match or by
// `map-${norm(name)}`, and the build asserts that below.
//
// `cf` is 1 exactly when a place was curated or overridden, and strictly less
// than 1 when it was inferred: the scoring function's ceiling is
// 1.0 (coverage) x 0.631 (specificity at cc=1) x 1.5 (fvBonus) = 0.946. The
// UI relies on that gap to tell "we know this" from "we guessed this" without
// carrying an extra field on all 400 events.

const CURATED_CF = 1;

function chapterOf(fv) {
  if (!fv) return null;
  const parts = fv.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

const placeBySlug = new Map(places.map((p) => [p.s, p]));

// Curated slug -> atlas slug. Exact first (wiki-backed places keep their bare
// slug), then the `map-` prefix the place build assigns to everything else.
function reconcileCuratedSlug(slug) {
  if (placeBySlug.has(slug)) return slug;
  const mapped = `map-${norm(slug)}`;
  return placeBySlug.has(mapped) ? mapped : null;
}

// Birth / Death / Lifetime / Reign / Judgeship events are biographical, and
// the ones the upstream data declines to place are the Genesis 5 and 11
// genealogies — "Birth of Peleg", "Lifetime of Serug" — which name no
// location at all. Chapter overlap will still happily resolve them (all 28 of
// them landed on Babel, because Babel is the rarest toponym in Genesis 10-11),
// but a genealogy entry has no geography to find. Absence of a curated place
// on one of these means we genuinely do not know, so say nothing rather than
// scattering the primeval map with confident inventions. Events that DO have a
// location keep it: Death of Moses -> Mount Nebo, Death of Abraham -> Machpelah.
const BIOGRAPHICAL = /^(Birth|Death|Lifetime|Reign|Judgeship) of\b/i;

function resolveInferred(event) {
  const eventChapters = new Set(event.p || []);
  const fvChapter = chapterOf(event.fv);
  const candidateIdx = new Set();
  for (const ch of eventChapters) {
    for (const idx of chapterToPlaceIdx.get(ch) || []) candidateIdx.add(idx);
  }

  // Coverage cannot discriminate when an event spans a single chapter: every
  // place in that chapter scores 1.0, so the ranking collapses onto
  // specificity and the RAREST toponym in the chapter wins outright. Rarity is
  // not evidence of being the subject — it is usually evidence of being
  // scenery. Rank those by prominence instead, unless the event's own name
  // says which place it means.
  const singleChapter = eventChapters.size <= 1;
  const eventName = norm(event.n);

  const scored = [];
  for (const idx of candidateIdx) {
    const place = places[idx];
    let overlap = 0;
    for (const ch of place._chapters) if (eventChapters.has(ch)) overlap += 1;
    if (overlap === 0) continue;
    const coverage = overlap / eventChapters.size;
    const specificity = 1 / Math.log2(place._chapters.length + 2);
    const fvBonus = fvChapter && place._chapters.includes(fvChapter) ? 1.5 : 1.0;
    // Only counts for places named distinctly enough to be worth matching —
    // a 2-character name would hit inside half the event titles in the set.
    const named = norm(place.n).length >= 4 && eventName.includes(norm(place.n));
    const score = coverage * specificity * fvBonus;
    if (score >= 0.15) scored.push({ slug: place.s, score, named, cc: place.cc });
  }

  scored.sort((a, b) => {
    if (a.named !== b.named) return a.named ? -1 : 1;
    if (singleChapter) return b.cc - a.cc || b.score - a.score;
    return b.score - a.score;
  });
  const top = scored.slice(0, 3);
  return {
    pl: top.map((t) => t.slug),
    cf: top.length ? Math.min(0.999, Number(top[0].score.toFixed(3))) : 0,
  };
}

// Full resolution for one raw event, before overrides are applied.
function resolvePlaces(event) {
  const curated = (event.pl || []).map(reconcileCuratedSlug).filter(Boolean);
  if ((event.pl || []).length && curated.length !== event.pl.length) {
    const missing = event.pl.filter((s) => !reconcileCuratedSlug(s));
    throw new Error(
      `bible-events.json: "${event.s}" references place slug(s) ${JSON.stringify(missing)} `
      + 'that match no geocoded place, by exact slug or by map-${norm(name)}. '
      + 'Add the place to bible-places.json or correct the event.',
    );
  }
  if (curated.length) return { pl: curated.slice(0, 3), cf: CURATED_CF, curated: true };
  if (BIOGRAPHICAL.test(event.n)) return { pl: [], cf: 0, curated: false };
  return { ...resolveInferred(event), curated: false };
}

// Below this, an inferred resolution is weak enough to be worth a human look.
const REVIEW_CF = 0.3;

const reviewQueue = [];
const events = [];

for (const raw of bibleEvents.events) {
  if (raw.y == null) continue; // undated events are excluded from the atlas, not forced onto it

  const override = atlasOverrides[raw.s];
  let resolution = resolvePlaces(raw);

  if (override) {
    for (const slug of override.pl || []) {
      if (!placeBySlug.has(slug)) {
        throw new Error(`atlas-overrides.json: "${raw.s}" references unknown place slug "${slug}"`);
      }
    }
    for (const key of ['att', 'def']) {
      if (override[key] && !politySlugSet.has(override[key])) {
        throw new Error(`atlas-overrides.json: "${raw.s}".${key} references unknown polity slug "${override[key]}"`);
      }
    }
    const overriddenPl = override.pl !== undefined ? override.pl : resolution.pl;
    resolution = {
      pl: overriddenPl,
      // An override that names places without naming a confidence is a hand
      // correction, and hand corrections are curated by definition. An override
      // to `pl: []` is the deliberate "this event has no place we can honestly
      // pin" case (creation, John's imprisonment at an unmapped Machaerus), and
      // an unplaced event carries no confidence to report.
      cf: overriddenPl.length === 0 ? 0
        : override.cf !== undefined ? override.cf
          : (override.pl !== undefined ? CURATED_CF : resolution.cf),
    };
  } else if (!resolution.curated && resolution.pl.length > 0 && resolution.cf < REVIEW_CF) {
    // Inferred, and weakly. Queue for a manual/LLM pass rather than shipping a
    // probable miss silently — the pin still renders, but the sheet marks it as
    // inferred (see cf handling in AtlasDetailSheet) and this file is the
    // worklist for turning it into a curated one.
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
const curatedCount = events.filter((e) => e.pl.length > 0 && e.cf === CURATED_CF).length;

// ── Traceable people (Phase 6: character traces) ────────────────────────
// A tiny standalone list — not a field on the 300KB+ bible-atlas.json — so
// pages that only need "does this person have a trace worth offering"
// (e.g. a Bible Wiki person page deciding whether to show the button at
// all) never have to fetch the full atlas just to answer that. See
// docs/atlas-enhancements-plan.md §6: this must NOT be a universal button,
// only ~18 people currently clear TRACE_MIN_EVENTS placed events.
const placedEventCountByPerson = new Map();
for (const event of events) {
  if (!event.pl.length) continue;
  for (const person of event.pe || []) {
    placedEventCountByPerson.set(person, (placedEventCountByPerson.get(person) || 0) + 1);
  }
}
const traceablePeople = [...placedEventCountByPerson.entries()]
  .filter(([slug, count]) => count >= TRACE_MIN_EVENTS && !NO_TRACE.has(slug))
  .map(([slug]) => slug)
  .sort();

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
const traceableOutput = stableStringify(traceablePeople);

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
  const existingTraceable = fs.existsSync(TRACEABLE_PATH) ? fs.readFileSync(TRACEABLE_PATH, 'utf8') : null;
  if (existing !== output || existingTraceable !== traceableOutput) {
    console.error('bible-atlas.json (or atlas-traceable-people.json) is out of date. Run `node scripts/build-atlas.js` and commit the result.');
    process.exit(1);
  }
  console.log('bible-atlas.json is up to date.');
  process.exit(0);
}

fs.writeFileSync(OUT_PATH, output);
fs.writeFileSync(TRACEABLE_PATH, traceableOutput);
console.log(`Wrote ${OUT_PATH}`);
console.log(`  ${places.length} places (${matchedWikiSlugs.size} with wiki pages)`);
console.log(`  ${events.length} dated events, ${resolvedCount} resolved to a place (${((resolvedCount / events.length) * 100).toFixed(1)}%)`);
console.log(`    ${curatedCount} curated (cf 1), ${resolvedCount - curatedCount} inferred from chapter overlap`);
console.log(`  ${traceablePeople.length} people qualify for a character trace (>= ${TRACE_MIN_EVENTS} placed events) -> ${TRACEABLE_PATH}`);

if (reviewQueue.length) {
  fs.writeFileSync(REVIEW_PATH, stableStringify(reviewQueue));
  console.log(`  ${reviewQueue.length} low-confidence resolutions queued for review -> ${REVIEW_PATH}`);
} else if (fs.existsSync(REVIEW_PATH)) {
  fs.unlinkSync(REVIEW_PATH);
}
