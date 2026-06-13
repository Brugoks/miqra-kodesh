/* global process */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── ENV VARS LOADER ──────────────────────────────────────────────────────────
// Simple parser to load local .env variables into process.env
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

// Create the Supabase client with the service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

// ── BOOK METADATA MAP ────────────────────────────────────────────────────────
// Maps en_kjv.json abbreviations to target standard 3-letter codes and names
const BOOK_DATA = {
  'gn': { abbr: 'GEN', name: 'Genesis' },
  'ex': { abbr: 'EXO', name: 'Exodus' },
  'lv': { abbr: 'LEV', name: 'Leviticus' },
  'nm': { abbr: 'NUM', name: 'Numbers' },
  'dt': { abbr: 'DEU', name: 'Deuteronomy' },
  'js': { abbr: 'JOS', name: 'Joshua' },
  'jud': { abbr: 'JDG', name: 'Judges' },
  'rt': { abbr: 'RUT', name: 'Ruth' },
  '1sm': { abbr: '1SA', name: '1 Samuel' },
  '2sm': { abbr: '2SA', name: '2 Samuel' },
  '1kgs': { abbr: '1KI', name: '1 Kings' },
  '2kgs': { abbr: '2KI', name: '2 Kings' },
  '1ch': { abbr: '1CH', name: '1 Chronicles' },
  '2ch': { abbr: '2CH', name: '2 Chronicles' },
  'ezr': { abbr: 'EZR', name: 'Ezra' },
  'ne': { abbr: 'NEH', name: 'Nehemiah' },
  'et': { abbr: 'EST', name: 'Esther' },
  'job': { abbr: 'JOB', name: 'Job' },
  'ps': { abbr: 'PSA', name: 'Psalms' },
  'prv': { abbr: 'PRO', name: 'Proverbs' },
  'ec': { abbr: 'ECC', name: 'Ecclesiastes' },
  'so': { abbr: 'SNG', name: 'Song of Solomon' },
  'is': { abbr: 'ISA', name: 'Isaiah' },
  'jr': { abbr: 'JER', name: 'Jeremiah' },
  'lm': { abbr: 'LAM', name: 'Lamentations' },
  'ez': { abbr: 'EZK', name: 'Ezekiel' },
  'dn': { abbr: 'DAN', name: 'Daniel' },
  'ho': { abbr: 'HOS', name: 'Hosea' },
  'jl': { abbr: 'JOL', name: 'Joel' },
  'am': { abbr: 'AMO', name: 'Amos' },
  'ob': { abbr: 'OBA', name: 'Obadiah' },
  'jn': { abbr: 'JON', name: 'Jonah' },
  'mi': { abbr: 'MIC', name: 'Micah' },
  'na': { abbr: 'NAM', name: 'Nahum' },
  'hk': { abbr: 'HAB', name: 'Habakkuk' },
  'zp': { abbr: 'ZEP', name: 'Zephaniah' },
  'hg': { abbr: 'HAG', name: 'Haggai' },
  'zc': { abbr: 'ZEC', name: 'Zechariah' },
  'ml': { abbr: 'MAL', name: 'Malachi' },
  'mt': { abbr: 'MAT', name: 'Matthew' },
  'mk': { abbr: 'MRK', name: 'Mark' },
  'lk': { abbr: 'LUK', name: 'Luke' },
  'jo': { abbr: 'JHN', name: 'John' },
  'act': { abbr: 'ACT', name: 'Acts' },
  'rm': { abbr: 'ROM', name: 'Romans' },
  '1co': { abbr: '1CO', name: '1 Corinthians' },
  '2co': { abbr: '2CO', name: '2 Corinthians' },
  'gl': { abbr: 'GAL', name: 'Galatians' },
  'eph': { abbr: 'EPH', name: 'Ephesians' },
  'ph': { abbr: 'PHP', name: 'Philippians' },
  'cl': { abbr: 'COL', name: 'Colossians' },
  '1ts': { abbr: '1TH', name: '1 Thessalonians' },
  '2ts': { abbr: '2TS', name: '2 Thessalonians' },
  '1tm': { abbr: '1TI', name: '1 Timothy' },
  '2tm': { abbr: '2TI', name: '2 Timothy' },
  'tt': { abbr: 'TIT', name: 'Titus' },
  'phm': { abbr: 'PHM', name: 'Philemon' },
  'hb': { abbr: 'HEB', name: 'Hebrews' },
  'jm': { abbr: 'JAS', name: 'James' },
  '1pe': { abbr: '1PE', name: '1 Peter' },
  '2pe': { abbr: '2PE', name: '2 Peter' },
  '1jo': { abbr: '1JN', name: '1 John' },
  '2jo': { abbr: '2JN', name: '2 John' },
  '3jo': { abbr: '3JN', name: '3 John' },
  'jd': { abbr: 'JUD', name: 'Jude' },
  're': { abbr: 'REV', name: 'Revelation' }
};

// Maps lowercase full/short book names to 3-letter codes for CLI selection filter
const BOOK_NAME_TO_ABBR = {
  'genesis': 'GEN', 'exodus': 'EXO', 'leviticus': 'LEV', 'numbers': 'NUM', 'deuteronomy': 'DEU',
  'joshua': 'JOS', 'judges': 'JDG', 'ruth': 'RUT', '1 samuel': '1SA', '2 samuel': '2SA',
  '1 kings': '1KI', '2 kings': '2KI', '1 chronicles': '1CH', '2 chronicles': '2CH',
  'ezra': 'EZR', 'nehemiah': 'NEH', 'esther': 'EST', 'job': 'JOB', 'psalms': 'PSA', 'psalm': 'PSA',
  'proverbs': 'PRO', 'ecclesiastes': 'ECC', 'song of solomon': 'SNG', 'song of songs': 'SNG', 'song': 'SNG',
  'isaiah': 'ISA', 'jeremiah': 'JER', 'lamentations': 'LAM', 'ezekiel': 'EZK', 'daniel': 'DAN',
  'hosea': 'HOS', 'joel': 'JOL', 'amos': 'AMO', 'obadiah': 'OBA', 'jonah': 'JON',
  'micah': 'MIC', 'nahum': 'NAM', 'habakkuk': 'HAB', 'zephaniah': 'ZEP', 'haggai': 'HAG',
  'zechariah': 'ZEC', 'malachi': 'MAL', 'matthew': 'MAT', 'mark': 'MRK', 'luke': 'LUK',
  'john': 'JHN', 'acts': 'ACT', 'romans': 'ROM', '1 corinthians': '1CO', '2 corinthians': '2CO',
  'galatians': 'GAL', 'ephesians': 'EPH', 'philippians': 'PHP', 'colossians': 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH', '1 timothy': '1TI', '2 timothy': '2TI',
  'titus': 'TIT', 'philemon': 'PHM', 'hebrews': 'HEB', 'james': 'JAS', '1 peter': '1PE',
  '2 peter': '2PE', '1 john': '1JN', '2 john': '2JN', '3 john': '3JN', 'jude': 'JUD',
  'revelation': 'REV', 'revelations': 'REV'
};

const CURATED_BOOKS = new Set([
  'PSA', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
  'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
  'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
]);

// Helper for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // ── ARGUMENT PARSING ──────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  let bookFilter = null;
  let seedAll = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) {
      const inputBook = args[i + 1].toLowerCase();
      bookFilter = BOOK_NAME_TO_ABBR[inputBook];
      if (!bookFilter) {
        console.error(`Error: Unknown book name "${args[i + 1]}". Check spelling.`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--all') {
      seedAll = true;
    }
  }

  // ── LOAD OR FETCH KJV TEXT ────────────────────────────────────────────────
  const scriptsDir = path.resolve(process.cwd(), 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }
  const kjvPath = path.resolve(scriptsDir, 'kjv-en.json');
  let kjvData;

  if (fs.existsSync(kjvPath)) {
    console.log('Loading KJV from local cache...');
    kjvData = JSON.parse(fs.readFileSync(kjvPath, 'utf8'));
  } else {
    console.log('Downloading KJV JSON from GitHub (thiagobodruk/bible)...');
    try {
      const response = await fetch('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      kjvData = await response.json();
      fs.writeFileSync(kjvPath, JSON.stringify(kjvData, null, 2), 'utf8');
      console.log('Saved KJV to scripts/kjv-en.json');
    } catch (error) {
      console.error('Failed to download KJV text:', error.message);
      process.exit(1);
    }
  }

  // ── COMPILE ALL VERSES ────────────────────────────────────────────────────
  console.log('Parsing Bible verses...');
  const allVerses = [];
  
  for (const bookObj of kjvData) {
    const rawAbbr = bookObj.abbrev.toLowerCase();
    
    // Map to our book abbreviation format
    const metadata = BOOK_DATA[rawAbbr];
    if (!metadata) {
      console.warn(`Warning: Could not map book abbreviation "${rawAbbr}". Skipping.`);
      continue;
    }

    const abbr = metadata.abbr;
    const fullBookName = metadata.name;

    // Filter books based on CLI inputs
    if (bookFilter && abbr !== bookFilter) continue;
    if (!bookFilter && !seedAll && !CURATED_BOOKS.has(abbr)) continue;

    const chapters = bookObj.chapters || [];
    for (let c = 0; c < chapters.length; c++) {
      const chapterNum = c + 1;
      const verses = chapters[c] || [];
      for (let v = 0; v < verses.length; v++) {
        const verseNum = v + 1;
        const text = verses[v]?.trim();
        if (!text) continue;

        allVerses.push({
          id: `${abbr}.${chapterNum}.${verseNum}`,
          book: fullBookName,
          chapter: chapterNum,
          verse: verseNum,
          text: text
        });
      }
    }
  }

  console.log(`Total verses matching criteria: ${allVerses.length}`);

  // ── RESUMABILITY: FETCH EXISTING EMBEDDINGS ──────────────────────────────
  console.log('Checking database for existing embeddings to avoid duplicates...');
  let existingIds = new Set();
  try {
    const { data: existingRecords, error: fetchError } = await supabase
      .from('verse_embeddings')
      .select('id')
      .not('embedding', 'is', null);

    if (fetchError) {
      throw fetchError;
    }
    
    existingIds = new Set(existingRecords.map(r => r.id));
    console.log(`Found ${existingIds.size} verses with embeddings already seeded.`);
  } catch (error) {
    console.error('Warning: Could not fetch existing embeddings. Proceeding with full upsert. Error:', error.message);
  }

  // Filter out already seeded verses
  const toSeed = allVerses.filter(v => !existingIds.has(v.id));
  console.log(`Remaining verses to seed: ${toSeed.length}`);

  if (toSeed.length === 0) {
    console.log('All verses in this scope are already seeded! Exiting.');
    process.exit(0);
  }

  // ── SEEDING BATCH LOOP ────────────────────────────────────────────────────
  const BATCH_SIZE = 20;
  const DELAY_MS = 500;
  
  let successCount = 0;
  let totalProcessed = 0;

  for (let i = 0; i < toSeed.length; i += BATCH_SIZE) {
    const batch = toSeed.slice(i, i + BATCH_SIZE);
    
    // Call the hf-proxy in parallel for the batch of 20
    const batchPromises = batch.map(async (verse) => {
      try {
        const { data, error } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: verse.text,
            provider: 'huggingface',
            task: 'embed'
          }
        });

        if (error) {
          throw error;
        }

        if (!data || !data.embedding) {
          throw new Error('No embedding array returned from hf-proxy');
        }

        return {
          id: verse.id,
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          text: verse.text,
          embedding: data.embedding
        };
      } catch (err) {
        console.error(`[FAIL] ${verse.id} - ${err.message || err}`);
        return null;
      }
    });

    const results = await Promise.all(batchPromises);
    const validResults = results.filter(r => r !== null);

    if (validResults.length > 0) {
      try {
        const { error: upsertError } = await supabase
          .from('verse_embeddings')
          .upsert(validResults, { onConflict: 'id' });

        if (upsertError) {
          throw upsertError;
        }

        successCount += validResults.length;
      } catch (err) {
        console.error(`Failed to upsert database records for batch starting at index ${i}:`, err.message);
      }
    }

    totalProcessed += batch.length;
    console.log(`Seeded ${successCount}/${toSeed.length} verses (${existingIds.size + successCount}/${allVerses.length} total)`);

    // Introduce rate-limiting delay between batches (if there are more batches remaining)
    if (i + BATCH_SIZE < toSeed.length) {
      await delay(DELAY_MS);
    }
  }

  console.log(`\nSeeding completed successfully! Processed ${totalProcessed} verses. Seeded ${successCount} new embeddings.`);
}

main().catch(err => {
  console.error('Unhandled error in seed script:', err);
  process.exit(1);
});
