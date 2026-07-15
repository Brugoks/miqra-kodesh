/* global process, Buffer */
// One-off Pollinations batch for Bible Wiki default images.
//
// Generates 1024x1024 JPEGs and 128x128 JPEG thumbnails, then uploads both to:
//   - Supabase Storage: wiki-images/_default/...
//   - Cloudflare R2:    miqra-wiki-images/_default/...

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const STYLE_SUFFIX = ', clear detailed face, sharp eyes and symmetrical facial features, realistic human anatomy, dignified realistic digital painting, warm natural light, historically accurate ancient Near East, Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, no text, no words, no watermark, no halo';
const MAX_GENERATION_ATTEMPTS = 18;

const ENTRIES = [
  {
    slug: 'ashkelon',
    name: 'Ashkelon',
    prompt: 'Philistine Ashkelon on the shore, arched brick gate open to the sea wind',
  },
  {
    slug: 'kadesh-1',
    name: 'Kadesh',
    prompt: 'the desert oasis of Kadesh, springs and palms where a nation camped',
  },
  {
    slug: 'kiriath-jearim',
    name: 'Kiriath-jearim',
    prompt: 'Kiriath-jearim of the woods, a hilltop house where the ark rested long years',
  },
  {
    slug: 'mizpah-3',
    name: 'Mizpah',
    prompt: 'Mizpah of Benjamin, a watch-height with a great memorial stone',
  },
  {
    slug: 'most-holy-place-2',
    name: 'Most Holy Place',
    prompt: 'the veiled Most Holy Place of the tabernacle, gold gleaming through incense smoke',
  },
  {
    slug: 'ophir',
    name: 'Ophir',
    prompt: 'the far gold port of Ophir, red cliffs, almug wood and treasure ships loading',
  },
  {
    slug: 'ramah-4',
    name: 'Ramah',
    prompt: 'Ramah 4, an ancient Near Eastern landscape in the biblical era, historically plausible terrain and settlement',
  },
  {
    slug: 'river',
    name: 'River',
    prompt: 'River, an ancient Near Eastern landscape in the biblical era, historically plausible terrain and settlement',
  },
  {
    slug: 'shephelah',
    name: 'Shephelah',
    prompt: 'the rolling Shephelah foothills, sycamores and wheat between hills and plain',
  },
  {
    slug: 'ai-1',
    name: 'Ai',
    prompt: 'the ruin-heap of Ai beside its ancient walls in the hill country',
  },
  {
    slug: 'aijalon',
    name: 'Aijalon',
    prompt: 'the Valley of Aijalon at evening, long shadows where sun and moon once stood still',
  },
  {
    slug: 'ammon',
    name: 'Ammon',
    prompt: 'the Ammonite tableland, watchtowers over wadis east of the Jordan',
  },
  {
    slug: 'caesarea',
    name: 'Caesarea',
    prompt: 'Caesarea Maritima, a great Roman breakwater harbor with lighthouse and temples',
  },
  {
    slug: 'cyprus',
    name: 'Cyprus',
    prompt: 'the island of Cyprus, copper hills and a Greek harbor town under bright sea light',
  },
  {
    slug: 'arabia',
    name: 'Arabia',
    prompt: 'the deserts of Arabia, star-filled sky over camel camps',
  },
  {
    slug: 'beeroth',
    name: 'Beeroth',
    prompt: 'Beeroth, an ancient Near Eastern landscape in the biblical era, historically plausible terrain and settlement',
  },
  {
    slug: 'beth-aven',
    name: 'Beth-aven',
    prompt: 'Beth-aven, an ancient Near Eastern landscape in the biblical era, historically plausible terrain and settlement',
  },
  {
    slug: 'bethsaida',
    name: 'Bethsaida',
    prompt: 'Bethsaida by the lake’s north shore, fishermen hauling nets at dawn',
  },
  {
    slug: 'beyond-the-river',
    name: 'Beyond the River',
    prompt: 'the Persian province Beyond the River, caravans crossing the great Euphrates fords',
  },
  {
    slug: 'cilicia',
    name: 'Cilicia',
    prompt: 'Cilicia beneath the Taurus mountains, tentmakers’ workshops in Tarsus',
  },
];

function loadDotenv() {
  const dotenvPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(dotenvPath)) return;
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    let val = match[2].trim();
    if (!val || process.env[key]) return;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// Same stable per-slug seed as scripts/generate-wiki-images.js.
function seedFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

function pollinationsUrl(prompt, seed) {
  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', '1024');
  url.searchParams.set('height', '1024');
  url.searchParams.set('model', 'flux');
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('seed', String(seed));
  return url;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function encodeS3Path(value) {
  return String(value).split('/').map((part) => encodeURIComponent(part)).join('/');
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

async function r2Fetch(args) {
  const request = signedR2Request(args);
  return fetch(request.url, request.init);
}

async function fetchImage(entry) {
  const fullPrompt = `${entry.prompt}${STYLE_SUFFIX}`;
  const seed = seedFor(entry.slug);
  const url = pollinationsUrl(fullPrompt, seed);
  const response = await fetch(url, {
    headers: {
      accept: 'image/*',
      'user-agent': 'miqra-kodesh-wiki-image-batch/1.0',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`Pollinations failed: ${response.status} ${body}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Pollinations returned non-image content-type: ${contentType}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function makeJpegs(sourceBytes) {
  const full = await sharp(sourceBytes)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const thumb = await sharp(sourceBytes)
    .resize(128, 128, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
  return { full, thumb };
}

async function uploadSupabase(storage, key, body) {
  const { error } = await storage.upload(key, body, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}

async function uploadR2({ endpoint, bucket, accessKeyId, secretAccessKey, key, body }) {
  const response = await r2Fetch({
    method: 'PUT',
    endpoint,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    body,
    contentType: 'image/jpeg',
  });
  if (!response.ok) {
    throw new Error(`R2 PUT failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
}

async function verifySupabase(storage, key) {
  const { data, error } = await storage.download(key);
  if (error) throw error;
  return Number(data.size || 0);
}

async function verifyR2({ endpoint, bucket, accessKeyId, secretAccessKey, key }) {
  const response = await r2Fetch({
    method: 'HEAD',
    endpoint,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
  });
  if (!response.ok) {
    throw new Error(`R2 HEAD failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
  return Number(response.headers.get('content-length') || 0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(attempt, err) {
  if (err?.status === 429) {
    return Math.min(90_000, 20_000 + attempt * 10_000);
  }
  return Math.min(30_000, 4_000 * attempt);
}

async function main() {
  loadDotenv();

  const supabaseUrl = required('VITE_SUPABASE_URL');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = required('R2_ACCOUNT_ID');
  const r2AccessKeyId = required('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = required('R2_SECRET_ACCESS_KEY');
  const r2Bucket = 'miqra-wiki-images';
  const r2Endpoint = process.env.R2_ENDPOINT || `https://${r2AccountId}.r2.cloudflarestorage.com`;

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const storage = supabase.storage.from('wiki-images');
  const r2 = {
    endpoint: r2Endpoint,
    bucket: r2Bucket,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  };

  let ok = 0;
  let failed = 0;

  for (const [index, entry] of ENTRIES.entries()) {
    const fullKey = `_default/${entry.slug}.jpg`;
    const thumbKey = `_default/thumbs/${entry.slug}.jpg`;
    process.stdout.write(`(${index + 1}/${ENTRIES.length}) ${entry.slug} seed=${seedFor(entry.slug)} ... `);

    try {
      let sourceBytes;
      for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
        try {
          sourceBytes = await fetchImage(entry);
          break;
        } catch (err) {
          if (attempt === MAX_GENERATION_ATTEMPTS) throw err;
          const waitMs = retryDelayMs(attempt, err);
          process.stdout.write(`busy retry ${attempt}/${MAX_GENERATION_ATTEMPTS} wait ${Math.round(waitMs / 1000)}s ... `);
          await sleep(waitMs);
        }
      }

      const { full, thumb } = await makeJpegs(sourceBytes);

      await uploadSupabase(storage, fullKey, full);
      await uploadSupabase(storage, thumbKey, thumb);
      await uploadR2({ ...r2, key: fullKey, body: full });
      await uploadR2({ ...r2, key: thumbKey, body: thumb });

      const [sbFull, sbThumb, r2Full, r2Thumb] = await Promise.all([
        verifySupabase(storage, fullKey),
        verifySupabase(storage, thumbKey),
        verifyR2({ ...r2, key: fullKey }),
        verifyR2({ ...r2, key: thumbKey }),
      ]);

      console.log(`ok full=${Math.round(full.length / 1024)}KB thumb=${Math.round(thumb.length / 1024)}KB verify sb:${sbFull}/${sbThumb} r2:${r2Full}/${r2Thumb}`);
      ok += 1;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed += 1;
    }

    await sleep(900);
  }

  console.log(`\nDone: ${ok} uploaded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
