const CACHE_NAME = 'nosigilo-shell-v10';
// Cache próprio para os arquivos do build. Separado do shell para não ser
// apagado a cada versão nova do service worker.
const CACHE_ASSETS = 'nosigilo-assets-v1';
const OFFLINE_SHELL = ['/index.html', '/manifest.webmanifest', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' busca da rede: sem isso a instalação podia guardar um
    // HTML antigo que o navegador ainda tinha em cache.
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== CACHE_ASSETS).map((key) => caches.delete(key))))
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
    url.pathname.startsWith('/private-uploads') ||
    // Checagem de versão nova: sempre da rede e nunca no cache (cada checagem
    // tem um ?t= diferente, e guardar todas enchia o cache do aparelho).
    url.pathname === '/version.json'
  ) {
    return;
  }

  // Abrir uma tela do app. Sempre a rede primeiro — e, quando dá certo, a
  // cópia guardada para uso sem internet é ATUALIZADA com o HTML novo.
  //
  // Antes a cópia era gravada só na instalação e nunca mais mudava. Numa
  // falha de rede (4G instável), o app abria esse HTML velho, que aponta para
  // um código que não existe mais no servidor: 404 e o usuário ficava preso
  // no texto de apresentação, sem saída. Agora: tenta a rede de novo antes de
  // desistir, e a cópia de reserva é sempre a da última versão que funcionou.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const buscar = () => fetch(request, { cache: 'no-store' });
      try {
        let resposta;
        try {
          resposta = await buscar();
        } catch {
          await new Promise((r) => setTimeout(r, 800));
          resposta = await buscar(); // segunda chance antes da cópia
        }
        if (resposta && resposta.ok && resposta.type === 'basic') {
          cache.put('/index.html', resposta.clone());
        }
        return resposta;
      } catch {
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Arquivos do build têm o hash no nome: o mesmo nome nunca muda de
  // conteúdo. Então vale o que já está no aparelho, e só vai à rede na
  // primeira vez. Antes era 'no-store' — baixava ~860 KB de JavaScript a
  // cada abertura, o que em 3G custava vários segundos.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then(async (cache) => {
        const guardado = await cache.match(request);
        if (guardado) return guardado;
        let resposta;
        try {
          resposta = await fetch(request);
        } catch {
          await new Promise((r) => setTimeout(r, 800));
          resposta = await fetch(request);
        }
        if (resposta && resposta.ok && resposta.type === 'basic') cache.put(request, resposta.clone());
        return resposta;
      })
    );
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
    icon: payload?.icon ? String(payload.icon) : '/icon-192.png',
    badge: payload?.badge ? String(payload.badge) : '/icon-96.png',
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
