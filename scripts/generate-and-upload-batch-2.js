import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

// Load env
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
const supabase = createClient(supabaseUrl, serviceRoleKey);

const r2AccountId = required('R2_ACCOUNT_ID');
const r2AccessKeyId = required('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = required('R2_SECRET_ACCESS_KEY');
const r2Bucket = required('R2_BUCKET');
const r2Endpoint = process.env.R2_ENDPOINT || `https://${r2AccountId}.r2.cloudflarestorage.com`;

const extended = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/bible-wiki-extended.json'), 'utf8'));
const missing = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'scripts/missing-extended-images.json'), 'utf8'));

const IMAGE_STYLE =
  'dignified realistic digital painting, warm natural light, historically accurate ancient Near East, '
  + 'Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, '
  + 'no text, no words, no watermark, no halo';

function formatYear(year) {
  return year < 0 ? `${-year} BC` : `AD ${year}`;
}

function formatYearRange(y) {
  if (!Array.isArray(y)) return null;
  const [a, b] = y;
  if (a == null && b == null) return null;
  if (a != null && b != null) return `${formatYear(a)}–${formatYear(b)}`;
  return formatYear(a != null ? a : b);
}

function getPrompt(item) {
  const isPerson = extended.people.some(p => p.s === item.slug);
  if (isPerson) {
    const entry = extended.people.find(p => p.s === item.slug);
    const era = formatYearRange(entry?.y);
    const person = entry?.g === 'F' ? 'a woman of the Bible' : entry?.g === 'M' ? 'a man of the Bible' : 'a figure of the Bible';
    return `Reverent portrait of ${item.name}, ${person}${era ? ` who lived around ${era}` : ''}, in authentic ancient Near Eastern dress of the biblical era`;
  } else {
    return `The biblical place ${item.name}, an ancient Near Eastern landscape in the biblical era, historically plausible terrain and settlement`;
  }
}

// AWS v4 Signer Helpers
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

async function uploadR2({ key, body, contentType }) {
  const request = signedR2Request({
    method: 'PUT',
    endpoint: r2Endpoint,
    bucket: r2Bucket,
    key,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    body,
    contentType,
  });
  const res = await fetch(request.url, request.init);
  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);
  }
}

async function uploadSupabase(key, body, contentType) {
  const { error } = await supabase.storage
    .from('wiki-images')
    .upload(key, body, { contentType, upsert: true });
  if (error) throw error;
}

function seedFor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 1000000;
}

async function generateAndUpload(item) {
  const seed = seedFor(item.slug);
  const prompt = `${getPrompt(item)}, ${IMAGE_STYLE}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to generate image from Pollinations: ${response.statusText}`);
  }
  
  const buffer = Buffer.from(await response.arrayBuffer());
  
  // Resize thumbnail
  const thumb = await sharp(buffer)
    .resize(128, 128, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 70 })
    .toBuffer();
    
  const full = await sharp(buffer)
    .jpeg({ quality: 85 })
    .toBuffer();
    
  // Upload to Supabase
  await uploadSupabase(`_default/${item.slug}.jpg`, full, 'image/jpeg');
  await uploadSupabase(`_default/thumbs/${item.slug}.jpg`, thumb, 'image/jpeg');
  
  // Upload to R2
  await uploadR2({ key: `_default/${item.slug}.jpg`, body: full, contentType: 'image/jpeg' });
  await uploadR2({ key: `_default/thumbs/${item.slug}.jpg`, body: thumb, contentType: 'image/jpeg' });
}

async function main() {
  const batch = missing.slice(40, 80);
  console.log(`Starting generation of Batch 2 (40 to 80) consisting of ${batch.length} items...`);
  
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    console.log(`\n(${i + 1}/${batch.length}) Generating: ${item.name} (${item.slug})...`);
    
    let retries = 3;
    while (retries > 0) {
      try {
        await generateAndUpload(item);
        console.log(`  Success! Generated and uploaded.`);
        break;
      } catch (err) {
        retries--;
        console.error(`  Failed (remaining retries: ${retries}):`, err.message);
        if (retries === 0) {
          console.error(`  Skipping ${item.name} due to failure.`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
  }
  
  console.log('\nBatch 2 completed successfully!');
}

main().catch(console.error);
