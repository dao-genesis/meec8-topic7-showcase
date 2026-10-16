/* 主题七成果展示站 · 口令门控与解密核心
   AES-256-GCM（PBKDF2-SHA256 200k 派生密钥）· 二进制格式: salt(16) | iv(12) | ciphertext
   设备级记忆：首次登录成功后自动写入 localStorage（本设备免再输），可在门控卡片一键清除。
   启动流程（无跳闪）：壳页 body 初始为 booting 态 —— 口令卡片整体不可见，只显示「正在解锁…」；
   —— 有记忆口令 → 静默解密，成功后正文直接呈现（口令框自始至终不出现）；
   —— 无记忆口令 → 门控卡片淡入；解密失败 → 显示卡片与错误提示。 */
(function () {
  'use strict';

  var ITERS = 200000;
  var SS_PASS = 'mw_pass';        // sessionStorage：本标签页会话
  var LS_PASS = 'mw_pass_keep';   // localStorage：设备级记忆（首次登录后自动写入）

  async function deriveKey(pass, salt) {
    var mat = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: ITERS, hash: 'SHA-256' },
      mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }

  function looksGzip(b) { return b && b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }

  async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前浏览器不支持本地解压（DecompressionStream）：请使用 Chrome / Edge / Safari 16.4+ / Firefox 113+ 打开本站');
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* 解密二进制密文（salt|iv|ct），必要时 gunzip */
  async function decryptBuffer(buf, pass) {
    var raw = new Uint8Array(buf);
    if (raw.length < 29) throw new Error('密文格式错误');
    var salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
    var key = await deriveKey(pass, salt);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    var bytes = new Uint8Array(pt);
    if (looksGzip(bytes)) bytes = await gunzip(bytes);
    return bytes;
  }

  /* 拉取并解密一个密文文件 */
  async function fetchDecrypt(url, pass) {
    var r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return decryptBuffer(await r.arrayBuffer(), pass);
  }

  window.__MW = { fetchDecrypt: fetchDecrypt, decryptBuffer: decryptBuffer, pass: null, ready: false };

  /* PWA：注册 Service Worker（离线缓存；仅 http/https 生效，file:// 自动跳过） */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* ---------- 壳页逻辑 ---------- */
  var gate = document.getElementById('gate');
  if (!gate) return;

  /* 新版 gate.js 运行时取消壳页兜底定时器（解锁流程由本脚本全权接管） */
  if (window.__MW_BOOT_T) { clearTimeout(window.__MW_BOOT_T); window.__MW_BOOT_T = null; }

  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html?$/i, '') || 'index';
  var input = document.getElementById('gate-input');
  var btn = document.getElementById('gate-btn');
  var err = document.getElementById('gate-err');
  var forget = document.getElementById('gate-forget');
  var clearBtn = document.getElementById('gate-clear');

  function showGate(msg) {
    document.body.classList.remove('booting');
    if (forget) forget.style.display = 'none';
    if (err) err.textContent = msg || '';
    if (input) { input.focus(); input.select(); }
  }

  async function unlock(pass) {
    if (!pass) { showGate(''); return; }
    err.textContent = '';
    btn.disabled = true; btn.textContent = '解密中…';
    try {
      var bytes = await fetchDecrypt('pages/' + page + '.enc', pass);
      var html = new TextDecoder().decode(bytes);
      window.__MW.pass = pass; window.__MW.ready = true;
      try { sessionStorage.setItem(SS_PASS, pass); } catch (e1) {}
      try { localStorage.setItem(LS_PASS, pass); } catch (e2) {}   /* 设备级记忆：首次登录后自动 */
      document.open(); document.write(html); document.close();
    } catch (e) {
      btn.disabled = false; btn.textContent = '进入';
      var msg = String((e && e.message) || e);
      try { sessionStorage.removeItem(SS_PASS); localStorage.removeItem(LS_PASS); } catch (e3) {}
      showGate(msg.indexOf('HTTP') === 0
        ? ('页面文件加载失败（' + msg + '），请检查网络后重试')
        : (msg.indexOf('浏览器') >= 0 ? msg : '口令不正确，请重试'));
      gate.classList.add('shake');
      setTimeout(function () { gate.classList.remove('shake'); }, 500);
    }
  }

  btn.addEventListener('click', function () { unlock(input.value.trim()); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });

  if (clearBtn) {
    clearBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      try { localStorage.removeItem(LS_PASS); sessionStorage.removeItem(SS_PASS); } catch (e) {}
      location.reload();
    });
  }

  var saved = null;
  try { saved = sessionStorage.getItem(SS_PASS) || localStorage.getItem(LS_PASS); } catch (e4) {}
  if (saved) {
    if (forget) forget.style.display = 'block';
    unlock(saved);          /* 静默解锁：booting 态保持，正文呈现前口令框不出现 */
  } else {
    showGate('');           /* 首次访问：门控卡片淡入 */
  }
})();
