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
    slug: 'kedesh-1',
    name: 'Kedesh',
    prompt: 'Kedesh in Naphtali, a refuge city in the high Galilean woods',
  },
  {
    slug: 'kidron',
    name: 'Kidron',
    prompt: 'the Kidron ravine below Jerusalem, ancient olives and rock-cut tombs',
  },
  {
    slug: 'taanach',
    name: 'Taanach',
    prompt: 'Taanach by the waters of Megiddo, chariot grounds in the valley',
  },
  {
    slug: 'valley-of-rephaim',
    name: 'Valley of Rephaim',
    prompt: 'the Valley of Rephaim, grain fields southwest of Jerusalem, balsam trees on the ridge',
  },
  {
    slug: 'zin-1',
    name: 'Zin',
    prompt: 'the wilderness of Zin, pale canyons and scorched flats',
  },
  {
    slug: 'zobah',
    name: 'Zobah',
    prompt: 'the Aramean kingdom of Zobah, horsemen mustering in the Beqaa lands',
  },
  {
    slug: 'zorah',
    name: 'Zorah',
    prompt: 'Zorah overlooking the Sorek valley, threshing floors on the hill breeze',
  },
  {
    slug: 'aroer-2',
    name: 'Aroer 2',
    prompt: 'Aroer of the south, a small desert town among wadis',
  },
  {
    slug: 'arpad',
    name: 'Arpad',
    prompt: 'Arpad of northern Syria, a besieged tell city',
  },
  {
    slug: 'azekah',
    name: 'Azekah',
    prompt: 'Azekah above the Valley of Elah, watching armies camp on either slope',
  },
  {
    slug: 'babylonia',
    name: 'Babylonia',
    prompt: 'the flat green river plain of Babylonia, canals and distant ziggurats',
  },
  {
    slug: 'bahurim',
    name: 'Bahurim',
    prompt: 'Bahurim on the old Jericho road, a dusty village of stone fences',
  },
  {
    slug: 'beth-horon',
    name: 'Beth-horon',
    prompt: 'the twin ridge towns of Beth-horon on the steep pass road',
  },
  {
    slug: 'bozrah-1',
    name: 'Bozrah',
    prompt: 'Bozrah of Edom, a sheepfold fortress in red rock',
  },
  {
    slug: 'chaldea',
    name: 'Chaldea',
    prompt: 'Chaldea of the south marshes, reed houses and star-gazing towers',
  },
  {
    slug: 'cyrene',
    name: 'Cyrene',
    prompt: 'Cyrene of North Africa, terraced Greek city above a green plateau',
  },
  {
    slug: 'edrei',
    name: 'Edrei',
    prompt: 'Edrei in Bashan, basalt-black walls of the kingdom of Og',
  },
  {
    slug: 'engedi',
    name: 'Engedi',
    prompt: 'the oasis of Engedi, waterfalls and ibex on cliffs above the Dead Sea',
  },
  {
    slug: 'ezion-geber',
    name: 'Ezion-geber',
    prompt: 'Ezion-geber on the Red Sea, a fleet of trading ships fitting out',
  },
  {
    slug: 'galatia',
    name: 'Galatia',
    prompt: 'the Anatolian highlands of Galatia, Roman roads through wide grasslands',
  },
  {
    slug: 'goshen-1',
    name: 'Goshen',
    prompt: 'the delta pastures of Goshen, Hebrew flocks fat by Nile channels',
  },
  {
    slug: 'jabbok',
    name: 'Jabbok',
    prompt: 'the deep Jabbok gorge at night, a lone figure wrestling till daybreak by the ford',
  },
  {
    slug: 'jabesh-gilead',
    name: 'Jabesh-gilead',
    prompt: 'Jabesh-gilead in the hills east of Jordan, loyal townsmen setting out by night',
  },
  {
    slug: 'luz-1',
    name: 'Luz',
    prompt: 'ancient Luz that became Bethel, a stone pillar anointed with oil at dawn',
  },
  {
    slug: 'clement-of-rome',
    name: 'Clement of Rome',
    prompt: 'Clement of Rome, an elderly first-century bishop in simple Roman tunic and cloak, dictating a letter by oil lamp in a Roman house church',
  },
  {
    slug: 'ignatius-of-antioch',
    name: 'Ignatius of Antioch',
    prompt: 'Ignatius of Antioch, a resolute second-century bishop in chains escorted by Roman soldiers along a stone road, writing letters at a rest stop',
  },
  {
    slug: 'council-of-jerusalem',
    name: 'Council of Jerusalem',
    prompt: 'The Council of Jerusalem: James the brother of Jesus standing in a simple first-century stone meeting hall, gesturing warmly, as the apostles Peter, Paul, and Barnabas listen intently among gathered elders',
  },
  {
    slug: 'polycarp',
    name: 'Polycarp',
    prompt: 'Polycarp, a white-bearded elderly bishop standing serene before a Roman arena crowd, hands unbound beside an unlit pyre',
  },
  {
    slug: 'justin-martyr',
    name: 'Justin Martyr',
    prompt: 'Justin Martyr, a second-century philosopher in a scholar\'s pallium cloak, reasoning from scrolls in a Roman colonnade',
  },
  {
    slug: 'irenaeus',
    name: 'Irenaeus',
    prompt: 'Irenaeus of Lyons, a second-century bishop at a writing desk stacked with codices, Gallic hills through a window',
  },
  {
    slug: 'tertullian',
    name: 'Tertullian',
    prompt: 'Tertullian, an intense North African advocate in Roman dress, mid-argument at a desk of legal scrolls in Carthage',
  },
  {
    slug: 'origen',
    name: 'Origen',
    prompt: 'Origen, a lean third-century scholar surrounded by shelves of scrolls in the great library district of Alexandria, comparing manuscript columns by lamplight',
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
