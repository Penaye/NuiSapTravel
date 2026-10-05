const CACHE_NAME = "nuisap-map-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/main.html",
  "/style.css",
  "/script.js",
  "/config.js",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.url.includes("supabase.co") ||
    event.request.url.includes("api.mapbox.com") ||
    event.request.url.includes("placehold.co")
  ) {
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
      .catch(() => {
        console.warn("Lỗi mạng, không thể fetch:", event.request.url);
      }),
  );
});
