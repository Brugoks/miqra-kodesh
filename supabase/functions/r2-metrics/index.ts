// Developer-only R2 storage snapshot. Uses Cloudflare R2's S3-compatible
// ListObjectsV2 API so the browser never receives R2 credentials.

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

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
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

function encodeS3Path(value: string) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

async function signedR2Url({ method, query }: { method: string; query: string }) {
  const endpointUrl = new URL(R2_ENDPOINT);
  const encodedPath = `/${encodeURIComponent(R2_BUCKET)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const payloadHash = await sha256Hex('');
  const headers = {
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
    query,
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
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `${endpointUrl.origin}${encodedPath}?${query}`,
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}

async function listR2Objects() {
  const objects: Array<{ key: string; size: number; lastModified: string | null }> = [];
  let continuationToken = '';

  while (true) {
    const params = [
      ...(continuationToken ? [['continuation-token', continuationToken]] : []),
      ['list-type', '2'],
      ['max-keys', '1000'],
    ].sort(([a], [b]) => a.localeCompare(b));
    const query = params
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    const signed = await signedR2Url({ method: 'GET', query });
    const response = await fetch(signed.url, { method: 'GET', headers: signed.headers });
    if (!response.ok) {
      throw new Error(`R2 list failed: ${response.status} ${await response.text().catch(() => '')}`);
    }

    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const contents = [...doc.querySelectorAll('Contents')];
    for (const node of contents) {
      const key = node.querySelector('Key')?.textContent || '';
      const size = Number(node.querySelector('Size')?.textContent || 0);
      const lastModified = node.querySelector('LastModified')?.textContent || null;
      if (key) objects.push({ key, size, lastModified });
    }

    const truncated = doc.querySelector('IsTruncated')?.textContent === 'true';
    continuationToken = doc.querySelector('NextContinuationToken')?.textContent || '';
    if (!truncated || !continuationToken) break;
  }

  return objects;
}

function summarizePrefixes(objects: Array<{ key: string; size: number }>) {
  const byPrefix = new Map<string, { prefix: string; objects: number; bytes: number }>();
  for (const object of objects) {
    const parts = object.key.split('/');
    const prefix = parts.length > 1 ? `${encodeS3Path(parts[0])}/` : '(root)';
    const current = byPrefix.get(prefix) || { prefix, objects: 0, bytes: 0 };
    current.objects += 1;
    current.bytes += object.size;
    byPrefix.set(prefix, current);
  }
  return [...byPrefix.values()].sort((a, b) => b.bytes - a.bytes);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
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
    if (profile?.role !== 'developer') {
      return jsonResponse({ error: 'Developer role required' }, 403);
    }

    const missing = [
      ['R2_ACCOUNT_ID', R2_ACCOUNT_ID],
      ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET', R2_BUCKET],
      ['R2_ENDPOINT', R2_ENDPOINT],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length) {
      return jsonResponse({ error: `Missing R2 configuration: ${missing.join(', ')}` }, 503);
    }

    const objects = await listR2Objects();
    const bytes = objects.reduce((sum, object) => sum + object.size, 0);
    const lastModifiedAt = objects
      .map((object) => object.lastModified)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    return jsonResponse({
      checkedAt: new Date().toISOString(),
      bucket: R2_BUCKET,
      endpointHost: new URL(R2_ENDPOINT).host,
      publicBaseUrl: R2_PUBLIC_BASE_URL || null,
      objects: objects.length,
      bytes,
      lastModifiedAt,
      prefixes: summarizePrefixes(objects),
      limits: {
        storageBytes: 10 * 1024 * 1024 * 1024,
        classAOperationsMonthly: 1_000_000,
        classBOperationsMonthly: 10_000_000,
      },
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
