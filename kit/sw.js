// Offline support for the Faceless Creator Kit. Scope: this folder only
// (/channel-studio/kit/), separate from Channel Studio's own worker.
// Bump VERSION whenever app files change so devices pick up the update.

const VERSION = 'fck-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './css/kit.css',
  './js/app.js',
  './js/ctx.js',
  './js/db.js',
  './js/gate.js',
  './js/logic.js',
  './js/pins/logic.js',
  './js/pins/render.js',
  './js/pins/thumbs.js',
  './js/seed.js',
  './js/store.js',
  './js/util.js',
  './js/views/backup.js',
  './js/views/batch.js',
  './js/views/board.js',
  './js/views/brand.js',
  './js/views/calendar.js',
  './js/views/channels.js',
  './js/views/common.js',
  './js/views/export.js',
  './js/views/pins.js',
  './js/views/templates.js',
  './js/views/topics.js',
  './js/views/video.js',
  './js/views/week.js',
  './js/views/welcome.js',
  './js/zip.js',
  './fonts/anton-latin-400-normal.woff2',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-800-normal.woff2',
  './fonts/lora-latin-400-normal.woff2',
  './fonts/lora-latin-700-normal.woff2',
  './fonts/montserrat-latin-500-normal.woff2',
  './fonts/montserrat-latin-800-normal.woff2',
  './fonts/playfair-display-latin-400-normal.woff2',
  './fonts/playfair-display-latin-800-normal.woff2',
  './fonts/space-grotesk-latin-500-normal.woff2',
  './fonts/space-grotesk-latin-700-normal.woff2',
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fck-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Another app on the same site may clear caches it does not know; refill
// ours on the next online visit.
async function ensureCache() {
  const cache = await caches.open(VERSION);
  if ((await cache.keys()).length < FILES.length) await cache.addAll(FILES);
}

// Network first (updates show up right away when online), cached copy when
// offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          if (req.mode === 'navigate') event.waitUntil(ensureCache().catch(() => {}));
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
