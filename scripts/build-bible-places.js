// Generate src/assets/bible-places.json from the openbible.info geocoded
// places dataset (CC-BY, https://www.openbible.info/geo/).
//
// Usage:
//   node scripts/build-bible-places.js            # downloads places.txt
//   node scripts/build-bible-places.js places.txt # or use a local copy
//
// Output rows: { n: name, la: lat, lo: lon, p: ['GEN.12', ...] } where p is
// the deduped list of book-code.chapter references that mention the place.

import fs from 'fs';
import path from 'path';

// merged.txt resolves every place to coordinates (aliases already followed);
// ~ / > / < prefixes mark approximate or region/contained points.
const SOURCE_URL = 'https://www.openbible.info/geo/data/merged.txt';
const OUT_PATH = path.resolve(process.cwd(), 'src/assets/bible-places.json');

// ESV-style abbreviations used in places.txt → the app's USFM codes.
const ESV_TO_CODE = {
  Gen: 'GEN', Ex: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU',
  Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT', '1 Sam': '1SA', '2 Sam': '2SA',
  '1 Kgs': '1KI', '2 Kgs': '2KI', '1 Chr': '1CH', '2 Chr': '2CH',
  Ezra: 'EZR', Neh: 'NEH', Est: 'EST', Job: 'JOB', Ps: 'PSA',
  Prov: 'PRO', Eccl: 'ECC', Sng: 'SNG', Isa: 'ISA', Jer: 'JER',
  Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL',
  Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nahum: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT',
  Rom: 'ROM', '1 Cor': '1CO', '2 Cor': '2CO', Gal: 'GAL', Eph: 'EPH',
  Phil: 'PHP', Col: 'COL', '1 Thes': '1TH', '2 Thes': '2TH',
  '1 Tim': '1TI', '2 Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB',
  Jas: 'JAS', '1 Pet': '1PE', '2 Pet': '2PE', '1 John': '1JN',
  '2 John': '2JN', '3 John': '3JN', Jude: 'JUD', Rev: 'REV',
};

function parsePassage(raw) {
  // e.g. '2 Kgs 5:12' or 'Obad 1' → 'CODE.CHAPTER'
  const match = raw.trim().match(/^(.+?)\s+(\d{1,3})(?::\d{1,3})?$/);
  if (!match) return null;
  const code = ESV_TO_CODE[match[1].trim()];
  return code ? `${code}.${match[2]}` : null;
}

async function loadSource() {
  const localPath = process.argv[2];
  if (localPath) return fs.readFileSync(localPath, 'utf8');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

const text = await loadSource();
const lines = text.split(/\r?\n/);
const places = [];
let skippedNoCoords = 0;

for (const line of lines) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [name, , lat, lon, passages] = line.split('\t');
  // Strip approximate/region markers (~, >, <) before parsing coordinates.
  const la = parseFloat(String(lat || '').replace(/^[~><]+/, ''));
  const lo = parseFloat(String(lon || '').replace(/^[~><]+/, ''));
  if (!name || !Number.isFinite(la) || !Number.isFinite(lo)) {
    skippedNoCoords += 1;
    continue;
  }
  const p = [...new Set((passages || '').split(',').map(parsePassage).filter(Boolean))];
  if (!p.length) continue;
  places.push({ n: name.trim(), la: Number(la.toFixed(4)), lo: Number(lo.toFixed(4)), p });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(places));
console.log(`Wrote ${places.length} places to ${OUT_PATH} (${skippedNoCoords} rows without coordinates skipped).`);
