import { hasSupabaseConfig, supabase } from './supabaseClient';

const wikiImageBaseUrl = (import.meta.env.VITE_WIKI_IMAGE_BASE_URL || '').replace(/\/+$/, '');

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function hasExternalWikiDefaultImages() {
  return Boolean(wikiImageBaseUrl);
}

export function wikiImageUrl(path) {
  if (!path) return null;
  if (wikiImageBaseUrl && path.startsWith('_default/')) {
    return `${wikiImageBaseUrl}/${encodeStoragePath(path)}`;
  }
  if (!hasSupabaseConfig) return null;
  return supabase.storage.from('wiki-images').getPublicUrl(path).data.publicUrl;
}
