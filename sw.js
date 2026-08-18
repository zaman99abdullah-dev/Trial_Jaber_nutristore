// ============================================================================
// NutriStore service worker — app-shell caching
// Strategy:
//   • index.html (navigations): NETWORK-FIRST — online users always get the
//     freshly deployed app (safe with the frequent redeploy workflow);
//     the cache is only served when the network is unreachable.
//   • icons / manifest: cache-first (they rarely change).
//   • Cross-origin requests (the Supabase Edge Function gateway): never
//     intercepted — data freshness and auth stay end-to-end. This matters more
//     than it did before: caching a reply that was scoped to one user's token
//     could show their tenant's data to the next caller.
// All shell paths below are RELATIVE ('./'), so this works unchanged whether the
// app is served from a domain root or a repo subfolder like /nutristore-test/.
// Bump CACHE when this file's logic changes.
// ============================================================================
const CACHE = 'nutristore-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is atomic — tolerate individual misses so a forgotten icon
      // upload can't brick installation.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API/proxies: straight through

  // App shell — network-first with cache fallback
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets — cache-first
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
