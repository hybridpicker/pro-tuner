const CACHE_NAME = 'pro-tuner-v6';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/audio/pitch-detector.js',
  '/js/audio/audio-worklet-processor.js',
  '/js/audio/noise-gate.js',
  '/js/audio/tone-generator.js',
  '/js/tunings/tuning-data.js',
  '/js/ui/meter.js',
  '/js/ui/waveform.js',
  '/js/ui/string-display.js',
  '/js/ui/theme.js',
  '/js/utils/settings.js',
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
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(event.request)
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
          });
      })
  );
});
