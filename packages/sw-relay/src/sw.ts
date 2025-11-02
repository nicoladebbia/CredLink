/// <reference lib="WebWorker" />

const swScope = self as unknown as ServiceWorkerGlobalScope & typeof globalThis;

function on(type: string, listener: (event: any) => void): void {
  (swScope.addEventListener as unknown as (type: string, listener: any) => void)(type, listener);
}

const MANIFEST_CACHE = 'c2-sw-manifests-v1';
const BADGE_CACHE = 'c2-sw-badge-v1';
const CACHEABLE_STATUS = new Set([200, 203, 204, 206, 300, 301, 302, 404]);

interface RelayStatusMessage {
  type: 'C2_RELAY_STATUS';
  status: 'fresh' | 'cached' | 'stale' | 'error';
  manifestUrl: string;
  storedAt?: string;
  statusCode?: number;
  reason?: string;
}

on('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await caches.open(MANIFEST_CACHE);
      await caches.open(BADGE_CACHE);
      if (typeof swScope.skipWaiting === 'function') {
        await swScope.skipWaiting();
      }
    })()
  );
});

on('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== MANIFEST_CACHE && key !== BADGE_CACHE)
          .map((key) => caches.delete(key))
      );
      await swScope.clients.claim();
    })()
  );
});

on('fetch', (event: FetchEvent) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (isManifestRequest(url)) {
    event.respondWith(handleManifestFetch(event));
    return;
  }

  if (isBadgeRequest(url)) {
    event.respondWith(handleBadgeFetch(event));
  }
});

async function handleManifestFetch(event: FetchEvent): Promise<Response> {
  const { request } = event;

  if (request.url.startsWith('http://')) {
    return problemResponse(497, 'MixedContentBlocked', 'Manifest blocked due to mixed content');
  }

  const cache = await caches.open(MANIFEST_CACHE);
  const cacheKey = buildCacheKey(request);
  const cached = await cache.match(cacheKey);

  const networkPromise = fetch(request.clone())
    .then(async (response) => {
      if (response.ok || response.status === 404) {
        const storedAt = await storeInCache(cache, cacheKey, response.clone(), request);
        queueBroadcast(event, {
          type: 'C2_RELAY_STATUS',
          status: 'fresh',
          manifestUrl: request.url,
          storedAt,
          statusCode: response.status
        });
      } else if (response.status >= 500 && cached) {
        const storedAt = cached.headers.get('X-C2P-SW-Stored-At') || new Date().toISOString();
        queueBroadcast(event, {
          type: 'C2_RELAY_STATUS',
          status: 'stale',
          manifestUrl: request.url,
          storedAt,
          statusCode: response.status,
          reason: 'origin-5xx'
        });
        return augmentResponse(cached, {
          'Warning': '110 - response is stale',
          'X-C2P-SW-Status': 'stale'
        });
      } else if (response.status >= 400) {
        queueBroadcast(event, {
          type: 'C2_RELAY_STATUS',
          status: 'error',
          manifestUrl: request.url,
          statusCode: response.status,
          reason: `http-${response.status}`
        });
      }
      return response;
    })
    .catch(async (error: unknown) => {
      if (cached) {
        const storedAt = cached.headers.get('X-C2P-SW-Stored-At') || new Date().toISOString();
        queueBroadcast(event, {
          type: 'C2_RELAY_STATUS',
          status: 'stale',
          manifestUrl: request.url,
          storedAt,
          reason: error instanceof Error ? error.message : 'network-failure'
        });
        return augmentResponse(cached, {
          'Warning': '110 - response is stale',
          'X-C2P-SW-Status': 'stale'
        });
      }
      queueBroadcast(event, {
        type: 'C2_RELAY_STATUS',
        status: 'error',
        manifestUrl: request.url,
        reason: 'offline'
      });
      return problemResponse(502, 'RelayOffline', 'Manifest unavailable (offline)');
    });

  if (cached) {
    const storedAt = cached.headers.get('X-C2P-SW-Stored-At') || '';
    queueBroadcast(event, {
      type: 'C2_RELAY_STATUS',
      status: 'cached',
      manifestUrl: request.url,
      storedAt
    });
    event.waitUntil(networkPromise);
    return augmentResponse(cached, {
      'X-C2P-SW-Status': 'revalidate'
    });
  }

  return networkPromise;
}

async function handleBadgeFetch(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(BADGE_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    event.waitUntil(refreshBadge(cache, request));
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached;
    }
    return problemResponse(502, 'BadgeOffline', 'Badge script unavailable (offline)');
  }
}

async function refreshBadge(cache: Cache, request: Request): Promise<void> {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    console.warn('Badge refresh failed', error);
  }
}

function isManifestRequest(url: URL): boolean {
  if (url.pathname.endsWith('.c2pa') || url.pathname.endsWith('.c2pa.json')) {
    return true;
  }
  if (url.pathname === '/c2/relay') {
    return true;
  }
  return false;
}

function isBadgeRequest(url: URL): boolean {
  return /badge-v\d+\.mjs$/.test(url.pathname);
}

function buildCacheKey(request: Request): Request {
  const headers = new Headers();
  headers.set('Accept', request.headers.get('Accept') || 'application/c2pa+json, application/json;q=0.8');
  return new Request(request.url, { headers });
}

async function storeInCache(cache: Cache, key: Request, response: Response, request: Request): Promise<string> {
  if (!CACHEABLE_STATUS.has(response.status)) {
    return new Date().toISOString();
  }

  const headers = new Headers(response.headers);
  const storedAt = new Date().toISOString();
  headers.set('X-C2P-SW-Stored-At', storedAt);
  headers.set('X-C2P-SW-Source', request.url);

  const body = await response.arrayBuffer();
  const cachedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
  await cache.put(key, cachedResponse);
  return storedAt;
}

function augmentResponse(response: Response, headersPatch: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(headersPatch)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function problemResponse(status: number, code: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: `https://c2c/problems/${code}`,
      title: code,
      detail
    }),
    {
      status,
      headers: {
        'content-type': 'application/problem+json',
        'Cache-Control': 'no-store'
      }
    }
  );
}

function queueBroadcast(event: ExtendableEvent, message: RelayStatusMessage): void {
  event.waitUntil(broadcast(message));
}

async function broadcast(message: RelayStatusMessage): Promise<void> {
  const clients = await swScope.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.postMessage(message);
      } catch (error) {
        console.warn('Failed to post message to client', error);
      }
    })
  );
}
