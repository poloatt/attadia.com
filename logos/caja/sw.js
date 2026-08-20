// Service Worker para Vite - Atta
const CACHE_VERSION = 'v3';
const CACHE_PREFIX = 'atta-cache-';
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

// Estrategia: cache-first para assets válidos, network-first para navegación
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorar API
  if (request.url.includes('/api/') || request.url.includes('api.attadia.com')) {
    return;
  }

  // Assets de Vite (hash) => cache first, solo respuestas JS/CSS válidas
  if (request.destination === 'script' || request.destination === 'style' || request.url.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached && isValidCachedAsset(request, cached)) return cached;
        if (cached) await cache.delete(request);

        const response = await fetch(request);
        if (isCacheableAssetResponse(request, response)) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Navegación => network first con fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
  }
});
