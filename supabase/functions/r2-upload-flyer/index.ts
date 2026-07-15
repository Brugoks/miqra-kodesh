// Authenticated event flyer upload to Cloudflare R2. The client sends a
// compressed image; this function validates the caller and writes to R2 so R2
// credentials never ship to the browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') || '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') || '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
const R2_BUCKET = Deno.env.get('R2_BUCKET') || '';
const R2_ENDPOINT = (Deno.env.get('R2_ENDPOINT') || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
const R2_PUBLIC_BASE_URL = (Deno.env.get('VITE_WIKI_IMAGE_BASE_URL') || '').replace(/\/+$/, '');

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const LEADER_ROLES = new Set(['developer', 'admin', 'leader', 'student_leader', 'parent_leader']);
const encoder = new TextEncoder();

function sanitizeFilename(value: string) {
  const fallback = 'flyer';
  return (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function extensionFor(type: string, name: string) {
  const byName = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (byName && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif'].includes(byName)) {
    return byName === 'jpeg' ? 'jpg' : byName;
  }
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/heic') return 'heic';
  if (type === 'image/heif') return 'heif';
  return 'jpg';
}

function encodeS3Path(value: string) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: ArrayBuffer | Uint8Array | string) {
  const data = typeof value === 'string' ? encoder.encode(value) : value;
  return hex(await crypto.subtle.digest('SHA-256', data));
}

async function hmac(key: ArrayBuffer | Uint8Array | string, value: string, output: 'hex' | 'buffer' = 'buffer') {
  const rawKey = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
  return output === 'hex' ? hex(signature) : signature;
}

async function signedR2Request({ method, key, body, contentType }: {
  method: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const endpointUrl = new URL(R2_ENDPOINT);
  const encodedPath = `/${encodeURIComponent(R2_BUCKET)}/${encodeS3Path(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const payloadHash = await sha256Hex(body);
  const headers = {
    'cache-control': 'public, max-age=31536000, immutable',
    'content-type': contentType,
    host: endpointUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name as keyof typeof headers]}\n`).join('');
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
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await hmac(
    await hmac(
      await hmac(
        await hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp),
        region,
      ),
      service,
    ),
    'aws4_request',
  );
  const signature = await hmac(signingKey as ArrayBuffer, stringToSign, 'hex');

  return {
    url: `${endpointUrl.origin}${encodedPath}`,
    init: {
      method,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const missing = [
      ['R2_ACCOUNT_ID', R2_ACCOUNT_ID],
      ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET', R2_BUCKET],
      ['R2_ENDPOINT', R2_ENDPOINT],
      ['VITE_WIKI_IMAGE_BASE_URL', R2_PUBLIC_BASE_URL],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      return jsonResponse({ error: `Missing R2 configuration: ${missing.join(', ')}` }, 503);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!LEADER_ROLES.has(profile?.role || '')) {
      return jsonResponse({ error: 'Leader role required' }, 403);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonResponse({ error: 'A flyer image is required.' }, 400);
    if (!ALLOWED_TYPES.has(file.type)) return jsonResponse({ error: 'Unsupported flyer type.' }, 400);
    if (file.size > MAX_BYTES) return jsonResponse({ error: 'Flyer must be 5 MB or smaller.' }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = extensionFor(file.type, file.name);
    const baseName = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
    const key = `event-flyers/${user.id}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${ext}`;
    const requestData = await signedR2Request({
      method: 'PUT',
      key,
      body: bytes,
      contentType: file.type,
    });
    const put = await fetch(requestData.url, requestData.init);
    if (!put.ok) {
      return jsonResponse({ error: `R2 upload failed: ${put.status}` }, 502);
    }

    return jsonResponse({
      key,
      publicUrl: `${R2_PUBLIC_BASE_URL}/${encodeS3Path(key)}`,
      contentType: file.type,
      size: file.size,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
