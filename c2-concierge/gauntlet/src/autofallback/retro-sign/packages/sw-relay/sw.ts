/**
 * C2PA Service Worker Relay
 * Handles CORS/Mixed Content fixes for manifest fetching
 */

// Service Worker types
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'c2pa-manifests-v1';
const MANIFEST_CDN = 'https://manifests.c2pa.example.com';
const ALLOWED_ORIGINS = [
  'https://localhost:3000',
  'https://demo.c2pa.example.com',
  'https://app.c2pa.example.com'
];

// Cache configuration
const CACHE_CONFIG = {
  maxAge: 5 * 60 * 1000, // 5 minutes
  staleWhileRevalidate: 24 * 60 * 60 * 1000 // 24 hours
};

// Install event - cache critical resources
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('C2PA Service Worker: Installing');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Pre-cache worker script for integrity
        return cache.addAll(['/packages/player-hooks/src/verify.worker.js']);
      })
      .then(() => {
        console.log('C2PA Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('C2PA Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('C2PA Service Worker: Activating');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log('C2PA Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('C2PA Service Worker: Activation complete');
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('C2PA Service Worker: Activation failed', error);
      })
  );
});

// Fetch event - intercept manifest requests
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  
  // Only intercept C2PA manifest requests
  if (isC2PAManifestRequest(url)) {
    event.respondWith(handleManifestRequest(event.request, url));
  }
});

/**
 * Check if request is for a C2PA manifest
 */
function isC2PAManifestRequest(url: URL): boolean {
  return (
    url.pathname.endsWith('.c2pa.json') ||
    url.pathname.endsWith('.c2pa') ||
    url.searchParams.has('c2pa') ||
    url.pathname.includes('/manifests/') && url.pathname.includes('.json')
  );
}

/**
 * Handle manifest request with CORS fixes and caching
 */
async function handleManifestRequest(request: Request, url: URL): Promise<Response> {
  try {
    // Check if origin is allowed
    const origin = request.headers.get('origin');
    if (origin && !isOriginAllowed(origin)) {
      console.warn('C2PA Service Worker: Origin not allowed', origin);
      return new Response('Origin not allowed', { status: 403 });
    }

    // Try cache first (stale-while-revalidate)
    const cachedResponse = await getCachedResponse(request);
    if (cachedResponse) {
      // Trigger background refresh
      refreshCache(request);
      return cachedResponse;
    }

    // Fetch from CDN with proper headers
    const response = await fetchFromCDN(request, url);
    
    // Cache the response
    await cacheResponse(request, response.clone());
    
    return response;
    
  } catch (error) {
    console.error('C2PA Service Worker: Failed to handle manifest request', error);
    
    // Try to return stale cache if available
    const staleResponse = await getStaleResponse(request);
    if (staleResponse) {
      return staleResponse;
    }
    
    // Return error response
    return new Response('Manifest fetch failed', { 
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

/**
 * Get cached response if fresh
 */
async function getCachedResponse(request: Request): Promise<Response | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (!cached) return null;
    
    // Check if cache is fresh
    const cacheTime = cached.headers.get('x-cache-time');
    if (cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < CACHE_CONFIG.maxAge) {
        console.debug('C2PA Service Worker: Cache hit (fresh)', request.url);
        return cached;
      }
    }
    
    return null;
  } catch (error) {
    console.error('C2PA Service Worker: Cache check failed', error);
    return null;
  }
}

/**
 * Get stale response for fallback
 */
async function getStaleResponse(request: Request): Promise<Response | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      console.debug('C2PA Service Worker: Cache hit (stale)', request.url);
      return cached;
    }
    
    return null;
  } catch (error) {
    console.error('C2PA Service Worker: Stale cache check failed', error);
    return null;
  }
}

/**
 * Refresh cache in background
 */
async function refreshCache(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await fetchFromCDN(request, url);
    await cacheResponse(request, response);
    console.debug('C2PA Service Worker: Cache refreshed', request.url);
  } catch (error) {
    console.debug('C2PA Service Worker: Cache refresh failed', error);
  }
}

/**
 * Fetch from CDN with proper CORS headers
 */
async function fetchFromCDN(request: Request, originalUrl: URL): Promise<Response> {
  // Rewrite URL to CDN
  const cdnUrl = `${MANIFEST_CDN}${originalUrl.pathname}${originalUrl.search}`;
  
  const cdnRequest = new Request(cdnUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers.entries()),
      'Accept': 'application/c2pa+json, application/json',
      'User-Agent': 'C2PA-ServiceWorker/1.0',
      'X-Forwarded-For': originalUrl.hostname,
      'X-Original-URL': request.url
    },
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store'
  });

  const response = await fetch(cdnRequest);
  
  if (!response.ok) {
    throw new Error(`CDN fetch failed: ${response.status} ${response.statusText}`);
  }

  // Add CORS headers for cross-origin requests
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  headers.set('X-C2PA-Relay', 'true');
  headers.set('X-Cache-Time', Date.now().toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Cache response with metadata
 */
async function cacheResponse(request: Request, response: Response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Add cache metadata
    const headers = new Headers(response.headers);
    headers.set('X-Cache-Time', Date.now().toString());
    headers.set('X-Cache-URL', request.url);
    
    const cacheResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    
    await cache.put(request, cacheResponse);
  } catch (error) {
    console.error('C2PA Service Worker: Cache storage failed', error);
  }
}

// Handle notification clicks (for badge interactions)
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('C2PA Service Worker: Notification clicked', event);
  
  event.notification.close();
  
  // Focus or open the client
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Focus existing client if available
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Handle push messages (for verification updates)
self.addEventListener('push', (event: PushEvent) => {
  console.log('C2PA Service Worker: Push message received');
  
  const options: NotificationOptions = {
    body: 'Content authenticity status updated',
    icon: '/c2pa-icon.png',
    badge: '/c2pa-badge.png',
    tag: 'c2pa-verify',
    requireInteraction: false,
    actions: [
      {
        action: 'view-details',
        title: 'View Details'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('C2PA Verification', options)
  );
});

// Message handling for client communication
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_MANIFEST') {
    handleCacheManifest(event.data.url);
  }
});

/**
 * Handle explicit manifest caching
 */
async function handleCacheManifest(url: string) {
  try {
    const request = new Request(url);
    const response = await fetchFromCDN(request, new URL(url));
    await cacheResponse(request, response);
    
    // Notify all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'MANIFEST_CACHED',
        url: url
      });
    });
  } catch (error) {
    console.error('C2PA Service Worker: Failed to cache manifest', error);
  }
}

// Performance monitoring
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.url.includes('/metrics')) {
    event.respondWith(getMetrics());
  }
});

/**
 * Get service worker metrics
 */
async function getMetrics(): Promise<Response> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const metrics = {
      cacheSize: keys.length,
      cacheKeys: keys.map(key => key.url),
      version: CACHE_NAME,
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('C2PA Service Worker: Metrics failed', error);
    return new Response('Metrics unavailable', { status: 500 });
  }
}

console.log('C2PA Service Worker: Loaded');
