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
    slug: 'jehoahaz_784',
    name: 'Jehoahaz',
    prompt: 'Jehoahaz king of Israel pleading before the Lord at a nearly empty muster ground, his few remaining chariots behind him',
  },
  {
    slug: 'jeroboam_873',
    name: 'Jeroboam son of Joash',
    prompt: 'Jeroboam son of Joash, king of Israel, on a rampart of Samaria surveying restored borders and prosperous fields below',
  },
  {
    slug: 'kareah_919',
    name: 'Kareah',
    prompt: 'Kareah, a Judean elder of soldier stock, watching armed bands regroup in the open countryside after Jerusalem’s fall',
  },
  {
    slug: 'manoah_1933',
    name: 'Manoah',
    prompt: 'Manoah of Zorah and his wife falling to their faces as the flame of their offering rises from a rock altar toward heaven',
  },
  {
    slug: 'mary_1943',
    name: 'Mary Magdalene',
    prompt: 'Mary Magdalene at first light in a garden of rock-hewn tombs, turning toward a voice, tears on her face',
  },
  {
    slug: 'mephibosheth_1999',
    name: 'Mephibosheth',
    prompt: 'Mephibosheth, lame in both feet, bowing low at the king’s table set with honor',
  },
  {
    slug: 'ner_2181',
    name: 'Ner',
    prompt: 'Ner the Benjamite patriarch, an elder with a staff outside Gibeah, young kinsmen tending flocks nearby',
  },
  {
    slug: 'sennacherib_2489',
    name: 'Sennacherib',
    prompt: 'Sennacherib of Assyria enthroned before siege ramps at Lachish, scribes tallying spoil',
  },
  {
    slug: 'ahimaaz_144',
    name: 'Ahimaaz',
    prompt: 'Ahimaaz son of Zadok running like the wind along the Jordan plain road, outpacing another courier with news for the king',
  },
  {
    slug: 'amoz_240',
    name: 'Amoz',
    prompt: 'Amoz of Jerusalem, a thoughtful Hebrew elder walking beneath the city wall with his young son at his side',
  },
  {
    slug: 'barak_401',
    name: 'Barak',
    prompt: 'Barak charging down Mount Tabor with ten thousand men as storm and mud swallow iron chariots below',
  },
  {
    slug: 'gad_1263',
    name: 'Gad the seer',
    prompt: 'Gad the seer standing before King David with a grave message, a shadowed threshing floor on the hill beyond',
  },
  {
    slug: 'hamor_1365',
    name: 'Hamor',
    prompt: 'Hamor the Hivite prince negotiating with the sons of Jacob at his city gate, elders seated around them',
  },
  {
    slug: 'hezron_1520',
    name: 'Hezron',
    prompt: 'Hezron son of Pharez, a bearded Hebrew clan father with staff and flocks in the green pasturelands of Goshen',
  },
  {
    slug: 'hushai_1577',
    name: 'Hushai',
    prompt: 'Hushai the Archite, David’s friend, robe torn and dust on his head, arriving at the gates of Jerusalem',
  },
  {
    slug: 'jeduthun_1224',
    name: 'Jeduthun',
    prompt: 'Jeduthun the Levite chief musician with a lyre, leading robed singers and instrument players before the tent of the ark',
  },
  {
    slug: 'kish_1784',
    name: 'Kish',
    prompt: 'Kish the Benjamite, a sturdy landowner standing at his farmstead as servants set out to search for strayed donkeys',
  },
  {
    slug: 'omri_2243',
    name: 'Omri',
    prompt: 'Omri the soldier-king surveying the newly bought hill of Samaria, builders staking out walls',
  },
  {
    slug: 'remaliah_2420',
    name: 'Remaliah',
    prompt: 'Remaliah, a Hebrew father of the northern kingdom, watching his grown son ride toward Samaria with armed companions',
  },
  {
    slug: 'ruth_2450',
    name: 'Ruth',
    prompt: 'Ruth the Moabite gleaning barley behind the reapers of Bethlehem, sheaf cradled in her arm',
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
