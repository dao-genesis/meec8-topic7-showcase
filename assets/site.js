/* 主题七成果展示站 · 共享脚本（无依赖） */
(function(){
  'use strict';

  /* ---------- 0. PWA：注册 Service Worker（离线缓存；重复注册无害） ---------- */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* ---------- 1. 图片灯箱 ---------- */
  var lb = document.getElementById('lightbox');
  if(!lb){
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = '<img alt="">';
    lb.addEventListener('click', function(){ lb.style.display='none'; });
    document.body.appendChild(lb);
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if(t && t.tagName === 'IMG' && t.closest('figure')){
      lb.querySelector('img').src = t.src;
      lb.style.display = 'flex';
    }
  });

  /* ---------- 2. 导航高亮（按当前文件名） ---------- */
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('nav.site a').forEach(function(a){
    var href = (a.getAttribute('href')||'').split('/').pop().split('#')[0].toLowerCase();
    if(href === here) a.classList.add('on');
  });

  /* ---------- 3. 代码块复制按钮 ---------- */
  document.querySelectorAll('pre').forEach(function(pre){
    var btn = document.createElement('button');
    btn.textContent = '复制';
    btn.style.cssText = 'position:absolute;top:8px;right:10px;background:#37474f;color:#cfd8dc;border:0;border-radius:6px;padding:3px 12px;font-size:.78rem;cursor:pointer;opacity:.85';
    btn.addEventListener('click', function(){
      var text = pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText;
      navigator.clipboard && navigator.clipboard.writeText(text).then(function(){
        btn.textContent = '已复制 ✓'; setTimeout(function(){ btn.textContent='复制'; }, 1200);
      });
    });
    if(getComputedStyle(pre).position === 'static') pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  /* ---------- 4. 网页演示（幻灯片）引擎 ---------- */
  var deck = document.querySelector('.deck');
  if(deck){
    var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
    var bar = deck.querySelector('.bar i');
    var idxEl = deck.querySelector('.ctl .idx');
    var cur = 0;

    function go(i){
      cur = Math.max(0, Math.min(slides.length - 1, i));
      slides.forEach(function(s, k){ s.classList.toggle('on', k === cur); });
      if(bar) bar.style.width = ((cur + 1) / slides.length * 100) + '%';
      if(idxEl) idxEl.textContent = (cur + 1) + ' / ' + slides.length;
      if(history.replaceState) history.replaceState(null, '', '#' + (cur + 1));
      try{ location.hash = ''; }catch(e){}
      try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){}
    }
    function next(){ go(cur + 1); }
    function prev(){ go(cur - 1); }

    document.addEventListener('keydown', function(e){
      if(e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
      else if(e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if(e.key === 'Home') { e.preventDefault(); go(0); }
      else if(e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
      else if(e.key === 'f' || e.key === 'F') { toggleFs(); }
      else if(e.key === 'a' || e.key === 'A') { toggleAuto(); }
    });
    deck.addEventListener('click', function(e){
      if(e.target.closest('a') || e.target.closest('button') || e.target.closest('table')) return;
      if(e.target.closest('.ctl')) return;
      next();
    });
    var btnPrev = deck.querySelector('.ctl .prev');
    var btnNext = deck.querySelector('.ctl .next');
    var btnFs = deck.querySelector('.ctl .fs');
    if(btnPrev) btnPrev.addEventListener('click', prev);
    if(btnNext) btnNext.addEventListener('click', next);
    function toggleFs(){
      if(document.fullscreenElement) document.exitFullscreen();
      else if(deck.requestFullscreen) deck.requestFullscreen();
    }
    if(btnFs) btnFs.addEventListener('click', toggleFs);

    /* 自动播放（A 键切换）：无人值守展示 / 逐页彩排 */
    var btnAuto = deck.querySelector('.ctl .auto');
    var timerEl = deck.querySelector('.ctl .timer');
    var AUTO_MS = 14000;
    var autoOn = false, autoT = null, t0 = Date.now();
    function fmtClock(s){ var m = Math.floor(s/60), r = s%60; return (m<10?'0':'')+m+':'+(r<10?'0':'')+r; }
    function autoNext(){
      next();
      if(autoOn){ clearTimeout(autoT); autoT = setTimeout(autoNext, AUTO_MS); }
    }
    function toggleAuto(){
      if(!btnAuto) return;
      autoOn = !autoOn;
      if(autoOn){
        btnAuto.textContent = '⏸ 暂停自动';
        btnAuto.classList.add('on');
        clearTimeout(autoT); autoT = setTimeout(autoNext, AUTO_MS);
      } else {
        btnAuto.textContent = '▶ 自动播放';
        btnAuto.classList.remove('on');
        clearTimeout(autoT);
      }
    }
    if(btnAuto) btnAuto.addEventListener('click', toggleAuto);
    if(timerEl) setInterval(function(){ timerEl.textContent = fmtClock(Math.floor((Date.now()-t0)/1000)); }, 1000);

    var start = parseInt((location.hash||'').replace('#',''), 10);
    go(isNaN(start) ? 0 : start - 1);
  }

  /* ---------- 5. 外链标记 ---------- */
  document.querySelectorAll('a[href^="http"]').forEach(function(a){
    if(!a.target) a.target = '_blank';
    a.rel = a.rel || 'noopener';
  });

  /* ---------- 6. 加密资源：图表/幻灯片解密 + 下载解密 ---------- */
  (function(){
    var MW = window.__MW;
    if(!MW || !MW.pass) return;

    /* 6a. 图表与幻灯片：img[src^="assets/figures/"] / img[src^="assets/slides/"] → 拉取 .enc → 解密 → blob URL */
    function decryptImg(img){
      var src = img.getAttribute('src') || '';
      if(img.dataset.decDone) return;
      img.dataset.decDone = '1';
      var mime = /\.webp$/i.test(src) ? 'image/webp' : 'image/png';
      var encUrl = src + '.enc';
      img.classList.add('enc-pending');
      MW.fetchDecrypt(encUrl, MW.pass).then(function(bytes){
        img.src = URL.createObjectURL(new Blob([bytes], { type: mime }));
        img.classList.remove('enc-pending');
      }).catch(function(){
        img.classList.remove('enc-pending');
        img.alt = (img.alt || '图片') + '（解密失败，请刷新）';
      });
    }
    window.__MW.decryptImg = decryptImg;
    document.querySelectorAll('img[src^="assets/figures/"], img[src^="assets/slides/"]').forEach(decryptImg);

    /* 6b. 下载：a[data-dec-name] → 拉取 .enc → 解密 → 触发下载原名 */
    document.querySelectorAll('a[data-dec-name]').forEach(function(a){
      a.addEventListener('click', function(ev){
        ev.preventDefault();
        if(a.dataset.busy) return;
        a.dataset.busy = '1';
        var old = a.textContent;
        a.textContent = '解密中…';
        MW.fetchDecrypt(a.getAttribute('href'), MW.pass).then(function(bytes){
          var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          var t = document.createElement('a');
          t.href = url; t.download = a.getAttribute('data-dec-name');
          document.body.appendChild(t); t.click(); t.remove();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
        }).catch(function(e){
          alert('解密下载失败：' + String((e && e.message) || e) + '\n请刷新页面后重试。');
        }).then(function(){
          a.textContent = old; delete a.dataset.busy;
        });
      });
    });
  })();

  /* ---------- 6c. 视频：点击播放时解密为 Blob（避免自动下载大文件） ---------- */
  document.querySelectorAll('video[data-dec-video]').forEach(function(v){
    var url = v.getAttribute('data-dec-video');
    var busy = false;
    function load(play){
      if (v.src || busy) { if (play && v.src) v.play(); return; }
      busy = true;
      MW.fetchDecrypt(url, MW.pass).then(function(bytes){
        v.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        if (play) v.play();
      }).catch(function(e){
        alert('视频解密失败：' + String((e && e.message) || e) + '\n请刷新页面后重试。');
      }).then(function(){ busy = false; });
    }
    v.addEventListener('click', function(){ load(true); });
    v.addEventListener('play', function(){ if (!v.src) { v.pause(); load(true); } });
    var poster = v.getAttribute('poster');
    if (poster && poster.indexOf('assets/figures/') === 0) {
      MW.fetchDecrypt(poster + '.enc', MW.pass).then(function(bytes){
        v.setAttribute('poster', URL.createObjectURL(new Blob([bytes], { type: 'image/png' })));
      }).catch(function(){ v.removeAttribute('poster'); });
    }
  });

  /* ---------- 7. 交互可视化（页面含 [data-viz] 组件时启动） ---------- */
  if (window.MWViz) window.MWViz.init(document);

  /* ---------- 8. PPTX 原版浏览器（页面含 .pptview 时启动） ---------- */
  (function(){
    var root = document.querySelector('.pptview');
    if(!root) return;
    var count = parseInt(root.getAttribute('data-count') || '0', 10);
    if(!count) return;
    var img = root.querySelector('.ppt-img');
    var idxEl = root.querySelector('.ppt-idx');
    var stage = root.querySelector('.ppt-stage');
    var strip = root.querySelector('.ppt-strip');
    var zoomSel = root.querySelector('.ppt-zoom');
    var cur = 1;
    var cache = {};
    var MW = window.__MW;

    function srcOf(n){ return 'assets/slides/slide-' + (n < 10 ? '0' + n : n) + '.webp'; }

    function load(n, cb){
      if(cache[n]){ cb(cache[n]); return; }
      var url = srcOf(n);
      if(!MW || !MW.pass){ cb(url); return; }   /* 明文镜像：直链 */
      MW.fetchDecrypt(url + '.enc', MW.pass).then(function(bytes){
        var burl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
        cache[n] = burl;
        cb(burl);
      }).catch(function(){ cb(null); });
    }

    var eviEl = root.querySelector('.ppt-evi');
    var eviMap = null;
    var eviNode = document.getElementById('ppt-evidence');
    if (eviNode) { try { eviMap = JSON.parse(eviNode.textContent); } catch (e) { eviMap = null; } }
    function updateEvi(n) {
      if (!eviEl) return;
      var e = eviMap && eviMap[String(n)];
      if (!e) { eviEl.style.display = 'none'; return; }
      eviEl.style.display = '';
      eviEl.textContent = '本页对应站内证据：' + e.t + ' →';
      eviEl.setAttribute('href', e.h);
    }

    function show(n){
      cur = Math.max(1, Math.min(count, n));
      if(idxEl) idxEl.textContent = cur + ' / ' + count;
      updateEvi(cur);
      var pending = root.querySelector('.ppt-loading');
      if(pending) pending.style.display = 'block';
      load(cur, function(url){
        if(url && img){ img.src = url; }
        var p = root.querySelector('.ppt-loading');
        if(p) p.style.display = 'none';
        load(cur + 1 <= count ? cur + 1 : cur - 1, function(){});   /* 预取相邻页 */
      });
      if(strip) Array.prototype.forEach.call(strip.children, function(b, i){
        b.classList.toggle('on', i + 1 === cur);
      });
    }

    /* 页码条 + 缩略图（缩略图后台顺序解密，不阻塞翻页） */
    if(strip){
      for(var i = 1; i <= count; i++){
        (function(n){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'ppt-thumb';
          b.textContent = n;
          b.addEventListener('click', function(){ show(n); });
          strip.appendChild(b);
        })(i);
      }
      var thumbs = root.querySelector('.ppt-thumbs');
      if(thumbs && MW && MW.pass !== undefined){
        thumbs.addEventListener('click', function(e){
          var im = e.target.closest('img');
          if(im) show(parseInt(im.getAttribute('data-n'), 10) || 1);
        });
        var t = 1;
        (function nextThumb(){
          if(t > count) return;
          var turl = 'assets/slides/thumb-' + (t < 10 ? '0' + t : t) + '.webp';
          function put(src){
            var im = thumbs.querySelector('img[data-n="' + t + '"]');
            if(!im){
              im = document.createElement('img');
              im.setAttribute('data-n', t);
              im.alt = '第 ' + t + ' 页';
              thumbs.appendChild(im);
            }
            im.src = src;
          }
          if(!MW.pass){ put(turl); t++; setTimeout(nextThumb, 60); return; }
          MW.fetchDecrypt(turl + '.enc', MW.pass).then(function(bytes){
            put(URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })));
          }).catch(function(){}).then(function(){ t++; setTimeout(nextThumb, 60); });
        })();
      }
    }

    root.querySelector('.ppt-prev').addEventListener('click', function(){ show(cur - 1); });
    root.querySelector('.ppt-next').addEventListener('click', function(){ show(cur + 1); });
    if(stage) stage.addEventListener('click', function(e){
      var r = stage.getBoundingClientRect();
      show((e.clientX - r.left) < r.width * 0.25 ? cur - 1 : cur + 1);
    });
    if(zoomSel) zoomSel.addEventListener('change', function(){
      root.setAttribute('data-zoom', zoomSel.value);
    });
    var fsBtn = root.querySelector('.ppt-fs');
    if(fsBtn) fsBtn.addEventListener('click', function(){
      if(document.fullscreenElement) document.exitFullscreen();
      else if(root.requestFullscreen) root.requestFullscreen();
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' '){ e.preventDefault(); show(cur + 1); }
      else if(e.key === 'ArrowLeft' || e.key === 'PageUp'){ e.preventDefault(); show(cur - 1); }
      else if(e.key === 'Home'){ e.preventDefault(); show(1); }
      else if(e.key === 'End'){ e.preventDefault(); show(count); }
      else if(e.key === 'f' || e.key === 'F'){ if(fsBtn) fsBtn.click(); }
    });
    show(1);
  })();
})();
