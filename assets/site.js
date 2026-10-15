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

    var start = parseInt((location.hash||'').replace('#',''), 10);
    go(isNaN(start) ? 0 : start - 1);
  }

  /* ---------- 5. 外链标记 ---------- */
  document.querySelectorAll('a[href^="http"]').forEach(function(a){
    if(!a.target) a.target = '_blank';
    a.rel = a.rel || 'noopener';
  });

  /* ---------- 6. 加密资源：图表解密 + 下载解密 ---------- */
  (function(){
    var MW = window.__MW;
    if(!MW || !MW.pass) return;

    /* 6a. 图表：img[src^="assets/figures/"] → 拉取 .enc → 解密 → blob URL */
    document.querySelectorAll('img[src^="assets/figures/"]').forEach(function(img){
      var encUrl = img.getAttribute('src') + '.enc';
      img.classList.add('enc-pending');
      MW.fetchDecrypt(encUrl, MW.pass).then(function(bytes){
        img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        img.classList.remove('enc-pending');
      }).catch(function(){
        img.classList.remove('enc-pending');
        img.alt = (img.alt || '图表') + '（解密失败，请刷新）';
      });
    });

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

  /* ---------- 7. 交互可视化（页面含 [data-viz] 组件时启动） ---------- */
  if (window.MWViz) window.MWViz.init(document);
})();
