// Kiosk offline page (V74). Keeps a copy of kiosk.html (and its own images) so the kiosk opens after a tablet restart
// without internet. It never touches: API calls (script.google.com), any POST, PINs/secrets, or the offline punch queue
// (localStorage / IndexedDB) — those live outside this cache, so updating or removing this worker cannot lose a punch.
const CACHE = 'kiosk-shell-v74-2';      // bump to publish a new page copy; old kiosk-shell-* caches are removed on activate
const PAGE = 'kiosk.html';
const NET_WAIT_MS = 4000;               // weak Wi-Fi: after 4 s the saved page is shown instead of a long blank wait

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.add(PAGE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('kiosk-shell-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isPage(url) { return url.pathname.slice(-('/' + PAGE).length) === '/' + PAGE; }
function isImage(url) { return /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(url.pathname); }

self.addEventListener('fetch', function (e) {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API, POST, other sites: untouched, never cached
  if (isPage(url)) {                                                        // the kiosk page: network first, saved copy offline
    e.respondWith(new Promise(function (resolve) {
      let done = false;
      const fallback = function () {
        if (done) return; done = true;
        caches.open(CACHE).then(function (c) { return c.match(PAGE); }).then(function (hit) {
          resolve(hit || fetch(req)); // nothing saved yet: let the browser show its normal error
        });
      };
      const timer = setTimeout(fallback, NET_WAIT_MS);
      fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put(PAGE, copy); }); }
        if (!done) { done = true; clearTimeout(timer); resolve(res); }
      }, function () { clearTimeout(timer); fallback(); });
    }));
    return;
  }
  if (isImage(url)) {                                                       // logos / background: saved copy first
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; });
      });
    }));
  }
  // anything else on this origin (admin page, My Records, scripts): browser default
});
