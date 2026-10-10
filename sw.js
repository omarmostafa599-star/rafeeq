// رفيق — offline support & updates. Bump VERSION on every release.
// Shell files are served from the cache first (instant start, works offline) and refreshed in the background.
// A new release = new VERSION → fresh download on install → the open pages are told to reload.
const VERSION = 'rafeeq-2.7.3';
const SHELL = ['./', './index.html', './config.js', './js/version.js', './js/app.js', './js/data.js', './js/parse.js', './js/i18n.js', './js/drive.js', './js/report.js', './js/xlsx.js', './vendor/supabase.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
// versioned URLs defeat the hosting CDN's edge cache too (not only the browser cache), so a new release never precaches an old file
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u + (u.includes('?') ? '&' : '?') + 'v=' + VERSION, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION }); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return; // Supabase & Google APIs are never cached
  const fresh = () => fetch(req.mode === 'navigate' ? req : new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); return res; });
  if (fonts) { e.respondWith(caches.match(req).then(hit => hit || fresh().catch(() => hit))); return; }
  const shell = SHELL.some(u => new URL(u, location.href).pathname === url.pathname) || req.mode === 'navigate';
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit && shell) return hit;                          // shell files only change with VERSION (then everything is re-fetched together)
    const net = fresh().catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }             // other assets: cache first, refresh quietly for next time
    return net.then(res => res || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined));
  }));
});
// Notifications (Web Push)
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'رفيق', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'رفيق', { body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', dir: 'auto', data: { url: m.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const scope = self.registration.scope;
  let url = new URL((e.notification.data && e.notification.data.url) || './', scope).href;
  if (!url.startsWith(scope)) url = scope; // never leave the app (the payload is data, not an instruction)
  const id = (/#t=([0-9a-f-]{36})$/i.exec(url) || [])[1] || null;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const app = list.find(c => c.url.startsWith(scope) && !/\/(share|privacy)\.html/.test(c.url));
    if (app) { return Promise.resolve(app.focus()).then(() => { if (id) app.postMessage({ openTask: id }); }).catch(() => { }); }
    return self.clients.openWindow(url);
  }));
});
