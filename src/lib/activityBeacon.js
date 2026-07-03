import { hasSupabaseConfig, supabase } from './supabaseClient';

export const ACTIVITY_ROUTE_FEATURES = {
  '/': 'dashboard',
  '/studies': 'studies',
  '/chat': 'chat',
  '/qa': 'qa',
  '/discipleship': 'discipleship',
  '/calendar': 'calendar',
  '/fellowship': 'fellowship',
  '/sermons': 'sermons',
  '/feedback': 'feedback',
  '/forms': 'forms',
  '/integrations': 'integrations',
  '/leader-portal': 'leader-portal',
};

const THROTTLE_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'miqra_activity_beacon';
const sentThisSession = new Map();

function storageAvailable() {
  return typeof window !== 'undefined' && window.sessionStorage;
}

function readStoredBeacons(now = Date.now()) {
  if (!storageAvailable()) return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => Number.isFinite(Number(value)) && now - Number(value) < THROTTLE_MS)
    );
  } catch {
    return {};
  }
}

function writeStoredBeacons(beacons) {
  if (!storageAvailable()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(beacons));
  } catch {
    // Storage can be unavailable in private modes; the in-memory map still throttles.
  }
}

export function getActivityFeatureForPath(pathname = '/') {
  const cleanPath = `/${String(pathname || '/')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter(Boolean)
    .join('/')}`;
  const normalized = cleanPath === '/' ? '/' : cleanPath.replace(/\/+$/, '');
  if (ACTIVITY_ROUTE_FEATURES[normalized]) return ACTIVITY_ROUTE_FEATURES[normalized];

  const firstSegment = normalized === '/' ? '/' : `/${normalized.split('/').filter(Boolean)[0]}`;
  return ACTIVITY_ROUTE_FEATURES[firstSegment] || null;
}

export function shouldTrackActivity(orgId, featureKey, now = Date.now()) {
  if (!orgId || !featureKey) return false;

  const key = `${orgId}:${featureKey}`;
  const inMemoryLastSent = Number(sentThisSession.get(key) || 0);
  if (inMemoryLastSent && now - inMemoryLastSent < THROTTLE_MS) return false;

  const stored = readStoredBeacons(now);
  const lastSent = Number(stored[key] || 0);
  if (lastSent && now - lastSent < THROTTLE_MS) return false;

  sentThisSession.set(key, now);
  stored[key] = now;
  writeStoredBeacons(stored);
  return true;
}

export function trackActivity(orgId, featureKey, { role, now = Date.now() } = {}) {
  if (role === 'developer') return;
  if (!hasSupabaseConfig || !supabase || typeof supabase.rpc !== 'function') return;
  if (!shouldTrackActivity(orgId, featureKey, now)) return;

  supabase
    .rpc('track_activity', { p_org: orgId, p_feature: featureKey })
    .catch(() => {});
}

export function resetActivityBeaconForTests() {
  sentThisSession.clear();
  if (storageAvailable()) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}
