// ==================== Service Worker - Plan de Actuación Digital ====================
const CACHE_NAME = 'plan-digital-v8';
const BASE_URL = '/PlanActDigV2/';

const PRECACHE_URLS = [
  BASE_URL,
  BASE_URL + 'index.html',
  BASE_URL + 'manifest.json',
  BASE_URL + 'pwa/icons/icon-192.png',
  BASE_URL + 'pwa/icons/icon-512.png'
];

const EXTERNAL_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// Install: precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Cache local files first
        const localPromise = cache.addAll(PRECACHE_URLS).catch(() => {});
        // Cache external resources individually (non-blocking)
        const externalPromises = EXTERNAL_URLS.map((url) =>
          cache.add(url).catch(() => {
            console.warn('SW: Could not cache external resource:', url);
          })
        );
        return Promise.all([localPromise, ...externalPromises]);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for Firestore API, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Firestore API calls: network-first (always need fresh data)
  if (url.hostname === 'firestore.googleapis.com' ||
      url.hostname === 'firestore.googleapis.com' ||
      url.pathname.includes('firestore')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Optionally cache successful responses for offline read
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // If offline, try cache
          return caches.match(event.request).then((cached) => {
            return cached || new Response(JSON.stringify({ error: 'Sin conexión' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Firebase auth/internal: network-first
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok && (event.request.url.startsWith(self.location.origin) ||
            EXTERNAL_URLS.some(ext => event.request.url.startsWith(ext)))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match(BASE_URL + 'index.html');
        }
      });
    })
  );
});