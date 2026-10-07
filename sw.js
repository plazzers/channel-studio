// Offline support: keeps a copy of the app files on the device.
// Bump VERSION whenever app files change so devices pick up the update.

const VERSION = 'cs-v2';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ctx.js',
  './js/db.js',
  './js/export.js',
  './js/logic.js',
  './js/store.js',
  './js/util.js',
  './js/zip.js',
  './js/views/board.js',
  './js/views/calendar.js',
  './js/views/detail.js',
  './js/views/lab.js',
  './js/views/settings.js',
  './js/views/shorts-tab.js',
  './js/views/shorts.js',
  './js/views/topics.js',
  './js/views/week.js',
  './data/channels.js',
  './data/seed.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so updates show up right away when online), cached copy
// when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
