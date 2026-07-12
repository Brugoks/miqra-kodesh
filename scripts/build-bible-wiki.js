/* global process */
// Generate the Bible Wiki foundation assets. People come from the Theographic
// Bible Metadata project (CC-BY 4.0,
// https://github.com/robertrouse/theographic-bible-metadata), which links every
// person to the verses that mention them plus family relations. Places are taken
// from the already-generated src/assets/bible-places.json (openbible.info, CC-BY).
//
// Usage:
//   node scripts/build-bible-wiki.js                          # downloads source JSON
//   node scripts/build-bible-wiki.js people.json verses.json [events.json places.json]
//
// Outputs:
//   src/assets/bible-wiki.json          — core: top people/places. Powers the
//     app-wide entity linker and ships as the first wiki chunk, so it stays small
//     and its slugs stay stable (images and observations key off them).
//   src/assets/bible-wiki-extended.json — the long tail: every remaining person
//     and place. Lazy-loaded only when someone browses or searches the wiki.
//   src/assets/bible-events.json        — biblical events (title, year, people,
//     places, chapter refs) in narrative order, for event pages and the timeline.
//
// Entry shape (people):
//   { s: slug, n: name, t: displayTitle?, g: 'M'|'F'?, al: [aliases]?,
//     vc: verseCount, y: [birthYear, deathYear]?, fv/lv: first/last verse
//     passage id, p: ['EXO.4', ...] chapter refs (canonical order),
//     rel: { fa, mo, pt: [], ch: [], sib: [] }? (slugs within the full set),
//     desc: shortBio? (curated, carried forward across regenerations) }
// Places: { s, n, la: lat, lo: lon, p: chapters, desc? }
// Events: { s, n, y?, fv, p: chapters, pe: [person slugs], pl: [place slugs] }

import fs from 'fs';
import path from 'path';

const RAW_BASE = 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json';
const PLACES_PATH = path.resolve(process.cwd(), 'src/assets/bible-places.json');
const OUT_CORE = path.resolve(process.cwd(), 'src/assets/bible-wiki.json');
const OUT_EXTENDED = path.resolve(process.cwd(), 'src/assets/bible-wiki-extended.json');
const OUT_EVENTS = path.resolve(process.cwd(), 'src/assets/bible-events.json');

const PEOPLE_CORE = 200;
const PLACES_CORE = 150;

// Famous figures whose verse counts fall below the top-200 cutoff but who
// clearly belong in the core set (entity linking, images, browsing). They are
// appended after the ranked top 200 rather than displacing anyone, so existing
// core slugs stay stable.
const CORE_INCLUDE = new Set([
  'eve_1231', 'miriam_2087', 'deborah_997', 'goliath_1327', 'hannah_1400',
  'rahab_2388', 'nicodemus_2204', 'zacchaeus_2961', 'lazarus_1812', 'martha_1937',
  'thomas_2851', 'andrew_264', 'matthew_1971', 'luke_1836', 'mark_1679',
  'stephen_2802', 'bathsheba_416', 'delilah_1005', 'hagar_1348', 'abel_13',
  'apollos_276', 'priscilla_2370', 'aquila_279', 'cornelius_956', 'lydia_1837',
  'naaman_2122', 'jael_689', 'zipporah_3095', 'enoch_1192', 'melchisedec_1991', 'ezekiel_1237', 'timotheus_2863',
]);

// OSIS book tokens (used by theographic osisRef) → the app's USFM codes.
const OSIS_TO_CODE = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU',
  Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA',
  '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH',
  Ezra: 'EZR', Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA',
  Prov: 'PRO', Eccl: 'ECC', Song: 'SNG', Isa: 'ISA', Jer: 'JER',
  Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL',
  Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT',
  Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO', Gal: 'GAL', Eph: 'EPH',
  Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH',
  '1Tim': '1TI', '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB',
  Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE', '1John': '1JN',
  '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
};

// Canonical order for sorting chapter refs and first/last appearance.
const BOOK_ORDER = Object.values(OSIS_TO_CODE);
const bookIdx = (code) => BOOK_ORDER.indexOf(code);

async function loadJson(localPath, url) {
  if (localPath) return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${url}): ${res.status}`);
  return res.json();
}

const [people, verses, events, theoPlaces] = await Promise.all([
  loadJson(process.argv[2], `${RAW_BASE}/people.json`),
  loadJson(process.argv[3], `${RAW_BASE}/verses.json`),
  loadJson(process.argv[4], `${RAW_BASE}/events.json`),
  loadJson(process.argv[5], `${RAW_BASE}/places.json`),
]);

// Airtable record id → { code, chapter, verse } for every verse.
const verseById = new Map();
for (const v of verses) {
  const osis = v.fields?.osisRef;
  if (!osis) continue;
  const [osisBook, chapter, verse] = osis.split('.');
  const code = OSIS_TO_CODE[osisBook];
  if (!code) continue;
  verseById.set(v.id, { code, chapter: Number(chapter), verse: Number(verse) });
}

const byCanon = (a, b) =>
  bookIdx(a.code) - bookIdx(b.code) || a.chapter - b.chapter || a.verse - b.verse;

const ranked = [...people]
  .filter((p) => p.fields?.slug && p.fields?.name && Array.isArray(p.fields?.verses) && p.fields.verses.length)
  .sort((a, b) => b.fields.verseCount - a.fields.verseCount);

// Relations resolve across the FULL people set — a core entry may point at an
// extended relative; the entry page always loads the merged dataset.
const inSet = new Map(ranked.map((p) => [p.id, p.fields.slug]));
const relSlugs = (ids) =>
  (Array.isArray(ids) ? ids : []).map((id) => inSet.get(id)).filter(Boolean);

function buildPerson(record) {
  const f = record.fields;
  const resolved = f.verses.map((id) => verseById.get(id)).filter(Boolean).sort(byCanon);
  if (!resolved.length) return null;

  const chapters = [];
  const seen = new Set();
  for (const v of resolved) {
    const ref = `${v.code}.${v.chapter}`;
    if (!seen.has(ref)) { seen.add(ref); chapters.push(ref); }
  }

  const first = resolved[0];
  const last = resolved[resolved.length - 1];
  const entry = {
    s: f.slug,
    n: f.name.trim(),
    vc: f.verseCount,
    fv: `${first.code}.${first.chapter}.${first.verse}`,
    lv: `${last.code}.${last.chapter}.${last.verse}`,
    p: chapters,
  };
  if (f.displayTitle && f.displayTitle.trim() !== f.name.trim()) entry.t = f.displayTitle.trim();
  if (f.gender === 'Male') entry.g = 'M';
  else if (f.gender === 'Female') entry.g = 'F';
  const aliases = (Array.isArray(f.alsoCalled) ? f.alsoCalled : [])
    .filter((a) => typeof a === 'string' && a.trim());
  if (aliases.length) entry.al = aliases.map((a) => a.trim());
  // minYear/maxYear are first/last-mention years (a person can be "mentioned"
  // millennia after death), so only explicit birth/death years are kept.
  const y0 = Number(f.birthYear);
  const y1 = Number(f.deathYear);
  if (Number.isFinite(y0) && Number.isFinite(y1) && y0 && y1) entry.y = [y0, y1];

  const rel = {};
  const fa = relSlugs(f.father)[0];
  const mo = relSlugs(f.mother)[0];
  const pt = relSlugs(f.partners);
  const ch = relSlugs(f.children);
  const sib = relSlugs(f.siblings);
  if (fa) rel.fa = fa;
  if (mo) rel.mo = mo;
  if (pt.length) rel.pt = pt;
  if (ch.length) rel.ch = ch;
  if (sib.length) rel.sib = sib;
  if (Object.keys(rel).length) entry.rel = rel;

  return entry;
}

const corePeople = [];
const extendedPeople = [];
let rankedIn = 0;
for (let i = 0; i < ranked.length; i += 1) {
  const entry = buildPerson(ranked[i]);
  if (!entry) continue;
  rankedIn += 1;
  const isCore = rankedIn <= PEOPLE_CORE || CORE_INCLUDE.has(entry.s);
  (isCore ? corePeople : extendedPeople).push(entry);
}

// Places: reuse the geocoded dataset already shipped for the passage map.
// Slugs are kebab-cased names — kept identical to previous builds so images
// and observations stay attached.
const allPlaces = JSON.parse(fs.readFileSync(PLACES_PATH, 'utf8'));
const kebab = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const usedSlugs = new Set([...corePeople, ...extendedPeople].map((p) => p.s));
const corePlaces = [];
const extendedPlaces = [];
const placeSlugByName = new Map();
for (const place of [...allPlaces].sort((a, b) => b.p.length - a.p.length)) {
  let slug = kebab(place.n);
  if (!slug) continue;
  if (usedSlugs.has(slug)) slug = `${slug}-place`;
  if (usedSlugs.has(slug)) continue; // duplicate place name — keep the better-attested one
  usedSlugs.add(slug);
  placeSlugByName.set(place.n, slug);
  const chapters = [...place.p].sort((a, b) => {
    const [ab, ac] = a.split('.');
    const [bb, bc] = b.split('.');
    return bookIdx(ab) - bookIdx(bb) || Number(ac) - Number(bc);
  });
  const entry = { s: slug, n: place.n, la: place.la, lo: place.lo, p: chapters };
  (corePlaces.length < PLACES_CORE ? corePlaces : extendedPlaces).push(entry);
}

// ── Events ───────────────────────────────────────────────────────────────────
// Theographic events: title + participants + verses, ordered by sortKey
// (narrative/chronological order). Participants map to person slugs; locations
// map to our openbible place slugs by display name.
const theoPlaceName = new Map();
for (const p of theoPlaces) {
  const name = (p.fields?.displayTitle || p.fields?.kjvName || '').trim();
  if (name) theoPlaceName.set(p.id, name);
}

const eventSlugs = new Set();
const outEvents = [];
for (const record of [...events].sort((a, b) => (a.fields?.sortKey || 0) - (b.fields?.sortKey || 0))) {
  const f = record.fields;
  if (!f?.title || !Array.isArray(f.verses)) continue;
  const resolved = f.verses.map((id) => verseById.get(id)).filter(Boolean).sort(byCanon);
  if (!resolved.length) continue;

  let slug = kebab(f.title);
  if (!slug) continue;
  while (eventSlugs.has(slug) || usedSlugs.has(slug)) slug = `${slug}-2`;
  eventSlugs.add(slug);

  const chapters = [];
  const seen = new Set();
  for (const v of resolved) {
    const ref = `${v.code}.${v.chapter}`;
    if (!seen.has(ref)) { seen.add(ref); chapters.push(ref); }
  }
  const first = resolved[0];
  const entry = {
    s: slug,
    n: f.title.trim(),
    fv: `${first.code}.${first.chapter}.${first.verse}`,
    p: chapters,
  };
  const year = Number(f.startDate);
  if (Number.isFinite(year) && year !== 0) entry.y = year;
  const pe = [...new Set(relSlugs(f.participants))];
  const pl = [...new Set((Array.isArray(f.locations) ? f.locations : [])
    .map((id) => placeSlugByName.get(theoPlaceName.get(id)))
    .filter(Boolean))];
  if (pe.length) entry.pe = pe.slice(0, 12);
  if (pl.length) entry.pl = pl.slice(0, 8);
  outEvents.push(entry);
}

// Hand/AI-curated short bios (`desc`) live only in the previously-generated
// output — this script re-derives everything else from source data, so carry
// existing descriptions forward by slug rather than silently dropping them.
function carryDescriptions(entries, previousFiles) {
  const descBySlug = new Map();
  for (const file of previousFiles) {
    if (!fs.existsSync(file)) continue;
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const e of [...(previous.people || []), ...(previous.places || [])]) {
      if (e.desc) descBySlug.set(e.s, e.desc);
    }
  }
  let carried = 0;
  for (const entry of entries) {
    const desc = descBySlug.get(entry.s);
    if (desc) { entry.desc = desc; carried += 1; }
  }
  if (carried < descBySlug.size) {
    console.warn(`Warning: ${descBySlug.size - carried} curated description(s) had no matching slug in the new output — likely dropped by a source-data or limit change.`);
  }
  console.log(`Carried forward ${carried} curated description(s).`);
}

carryDescriptions(
  [...corePeople, ...corePlaces, ...extendedPeople, ...extendedPlaces],
  [OUT_CORE, OUT_EXTENDED],
);

fs.writeFileSync(OUT_CORE, JSON.stringify({ people: corePeople, places: corePlaces }));
fs.writeFileSync(OUT_EXTENDED, JSON.stringify({ people: extendedPeople, places: extendedPlaces }));
fs.writeFileSync(OUT_EVENTS, JSON.stringify({ events: outEvents }));
console.log(`Core: ${corePeople.length} people + ${corePlaces.length} places → ${OUT_CORE}`);
console.log(`Extended: ${extendedPeople.length} people + ${extendedPlaces.length} places → ${OUT_EXTENDED}`);
console.log(`Events: ${outEvents.length} → ${OUT_EVENTS}`);
