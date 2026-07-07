/* Service worker: Web Push notifications + offline caching.
 *
 * Caching strategy:
 *  - Navigations (SPA routes): network-first, falling back to the cached app
 *    shell so the app still opens with no signal.
 *  - Hashed build assets (/assets/*): cache-first — Vite fingerprints them, so
 *    a cached copy is immutable.
 *  - Other same-origin static files (icons, manifest): stale-while-revalidate.
 *  - Cross-origin requests (Supabase, external APIs) are never intercepted, so
 *    auth-sensitive responses are never cached here.
 */

// Bump this whenever the caching logic below changes — activation deletes all
// older caches, which is also the recovery path for clients holding bad entries.
const CACHE_VERSION = 'miqra-cache-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    const cached = await cache.match('/');
    if (cached) return cached;
    throw new Error('offline and no cached shell');
  }
}

/* The SPA rewrite answers unknown paths with index.html + 200, so a request
 * for an asset from a previous deploy can come back as HTML. Caching that
 * would permanently serve HTML in place of a script or stylesheet. */
function isCacheableAsset(response) {
  const type = response.headers.get('content-type') || '';
  return response.ok && !type.includes('text/html');
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableAsset(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (isCacheableAsset(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Miqra Kodesh', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Miqra Kodesh';
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return undefined;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
