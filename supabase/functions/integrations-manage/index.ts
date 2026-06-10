import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type ManageRequest = {
  action: 'list' | 'disconnect';
  provider?: 'canva' | 'constant-contact';
};

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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

    const payload = await request.json() as ManageRequest;
    if (!payload.action) {
      return jsonResponse({ error: 'Missing action' }, 400);
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

    if (payload.action === 'disconnect') {
      if (!payload.provider) {
        return jsonResponse({ error: 'Missing provider' }, 400);
      }

      const { error } = await adminClient
        .from('integration_connections')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('provider', payload.provider);

      if (error) {
        return jsonResponse({ error: 'Could not disconnect integration', details: error.message }, 500);
      }

      return jsonResponse({ provider: payload.provider, disconnected: true });
    }

    const { data, error } = await adminClient
      .from('integration_connections')
      .select('provider, expires_at, scopes, updated_at')
      .eq('user_id', userData.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      return jsonResponse({ error: 'Could not load integration connections', details: error.message }, 500);
    }

    return jsonResponse({ connections: data || [] });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});

