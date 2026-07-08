import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  console.warn("Supabase configuration keys (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing from your environment variables.");
}

// A request that never settles leaves whichever page issued it stuck on its
// loading state until the user hard-refreshes, so every request gets a hard
// deadline. Callers already treat errors as empty results and clear their
// spinners. 60s leaves headroom for slow photo uploads to storage.
const fetchWithDeadline = (input, init = {}) => {
  if (init.signal || typeof AbortSignal.timeout !== 'function') {
    return fetch(input, init);
  }
  return fetch(input, { ...init, signal: AbortSignal.timeout(60_000) });
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
        storageKey: 'cb-students-auth',
      },
      global: {
        fetch: fetchWithDeadline,
      },
    })
  : null;
