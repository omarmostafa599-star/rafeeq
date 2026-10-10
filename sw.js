// رفيق moved to https://myrafeeq.github.io/ — this worker replaces the old one, clears the old copy and reloads open windows onto the notice page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url); } catch (err) { } }
})()));
