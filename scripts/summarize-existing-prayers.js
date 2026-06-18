/* global process */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── ENV VARS LOADER ──────────────────────────────────────────────────────────
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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('Fetching prayers from database...');
  const { data: prayers, error } = await supabase
    .from('prayers')
    .select('id, body, name')
    .is('summary', null);

  if (error) {
    console.error('Error fetching prayers:', error.message);
    process.exit(1);
  }

  const toSummarize = (prayers || []).filter(p => (p.body || '').trim().length > 250);
  console.log(`Found ${prayers?.length || 0} total prayers without summaries.`);
  console.log(`Lengthy prayers (> 250 chars) needing summaries: ${toSummarize.length}`);

  if (toSummarize.length === 0) {
    console.log('No existing prayers need summarization. Done!');
    process.exit(0);
  }

  for (let i = 0; i < toSummarize.length; i++) {
    const prayer = toSummarize[i];
    const textSnippet = prayer.body.slice(0, 40).replace(/\n/g, ' ') + '...';
    console.log(`[${i + 1}/${toSummarize.length}] Summarizing prayer by "${prayer.name}": "${textSnippet}"`);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: `Summarize this prayer request in a single short sentence (under 12 words) that captures all key requests. Do not include any introductory text, prefix, or signature. Just output the summary sentence. Prayer: "${prayer.body.trim()}"`,
          max_new_tokens: 60
        }
      });

      if (fnErr || !data?.text) {
        throw new Error(fnErr?.message || 'No summary text returned');
      }

      const summary = data.text.replace(/^["']|["']$/g, '').trim();

      const { error: updateErr } = await supabase
        .from('prayers')
        .update({ summary })
        .eq('id', prayer.id);

      if (updateErr) {
        throw updateErr;
      }

      console.log(`  -> Success: "${summary}"`);
    } catch (err) {
      console.error(`  -> Failed: ${err.message}`);
    }

    if (i < toSummarize.length - 1) {
      await delay(500); // rate-limiting safety
    }
  }

  console.log('\nAll existing prayers processed!');
}

main().catch(err => {
  console.error('Unhandled error in script:', err);
  process.exit(1);
});
