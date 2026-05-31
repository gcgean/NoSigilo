const CACHE_NAME = 'nosigilo-shell-v5';
const OFFLINE_SHELL = ['/index.html', '/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.svg', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;

  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/uploads') ||
    url.pathname.startsWith('/private-uploads')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || Response.error();
      })
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'NoSigilo.net', body: event.data.text() };
  }

  const title = String(payload?.title || 'NoSigilo.net');
  const options = {
    body: payload?.body ? String(payload.body) : '',
    icon: payload?.icon ? String(payload.icon) : '/icon-192.svg',
    badge: payload?.badge ? String(payload.badge) : '/icon-192.svg',
    tag: payload?.tag ? String(payload.tag) : 'nosigilo-push',
    data: {
      url: payload?.url ? String(payload.url) : '/notifications',
      ...(payload?.data && typeof payload.data === 'object' ? payload.data : {}),
    },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const relativeUrl =
    event.notification?.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/notifications';
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (!client || !('focus' in client)) continue;
        if (client.url === targetUrl) {
          return client.focus();
        }
      }
      for (const client of clients) {
        if (!client || !('focus' in client)) continue;
        if (client.url.startsWith(self.location.origin)) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
