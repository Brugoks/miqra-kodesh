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
// spinners. Reads fail fast (20s) and get one retry: a tab resumed from the
// background often loses its first request to a dead keep-alive socket and
// succeeds on a fresh one — the failure users were fixing with a manual
// refresh. Writes keep the long 60s deadline (headroom for photo uploads)
// and are never retried, since they may not be idempotent.
const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 60_000;

const fetchWithDeadline = async (input, init = {}) => {
  if (init.signal || typeof AbortSignal.timeout !== 'function') {
    return fetch(input, init);
  }
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const timeout = isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    // fetch only rejects on network failure/timeout (never on HTTP status),
    // so a single read retry can't duplicate work or mask server errors.
    if (!isRead) throw err;
    return fetch(input, { ...init, signal: AbortSignal.timeout(timeout) });
  }
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
