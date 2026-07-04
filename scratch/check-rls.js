import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env variables
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE URL or SERVICE ROLE KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function run() {
  console.log("Checking remote Supabase RLS policies...");

  // Let's query pg_policies using an RPC or arbitrary SQL execution?
  // Supabase JS doesn't have an arbitrary SQL executor unless we have an RPC.
  // Wait, let's see if we can query pg_policies or similar using a custom RPC,
  // or let's read the buckets definition using standard supabase client.
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
  if (bucketsErr) {
    console.error("Error listing buckets:", bucketsErr);
  } else {
    console.log("Buckets:", buckets);
  }

  // Let's check if we can query storage.objects policies using pg_policies via a quick custom query?
  // Supabase's JS library doesn't let us query postgres system catalog tables directly unless we use an RPC.
  // Let's see if the database has any RPC for running queries, or check the profile organization state.
  // Let's query one of the tables we do have access to.
  // Let's see if we can query profiles:
  const { data: profiles, error: profilesErr } = await supabase.from('profiles').select('*').limit(3);
  if (profilesErr) {
    console.error("Error reading profiles:", profilesErr);
  } else {
    console.log("Sample Profiles:", profiles);
  }
}

run();
