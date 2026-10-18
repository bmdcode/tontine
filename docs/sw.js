/* Service worker : l'application fonctionne sans internet une fois installée.
 * Changez VERSION à chaque mise à jour publiée pour que les téléphones la reçoivent. */
var VERSION = 'tontine-v6';
var FICHIERS = ['./', './index.html', './css/style.css', './js/core.js', './js/documents.js', './js/copies.js', './js/app.js', './manifest.webmanifest',
                './icons/favicon-32.png', './icons/icone-192.png', './icons/icone-512.png', './icons/icone-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (ev) { if (ev.data === 'activer') self.skipWaiting(); });

/* Réseau d'abord (pour recevoir les mises à jour), cache si pas de connexion */
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET' || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(ev.request).then(function (rep) {
      var copie = rep.clone();
      caches.open(VERSION).then(function (c) { c.put(ev.request, copie); });
      return rep;
    }).catch(function () {
      return caches.match(ev.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
