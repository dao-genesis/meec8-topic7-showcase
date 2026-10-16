/* 主题七成果展示站 · Service Worker（PWA 离线缓存）
   策略：页面与 pages/*.enc 网络优先（保证内容新鲜，离线回退缓存）；
        其余同源资源（样式/脚本/图标/图表与下载密文）缓存优先。
   说明：本站内容以 AES-256-GCM 密文分发，缓存中同样只有密文。 */
var CACHE = 'mw7-cache-v3';
var CORE = ['./', 'index.html', 'brief.html', 'logic.html', 'results.html', 'benchmark.html',
            'qa.html', 'slides.html', 'demo.html', 'materials.html', 'assets/site.css',
            'assets/site.js', 'assets/viz.js', 'assets/gate.js', 'assets/favicon.svg',
            'assets/icon-192.png', 'assets/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function freshFirst(url) {
  var p = url.pathname;
  return p === '/' || /\.html?$/.test(p) || p.indexOf('/pages/') >= 0;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  if (freshFirst(url)) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('index.html'); });
      })
    );
  } else {
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return r;
        });
      })
    );
  }
});
