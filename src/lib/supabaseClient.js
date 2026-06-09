import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  console.warn("Supabase configuration keys (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing from your environment variables.");
}

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;
