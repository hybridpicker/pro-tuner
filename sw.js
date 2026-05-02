const CACHE_NAME = 'pro-tuner-v10';
const CACHE_PREFIX = 'pro-tuner-';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=20260502-2',
  '/js/app.js?v=20260502-2',
  '/js/audio/pitch-detector.js?v=20260502-2',
  '/js/audio/audio-worklet-processor.js?v=20260502-2',
  '/js/audio/noise-gate.js?v=20260502-2',
  '/js/audio/tone-generator.js?v=20260502-2',
  '/js/tunings/tuning-data.js?v=20260502-2',
  '/js/ui/meter.js?v=20260502-2',
  '/js/ui/waveform.js?v=20260502-2',
  '/js/ui/string-display.js?v=20260502-2',
  '/js/ui/theme.js?v=20260502-2',
  '/js/utils/settings.js?v=20260502-2',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.svg',
  '/icons/og-image.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const staleAppCaches = keys.filter(
          (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
        );

        return Promise.all(staleAppCaches.map((key) => caches.delete(key)))
          .then(() => self.clients.claim())
          .then(() => {
            if (staleAppCaches.length === 0) return undefined;

            return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
              .then((clients) => Promise.all(
                clients.map((client) => client.navigate(client.url))
              ));
          });
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const isCacheableType = response.type === 'basic' || response.type === 'cors';
        if (isCacheableType) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
