const CACHE_NAME = 'titan61-gym-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './exercises-data.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './images/bench_press_bar.png',
  './images/incline_db_press.png',
  './images/lat_pulldown_wide.png',
  './images/barbell_row.png',
  './images/hack_squat.png',
  './images/romanian_deadlift.png',
  './images/leg_extension.png',
  './images/incline_barbell_press.png',
  './images/machine_chest_press.png',
  './images/neutral_grip_pulldown.png',
  './images/leg_press_45.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
