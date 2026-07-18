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

const STYLE_SUFFIX = ', dignified realistic digital painting, warm natural light, historically accurate ancient Near East, Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, no text, no words, no watermark, no halo';
const MAX_GENERATION_ATTEMPTS = 18;

const ENTRIES = [
  {
    slug: 'hananiah_1395',
    name: 'Hananiah',
    prompt: 'Reverent portrait of Hananiah, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'hanun_1404',
    name: 'Hanun',
    prompt: 'Reverent portrait of Hanun, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'hebron_1475',
    name: 'Hebron',
    prompt: 'Reverent portrait of Hebron, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'hoshea_1559',
    name: 'Hoshea',
    prompt: 'Reverent portrait of Hoshea, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'jehoahaz_2516',
    name: 'Jehoahaz',
    prompt: 'Reverent portrait of Jehoahaz, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'jeshua_895',
    name: 'Jeshua',
    prompt: 'Reverent portrait of Jeshua, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'joash_1630',
    name: 'Joash',
    prompt: 'Reverent portrait of Joash, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'kadmiel_1767',
    name: 'Kadmiel',
    prompt: 'Reverent portrait of Kadmiel, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'maachah_1841',
    name: 'Maachah',
    prompt: 'Reverent portrait of Maachah, a woman of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'mahli_1889',
    name: 'Mahli',
    prompt: 'Reverent portrait of Mahli, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'mary_1940',
    name: 'Mary',
    prompt: 'Reverent portrait of Mary, a woman of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'menahem_1996',
    name: 'Menahem',
    prompt: 'Reverent portrait of Menahem, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'micah_2055',
    name: 'Micah',
    prompt: 'Reverent portrait of Micah, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'molech_2104',
    name: 'Molech',
    prompt: 'Reverent portrait of Molech, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'mushi_2116',
    name: 'Mushi',
    prompt: 'Reverent portrait of Mushi, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'peleg_2308',
    name: 'Peleg',
    prompt: 'Reverent portrait of Peleg, a man of the Bible who lived around 2247 BC–2008 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'salah_2455',
    name: 'Salah',
    prompt: 'Reverent portrait of Salah, a man of the Bible who lived around 2311 BC–1878 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'sheba_2570',
    name: 'Sheba',
    prompt: 'Reverent portrait of Sheba, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'shebna_2577',
    name: 'Shebna',
    prompt: 'Reverent portrait of Shebna, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'shelah_2593',
    name: 'Shelah',
    prompt: 'Reverent portrait of Shelah, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'tubal_2883',
    name: 'Tubal',
    prompt: 'Reverent portrait of Tubal, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'uzzah_2916',
    name: 'Uzzah',
    prompt: 'Reverent portrait of Uzzah, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'zimri_3088',
    name: 'Zimri',
    prompt: 'Reverent portrait of Zimri, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'ahaziah_120',
    name: 'Ahaziah',
    prompt: 'Reverent portrait of Ahaziah, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'barzillai_411',
    name: 'Barzillai',
    prompt: 'Reverent portrait of Barzillai, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'bela_436',
    name: 'Bela',
    prompt: 'Reverent portrait of Bela, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'cainan_534',
    name: 'Cainan',
    prompt: 'Reverent portrait of Cainan, a man of the Bible who lived around 3679 BC–2769 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'caleb_538',
    name: 'Caleb',
    prompt: 'Reverent portrait of Caleb, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'dagon_969',
    name: 'Dagon',
    prompt: 'Reverent portrait of Dagon, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'daughter_of_lot_younger_984',
    name: 'Daughter of Lot - Younger',
    prompt: 'Reverent portrait of Daughter of Lot - Younger, a woman of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'daughter_of_pharaoh_988',
    name: 'Daughter of Pharaoh',
    prompt: 'Reverent portrait of Daughter of Pharaoh, a woman of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'elihu_1130',
    name: 'Elihu',
    prompt: 'Reverent portrait of Elihu, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'jared_730',
    name: 'Jared',
    prompt: 'Reverent portrait of Jared, a man of the Bible who lived around 3544 BC–2582 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'javan_744',
    name: 'Javan',
    prompt: 'Reverent portrait of Javan, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'jonadab_1688',
    name: 'Jonadab',
    prompt: 'Reverent portrait of Jonadab, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'lamech_1809',
    name: 'Lamech',
    prompt: 'Reverent portrait of Lamech, a man of the Bible who lived around 3130 BC–2353 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'mahalaleel_1885',
    name: 'Mahalaleel',
    prompt: 'Reverent portrait of Mahalaleel, a man of the Bible who lived around 3609 BC–2714 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'meshech_2012',
    name: 'Meshech',
    prompt: 'Reverent portrait of Meshech, a man of the Bible, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'methuselah_2042',
    name: 'Methuselah',
    prompt: 'Reverent portrait of Methuselah, a man of the Bible who lived around 3317 BC–2348 BC, in authentic ancient Near Eastern dress of the biblical era',
  },
  {
    slug: 'nahor_2142',
    name: 'Nahor',
    prompt: 'Reverent portrait of Nahor, a man of the Bible who lived around 2155 BC–2007 BC, in authentic ancient Near Eastern dress of the biblical era',
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

  // Retrieve existing images to avoid overwriting
  const existing = new Set();
  try {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from('wiki-images')
        .list('_default', { limit: 100, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const f of data) {
        if (f.name.endsWith('.jpg')) existing.add(f.name.replace(/\.jpg$/, ''));
      }
      offset += data.length;
    }
  } catch (err) {
    console.warn(`Warning: Could not list existing default images: ${err.message}`);
  }

  for (const [index, entry] of ENTRIES.entries()) {
    const fullKey = `_default/${entry.slug}.jpg`;
    const thumbKey = `_default/thumbs/${entry.slug}.jpg`;
    process.stdout.write(`(${index + 1}/${ENTRIES.length}) ${entry.slug} seed=${seedFor(entry.slug)} ... `);

    if (existing.has(entry.slug)) {
      console.log('already exists');
      continue;
    }

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
