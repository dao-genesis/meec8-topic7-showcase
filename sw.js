/* 主题七成果展示站 · Service Worker（PWA 离线缓存）
   策略：壳页 / pages 密文 / 样式脚本 → 网络优先（更新即时生效，断网回退缓存）；
        图表 / 幻灯片 / 下载等大文件密文 → 缓存优先（省流量）。
   ⚠️ 维护者纪律：每次重建站点（图表 / 幻灯片 / 下载物有更新）时把 CACHE 版本号 +1，
      否则老访客的「缓存优先」资源会停留在旧版（v3 血泪：站点更新了、访客没变化）。
   说明：本站内容以 AES-256-GCM 密文分发，缓存中同样只有密文。 */
var CACHE = 'mw7-cache-v4';
var CORE = ['./', 'index.html', 'brief.html', 'logic.html', 'results.html', 'benchmark.html',
            'qa.html', 'slides.html', 'demo.html', 'materials.html', 'assets/site.css',
            'assets/site.js', 'assets/viz.js', 'assets/gate.js', 'assets/favicon.svg',
            'assets/icon-192.png', 'assets/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* 缓存优先：只用于「大文件密文」（素材更新靠 CACHE 版本号升级） */
function bigAsset(url) {
  var p = url.pathname;
  return p.indexOf('/downloads/') >= 0 ||
         p.indexOf('/assets/figures/') >= 0 ||
         p.indexOf('/assets/slides/') >= 0;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  if (bigAsset(url)) {
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
  } else {
    /* 网络优先 + 绕过 HTTP 缓存（no-cache = 每次都向服务器复验，保证更新即时生效） */
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(function (r) {
        if (r && r.ok) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('index.html'); });
      })
    );
  }
});
