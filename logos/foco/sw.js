// Service Worker para Vite - Foco
const CACHE_VERSION = 'v6';
const CACHE_PREFIX = 'foco-cache-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

function isScriptResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('javascript') || contentType.includes('ecmascript');
}

function isStyleResponse(response) {
  return (response.headers.get('content-type') || '').includes('css');
}

function isCacheableAssetResponse(request, response) {
  if (!response || !response.ok) return false;
  if (request.destination === 'script') return isScriptResponse(response);
  if (request.destination === 'style') return isStyleResponse(response);
  if (request.url.includes('/assets/')) {
    return !((response.headers.get('content-type') || '').includes('text/html'));
  }
  return false;
}

function isValidCachedAsset(request, cached) {
  if (!cached) return false;
  if (request.destination === 'script') return isScriptResponse(cached);
  if (request.destination === 'style') return isStyleResponse(cached);
  if (request.url.includes('/assets/')) {
    return !((cached.headers.get('content-type') || '').includes('text/html'));
  }
  return true;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/') || request.url.includes('api.attadia.com')) {
    return;
  }

  // Hashed Vite assets: network-first so deploys never serve stale bundles that 404 lazy chunks.
  if (request.destination === 'script' || request.destination === 'style' || request.url.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (isCacheableAssetResponse(request, response)) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (networkError) {
          const cached = await cache.match(request);
          if (cached && isValidCachedAsset(request, cached)) return cached;
          throw networkError;
        }
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
  }
});
