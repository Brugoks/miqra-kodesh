import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Load .env
const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (!val) return;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env`);
  return value;
}

const supabaseUrl = required('VITE_SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const r2AccountId = required('R2_ACCOUNT_ID');
const r2AccessKeyId = required('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = required('R2_SECRET_ACCESS_KEY');
const r2Bucket = required('R2_BUCKET');
const r2Endpoint = process.env.R2_ENDPOINT || `https://${r2AccountId}.r2.cloudflarestorage.com`;

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

// R2 Signer Helpers
function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function encodeS3Path(value) {
  return String(value)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function signedR2Request({ method, endpoint, bucket, key, accessKeyId, secretAccessKey, body, contentType }) {
  const endpointUrl = new URL(endpoint);
  const encodedPath = `/${bucket}/${encodeS3Path(key)}`;
  const url = `${endpointUrl.origin}${encodedPath}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const payloadHash = sha256Hex(body || '');

  const headers = {
    host: endpointUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(contentType ? { 'content-type': contentType } : {}),
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    encodedPath,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${secretAccessKey}`, dateStamp),
        region
      ),
      service
    ),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    url,
    init: {
      method,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      ...(body ? { body } : {}),
    },
  };
}

async function uploadToR2(key, body, contentType) {
  const request = signedR2Request({
    method: 'PUT',
    endpoint: r2Endpoint,
    bucket: r2Bucket,
    key,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    body,
    contentType
  });
  const res = await fetch(request.url, request.init);
  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);
  }
}

// Stable seed generator
function seedFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

const STYLE =
  'dignified realistic digital painting, warm natural light, historically accurate ancient Near East, '
  + 'Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, '
  + 'no text, no words, no watermark, no halo';

const batch = [
  { slug: 'joab_1617', name: 'Joab', prompt: 'Joab, David’s hard-eyed general, in bronze scale armor before the siege ramp of Rabbah' },
  { slug: 'hezekiah_1512', name: 'Hezekiah', prompt: 'King Hezekiah spreading a threatening letter before the temple altar in prayer, oil lamps flickering' },
  { slug: 'manasseh_1928', name: 'Manasseh', prompt: 'Manasseh son of Joseph, a young Hebrew man in Egyptian linen receiving a patriarch’s blessing' },
  { slug: 'elijah_1131', name: 'Elijah', prompt: 'Elijah the prophet in a hairy mantle on Mount Carmel, fire falling from heaven onto a drenched stone altar' },
  { slug: 'absalom_59', name: 'Absalom', prompt: 'Absalom, handsome son of David with long thick hair, riding a mule beneath the great oaks of Ephraim' },
  { slug: 'john_1676', name: 'John', prompt: 'John the Baptist in a camel-hair garment and leather belt, preaching at the reedy banks of the Jordan' },
  { slug: 'nebuchadnezzar_2167', name: 'Nebuchadnezzar', prompt: 'Nebuchadnezzar king of Babylon on the palace roof at night, the hanging gardens and ziggurat below him' },
  { slug: 'canaan_914', name: 'Canaan', prompt: 'Canaan, ancestor of a people, a robed figure overlooking walled hilltop towns of the ancient Levant' },
  { slug: 'jonathan_1692', name: 'Jonathan', prompt: 'Jonathan the prince climbing a rocky crag with his young armor-bearer, bow on his back, Philistine outpost above' },
  { slug: 'jeroboam_872', name: 'Jeroboam', prompt: 'Jeroboam son of Nebat standing before a golden calf on a stone platform at Bethel, incense smoke rising' },
  { slug: 'ahab_113', name: 'Ahab', prompt: 'King Ahab in royal robes sulking on the ivory-inlaid couch of his Samaria palace, Jezreel vineyards through the window' },
  { slug: 'daniel_975', name: 'Daniel', prompt: 'Daniel serene among lions in a torchlit stone den, hands folded, the beasts calm around him' },
  { slug: 'reuben_2429', name: 'Reuben', prompt: 'Reuben the firstborn standing anxiously at the mouth of a dry cistern in Dothan, distant caravan on the horizon' },
  { slug: 'jehoshaphat_808', name: 'Jehoshaphat', prompt: 'King Jehoshaphat leading singers in white before his army in the wilderness of Tekoa' },
  { slug: 'levi_1820', name: 'Levi', prompt: 'Levi the patriarch, a bearded Hebrew man with a shepherd’s staff, ancestral tents pitched behind him' },
  { slug: 'dan_973', name: 'Dan', prompt: 'Dan the patriarch, a Hebrew tribesman with a staff, a coiled serpent by the roadside recalling Jacob’s blessing' },
  { slug: 'pharaoh_2329', name: 'Pharaoh', prompt: 'the Pharaoh of Joseph’s time seated in an Egyptian audience hall, troubled by dreams, painted columns behind' },
  { slug: 'eleazar_1062', name: 'Eleazar', prompt: 'Eleazar son of Aaron in priestly white linen and turban, tending the bronze altar of the tabernacle' },
  { slug: 'balaam_593', name: 'Balaam', prompt: 'Balaam the diviner on a mountain overlook above Israel’s tented camp, his donkey beside him, arms raised in oracle' },
  { slug: 'gad_1262', name: 'Gad', prompt: 'Gad the patriarch, a rugged Hebrew man armed with a short sword, ready as a raider band approaches' }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Starting generation and upload of ${batch.length} wiki images (Batch 3)...`);
  
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const fullPrompt = `${item.prompt}, ${STYLE}`;
    const seed = seedFor(item.slug);
    
    console.log(`\n---------------------------------------`);
    console.log(`(${i + 1}/${batch.length}) Generating: ${item.name} (${item.slug})`);
    console.log(`Seed: ${seed}`);
    console.log(`Prompt: "${fullPrompt}"`);
    
    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const buffer = Buffer.from(await res.arrayBuffer());
        
        // Resize and format
        const fullImageBytes = await sharp(buffer)
          .resize(1024, 1024, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 85 })
          .toBuffer();
          
        const thumbBytes = await sharp(buffer)
          .resize(128, 128, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 70 })
          .toBuffer();
          
        const fullKey = `_default/${item.slug}.jpg`;
        const thumbKey = `_default/thumbs/${item.slug}.jpg`;
        
        // Upload to Supabase
        console.log(`  Uploading to Supabase: ${fullKey}...`);
        const { error: upFullErr } = await supabase.storage
          .from('wiki-images')
          .upload(fullKey, fullImageBytes, { contentType: 'image/jpeg', upsert: true });
        if (upFullErr) throw upFullErr;

        console.log(`  Uploading to Supabase: ${thumbKey}...`);
        const { error: upThumbErr } = await supabase.storage
          .from('wiki-images')
          .upload(thumbKey, thumbBytes, { contentType: 'image/jpeg', upsert: true });
        if (upThumbErr) throw upThumbErr;
        
        // Upload to R2
        console.log(`  Uploading to Cloudflare R2: ${fullKey}...`);
        await uploadToR2(fullKey, fullImageBytes, 'image/jpeg');

        console.log(`  Uploading to Cloudflare R2: ${thumbKey}...`);
        await uploadToR2(thumbKey, thumbBytes, 'image/jpeg');
        
        console.log(`  Success!`);
        success = true;
      } catch (err) {
        console.warn(`  Attempt ${attempt} failed: ${err.message}`);
        if (attempt < 3) {
          console.log('  Waiting 3s before retry...');
          await sleep(3000);
        }
      }
    }
    
    if (!success) {
      console.error(`  ERROR: Failed to generate/upload ${item.slug} after 3 attempts.`);
    }
    
    // Polite throttle delay between requests
    await sleep(1500);
  }
  
  console.log('\nAll generation and upload tasks finished!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
