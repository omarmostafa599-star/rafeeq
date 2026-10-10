// رفيق moved to https://myrafeeq.github.io/ — this page retires the old copy on this device and sends the user there.
(function () {
  var NEW = 'https://myrafeeq.github.io/';
  var page = location.pathname.split('/').pop();
  var target = NEW + (/^(share|privacy)\.html$/.test(page) ? page : '') + location.hash;
  document.getElementById('go').href = target;

  // Retire the old service worker and its caches so the old copy never opens again.
  try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }); } catch (e) { }
  try { if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }); } catch (e) { }

  // Data that lives only on this device (local mode, or changes not yet synced) must be saved before leaving.
  var read = function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
  var pick = null;
  keys.filter(function (k) { return k.indexOf('rafeeq2.cache.') === 0; }).forEach(function (k) {
    var scope = k.slice('rafeeq2.cache.'.length), c = read(k), out = read('rafeeq2.outbox.' + scope);
    var has = c && ((c.tasks && c.tasks.length) || (c.people && c.people.length));
    if (has && (scope === 'local' || (Array.isArray(out) && out.length))) pick = pick || c;
  });
  if (!pick) { setTimeout(function () { location.replace(target); }, 1800); return; }

  document.getElementById('save').hidden = false;
  document.getElementById('auto').hidden = true;
  var live = function (a) { return (a || []).filter(function (x) { return x && !x.deleted; }); };
  document.getElementById('dl').onclick = function () {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var data = { app: 'rafeeq', version: 2, exported_at: d.toISOString(), profile: pick.profile || {}, people: live(pick.people), tasks: live(pick.tasks), files: live(pick.files) };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'rafeeq-backup-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    this.textContent = 'تم التنزيل ✓';
  };
})();
