import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';
import { createIntegrationHandler, databaseError } from './handler.ts';
import { loadScripture } from './scripture.ts';
import { validCanvasClaims } from './auth.js';

const required = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing ${key}`); return value; };
const supabaseUrl = required('SUPABASE_URL');
const resource = required('LIVING_CANVAS_MCP_RESOURCE');
const appOrigin = new URL(required('LIVING_CANVAS_APP_ORIGIN')).origin;
const clientIds = required('LIVING_CANVAS_OAUTH_CLIENT_IDS').split(',').map((s) => s.trim());
const issuer = `${supabaseUrl}/auth/v1`;
if (new URL(resource).protocol !== 'https:' || !resource.endsWith('/mcp')) throw new Error('MCP resource must be an HTTPS URL ending in /mcp');

Deno.serve(createIntegrationHandler({
  resource, issuer, appOrigin, loadScripture,
  async authenticate(request) {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return null;
    // This client always acts AS THE CALLER. No service-role key is used.
    const client = createClient(supabaseUrl, required('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const token = authorization.slice(7);
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims || !validCanvasClaims(claims, { issuer, resource, clientIds })) return null;
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user || user.id !== claims.sub) return null;
    const unwrap = ({ data, error }: any) => { if (error) throw databaseError(error); return data; };
    return {
      async consume() { return unwrap(await client.rpc('consume_living_canvas_request')); },
      async get(id: string) { return unwrap(await client.from('study_canvases').select('id,title,reference,passages,steps,pins,journey,board,updated_at').eq('id', id).maybeSingle()); },
      async receipt(key: string) { return unwrap(await client.from('living_canvas_receipts').select('request_hash,result').eq('request_key', key).maybeSingle()); },
      async list(offset: number, limit: number) {
        const rows = unwrap(await client.from('study_canvases').select('id,title,reference,step_count,updated_at').order('updated_at', { ascending: false }).order('id').range(offset, offset + limit));
        return { canvases: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
      },
      async commit(args: any) { return unwrap(await client.rpc('commit_living_canvas_change', args)); },
    };
  },
}));
