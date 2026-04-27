// Service Worker — Network-first for HTML (always get fresh updates),
// Cache-first for static assets with stale-while-revalidate
const CACHE_VERSION = 'v2';
const CACHE_NAME = `radiology-app-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './login-bg.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const req = event.request;

  // Skip Supabase + CDNs (always go to network, no cache)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('cdn.') || url.hostname.includes('cdnjs.') || url.hostname.includes('fonts.')) return;
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  // Network-first for HTML/navigation (so updates show immediately when online)
  const isHtml = req.mode === 'navigate' || req.url.endsWith('.html') || req.url.endsWith('/');
  if (isHtml) {
    event.respondWith(
      fetch(req).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Handle messages from the app (e.g., force update)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
