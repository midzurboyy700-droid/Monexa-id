const CACHE_VERSION = 'monexa-v2';
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const RUNTIME_CACHE = 'runtime-' + CACHE_VERSION;

const APP_SHELL = [
  './index.html',
  './styles.css',
  './script.js',
  './firebase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const BYPASS_KEYWORDS = [
  'firebasedatabase.app',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'googleusercontent.com'
];

function safePut(cachePromise, key, response) {
  cachePromise.then(function (cache) {
    try { cache.put(key, response); } catch (e) { /* abaikan */ }
  }).catch(function () { /* abaikan */ });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .catch(function () { /* instal tetap lanjut walau precache sebagian gagal */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key.indexOf(CACHE_VERSION) === -1; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    event.respondWith(fetch(request));
    return;
  }

  if (BYPASS_KEYWORDS.some(function (kw) { return url.host.indexOf(kw) !== -1; })) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          safePut(caches.open(RUNTIME_CACHE), './index.html', response.clone());
          return response;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (cached) {
            return cached || fetch(request);
          });
        })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request);
      }).catch(function () {
        return fetch(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && (response.status === 200 || response.type === 'opaque')) {
          safePut(caches.open(RUNTIME_CACHE), request, response.clone());
        }
        return response;
      });
    }).catch(function () {
      return fetch(request);
    })
  );
});
