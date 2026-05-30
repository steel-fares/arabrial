const CACHE = 'arbr-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/assets/css/arbr.css',
  '/assets/js/config.public.js',
  '/assets/js/security.js',
  '/assets/js/layout.js',
  '/assets/js/arbr.js',
  '/assets/js/pwa-register.js',
  '/logo.svg',
  '/manifest.json',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin.includes('supabase.co') || url.origin.includes('googleapis.com') || url.origin.includes('gstatic.com') || url.origin.includes('jsdelivr.net')) {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match('/offline.html'))
    )
  );
});
