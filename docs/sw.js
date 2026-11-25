const C = 'familia-2';
const FILES = ['./', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-180.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('familia-') && x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
// Network first; the saved copy is used only when offline. API calls are never cached.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(C).then((c) => c.put(e.request, copy))); }
    return r;
  }).catch(async () => (await caches.match(e.request, { ignoreSearch: true, cacheName: C })) || Response.error()));
});
