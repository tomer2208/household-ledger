// Service worker for the installed web app (BLUEPRINT §3.10, PWA route).
//
// 1. App shell offline: the page and its hashed bundles are cached, so the app opens
//    without a network and shows the last synced data (TanStack Query's persisted cache).
//    Data itself never goes through here; Supabase requests are left alone.
// 2. Web Push: budget alerts from push-dispatch, and opening the right screen on tap.
//
// BUILD is stamped by scripts/build-web.sh on every export, which rotates the cache.

const BUILD = '__BUILD__';
const CACHE = `shell-${BUILD}`;
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

// Pulls the bundle and asset URLs out of index.html so the first offline launch works,
// not only the second one.
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'no-store' });
  const html = await res.clone().text();
  await cache.put('/', res);
  const urls = new Set(SHELL.slice(1));
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) urls.add(m[1]);
  await Promise.all(
    [...urls].map((u) => cache.add(u).catch(() => undefined)), // one missing icon must not block install
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts: straight to the network

  // Pages: network first so a new deploy shows up at once; the cached shell when offline.
  // Every route is the same single-page shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  // Bundles and assets have content hashes in their names, so a cached copy is never stale.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ---- Web Push (budget alerts, US-S2) ----

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Household Ledger', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Household Ledger';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag, // a newer alert for the same category replaces the older one
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        // The app listens for this and routes in-place, keeping its state.
        open.postMessage({ type: 'open-url', url: event.notification.data?.url || '/' });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
