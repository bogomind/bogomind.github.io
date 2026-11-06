/* 差一筹 offline: keep what was loaded, serve it when the network is gone, refresh it in the background. */
var V = 'chou-1';
var SHELL = ['./', 'chou.css', 'core.js', 'app.js', 'days.json', 'notes.json', 'manifest.webmanifest', '/favicon.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('chou-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // the game page answers every /chou/ and /chou/?d=N navigation; anything else is cached under its own URL
  var app = req.mode === 'navigate' && /\/chou\/(index\.html)?$/.test(url.pathname);
  var key = app ? new URL('./', self.registration.scope).href : req;
  e.respondWith(caches.open(V).then(function (c) {
    return c.match(key).then(function (hit) {
      var net = fetch(req).then(function (r) {
        if (r.ok && r.type === 'basic') c.put(key, r.clone());
        return r;
      });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net;
    });
  }));
});
