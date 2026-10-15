/* 主题七成果展示站 · 交互可视化引擎（无依赖 · Canvas）
   组件：event 暴雨回放 / predict 预测浏览器 / swmm 策略对比 / stress 极端场景 / models 模型效率
   数据：页面内嵌 <script type="application/json" id="viz-json-*">（构建时注入，随页面一起加密） */
window.MWViz = (function () {
  'use strict';

  var C = {
    teal: '#00796b', tealD: '#004d40', ink: '#263238', muted: '#607d8b', grid: '#e3eaea',
    blue: '#1565c0', yellow: '#f9a825', orange: '#ef6c00', red: '#c62828',
    purple: '#6a1b9a', dark: '#37474f', light: '#f2f6f6'
  };
  var LEVEL = ['正常', '蓝色', '黄色', '橙色', '红色'];
  var LEVEL_COLOR = ['#eceff1', '#90caf9', '#ffe082', '#ffb74d', '#ef9a9a'];

  var CACHE = {};

  function data(name) {
    if (CACHE[name] !== undefined) return CACHE[name];
    var el = document.getElementById('viz-json-' + name);
    CACHE[name] = el ? JSON.parse(el.textContent) : null;
    return CACHE[name];
  }

  function E(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function fmt(x, d) {
    if (x == null || isNaN(x)) return '–';
    return Number(x).toFixed(d == null ? 0 : d);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function tAt(start, mins) {
    var d = new Date(start.replace(' ', 'T') + ':00');
    d.setMinutes(d.getMinutes() + mins);
    return d;
  }

  function fmtDT(d) {
    return (d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function chip(label, on, onclick) {
    var b = E('button', 'vchip' + (on ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', onclick);
    return b;
  }

  function chart(host, height) {
    var box = E('div', 'vchart');
    var cv = document.createElement('canvas');
    cv.style.height = height + 'px';
    box.appendChild(cv);
    host.appendChild(box);
    var ctx = cv.getContext('2d');
    var c = { cv: cv, ctx: ctx, h: height, w: 600, box: box };
    c.fit = function () {
      var w = Math.max(280, box.clientWidth || host.clientWidth || 600);
      var dpr = window.devicePixelRatio || 1;
      c.w = w;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(height * dpr);
      cv.style.width = '100%';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    c.fit();
    return c;
  }

  function onResize(redraw) {
    var t = null;
    window.addEventListener('resize', function () {
      if (t) clearTimeout(t);
      t = setTimeout(redraw, 150);
    });
  }

  function yscale(vmin, vmax, p0, p1) {
    var k = (p1 - p0) / ((vmax - vmin) || 1);
    return function (v) { return p1 - (v - vmin) * k; };
  }

  function xscale(n, p0, p1) {
    var k = (p1 - p0) / ((n - 1) || 1);
    return function (i) { return p0 + i * k; };
  }

  function niceTicks(vmin, vmax, n) {
    var span = (vmax - vmin) || 1;
    var step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10));
    var err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(vmin / step) * step; v <= vmax + 1e-9; v += step) out.push(v);
    return out;
  }

  function drawAxes(c, pad, ymin, ymax, xticks, yfmt) {
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui,-apple-system,"Segoe UI",sans-serif';
    ctx.textBaseline = 'middle';
    var ticks = niceTicks(ymin, ymax, 4);
    var Y = yscale(ymin, ymax, pad.t, h - pad.b);
    ticks.forEach(function (v) {
      var y = Y(v);
      if (y < pad.t - 1 || y > h - pad.b + 1) return;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.textAlign = 'right';
      ctx.fillText(yfmt ? yfmt(v) : String(Math.round(v)), pad.l - 6, y);
    });
    ctx.textAlign = 'center';
    xticks.forEach(function (xt) {
      var x = xt[0];
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(xt[1], x, h - pad.b + 12);
    });
    return Y;
  }

  function line(c, X, Y, arr, color, width, dash) {
    var ctx = c.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.6;
    if (dash) ctx.setLineDash(dash);
    var started = false;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v == null || isNaN(v)) { started = false; continue; }
      var x = X(i), y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function tooltip(c) {
    var tp = E('div', 'vtip');
    c.box.appendChild(tp);
    return {
      show: function (x, y, html) {
        tp.innerHTML = html;
        tp.style.display = 'block';
        var bw = c.box.clientWidth;
        var left = Math.min(Math.max(6, x + 12), bw - tp.offsetWidth - 6);
        tp.style.left = left + 'px';
        tp.style.top = Math.max(4, y - 10) + 'px';
      },
      hide: function () { tp.style.display = 'none'; }
    };
  }

  function nearestIndex(c, ev, n) {
    var r = c.cv.getBoundingClientRect();
    var x = ev.clientX - r.left;
    var pad = c.pad;
    var frac = (x - pad.l) / Math.max(1, (c.w - pad.l - pad.r));
    return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
  }

  /* ================= 1. 暴雨事件全过程回放 ================= */
  function buildEvent(host) {
    var D = data('event');
    if (!D) return;
    var N = D.t.length;
    var state = { i: 0, playing: false, speed: 144, last: 0 };
    var speeds = { '慢': 48, '中': 144, '快': 384 };

    var ctl = E('div', 'vctl');
    var btn = E('button', 'vbtn', '▶ 播放');
    btn.type = 'button';
    var spd = E('select', 'vsel');
    Object.keys(speeds).forEach(function (k) {
      var o = E('option', null, k); o.value = k;
      if (k === '中') o.selected = true;
      spd.appendChild(o);
    });
    var range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = N - 1; range.value = 0;
    range.className = 'vrange';
    var jump = E('button', 'vbtn', '⏭ 下一段黄色预警');
    jump.type = 'button';
    ctl.appendChild(btn); ctl.appendChild(spd); ctl.appendChild(range); ctl.appendChild(jump);
    host.appendChild(ctl);

    var c = chart(host, 330);
    c.pad = { l: 46, r: 14, t: 10, b: 22 };
    var tip = tooltip(c);

    var read = E('div', 'vread');
    host.appendChild(read);

    var legend = E('div', 'vlegend');
    legend.innerHTML = '<span><i style="background:' + C.dark + '"></i>进水真值（模拟）</span>' +
      '<span><i style="background:' + C.teal + '"></i>P90 超前预测（预警口径）</span>' +
      '<span><i style="background:' + C.yellow + '"></i>黄色事件段</span>' +
      '<span><i style="background:#ffe082"></i>预警等级带：蓝/黄</span>' +
      '<span>降雨 = 上海 52 站平均（真实）</span>';
    host.appendChild(legend);

    var rainMax = 1;
    D.rain.forEach(function (v) { rainMax = Math.max(rainMax, v || 0); });
    var flowMax = 9000;
    D.inflow.forEach(function (v) { flowMax = Math.max(flowMax, v || 0); });
    var pad = c.pad;

    function lanes(h) {
      var t = pad.t, b = h - pad.b;
      var rainH = (b - t) * 0.28;
      var bandH = 16;
      var flowT = t + rainH + 8;
      var flowB = b - bandH - 10;
      return { t: t, b: b, rainT: t, rainB: t + rainH, flowT: flowT, flowB: flowB, bandT: b - bandH, bandB: b };
    }

    function draw() {
      c.fit();
      var ctx = c.ctx, w = c.w, h = c.h;
      var L = lanes(h);
      var X = xscale(N, pad.l, w - pad.r);
      // 时间刻度：每 ~4 天
      var stepMin = D.step_min;
      var perDay = Math.round(1440 / stepMin);
      var tickEvery = Math.max(1, Math.round(N / 6 / perDay)) * perDay;
      var xticks = [];
      for (var i = 0; i < N; i += tickEvery) {
        xticks.push([X(i), fmtDT(tAt(D.start, D.t[i])).slice(0, 5)]);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px system-ui,-apple-system,"Segoe UI",sans-serif';
      ctx.textBaseline = 'middle';
      // 黄色事件段阴影
      D.episodes.forEach(function (ep) {
        ctx.fillStyle = 'rgba(249,168,37,.14)';
        ctx.fillRect(X(ep.start_i), L.rainT, Math.max(2, X(ep.end_i) - X(ep.start_i)), L.b - L.rainT);
      });
      // 降雨（从上往下）
      ctx.fillStyle = 'rgba(38,166,154,.55)';
      for (var i2 = 0; i2 < N; i2++) {
        var rv = D.rain[i2] || 0;
        if (rv <= 0.05) continue;
        var bh = (rv / rainMax) * (L.rainB - L.rainT);
        var x0 = X(i2);
        var bw = Math.max(1, X(1) - X(0));
        ctx.fillRect(x0 - bw / 2, L.rainT, bw, bh);
      }
      ctx.fillStyle = C.muted; ctx.textAlign = 'left';
      ctx.fillText('降雨 mm/h', pad.l + 4, L.rainT + 8);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(rainMax, 0), pad.l - 6, L.rainT + 8);
      // 流量车道
      var Y = yscale(0, flowMax, L.flowT, L.flowB);
      niceTicks(0, flowMax, 3).forEach(function (v) {
        var y = Y(v);
        if (y < L.flowT - 1 || y > L.flowB + 1) return;
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(v)), pad.l - 6, y);
      });
      // 阈值线
      var ths = [[D.thresholds['蓝色'], C.blue, '蓝色 60%'], [D.thresholds['黄色'], C.yellow, '黄色 80%'],
                 [D.thresholds['橙色'], C.orange, '橙色 95%'], [D.thresholds['红色'], C.red, '红色 110%']];
      ths.forEach(function (th) {
        var v = th[0] * D.capacity;
        var y = Y(v);
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = th[1]; ctx.globalAlpha = .75; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.restore();
        ctx.fillStyle = th[1]; ctx.textAlign = 'left';
        ctx.fillText(th[2], w - pad.r - 66, y - 7);
      });
      // 曲线
      line(c, X, Y, D.inflow_true, C.dark, 1.8);
      line(c, X, Y, D.inflow, C.teal, 1.8);
      // 预警等级带
      for (var i3 = 0; i3 < N; i3++) {
        var lv = D.level[i3] || 0;
        if (lv === 0 && i3 % 3 !== 0) continue;
        ctx.fillStyle = LEVEL_COLOR[lv];
        ctx.fillRect(X(i3) - 1, L.bandT, 3, L.bandB - L.bandT);
      }
      ctx.fillStyle = C.muted; ctx.textAlign = 'right';
      ctx.fillText('预警等级', pad.l - 6, (L.bandT + L.bandB) / 2 - 1);
      // 光标
      var i = state.i;
      var cx = X(i);
      ctx.strokeStyle = 'rgba(38,50,56,.75)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, L.rainT); ctx.lineTo(cx, L.b); ctx.stroke();
      ctx.fillStyle = C.dark;
      ctx.beginPath(); ctx.arc(cx, Y(D.inflow_true[i]), 3.2, 0, 6.283); ctx.fill();
      ctx.fillStyle = C.teal;
      ctx.beginPath(); ctx.arc(cx, Y(D.inflow[i]), 3.2, 0, 6.283); ctx.fill();
      // 时间刻度
      ctx.textAlign = 'center';
      xticks.forEach(function (xt) {
        ctx.fillStyle = C.muted;
        ctx.fillText(xt[1], xt[0], h - pad.b + 11);
      });
      updateRead();
    }

    function updateRead() {
      var i = state.i;
      var lv = D.level[i] || 0;
      var adv = D.advice_texts[D.advice[i]] || '';
      read.innerHTML =
        cell('时间', fmtDT(tAt(D.start, D.t[i]))) +
        cell('降雨（52 站平均）', fmt(D.rain[i], 1) + ' mm/h') +
        cell('进水真值（模拟）', fmt(D.inflow_true[i]) + ' m³/h') +
        cell('P90 超前预测', fmt(D.inflow[i]) + ' m³/h') +
        cell('容量比（设计 8000）', fmt(D.ratio[i] * 100, 0) + '%') +
        cell('预警等级', '<span class="vlevel" style="background:' + LEVEL_COLOR[lv] + '">' + LEVEL[lv] + '</span>') +
        cell('提前量', fmt(D.lead[i]) + ' min', true) +
        cell('协同调控建议', adv, true);
      range.value = i;
    }

    function cell(k, v, wide) {
      return '<div class="vcell' + (wide ? ' wide' : '') + '"><div class="vk">' + k + '</div><div class="vv">' + v + '</div></div>';
    }

    var raf = null;
    function loop(ts) {
      if (!state.playing) return;
      if (!state.last) state.last = ts;
      var dt = (ts - state.last) / 1000;
      state.last = ts;
      var adv = Math.max(1, Math.round(state.speed * dt));
      state.i = Math.min(N - 1, state.i + adv);
      draw();
      if (state.i >= N - 1) { state.playing = false; btn.textContent = '▶ 重播'; btn.classList.remove('on'); state.i = 0; }
      raf = requestAnimationFrame(loop);
    }

    btn.addEventListener('click', function () {
      if (state.playing) {
        state.playing = false; btn.textContent = '▶ 继续'; btn.classList.remove('on');
        if (raf) cancelAnimationFrame(raf);
      } else {
        state.playing = true; state.last = 0; btn.textContent = '⏸ 暂停'; btn.classList.add('on');
        raf = requestAnimationFrame(loop);
      }
    });
    spd.addEventListener('change', function () { state.speed = speeds[spd.value] || 144; });
    range.addEventListener('input', function () {
      state.i = parseInt(range.value, 10) || 0;
      if (state.playing) { state.playing = false; btn.textContent = '▶ 继续'; btn.classList.remove('on'); if (raf) cancelAnimationFrame(raf); }
      draw();
    });
    jump.addEventListener('click', function () {
      var next = null;
      for (var k = 0; k < D.episodes.length; k++) {
        if (D.episodes[k].start_i > state.i + 1) { next = D.episodes[k]; break; }
      }
      if (!next) next = D.episodes[0];
      if (!next) return;
      state.i = Math.max(0, next.start_i - 12);
      draw();
    });
    c.cv.addEventListener('mousemove', function (ev) {
      var i = nearestIndex(c, ev, N);
      var x = xscale(N, pad.l, c.w - pad.r)(i);
      tip.show(x, 20, '<b>' + fmtDT(tAt(D.start, D.t[i])) + '</b><br>' +
        '降雨 ' + fmt(D.rain[i], 1) + ' mm/h · 容量比 ' + fmt(D.ratio[i] * 100, 0) + '%<br>' +
        '真值 ' + fmt(D.inflow_true[i]) + ' · P90 ' + fmt(D.inflow[i]) + ' m³/h<br>' +
        '等级 ' + LEVEL[D.level[i] || 0]);
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });
    onResize(draw);
    draw();
  }

  /* ================= 2. 预测浏览器 ================= */
  var SERIES_META = {
    koeln: {
      order: ['h60', 'h120', 'h180', 'lstm_h120'],
      meta: {
        h60: { label: '流量 +1h', unit: 'L/s' }, h120: { label: '流量 +2h', unit: 'L/s' },
        h180: { label: '流量 +3h', unit: 'L/s' }, lstm_h120: { label: '流量 +2h（LSTM）', unit: 'L/s' }
      }
    },
    taihe: {
      order: ['h60', 'h120', 'h180', 'cod_h120', 'nh3n_load_h120', 'lstm_h120'],
      meta: {
        h60: { label: '流量 +1h', unit: 'm³/h' }, h120: { label: '流量 +2h', unit: 'm³/h' },
        h180: { label: '流量 +3h', unit: 'm³/h' }, cod_h120: { label: 'COD 浓度 +2h', unit: 'mg/L' },
        nh3n_load_h120: { label: '氨氮负荷 +2h', unit: 'kg/h' }, lstm_h120: { label: '流量 +2h（LSTM）', unit: 'm³/h' }
      }
    }
  };

  function buildPredict(host) {
    var D = data('predict');
    if (!D) return;
    var state = { site: 'koeln', key: 'h120', on: { lightgbm: true, band: true, mlp: false, persistence: false, seasonal: false } };

    var tabs = E('div', 'vctl');
    host.appendChild(tabs);
    var seriesBar = E('div', 'vctl');
    host.appendChild(seriesBar);
    var toggles = E('div', 'vctl');
    host.appendChild(toggles);

    var c = chart(host, 320);
    c.pad = { l: 52, r: 14, t: 12, b: 24 };
    var tip = tooltip(c);
    var badges = E('div', 'vbadges');
    host.appendChild(badges);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = '鼠标悬停查看数值；曲线为测试段真实序列（Köln 2019 / 泰和 2024-08 模拟），数字与 reports/*.json 一致。区间呈"扇形"处 = 降雨转捩时 P90 上包络瞬时抬升/回落（平均宽度 MPIW：Köln +2h 64 L/s）；区间整体欠覆盖（PICP 67%~74%），上线前需校准。';
    host.appendChild(note);

    function buildTabs() {
      tabs.innerHTML = '';
      tabs.appendChild(chip('Köln（真实）', state.site === 'koeln', function () { state.site = 'koeln'; state.key = 'h120'; rebuild(); }));
      tabs.appendChild(chip('泰和（模拟）', state.site === 'taihe', function () { state.site = 'taihe'; state.key = 'h120'; rebuild(); }));
      seriesBar.innerHTML = '';
      SERIES_META[state.site].order.forEach(function (k) {
        var m = SERIES_META[state.site].meta[k];
        seriesBar.appendChild(chip(m.label, state.key === k, function () { state.key = k; rebuild(); }));
      });
      toggles.innerHTML = '';
      toggles.appendChild(chip('LightGBM 点预测', state.on.lightgbm, function () { state.on.lightgbm = !state.on.lightgbm; rebuild(); }));
      toggles.appendChild(chip('P10–P90 区间', state.on.band, function () { state.on.band = !state.on.band; rebuild(); }));
      toggles.appendChild(chip('MLP', state.on.mlp, function () { state.on.mlp = !state.on.mlp; rebuild(); }));
      toggles.appendChild(chip('持续法', state.on.persistence, function () { state.on.persistence = !state.on.persistence; rebuild(); }));
      toggles.appendChild(chip('季节朴素', state.on.seasonal, function () { state.on.seasonal = !state.on.seasonal; rebuild(); }));
    }

    function rebuild() { buildTabs(); draw(); }

    function draw() {
      var S = D[state.site];
      var d = S.series[state.key];
      if (!d) return;
      var meta = SERIES_META[state.site].meta[state.key];
      c.fit();
      var N = d.t.length;
      var pad = c.pad;
      var vis = [];
      if (state.on.lightgbm && d.lightgbm) vis.push(d.lightgbm);
      if (d.lstm) vis.push(d.lstm);
      if (state.on.mlp && d.mlp) vis.push(d.mlp);
      if (state.on.persistence && d.persistence) vis.push(d.persistence);
      if (state.on.seasonal && d.seasonal_naive) vis.push(d.seasonal_naive);
      vis.push(d.y_true);
      if (state.on.band && d.p10) { vis.push(d.p10); vis.push(d.p90); }
      var vmin = Infinity, vmax = -Infinity;
      vis.forEach(function (arr) {
        arr.forEach(function (v) {
          if (v == null || isNaN(v)) return;
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        });
      });
      var span = (vmax - vmin) || 1;
      vmin -= span * 0.06; vmax += span * 0.10;
      var X = xscale(N, pad.l, c.w - pad.r);
      var Y = yscale(vmin, vmax, pad.t, c.h - pad.b);
      var perDay = Math.round(1440 / d.step_min);
      var tickEvery = Math.max(1, Math.round(N / 7 / perDay)) * perDay;
      var xticks = [];
      for (var i = 0; i < N; i += tickEvery) xticks.push([X(i), fmtDT(tAt(d.start, d.t[i])).slice(0, 5)]);
      drawAxes(c, pad, vmin, vmax, xticks);
      // 区间带
      if (state.on.band && d.p10) {
        var ctx = c.ctx;
        ctx.beginPath();
        var started = false;
        for (var i2 = 0; i2 < N; i2++) {
          var x = X(i2);
          if (!started) { ctx.moveTo(x, Y(d.p10[i2])); started = true; } else ctx.lineTo(x, Y(d.p10[i2]));
        }
        for (var i3 = N - 1; i3 >= 0; i3--) ctx.lineTo(X(i3), Y(d.p90[i3]));
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,121,107,.13)';
        ctx.fill();
      }
      if (state.on.seasonal && d.seasonal_naive) line(c, X, Y, d.seasonal_naive, C.purple, 1.3, [5, 3]);
      if (state.on.persistence && d.persistence) line(c, X, Y, d.persistence, C.muted, 1.3, [4, 3]);
      if (state.on.mlp && d.mlp) line(c, X, Y, d.mlp, C.orange, 1.4);
      if (d.lstm) line(c, X, Y, d.lstm, C.blue, 1.5);
      if (state.on.lightgbm && d.lightgbm) line(c, X, Y, d.lightgbm, C.teal, 1.8);
      line(c, X, Y, d.y_true, C.dark, 2);
      // 单位
      var ctx2 = c.ctx;
      ctx2.fillStyle = C.muted; ctx2.textAlign = 'left'; ctx2.font = '11px system-ui,sans-serif';
      ctx2.fillText(meta.unit, pad.l + 4, pad.t + 6);
      c._X = X; c._Y = Y; c._d = d; c._N = N; c._meta = meta;
      updateBadges(S, d);
    }

    function updateBadges(S, d) {
      var m = (S.metrics || {})[state.key];
      var html = '';
      function b(k, v, cls) { return '<span class="vbadge ' + (cls || '') + '">' + k + ' <b>' + v + '</b></span>'; }
      if (m && m.model) {
        html += b('LightGBM NSE', fmt(m.model.NSE, 3), 'good');
        html += b('MAE', fmt(m.model.MAE, 1));
        html += b('MAPE', fmt(m.model.MAPE, 1) + '%');
        if (m.persistence) html += b('持续法 NSE', fmt(m.persistence.NSE, 3));
        if (m.seasonal_naive) html += b('季节朴素 NSE', fmt(m.seasonal_naive.NSE, 3));
        if (m.mlp) html += b('MLP NSE', fmt(m.mlp.NSE, 3));
      } else {
        html += '<span class="vbadge">该序列为对照实验（LSTM / 浓度 / 负荷），指标见结果全景页</span>';
      }
      badges.innerHTML = html;
    }

    c.cv.addEventListener('mousemove', function (ev) {
      if (!c._d) return;
      var i = nearestIndex(c, ev, c._N);
      var d = c._d;
      var x = c._X(i);
      var rows = ['<b>' + fmtDT(tAt(d.start, d.t[i])) + '</b>'];
      if (d.y_true) rows.push('真值 ' + fmt(d.y_true[i], 1));
      if (state.on.lightgbm && d.lightgbm) rows.push('LightGBM ' + fmt(d.lightgbm[i], 1));
      if (d.lstm) rows.push('LSTM ' + fmt(d.lstm[i], 1));
      if (state.on.mlp && d.mlp) rows.push('MLP ' + fmt(d.mlp[i], 1));
      if (state.on.band && d.p10) rows.push('P10–P90 ' + fmt(d.p10[i], 1) + ' ~ ' + fmt(d.p90[i], 1));
      tip.show(x, 24, rows.join('<br>'));
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });
    onResize(function () { draw(); });
    rebuild();
  }

  /* ================= 3. SWMM 策略对比 ================= */
  var SWMM_META = {
    static: { label: '无调控（泵常开）', color: '#90a4ae' },
    rule: { label: '本地液位规则', color: '#8d6e63' },
    predict: { label: '预见性滚动（防冒溢保护）', color: '#00796b' },
    aggressive: { label: '预见性滚动（激进限排）', color: '#ef6c00' }
  };

  function buildSwmm(host) {
    var D = data('swmm');
    if (!D) return;
    var on = { static: true, rule: false, predict: true, aggressive: true };
    var ctl = E('div', 'vctl');
    host.appendChild(ctl);
    var c = chart(host, 250);
    c.pad = { l: 50, r: 14, t: 12, b: 24 };
    var tip = tooltip(c);
    var table = E('div', 'vtable');
    host.appendChild(table);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = 'P=50a 设计暴雨概化模拟（未经泰和实测率定）：价值在策略间相对比较——激进限排削超阈体积 −89%，但前池冒溢 +6.2%；防冒溢保护版冒溢不增、超阈 −28%。';
    host.appendChild(note);

    function drawCtl() {
      ctl.innerHTML = '';
      Object.keys(SWMM_META).forEach(function (k) {
        ctl.appendChild(chip(SWMM_META[k].label, !!on[k], function () {
          on[k] = !on[k];
          if (!Object.keys(on).some(function (x) { return on[x]; })) on[k] = true;
          draw();
        }));
      });
    }

    function drawTable() {
      var st = D.stats || {};
      var STATS_KEY = { static: 'static', rule: 'rule', predict: 'predict', aggressive: 'predict_aggressive' };
      var rows = [['策略', '峰值入流', '超阈历时', '超阈体积', '前池冒溢体积']];
      Object.keys(SWMM_META).forEach(function (k) {
        var s = st[STATS_KEY[k]] || {};
        rows.push([SWMM_META[k].label, fmt(s['峰值入流_cms'], 2) + ' m³/s', fmt(s['超阈历时_h'], 1) + ' h',
          fmt(s['超阈体积_万m3'], 2) + ' 万m³', fmt(s['前池冒溢体积_万m3'], 2) + ' 万m³']);
      });
      var html = '<table>';
      rows.forEach(function (r, i) {
        html += '<tr>';
        r.forEach(function (cellv, j) {
          var cls = (i > 0 && on[Object.keys(SWMM_META)[i - 1]]) ? ' class="on"' : '';
          html += (i === 0 ? '<th>' : '<td' + cls + '>') + cellv + (i === 0 ? '</th>' : '</td>');
        });
        html += '</tr>';
      });
      html += '</table>';
      table.innerHTML = html;
    }

    function draw() {
      drawCtl();
      drawTable();
      c.fit();
      var N = D.t.length, pad = c.pad;
      var vmax = 0;
      D.static.forEach(function (v) { vmax = Math.max(vmax, v); });
      vmax = Math.max(vmax, D.safe_cms) * 1.12;
      var X = xscale(N, pad.l, c.w - pad.r);
      var Y = yscale(0, vmax, pad.t, c.h - pad.b);
      var perDay = Math.round(1440 / D.step_min);
      var xticks = [];
      for (var i = 0; i < N; i += perDay) xticks.push([X(i), fmtDT(tAt(D.start, D.t[i])).slice(0, 5)]);
      drawAxes(c, pad, 0, vmax, xticks);
      var ctx = c.ctx;
      // 安全阈值
      var yt = Y(D.safe_cms);
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = C.red; ctx.globalAlpha = .8; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pad.l, yt); ctx.lineTo(c.w - pad.r, yt); ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.red; ctx.textAlign = 'left';
      ctx.fillText('安全阈值 ' + D.safe_cms + ' m³/s', c.w - pad.r - 108, yt - 8);
      ['static', 'rule', 'predict', 'aggressive'].forEach(function (k) {
        if (!on[k]) return;
        line(c, X, Y, D[k], SWMM_META[k].color, k === 'predict' || k === 'aggressive' ? 2 : 1.4);
      });
      c._X = X; c._Y = Y;
    }

    c.cv.addEventListener('mousemove', function (ev) {
      var i = nearestIndex(c, ev, D.t.length);
      var x = c._X(i);
      var rows = ['<b>' + fmtDT(tAt(D.start, D.t[i])) + '</b>'];
      ['static', 'rule', 'predict', 'aggressive'].forEach(function (k) {
        if (on[k]) rows.push(SWMM_META[k].label + ' ' + fmt(D[k][i], 2));
      });
      tip.show(x, 20, rows.join('<br>'));
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });
    onResize(draw);
    draw();
  }

  /* ================= 4. 极端场景（P=100a 增广前后） ================= */
  function buildStress(host) {
    var D = data('stress');
    if (!D) return;
    var on = { truth: true, base: true, aug: true };
    var ctl = E('div', 'vctl');
    host.appendChild(ctl);
    var c = chart(host, 250);
    c.pad = { l: 56, r: 14, t: 12, b: 24 };
    var tip = tooltip(c);
    var cards = E('div', 'vread');
    host.appendChild(cards);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = 'P=100a 设计暴雨（2h 芝加哥雨型，峰值 55,271 m³/h）：常规工况训练模型严重低估洪峰；加入 P5/P50 增广后 NSE 0.149 → 0.954。增广需针对目标雨型设计（台风场景反而负迁移），仍为模拟口径。';
    host.appendChild(note);

    function drawCtl() {
      ctl.innerHTML = '';
      ctl.appendChild(chip('真值', on.truth, function () { on.truth = !on.truth; draw(); }));
      ctl.appendChild(chip('基准模型（常规工况训练）', on.base, function () { on.base = !on.base; draw(); }));
      ctl.appendChild(chip('增广模型（P5/P50 加入训练）', on.aug, function () { on.aug = !on.aug; draw(); }));
    }

    function drawCards() {
      var a = D.annot;
      cards.innerHTML =
        '<div class="vcell"><div class="vk">基准 NSE</div><div class="vv">' + fmt(a.base_nse, 3) + '</div></div>' +
        '<div class="vcell"><div class="vk">基准洪峰误差</div><div class="vv">' + fmt(a.base_peak_err * 100, 0) + '%</div></div>' +
        '<div class="vcell"><div class="vk">增广 NSE</div><div class="vv good">' + fmt(a.aug_nse, 3) + '</div></div>' +
        '<div class="vcell"><div class="vk">增广洪峰误差</div><div class="vv good">' + fmt(a.aug_peak_err * 100, 0) + '%</div></div>' +
        '<div class="vcell wide"><div class="vk">设计暴雨雨量 / 洪峰真值</div><div class="vv">' + fmt(a.rain_mm, 1) + ' mm / ' + fmt(a.peak) + ' m³/h</div></div>';
    }

    function draw() {
      drawCtl();
      drawCards();
      c.fit();
      var N = D.t.length, pad = c.pad;
      var vmax = 0, vmin = Infinity;
      [D.truth, D.base, D.aug].forEach(function (arr) {
        arr.forEach(function (v) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
      });
      var X = xscale(N, pad.l, c.w - pad.r);
      var Y = yscale(Math.max(0, vmin * 0.9), vmax * 1.08, pad.t, c.h - pad.b);
      var perDay = Math.round(1440 / D.step_min);
      var xticks = [];
      for (var i = 0; i < N; i += perDay) xticks.push([X(i), fmtDT(tAt(D.start, D.t[i])).slice(0, 5)]);
      drawAxes(c, pad, Math.max(0, vmin * 0.9), vmax * 1.08, xticks);
      if (on.base) line(c, X, Y, D.base, C.orange, 1.6);
      if (on.aug) line(c, X, Y, D.aug, C.teal, 1.8);
      if (on.truth) line(c, X, Y, D.truth, C.dark, 2);
      c._X = X; c._Y = Y;
    }

    c.cv.addEventListener('mousemove', function (ev) {
      var i = nearestIndex(c, ev, D.t.length);
      var x = c._X(i);
      tip.show(x, 20, '<b>' + fmtDT(tAt(D.start, D.t[i])) + '</b><br>' +
        (on.truth ? '真值 ' + fmt(D.truth[i]) + '<br>' : '') +
        (on.base ? '基准 ' + fmt(D.base[i]) + '<br>' : '') +
        (on.aug ? '增广 ' + fmt(D.aug[i]) : ''));
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });
    onResize(draw);
    draw();
  }

  /* ================= 5. 模型与效率 ================= */
  function buildModels(host) {
    var D = data('models');
    if (!D) return;
    var state = { site: 'koeln', h: 120 };
    var ctl = E('div', 'vctl');
    host.appendChild(ctl);
    var grid = E('div', 'mgrid');
    host.appendChild(grid);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = 'Köln 真实数据：LightGBM 全面超过四类基线（+1h NSE 0.943）；泰和模拟各模型接近（0.98→0.96）。训练耗时 LightGBM 仅 1.6~6.5 s，约为 LSTM 的 1/14~1/38，推理均达亚秒级。';
    host.appendChild(note);

    function bars(title, items, scale) {
      var max = scale || Math.max.apply(null, items.map(function (it) { return Math.abs(it.v) || 0; })) || 1;
      var html = '<div class="mpanel"><h4>' + title + '</h4>';
      items.forEach(function (it) {
        var pct = Math.max(0, Math.min(100, (it.v / max) * 100));
        var neg = it.v < 0;
        html += '<div class="mrow"><span class="mlab">' + it.k + '</span>' +
          '<span class="mtrack"><i class="' + (neg ? 'neg' : (it.cls || '')) + '" style="width:' + (neg ? 2 : pct) + '%"></i></span>' +
          '<span class="mval">' + (it.txt != null ? it.txt : fmt(it.v, 3)) + '</span></div>';
      });
      html += '</div>';
      return html;
    }

    function draw() {
      ctl.innerHTML = '';
      ctl.appendChild(chip('Köln（真实）', state.site === 'koeln', function () { state.site = 'koeln'; draw(); }));
      ctl.appendChild(chip('泰和（模拟）', state.site === 'taihe', function () { state.site = 'taihe'; draw(); }));
      [60, 120, 180].forEach(function (h) {
        ctl.appendChild(chip('+' + (h / 60) + 'h', state.h === h, function () { state.h = h; draw(); }));
      });
      var key = state.site + '_h' + state.h;
      var nse = D.nse[key] || {};
      var nseHtml = '<div class="mpanel"><h4>NSE（0 线为中点 · 越高越好 · 负值无效）</h4>';
      Object.keys(nse).forEach(function (k) {
        var v = nse[k];
        var pct = Math.min(50, Math.abs(v) * 50);
        var off = v >= 0 ? 50 : 50 - pct;
        nseHtml += '<div class="mrow"><span class="mlab">' + k + '</span>' +
          '<span class="mtrack center"><i class="' + (v >= 0 ? 'good' : 'neg') + '" style="margin-left:' + off + '%;width:' + pct + '%"></i></span>' +
          '<span class="mval">' + fmt(v, 3) + '</span></div>';
      });
      nseHtml += '</div>';
      // 耗时（该站点/提前量的模型）
      var rt = (D.runtime || []).filter(function (r) { return r.dataset === state.site && String(r.h) === String(state.h); });
      var seen = {};
      var rtItems = [];
      rt.forEach(function (r) {
        var short = r.model.indexOf('LSTM') === 0 ? 'LSTM' : (r.model.indexOf('MLP') === 0 ? 'MLP' :
          (r.model.indexOf('分位数') >= 0 ? 'LightGBM 分位' : 'LightGBM'));
        if (seen[short]) return;
        seen[short] = 1;
        rtItems.push({ k: short, v: r.train_s, txt: fmt(r.train_s, 1) + ' s' });
      });
      var rtHtml = bars('训练耗时（秒，越低越好）', rtItems.length ? rtItems : [{ k: '无数据', v: 0, txt: '–' }]);
      grid.innerHTML = nseHtml + rtHtml;
    }
    draw();
  }

  /* ================= init ================= */
  var BUILDERS = { event: buildEvent, predict: buildPredict, swmm: buildSwmm, stress: buildStress, models: buildModels };

  function init(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-viz]') : [];
    Array.prototype.forEach.call(nodes, function (host) {
      if (host.getAttribute('data-viz-done')) return;
      host.setAttribute('data-viz-done', '1');
      var kind = host.getAttribute('data-viz');
      var fn = BUILDERS[kind];
      if (!fn) return;
      try {
        fn(host);
      } catch (e) {
        host.innerHTML = '<p class="small muted">交互组件（' + kind + '）加载失败：' + (e && e.message ? e.message : e) + '</p>';
      }
    });
  }

  /* 自启动兜底：即使 site.js 未加载也能渲染（init 有幂等保护） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  return { init: init };
})();
