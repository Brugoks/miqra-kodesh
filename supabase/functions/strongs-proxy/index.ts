import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { strongsId } = (await request.json()) as { strongsId: string };
    if (!strongsId) return jsonResponse({ error: 'strongsId is required' }, 400);

    const normalized = strongsId.trim().toUpperCase();
    if (!/^[HG]\d{1,5}$/.test(normalized)) {
      return jsonResponse({ error: 'Invalid Strongs number. Use format H1234 or G1234.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('strongs_lexicon')
      .select('*')
      .eq('id', normalized)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: `Strongs ID ${normalized} not found` }, 404);

    return jsonResponse({ strongsId: normalized, data });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
