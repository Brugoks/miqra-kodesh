/* global process, Buffer */
// Copy generated Bible Wiki default images from Supabase Storage to Cloudflare R2.
//
// Required .env values:
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET
//
// Optional:
//   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
//
// Usage:
//   node scripts/migrate-wiki-images-to-r2.js --dry-run
//   node scripts/migrate-wiki-images-to-r2.js
//   node scripts/migrate-wiki-images-to-r2.js --limit 50
//   node scripts/migrate-wiki-images-to-r2.js --force

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

function contentTypeFor(key, fallback) {
  if (fallback) return fallback;
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
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

async function listSupabaseFiles(storage, folder) {
  const files = [];
  async function walk(prefix) {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await storage.list(prefix, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        const size = Number(item.metadata?.size || 0);
        const isFile = Boolean(item.id) || size > 0 || item.metadata?.mimetype || item.metadata?.eTag;
        if (isFile) files.push({ path: itemPath, size, contentType: item.metadata?.mimetype || null });
        else await walk(itemPath);
      }
      if (!data || data.length < limit) break;
      offset += limit;
    }
  }
  await walk(folder);
  return files;
}

loadDotenv();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

const supabaseUrl = required('VITE_SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const r2AccountId = required('R2_ACCOUNT_ID');
const r2AccessKeyId = required('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = required('R2_SECRET_ACCESS_KEY');
const r2Bucket = required('R2_BUCKET');
const r2Endpoint = process.env.R2_ENDPOINT || `https://${r2AccountId}.r2.cloudflarestorage.com`;

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const storage = supabase.storage.from('wiki-images');
const files = (await listSupabaseFiles(storage, '_default')).slice(0, limit);

console.log(`${files.length} wiki default objects found${dryRun ? ' (dry run)' : ''}.`);

let copied = 0;
let skipped = 0;
let failed = 0;

for (const [index, file] of files.entries()) {
  process.stdout.write(`(${index + 1}/${files.length}) ${file.path} ... `);
  try {
    if (!force) {
      const head = await r2Fetch({
        method: 'HEAD',
        endpoint: r2Endpoint,
        bucket: r2Bucket,
        key: file.path,
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      });
      if (head.ok) {
        skipped += 1;
        console.log('exists');
        continue;
      }
      if (head.status !== 404) {
        throw new Error(`R2 HEAD failed: ${head.status} ${await head.text().catch(() => '')}`);
      }
    }

    if (dryRun) {
      copied += 1;
      console.log(`would copy (${Math.round(file.size / 1024)}KB)`);
      continue;
    }

    const { data, error } = await storage.download(file.path);
    if (error) throw error;
    const body = Buffer.from(await data.arrayBuffer());
    const contentType = contentTypeFor(file.path, file.contentType);
    const put = await r2Fetch({
      method: 'PUT',
      endpoint: r2Endpoint,
      bucket: r2Bucket,
      key: file.path,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      body,
      contentType,
    });
    if (!put.ok) throw new Error(`R2 PUT failed: ${put.status} ${await put.text().catch(() => '')}`);
    copied += 1;
    console.log(`copied (${Math.round(body.length / 1024)}KB)`);
  } catch (err) {
    failed += 1;
    console.log(`FAILED: ${err.message}`);
  }
}

console.log(`\nDone: ${copied} copied${dryRun ? ' candidates' : ''}, ${skipped} skipped, ${failed} failed.`);
