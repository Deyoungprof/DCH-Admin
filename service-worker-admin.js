const CACHE_NAME = 'deyoungprof-admin-v3';
const STATIC_CACHE = 'deyoungprof-admin-static-v3';
const DYNAMIC_CACHE = 'deyoungprof-admin-dynamic-v3';

// Only cache local assets that we control
const STATIC_ASSETS = [
  './',
  './manifest-admin.json',
  './admin-logo.png'
];

// External CDN resources - don't cache, just pass through
const EXTERNAL_RESOURCES = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Install event
self.addEventListener('install', event => {
  console.log('Admin Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Admin Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('Cache installation error:', err))
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Admin Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
            console.log('Admin Service Worker: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network-first for admin (always get fresh data)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // CRITICAL FIX: Skip caching for non-GET requests (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Pass through external CDN resources without caching
  const isExternal = EXTERNAL_RESOURCES.some(domain => url.hostname.includes(domain));
  if (isExternal) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-first strategy for admin panel and Firebase (always fresh data)
  if (url.pathname.includes('./') || 
      url.hostname.includes('firebasestorage') || 
      url.hostname.includes('firestore') ||
      url.hostname.includes('firebase')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for local static assets only
  if (request.destination === 'image' || 
      url.pathname.endsWith('.css') || 
      url.pathname.endsWith('.js')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default to network-first
  event.respondWith(networkFirst(request));
});

// Network-first strategy
async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  try {
    const response = await fetch(request);
    // Only cache successful GET responses
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || new Response('Offline - Admin requires connection', { status: 503 });
  }
}

// Cache-first strategy
async function cacheFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Message listener
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
