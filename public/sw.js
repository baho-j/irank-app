const CACHE_NAME = 'irank-hub-v1';
const STATIC_CACHE_NAME = 'irank-static-v1';
const DYNAMIC_CACHE_NAME = 'irank-dynamic-v1';
const API_CACHE_NAME = 'irank-api-v1';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/_next/static/css/app/globals.css',
];

const CACHED_ROUTES = [
  '/admin/dashboard',
  '/admin/profile',
  '/admin/settings',
  '/admin/tournaments',
  '/admin/tournaments/create',
  '/admin/users',

  '/school/dashboard',
  '/school/profile',
  '/school/settings',
  '/school/tournaments',

  '/student/dashboard',
  '/student/profile',
  '/student/settings',
  '/student/tournaments',

  '/volunteer/dashboard',
  '/volunteer/profile',
  '/volunteer/settings',
  '/volunteer/tournaments'
];

const STATIC_ASSETS = [
  '/icons/apple-touch-icon.png',
  '/icons/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/images/logo.png',
  '/images/peeps.png',
  '/images/dots-and-stars.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');

  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll([...APP_SHELL, ...STATIC_ASSETS]);
      }),

      caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Pre-caching main routes');
        return cache.addAll(CACHED_ROUTES);
      })
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME &&
            cacheName !== DYNAMIC_CACHE_NAME &&
            cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.origin !== location.origin && !isConvexAPI(url)) {
    return;
  }

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);

  try {
    if (isConvexAPI(url)) {
      return await handleAPIRequest(request);
    }

    if (isStaticAsset(url)) {
      return await handleStaticAsset(request);
    }

    if (isAppRoute(url)) {
      return await handleAppRoute(request);
    }

    if (isNextJSAsset(url)) {
      return await handleNextJSAsset(request);
    }

    return await fetch(request);

  } catch (error) {
    console.log('[SW] Fetch failed:', error);

    if (isAppRoute(url)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      const cachedResponse = await cache.match('/') || await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Network unavailable',
        offline: true,
        message: 'This content is not available offline'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] API request failed, trying cache:', request.url);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      console.log('[SW] Returning cached API response');
      return cachedResponse;
    }

    throw error;
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function handleAppRoute(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  if (cachedResponse) {
    fetchPromise;
    return cachedResponse;
  }

  return await fetchPromise || new Response('Offline', { status: 503 });
}

async function handleNextJSAsset(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

function isConvexAPI(url) {
  return url.hostname.includes('convex') || url.pathname.includes('/api/');
}

function isStaticAsset(url) {
  return STATIC_ASSETS.some(asset => url.pathname.includes(asset)) ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

function isAppRoute(url) {
  return url.origin === location.origin &&
    (CACHED_ROUTES.includes(url.pathname) ||
      url.pathname.startsWith('/admin/') ||
      url.pathname.startsWith('/school/') ||
      url.pathname.startsWith('/student/') ||
      url.pathname.startsWith('/volunteer/'));
}

function isNextJSAsset(url) {
  return url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/static/');
}


self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'convex-mutations') {
    event.waitUntil(syncOfflineMutations());
  }
});

// Wakes the page, which owns the IndexedDB outbox, to drain it.
async function syncOfflineMutations() {
  const clientList = await self.clients.matchAll({ includeUncontrolled: true });

  clientList.forEach((client) => client.postMessage({ type: 'SYNC_OUTBOX' }));
}


self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'irank-notification',
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  const notificationData = event.notification.data;
  const targetUrl = notificationData.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

console.log('[SW] Service worker script loaded');