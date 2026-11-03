// Keeps a copy of the app on the phone so it opens without an internet connection.
// Records are never stored here; they live only in the phone's own storage.
const VERSION = 'zefira-v1';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './fonts/atkinson-400.woff2',
  './fonts/atkinson-700.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Open instantly from the saved copy, and quietly fetch any update for next time.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((saved) => {
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => saved || caches.match('./index.html'));
      return saved || fresh;
    })
  );
});
