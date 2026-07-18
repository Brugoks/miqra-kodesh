// Seed the cross_references table from the openbible.info dataset (CC-BY).
//
// Usage:
//   curl -sL -o /tmp/cross-references.zip https://a.openbible.info/data/cross-references.zip
//   unzip -o /tmp/cross-references.zip -d /tmp
//   node scripts/seed-cross-references.js /tmp/cross_references.txt
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
// (same convention as seed-verse-embeddings.js). Re-running is safe: the
// table is truncated first so the seed is idempotent.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/seed-cross-references.js <path to cross_references.txt>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// openbible.info uses OSIS book ids; the app uses API.Bible 3-letter codes.
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

// 'Gen.1.1' → 'GEN.1.1'; returns null for unknown books.
function convertVerse(osisRef) {
  const parts = osisRef.split('.');
  if (parts.length !== 3) return null;
  const code = OSIS_TO_CODE[parts[0]];
  if (!code) return null;
  return `${code}.${parts[1]}.${parts[2]}`;
}

// 'John.1.1-John.1.3' → 'JHN.1.1-JHN.1.3'
function convertRef(osisRef) {
  return osisRef.split('-').map(convertVerse).every(Boolean)
    ? osisRef.split('-').map(convertVerse).join('-')
    : null;
}

async function main() {
  const lines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/);
  const rows = [];
  let skipped = 0;

  for (const line of lines.slice(1)) { // skip header
    if (!line.trim()) continue;
    const [fromRaw, toRaw, votesRaw] = line.split('\t');
    const from_ref = convertVerse(fromRaw);
    const to_ref = convertRef(toRaw);
    if (!from_ref || !to_ref) {
      skipped += 1;
      continue;
    }
    rows.push({ from_ref, to_ref, votes: parseInt(votesRaw, 10) || 0 });
  }

  console.log(`Parsed ${rows.length} cross references (${skipped} skipped).`);

  console.log('Clearing existing rows…');
  const { error: deleteError } = await supabase
    .from('cross_references')
    .delete()
    .gte('id', 0);
  if (deleteError) {
    console.error('Failed to clear table:', deleteError.message);
    process.exit(1);
  }

  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('cross_references').insert(chunk);
    if (error) {
      console.error(`Insert failed at row ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`Inserted ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
  }

  console.log('Done.');
}

main();
