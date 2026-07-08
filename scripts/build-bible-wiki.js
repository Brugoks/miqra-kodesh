/* global process */
// Generate src/assets/bible-wiki.json — the scripture-derived foundation for the
// Bible Wiki. People come from the Theographic Bible Metadata project (CC-BY 4.0,
// https://github.com/robertrouse/theographic-bible-metadata), which links every
// person to the verses that mention them plus family relations. Places are taken
// from the already-generated src/assets/bible-places.json (openbible.info, CC-BY).
//
// Usage:
//   node scripts/build-bible-wiki.js                          # downloads source JSON
//   node scripts/build-bible-wiki.js people.json verses.json  # or use local copies
//
// Output shape:
//   {
//     people: [{ s: slug, n: name, t: displayTitle?, g: 'M'|'F'?, al: [aliases]?,
//                vc: verseCount, y: [birthYear, deathYear]?, fv/lv: first/last verse
//                passage id, p: ['EXO.4', ...] chapter refs (canonical order),
//                rel: { fa, mo, pt: [], ch: [], sib: [] }? (slugs within the set),
//                desc: shortBio? (curated, carried forward across regenerations —
//                see the merge step near the bottom of this script) }],
//     places: [{ s: slug, n: name, la: lat, lo: lon, p: ['GEN.12', ...], desc: shortBio? }],
//   }

import fs from 'fs';
import path from 'path';

const PEOPLE_URL = 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json/people.json';
const VERSES_URL = 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json/verses.json';
const PLACES_PATH = path.resolve(process.cwd(), 'src/assets/bible-places.json');
const OUT_PATH = path.resolve(process.cwd(), 'src/assets/bible-wiki.json');

const PEOPLE_LIMIT = 200;
const PLACES_LIMIT = 150;

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

const [people, verses] = await Promise.all([
  loadJson(process.argv[2], PEOPLE_URL),
  loadJson(process.argv[3], VERSES_URL),
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

const top = [...people]
  .filter((p) => p.fields?.slug && p.fields?.name && Array.isArray(p.fields?.verses))
  .sort((a, b) => b.fields.verseCount - a.fields.verseCount)
  .slice(0, PEOPLE_LIMIT);

const inSet = new Map(top.map((p) => [p.id, p.fields.slug]));
const relSlugs = (ids) =>
  (Array.isArray(ids) ? ids : []).map((id) => inSet.get(id)).filter(Boolean);

const outPeople = [];
for (const record of top) {
  const f = record.fields;
  const resolved = f.verses.map((id) => verseById.get(id)).filter(Boolean).sort(byCanon);
  if (!resolved.length) continue;

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

  outPeople.push(entry);
}

// Places: reuse the geocoded dataset already shipped for the passage map.
const allPlaces = JSON.parse(fs.readFileSync(PLACES_PATH, 'utf8'));
const kebab = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const usedSlugs = new Set(outPeople.map((p) => p.s));
const outPlaces = [];
for (const place of [...allPlaces].sort((a, b) => b.p.length - a.p.length).slice(0, PLACES_LIMIT)) {
  let slug = kebab(place.n);
  if (!slug) continue;
  if (usedSlugs.has(slug)) slug = `${slug}-place`;
  if (usedSlugs.has(slug)) continue; // duplicate place name — keep the better-attested one
  usedSlugs.add(slug);
  const chapters = [...place.p].sort((a, b) => {
    const [ab, ac] = a.split('.');
    const [bb, bc] = b.split('.');
    return bookIdx(ab) - bookIdx(bb) || Number(ac) - Number(bc);
  });
  outPlaces.push({ s: slug, n: place.n, la: place.la, lo: place.lo, p: chapters });
}

// Hand/AI-curated short bios (`desc`) live only in the previously-generated
// output — this script re-derives everything else from source data, so carry
// existing descriptions forward by slug rather than silently dropping them.
if (fs.existsSync(OUT_PATH)) {
  const previous = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  const descBySlug = new Map(
    [...(previous.people || []), ...(previous.places || [])]
      .filter((e) => e.desc)
      .map((e) => [e.s, e.desc]),
  );
  let carried = 0;
  for (const entry of [...outPeople, ...outPlaces]) {
    const desc = descBySlug.get(entry.s);
    if (desc) { entry.desc = desc; carried += 1; }
  }
  if (carried < descBySlug.size) {
    console.warn(`Warning: ${descBySlug.size - carried} curated description(s) had no matching slug in the new output — likely dropped by a source-data or limit change.`);
  }
  console.log(`Carried forward ${carried} curated description(s) from the previous output.`);
}

fs.writeFileSync(OUT_PATH, JSON.stringify({ people: outPeople, places: outPlaces }));
console.log(`Wrote ${outPeople.length} people + ${outPlaces.length} places to ${OUT_PATH}`);
