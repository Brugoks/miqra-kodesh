import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type Provider = 'canva' | 'constant-contact';

type OAuthRequest = {
  provider: Provider;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  scopes?: string;
};

const providerConfig = {
  canva: {
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    clientIdEnv: 'CANVA_CLIENT_ID',
    clientSecretEnv: 'CANVA_CLIENT_SECRET',
  },
  'constant-contact': {
    tokenUrl: 'https://authz.constantcontact.com/oauth2/default/v1/token',
    clientIdEnv: 'CONSTANT_CONTACT_CLIENT_ID',
    clientSecretEnv: 'CONSTANT_CONTACT_CLIENT_SECRET',
  },
};

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const createBasicAuthHeader = (clientId: string, clientSecret: string) => {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
};

const exchangeCode = async ({ provider, code, redirectUri, codeVerifier }: OAuthRequest) => {
  const config = providerConfig[provider];
  const clientId = requireEnv(config.clientIdEnv);
  const clientSecret = requireEnv(config.clientSecretEnv);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  if (provider === 'canva' && codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: createBasicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const payload = await request.json() as OAuthRequest;
    if (!payload.provider || !providerConfig[payload.provider]) {
      return jsonResponse({ error: 'Unsupported integration provider' }, 400);
    }
    if (!payload.code || !payload.redirectUri) {
      return jsonResponse({ error: 'Missing authorization code or redirect URI' }, 400);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid user session' }, 401);
    }

    const tokenResult = await exchangeCode(payload);
    if (!tokenResult.ok) {
      return jsonResponse({
        error: 'Token exchange failed',
        provider: payload.provider,
        details: tokenResult.data,
      }, tokenResult.status);
    }

    const expiresIn = Number(tokenResult.data.expires_in || 0);
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await adminClient
      .from('integration_connections')
      .upsert({
        user_id: userData.user.id,
        provider: payload.provider,
        access_token: tokenResult.data.access_token,
        refresh_token: tokenResult.data.refresh_token || null,
        expires_at: expiresAt,
        scopes: tokenResult.data.scope || payload.scopes || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      return jsonResponse({ error: 'Could not save integration connection', details: upsertError.message }, 500);
    }

    return jsonResponse({
      provider: payload.provider,
      connected: true,
      expiresAt,
      scopes: tokenResult.data.scope || payload.scopes || null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});

