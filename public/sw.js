// Royale Gold service worker — static assets ONLY.
// Pages and /api/* are NEVER cached: balances, rounds and the live game
// state must always come from the network, and a new deploy must reach
// the phone at once. Bump CACHE when a cached asset path changes content
// (e.g. a new icon set); old caches are deleted on activate.
const CACHE = "rg-static-v1";
const STATIC_PREFIXES = ["/_next/static/", "/covers/", "/icons/"];

self.addEventListener("install", (event) => {
  // Take over at once — no waiting for every tab to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Anything that is not a versioned static asset passes through
  // untouched — pages, RSC navigation and /api/* are never intercepted.
  if (!STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })()
  );
});
