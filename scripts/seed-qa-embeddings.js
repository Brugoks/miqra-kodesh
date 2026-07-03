/* global process */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { data: questions, error: fetchError } = await supabase
    .from('qa_questions')
    .select('id, title, body')
    .is('embedding', null)
    .order('created_at', { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  const rows = questions || [];
  console.log(`Found ${rows.length} Q&R questions without embeddings.`);

  if (rows.length === 0) {
    process.exit(0);
  }

  let successCount = 0;
  for (const question of rows) {
    const text = `${question.title || ''} ${question.body || ''}`.trim();
    if (!text) continue;

    try {
      const { data, error } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: text,
          provider: 'huggingface',
          task: 'embed'
        }
      });

      if (error) throw error;
      if (!data?.embedding) throw new Error('No embedding array returned from hf-proxy');

      const { error: updateError } = await supabase
        .from('qa_questions')
        .update({ embedding: data.embedding })
        .eq('id', question.id);

      if (updateError) throw updateError;

      successCount += 1;
      console.log(`Seeded ${successCount}/${rows.length}: ${question.id}`);
      await delay(250);
    } catch (err) {
      console.error(`[FAIL] ${question.id} - ${err.message || err}`);
    }
  }

  console.log(`Q&R embedding backfill complete. Seeded ${successCount}/${rows.length}.`);
}

main().catch((err) => {
  console.error('Unhandled error in QA embedding seed script:', err);
  process.exit(1);
});
