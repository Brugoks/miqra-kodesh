import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';
import { recordUsageEvent } from '../_shared/usage.ts';
import { createHandler } from './handler.ts';
import { loadSources } from './sources.ts';

Deno.serve(createHandler({
  async identity(request) {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return null;
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !user) return null;
    const { data: profile, error: profileError } = await client.from('profiles').select('role, active_organization_id').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    return { userId: user.id, role: profile?.role || '', organizationId: profile?.active_organization_id || null };
  },
  loadSources,
  env: (key) => Deno.env.get(key),
  fetch,
  recordUsage: recordUsageEvent,
}));
