import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

type ProxyRequest = {
  provider: 'canva' | 'constant-contact';
  action: 'list-designs' | 'list-contact-lists';
};

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const getEndpoint = (payload: ProxyRequest) => {
  if (payload.provider === 'canva' && payload.action === 'list-designs') {
    return 'https://api.canva.com/rest/v1/designs';
  }

  if (payload.provider === 'constant-contact' && payload.action === 'list-contact-lists') {
    return 'https://api.cc.email/v3/contact_lists';
  }

  return null;
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

    const payload = await request.json() as ProxyRequest;
    const endpoint = getEndpoint(payload);
    if (!endpoint) {
      return jsonResponse({ error: 'Unsupported integration action' }, 400);
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connectionError } = await adminClient
      .from('integration_connections')
      .select('access_token, expires_at')
      .eq('user_id', userData.user.id)
      .eq('provider', payload.provider)
      .maybeSingle();

    if (connectionError) {
      return jsonResponse({ error: 'Could not load integration token', details: connectionError.message }, 500);
    }

    if (!connection?.access_token) {
      return jsonResponse({ error: 'Integration is not connected' }, 404);
    }

    if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: 'Integration token is expired. Reconnect this provider.' }, 401);
    }

    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${connection.access_token}`,
      },
    });

    const data = await response.json();
    await recordUsageEvent({
      provider: payload.provider,
      feature: payload.action,
      status: response.status,
      userId: userData.user.id,
    });

    if (!response.ok) {
      return jsonResponse({
        error: 'Provider API request failed',
        provider: payload.provider,
        details: data,
      }, response.status);
    }

    return jsonResponse({
      provider: payload.provider,
      action: payload.action,
      data,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
