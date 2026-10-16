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


  /* ================= 6. 传感器故障容错台 ================= */
  function buildRobust(host) {
    var D = data('robust');
    if (!D) return;
    var state = { case: 0, sc: 0 };
    var tabs = E('div', 'vctl');
    var chips = E('div', 'vctl');
    var grid = E('div', 'mgrid');
    host.appendChild(tabs); host.appendChild(chips); host.appendChild(grid);
    var driftBox = E('div', 'mt14');
    host.appendChild(driftBox);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = '场景为测试段注入式扰动（模拟口径）；"稳健模式" = 质控 + 前向填充 + 守卫模型；"严格模式可用率" = 允许原样服务的时间占比。出处：reports/robustness.json。';
    host.appendChild(note);

    function cur() { return D.cases[state.case]; }
    function sc() { return cur().scenarios[state.sc] || cur().scenarios[0]; }
    function ref() { return cur().scenarios[0]; }

    function barsHtml(s, r) {
      var rows = [
        { k: '稳健模式（质控 + 守卫）', v: s.robust, rv: r.robust, cls: 'good' },
        { k: '前向填充基线', v: s.ffill, rv: r.ffill },
        { k: '持续法基线', v: s.persist, rv: r.persist }
      ];
      var html = '<div class="mpanel"><h4>NSE（越高越好 · 细线 = 无扰动参照）</h4>';
      rows.forEach(function (it) {
        var pct = Math.max(0, Math.min(100, it.v * 100));
        var rp = Math.max(0, Math.min(100, it.rv * 100));
        html += '<div class="mrow"><span class="mlab">' + it.k + '</span>' +
          '<span class="mtrack"><i class="' + (it.cls || '') + '" style="width:' + pct + '%"></i>' +
          '<em class="refmark" style="left:' + rp + '%"></em></span>' +
          '<span class="mval">' + fmt(it.v, 3) + '</span></div>';
      });
      html += '</div>';
      return html;
    }

    function cardsHtml(s, r) {
      var d = s.robust - r.robust;
      var qc = s.qc || {};
      var qcTop = Object.keys(qc).slice(0, 3).map(function (k) { return k + ' ' + qc[k]; }).join(' · ');
      return '<div class="mpanel"><h4>运行指标</h4>' +
        '<div class="vread">' +
        '<div class="vcell"><div class="vk">严格模式可用率</div><div class="vv">' + fmt(s.strict * 100, 1) + '%</div></div>' +
        '<div class="vcell"><div class="vk">稳健 NSE（较无扰动）</div><div class="vv ' + (d >= -0.02 ? 'good' : '') + '">' + fmt(s.robust, 3) + '（' + (d >= 0 ? '+' : '') + fmt(d, 3) + '）</div></div>' +
        '<div class="vcell"><div class="vk">稳健 MAE</div><div class="vv">' + fmt(s.mae_robust, 1) + ' ' + cur().unit + '</div></div>' +
        '<div class="vcell wide"><div class="vk">质控标记（前 3 类）</div><div class="vv">' + (qcTop || '—') + '</div></div>' +
        '</div></div>';
    }

    function driftHtml() {
      var site = cur().site;
      var e = null;
      (D.drift || []).forEach(function (x) { if (x.site === site && !e) e = x; });
      if (!e) return '';
      return '<div class="card tight"><p class="small"><b>漂移检测演练（' + (site === 'koeln' ? 'Köln' : '泰和') + ' · ' + e.sensor + '）：</b>' +
        '注入 ' + fmt(e.drift_end, 2) + ' 的缓慢漂移 → ' +
        (e.alarm ? '自动报警于 ' + e.alarm.slice(5, 16) + '（此前误报率 ' + fmt(e.far_before * 100, 2) + '%）' : '未触发报警（漂移量 ' + fmt(e.drift_end, 2) + ' 小于检测阈值，属预期）') +
        '；漂移后 MAE：带守卫 ' + fmt(e.mae_guarded_after, 1) + ' vs 无守卫 ' + fmt(e.mae_model_after, 1) + ' vs 持续法 ' + fmt(e.mae_persist_after, 1) + '。</p></div>';
    }

    function draw() {
      tabs.innerHTML = '';
      D.cases.forEach(function (c, i) {
        tabs.appendChild(chip((c.site === 'koeln' ? 'Köln' : '泰和') + ' +' + (c.h / 60) + 'h', state.case === i, function () {
          state.case = i; state.sc = 0; draw();
        }));
      });
      chips.innerHTML = '';
      cur().scenarios.forEach(function (x, i) {
        chips.appendChild(chip(x.name, state.sc === i, function () { state.sc = i; draw(); }));
      });
      var s = sc(), r = ref();
      grid.innerHTML = barsHtml(s, r) + cardsHtml(s, r);
      driftBox.innerHTML = driftHtml();
    }
    draw();
  }

  /* ================= 7. SHAP 可解释性 ================= */
  var SHAP_COLORS = { '历史进水': '#00796b', '管网液位': '#1565c0', '降雨': '#26a69a', '时刻/星期': '#b0bec5' };

  function buildShap(host) {
    var D = data('shap');
    if (!D) return;
    var state = { site: 0, slice: 'all' };
    var tabs = E('div', 'vctl');
    var sliceBar = E('div', 'vctl');
    var grid = E('div', 'mgrid');
    host.appendChild(tabs); host.appendChild(sliceBar); host.appendChild(grid);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = 'SHAP 为模型输出的相关性分摊（TreeExplainer），不等于物理因果；特征全部来自发布时刻及之前（无泄漏）。出处：reports/shap_summary.json · 加性误差上限见右栏。';
    host.appendChild(note);

    function cur() { return D.sites[state.site]; }

    function topHtml(s) {
      var max = s.top[0].v || 1;
      var html = '<div class="mpanel"><h4>特征贡献 Top 12（平均 |SHAP| · ' + s.unit + '）</h4>';
      s.top.forEach(function (t) {
        var pct = Math.max(1, (t.v / max) * 100);
        html += '<div class="mrow"><span class="mlab">' + t.label + '</span>' +
          '<span class="mtrack"><i class="good" style="width:' + pct + '%"></i></span>' +
          '<span class="mval">' + fmt(t.v, 1) + '</span></div>';
      });
      html += '</div>';
      return html;
    }

    function groupHtml(s) {
      var g = s.groups[state.slice] || s.groups.all;
      var keys = Object.keys(g).sort(function (a, b) { return g[b] - g[a]; });
      var bar = '<div class="shap-stack">';
      keys.forEach(function (k) {
        bar += '<i style="width:' + (g[k] * 100) + '%;background:' + (SHAP_COLORS[k] || '#90a4ae') + '" title="' + k + '"></i>';
      });
      bar += '</div>';
      var legend = '<div class="vlegend">' + keys.map(function (k) {
        return '<span><i style="background:' + (SHAP_COLORS[k] || '#90a4ae') + '"></i>' + k + ' ' + fmt(g[k] * 100, 1) + '%</span>';
      }).join('') + '</div>';
      var label = state.slice === 'all' ? '全测试段' : (state.slice === 'wet' ? '雨天（' + s.n_wet + ' 步）' : '晴天');
      return '<div class="mpanel"><h4>分组贡献占比（' + label + '）</h4>' + bar + legend +
        '<div class="vread" style="margin-top:12px">' +
        '<div class="vcell"><div class="vk">基线 φ0（E[f(X)]）</div><div class="vv">' + fmt(s.base, 1) + ' ' + s.unit + '</div></div>' +
        '<div class="vcell"><div class="vk">解释样本</div><div class="vv">' + s.n.toLocaleString() + '</div></div>' +
        '<div class="vcell wide"><div class="vk">加性误差上限</div><div class="vv">' + s.add_err.toExponential(1) + ' ' + s.unit + '</div></div>' +
        '</div></div>';
    }

    function draw() {
      tabs.innerHTML = '';
      D.sites.forEach(function (s, i) {
        tabs.appendChild(chip((s.site === 'koeln' ? 'Köln（真实）' : '泰和（模拟）') + ' +' + (s.h / 60) + 'h', state.site === i, function () {
          state.site = i; draw();
        }));
      });
      sliceBar.innerHTML = '';
      [['all', '全部'], ['wet', '雨天'], ['dry', '晴天']].forEach(function (x) {
        sliceBar.appendChild(chip(x[1], state.slice === x[0], function () { state.slice = x[0]; draw(); }));
      });
      var s = cur();
      grid.innerHTML = topHtml(s) + groupHtml(s);
    }
    draw();
  }

  /* ================= 8. 输送延迟实验台 ================= */
  function buildDelay(host) {
    var D = data('delay');
    if (!D) return;
    var state = { v: D.v_ms, running: false, p: 0, last: 0 };
    var ctl = E('div', 'vctl');
    var btn = E('button', 'vbtn', '▶ 释放脉冲');
    btn.type = 'button';
    var vlab = E('span', 'small muted', '流速 v = ' + fmt(state.v, 1) + ' m/s');
    var vr = document.createElement('input');
    vr.type = 'range'; vr.min = 5; vr.max = 12; vr.value = state.v * 10; vr.className = 'vrange';
    ctl.appendChild(btn); ctl.appendChild(vr); ctl.appendChild(vlab);
    host.appendChild(ctl);

    var c = chart(host, 250);
    c.pad = { l: 92, r: 20, t: 16, b: 26 };
    var read = E('div', 'vread');
    host.appendChild(read);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = '输送延迟 τ = 管道长度 L ÷ 流速 v（核心物理机制 · ' + D.lead_note + '）；绿色虚线 = 预警提前量 120 min —— τ 大于它时，上游信号到达前预警已发出。出处：官方骨架 + 模拟场景参数。';
    host.appendChild(note);

    var T_MAX_H = 4.0;   // 时间轴 0..4h
    var SPEED = 0.7;     // 每秒推进小时数 → 4h ≈ 5.7s

    function taus() {
      return D.nodes.map(function (n) { return n.km * 1000 / (state.v * 3600); });
    }

    function fmtTau(h) {
      var m = Math.round(h * 60);
      return Math.floor(m / 60) + ' h ' + pad2(m % 60) + ' min';
    }

    function draw() {
      c.fit();
      var ctx = c.ctx, w = c.w, h = c.h, pad = c.pad;
      var lanes = D.nodes.length;
      var X = function (hrs) { return pad.l + (w - pad.l - pad.r) * (hrs / T_MAX_H); };
      var ts = taus();
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px system-ui,-apple-system,"Segoe UI",sans-serif';
      ctx.textBaseline = 'middle';
      // 时间轴
      for (var hr = 0; hr <= T_MAX_H; hr += 1) {
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(hr), pad.t); ctx.lineTo(X(hr), h - pad.b); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = 'center';
        ctx.fillText(hr + ' h', X(hr), h - pad.b + 12);
      }
      // 预警提前量参考线
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = C.teal; ctx.globalAlpha = .8; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(X(2), pad.t); ctx.lineTo(X(2), h - pad.b); ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.teal; ctx.textAlign = 'left';
      ctx.fillText('预警提前量 120 min', X(2) + 4, pad.t + 8);
      // 车道
      var laneH = (h - pad.b - pad.t) / lanes;
      D.nodes.forEach(function (n, i) {
        var y = pad.t + laneH * (i + 0.5);
        ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = 'right';
        ctx.fillText(n.id + ' ' + n.km + ' km', pad.l - 6, y);
        var tau = ts[i];
        var arriveX = X(Math.min(tau, T_MAX_H));
        // 轨迹
        ctx.strokeStyle = 'rgba(0,121,107,.35)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(arriveX, y); ctx.stroke();
        // 到达标记
        if (state.p * T_MAX_H >= tau) {
          ctx.fillStyle = C.teal;
          ctx.beginPath(); ctx.arc(arriveX, y, 6, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.arc(arriveX, y, 2.4, 0, 6.283); ctx.fill();
          ctx.fillStyle = C.teal; ctx.textAlign = 'left';
          ctx.fillText('到达 ' + fmtTau(tau), arriveX + 9, y);
        }
        // 脉冲
        var tp = Math.min(state.p * T_MAX_H, tau);
        var px = X(tp);
        ctx.fillStyle = '#ef6c00';
        ctx.beginPath(); ctx.arc(px, y, 5.5, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(239,108,0,.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, y, 9, 0, 6.283); ctx.stroke();
      });
      // 厂前
      ctx.fillStyle = C.dark; ctx.textAlign = 'left';
      ctx.fillText('厂前（' + D.plant + '）', pad.l, pad.t - 4);
      updateRead(ts);
    }

    function updateRead(ts) {
      var html = '';
      D.nodes.forEach(function (n, i) {
        html += '<div class="vcell"><div class="vk">' + n.id + '（' + n.km + ' km）</div><div class="vv">τ = ' + fmtTau(ts[i]) + '</div></div>';
      });
      html += '<div class="vcell wide"><div class="vk">含义</div><div class="vv">τ 就是"超前感知"的物理上限：上游信号领先 τ 小时到达厂前</div></div>';
      read.innerHTML = html;
    }

    var raf = null;
    function loop(tsMs) {
      if (!state.running) return;
      if (!state.last) state.last = tsMs;
      var dt = (tsMs - state.last) / 1000;
      state.last = tsMs;
      state.p = Math.min(1, state.p + dt * SPEED / T_MAX_H);
      draw();
      if (state.p >= 1) {
        state.running = false; btn.textContent = '▶ 重放'; btn.classList.remove('on');
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    btn.addEventListener('click', function () {
      if (state.running) {
        state.running = false; btn.textContent = '▶ 继续'; btn.classList.remove('on');
        if (raf) cancelAnimationFrame(raf);
      } else {
        if (state.p >= 1) state.p = 0;
        state.running = true; state.last = 0; btn.textContent = '⏸ 暂停'; btn.classList.add('on');
        raf = requestAnimationFrame(loop);
      }
    });
    vr.addEventListener('input', function () {
      state.v = parseInt(vr.value, 10) / 10;
      vlab.textContent = '流速 v = ' + fmt(state.v, 1) + ' m/s';
      draw();
    });
    onResize(draw);
    draw();
  }


  /* ================= 9. 效益计算器 ================= */
  function buildBenefit(host) {
    var D = data('benefit');
    if (!D) return;
    var state = { lead: D.lead_min, cap: D.capacity_cms, alpha: Math.round(D.alpha * 100) };
    var ctl = E('div', 'vctl');
    host.appendChild(ctl);
    var grid = E('div', 'mgrid');
    host.appendChild(grid);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.textContent = '拖三个滑块，看"雨前预抽空可腾调蓄容积"如何变化（公式透明可查）：容积 = 提前量 × 泵站合计能力 × 可预降比例 α。' + D.note + '。';
    host.appendChild(note);

    function sliders() {
      ctl.innerHTML = '';
      function slider(label, min, max, step, val, key, fmtf) {
        var box = E('span', 'vsl');
        var lab = E('span', 'vsl-lab', label + ' <b>' + fmtf(val) + '</b>');
        var r = document.createElement('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.className = 'vrange';
        r.addEventListener('input', function () {
          state[key] = parseFloat(r.value);
          lab.innerHTML = label + ' <b>' + fmtf(state[key]) + '</b>';
          draw();
        });
        box.appendChild(lab); box.appendChild(r);
        ctl.appendChild(box);
      }
      slider('提前量', 30, 180, 10, state.lead, 'lead', function (v) { return v + ' min'; });
      slider('泵站合计能力', 20, 60, 0.5, state.cap, 'cap', function (v) { return fmt(v, 1) + ' m³/s'; });
      slider('可预降调蓄比例 α', 5, 30, 1, state.alpha, 'alpha', function (v) { return fmt(v, 0) + '%'; });
    }

    function draw() {
      var vol = state.lead * 60 * state.cap * (state.alpha / 100) / 1e4;  // 万 m³
      var mult = vol / D.baseline_wan;
      var refPct = Math.min(100, (vol / 8) * 100);
      var basePct = Math.min(100, (D.baseline_wan / 8) * 100);
      grid.innerHTML =
        '<div class="mpanel"><h4>可腾调蓄容积（万 m³）</h4>' +
        '<div class="mrow"><span class="mlab">当前设定</span>' +
        '<span class="mtrack"><i class="good" style="width:' + refPct + '%"></i>' +
        '<em class="refmark" style="left:' + basePct + '%"></em></span>' +
        '<span class="mval">' + fmt(vol, 2) + '</span></div>' +
        '<div class="mrow"><span class="mlab">默认设定（120min/40.5/15%）</span>' +
        '<span class="mtrack"><i style="width:' + Math.min(100, D.ref_wan / 8 * 100) + '%"></i></span>' +
        '<span class="mval">' + fmt(D.ref_wan, 2) + '</span></div>' +
        '<p class="small muted" style="margin:6px 0 0">细线 = 无调控超阈体积 2.09 万 m³（P=50a 概化 SWMM）</p></div>' +
        '<div class="mpanel"><h4>解读</h4><div class="vread">' +
        '<div class="vcell"><div class="vk">可腾容积</div><div class="vv good">' + fmt(vol, 2) + ' 万 m³</div></div>' +
        '<div class="vcell"><div class="vk">≈ 无调控超阈体积的</div><div class="vv">' + fmt(mult, 1) + ' 倍</div></div>' +
        '<div class="vcell"><div class="vk">参与泵站</div><div class="vv">' + D.stations + ' 站</div></div>' +
        '<div class="vcell wide"><div class="vk">公式</div><div class="vv">' + fmt(state.lead, 0) + ' min × 60 × ' + fmt(state.cap, 1) + ' m³/s × ' + fmt(state.alpha, 0) + '% = ' + fmt(vol * 1e4 / 1e4, 2) + ' 万 m³</div></div>' +
        '</div></div>';
    }

    sliders();
    draw();
  }

  /* ================= 10. 厂网一张图（官方骨架同构 · 地图式：缩放/平移/点选/时间条） ================= */
  var NET_STOPS = [
    [0.00, [232, 244, 242]], [0.45, [126, 200, 193]], [0.70, [13, 95, 90]],
    [0.86, [200, 140, 28]], [1.00, [176, 58, 46]]
  ];
  function netColor(f) {
    f = Math.max(0, Math.min(1, f));
    for (var k = 1; k < NET_STOPS.length; k++) {
      if (f <= NET_STOPS[k][0]) {
        var a = NET_STOPS[k - 1], b = NET_STOPS[k];
        var tt = (f - a[0]) / ((b[0] - a[0]) || 1);
        return 'rgb(' + Math.round(a[1][0] + (b[1][0] - a[1][0]) * tt) + ',' +
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * tt) + ',' +
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * tt) + ')';
      }
    }
    return 'rgb(176,58,46)';
  }
  function pumpRingColor(on) {
    return on <= 0 ? '#c9c1ad' : (on === 1 ? '#e0a92e' : (on === 2 ? '#c8791e' : '#b03a2e'));
  }

  function buildNetwork(host) {
    var D = data('network');
    if (!D) return;
    var steps = D.t.length;
    var state = { i: 0, playing: false, speed: 72, last: 0 };
    var view = { k: 1, tx: 0, ty: 0 };
    var raf = null;
    var opts = { labels: true, flow: true };

    /* ---- 世界坐标（0..1）：干线沿距厂距离布置；支线斜向接入（与 fig03 官方骨架同构） ---- */
    var byId = {}, pos = [];
    D.nodes.forEach(function (n, k) { byId[n.id] = k; });
    var KMAX = 10.5;
    function wx(km) { return 0.055 + (1 - km / KMAX) * 0.9; }
    var trunkY = 0.52;
    D.nodes.forEach(function (n, k) {
      if (n.kind !== 'branch') pos[k] = { x: wx(n.km), y: trunkY };
    });
    /* 支线接入点与朝向（1 = 干线上侧，-1 = 下侧）——与官方骨架图一致 */
    var ATT = { B4: ['T03', 1], B2: ['T04', 1], B6: ['T05', -1], B1: ['T09', 1], B3: ['T10', -1], B5: ['T11', -1] };
    var branchOf = {};
    Object.keys(ATT).forEach(function (b) {
      var ap = pos[byId[ATT[b][0]]], side = ATT[b][1];
      for (var j = 1; j <= 5; j++) {
        pos[byId[b + '0' + j]] = { x: ap.x - 0.052 * j, y: trunkY + side * 0.062 * j };
        branchOf[b + '0' + j] = b;
      }
    });
    pos.forEach(function (p) { p.x = Math.min(0.985, Math.max(0.015, p.x)); p.y = Math.min(0.95, Math.max(0.05, p.y)); });
    var plantIdx = byId['PLANT_IN'];
    var pumpByNode = {}, pumpIdxByNode = {};
    D.pumps.forEach(function (pm, pi) { pumpByNode[pm.node] = pm; pumpIdxByNode[pm.node] = pi; });

    /* ---- 控件 ---- */
    var ctl = E('div', 'vctl');
    var btn = E('button', 'vbtn', '▶ 播放');
    btn.type = 'button';
    var spd = E('select', 'vsel');
    var SPEEDS = { '慢': 24, '中': 72, '快': 180 };
    Object.keys(SPEEDS).forEach(function (k) {
      var o = E('option', null, k); o.value = k; spd.appendChild(o);
    });
    spd.value = '中';
    var range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = steps - 1; range.value = 0;
    range.className = 'vrange';
    var jump = E('button', 'vbtn', '⏭ 跳到雨峰');
    jump.type = 'button';
    var zin = E('button', 'vbtn', '＋');
    var zout = E('button', 'vbtn', '－');
    var zreset = E('button', 'vbtn', '⟲ 复位');
    var chipLab = chip('支线编号', true, function () { opts.labels = !opts.labels; chipLab.classList.toggle('on', opts.labels); draw(); });
    var chipFlow = chip('流向动画', true, function () { opts.flow = !opts.flow; chipFlow.classList.toggle('on', opts.flow); draw(); });
    [zin, zout, zreset].forEach(function (b) { b.type = 'button'; });
    ctl.appendChild(btn); ctl.appendChild(spd); ctl.appendChild(range); ctl.appendChild(jump);
    ctl.appendChild(zin); ctl.appendChild(zout); ctl.appendChild(zreset);
    ctl.appendChild(chipLab); ctl.appendChild(chipFlow);
    host.appendChild(ctl);

    var c = chart(host, 470);
    c.pad = { l: 0, r: 0, t: 0, b: 0 };
    var tip = tooltip(c);
    var read = E('div', 'vread');
    host.appendChild(read);
    var detail = E('div', 'note teal');
    detail.style.display = 'none';
    host.appendChild(detail);
    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.innerHTML = '地图操作：滚轮缩放（指向缩放）· 拖拽平移 · 双击放大 · 点节点看详情 · ＋/－/⟲ 复位。' +
      '<b>节点颜色 = 管网液位</b>（每步自适应标尺，越高越暖）；<b>泵站方框</b>（PS01–PS06）外环 = 开机数（灰 0 · 黄 1 · 橙 2 · 红 ≥3）；' +
      '管段上的箭头 = 流向（支线 → 干线 → 厂前）；底部时间条可点击/拖动定位。' +
      '窗口：' + D.note + '；雨强为上海实测驱动，液位/流量/泵站为物理概化模拟（口径见 results）。';
    host.appendChild(note);

    function clampView() {
      view.k = Math.max(0.7, Math.min(5, view.k));
      var w = c.w, h = c.h;
      var minTx = w * 0.3 - w * view.k, maxTx = w * 0.7;
      var minTy = h * 0.25 - h * view.k, maxTy = h * 0.75;
      view.tx = Math.max(minTx, Math.min(maxTx, view.tx));
      view.ty = Math.max(minTy, Math.min(maxTy, view.ty));
    }
    function X(f) { return (30 + f * (c.w - 60)) * view.k + view.tx; }
    function Y(f) { return (16 + f * (c.h - 60)) * view.k + view.ty; }
    function SZ(px) { return px * Math.min(1.9, Math.max(0.8, view.k)); }
    function stepRange(i) {
      var lv = D.lv[i], lo = Infinity, hi = -Infinity;
      for (var k2 = 0; k2 < lv.length; k2++) {
        if (lv[k2] < lo) lo = lv[k2];
        if (lv[k2] > hi) hi = lv[k2];
      }
      if (hi - lo < 20) { var mid = (hi + lo) / 2; lo = mid - 10; hi = mid + 10; }
      return [lo, hi];
    }

    /* ---- 主图绘制 ---- */
    function draw() {
      c.fit();
      var ctx = c.ctx, w = c.w, h = c.h;
      ctx.clearRect(0, 0, w, h);
      var i = state.i;
      var lv = D.lv[i];
      var sr = stepRange(i), stepLo = sr[0], stepHi = sr[1];
      var kz = Math.min(1.9, Math.max(0.8, view.k));

      /* 管段（宽度 = 管径档；颜色 = 两端液位均值；箭头 = 流向） */
      var dashOff = opts.flow ? ((Date.now() / 45) % 14) : 0;
      D.links.forEach(function (l) {
        var a = pos[l[0]], b = pos[l[1]];
        var f = ((lv[l[0]] + lv[l[1]]) / 2 - stepLo) / (stepHi - stepLo);
        var x1 = X(a.x), y1 = Y(a.y), x2 = X(b.x), y2 = Y(b.y);
        ctx.strokeStyle = netColor(f);
        ctx.lineWidth = (l[2] >= 1800 ? 3.6 : (l[2] >= 1400 ? 2.4 : 1.5)) * kz;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (opts.flow) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,.55)';
          ctx.lineWidth = 1.1 * kz;
          ctx.setLineDash([5 * kz, 9 * kz]);
          ctx.lineDashOffset = -dashOff * kz;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.restore();
        }
        /* 流向箭头（中点） */
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var ang = Math.atan2(y2 - y1, x2 - x1);
        var asz = 3.2 * kz;
        ctx.fillStyle = 'rgba(15,37,48,.55)';
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang) * asz, my + Math.sin(ang) * asz);
        ctx.lineTo(mx + Math.cos(ang + 2.5) * asz, my + Math.sin(ang + 2.5) * asz);
        ctx.lineTo(mx + Math.cos(ang - 2.5) * asz, my + Math.sin(ang - 2.5) * asz);
        ctx.closePath(); ctx.fill();
      });

      /* 泵站方框 + 开机外环 */
      D.pumps.forEach(function (pm) {
        var p = pos[pm.node], pi = pumpIdxByNode[pm.node], on = D.pon[i][pi];
        var x = X(p.x), y = Y(p.y);
        var r = SZ(pm.node === plantIdx ? 13 : 8) + 4.5 * kz;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = pumpRingColor(on); ctx.lineWidth = 2.6 * kz; ctx.stroke();
      });

      /* 节点 */
      D.nodes.forEach(function (n, k) {
        var p = pos[k];
        var f = (lv[k] - stepLo) / (stepHi - stepLo);
        var r = SZ(n.kind === 'plant_inlet' ? 12 : (n.kind === 'trunk' ? 7.5 : 5.5));
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
        ctx.fillStyle = netColor(f); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3 * kz; ctx.stroke();
      });

      /* 污水厂（建筑符号 + 名称） */
      var pp = pos[plantIdx];
      var px = X(pp.x), py = Y(pp.y);
      ctx.fillStyle = 'rgba(13,95,90,.12)';
      ctx.strokeStyle = '#0d5f5a'; ctx.lineWidth = 1.6 * kz;
      var bw = 26 * kz, bh = 20 * kz;
      ctx.fillRect(px + 14 * kz, py - bh / 2, bw, bh);
      ctx.strokeRect(px + 14 * kz, py - bh / 2, bw, bh);
      ctx.fillStyle = 'rgba(13,95,90,.65)';
      ctx.fillRect(px + 18 * kz, py - bh / 2 + 4 * kz, 4 * kz, bh - 8 * kz);
      ctx.fillRect(px + 25 * kz, py - bh / 2 + 4 * kz, 4 * kz, bh - 8 * kz);
      ctx.fillRect(px + 32 * kz, py - bh / 2 + 4 * kz, 4 * kz, bh - 8 * kz);
      ctx.fillStyle = '#083f3c';
      ctx.font = '700 ' + Math.round(12 * kz) + 'px system-ui,-apple-system,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('泰和污水厂', px + 14 * kz + bw / 2, py - bh / 2 - 8 * kz);

      /* 标签：干线节点（T01–T12）+ 泵站 + （可选）支线节点（Bx01 与泵站标签重叠，跳过） */
      ctx.font = Math.round(10.5 * kz) + 'px ui-monospace,Consolas,monospace';
      ctx.fillStyle = '#1b3d4a';
      D.nodes.forEach(function (n, k) {
        if (n.kind === 'trunk') ctx.fillText(n.id, X(pos[k].x), Y(pos[k].y) - 15 * kz);
      });
      if (opts.labels) {
        ctx.fillStyle = '#5d6e73';
        ctx.font = Math.round(9 * kz) + 'px ui-monospace,Consolas,monospace';
        D.nodes.forEach(function (n, k) {
          if (n.kind === 'branch' && !/01$/.test(n.id)) ctx.fillText(n.id, X(pos[k].x), Y(pos[k].y) - 11 * kz);
        });
      }
      ctx.font = '700 ' + Math.round(10.5 * kz) + 'px ui-monospace,Consolas,monospace';
      ctx.fillStyle = '#a8691c';
      D.pumps.forEach(function (pm) {
        var p = pos[pm.node];
        ctx.fillText(pm.id, X(p.x), Y(p.y) + 22 * kz);
      });
      ctx.textAlign = 'left';

      /* 距厂距离轴（世界坐标，随缩放平移） */
      ctx.strokeStyle = 'rgba(15,37,48,.35)'; ctx.lineWidth = 1;
      var axy = Y(0.86);
      ctx.beginPath(); ctx.moveTo(X(0.03), axy); ctx.lineTo(X(0.985), axy); ctx.stroke();
      ctx.font = '10px ui-monospace,Consolas,monospace';
      ctx.fillStyle = '#5d6e73';
      ctx.textAlign = 'center';
      [10, 8, 6, 4, 2, 0].forEach(function (km) {
        var x = X(wx(km));
        ctx.beginPath(); ctx.moveTo(x, axy); ctx.lineTo(x, axy + 4); ctx.stroke();
        ctx.fillText(km === 0 ? '0' : '-' + km, x, axy + 14);
      });
      ctx.fillText('距厂距离 (km)', X(0.5), axy + 27);
      ctx.textAlign = 'left';

      /* 色标（左下 · 本步范围 · 屏幕坐标，不随缩放） */
      var lgW = 168, lgH = 10, lgX = 30, lgY = h - 22;
      var grd = ctx.createLinearGradient(lgX, 0, lgX + lgW, 0);
      for (var s = 0; s <= 10; s++) grd.addColorStop(s / 10, netColor(s / 10));
      ctx.fillStyle = grd; ctx.fillRect(lgX, lgY, lgW, lgH);
      ctx.strokeStyle = '#c9c1ad'; ctx.lineWidth = 1; ctx.strokeRect(lgX, lgY, lgW, lgH);
      ctx.fillStyle = '#5d6e73'; ctx.font = '10.5px ui-monospace,Consolas,monospace';
      ctx.fillText('本步 ' + (stepLo / 1000).toFixed(2) + ' m', lgX, lgY - 6);
      ctx.fillText((stepHi / 1000).toFixed(2) + ' m', lgX + lgW - 38, lgY - 6);
      ctx.fillText('×' + view.k.toFixed(1), w - 54, h - 12);
      drawStrip();
    }

    /* ---- 时间条（底部 · 点击/拖动定位） ---- */
    var stripH = 66;
    var strip = E('div', 'vchart');
    var scv = document.createElement('canvas');
    scv.style.height = stripH + 'px';
    scv.style.cursor = 'crosshair';
    strip.appendChild(scv);
    host.appendChild(strip);
    var sctx = scv.getContext('2d');
    var sw = 600;
    function stripFit() {
      sw = Math.max(280, strip.clientWidth || host.clientWidth || 600);
      var dpr = window.devicePixelRatio || 1;
      scv.width = Math.round(sw * dpr);
      scv.height = Math.round(stripH * dpr);
      scv.style.width = '100%';
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function stripX(i) { return 8 + i / (steps - 1) * (sw - 16); }
    function stripI(mx) {
      var i = Math.round((mx - 8) / (sw - 16) * (steps - 1));
      return Math.max(0, Math.min(steps - 1, i));
    }
    function drawStrip() {
      stripFit();
      sctx.clearRect(0, 0, sw, stripH);
      var i, x;
      /* 雨强（柱 · 上半） */
      var rmax = 0;
      for (i = 0; i < steps; i++) if (D.rain[i] > rmax) rmax = D.rain[i];
      sctx.fillStyle = 'rgba(93,110,115,.35)';
      for (i = 0; i < steps; i++) {
        if (D.rain[i] <= 0) continue;
        x = stripX(i);
        var bh = 4 + (D.rain[i] / (rmax || 1)) * 18;
        sctx.fillRect(x - 0.6, 22 - bh, 1.4, bh);
      }
      /* 进厂流量（线 · 下半） */
      var imin = Infinity, imax = -Infinity;
      for (i = 0; i < steps; i++) { if (D.inflow[i] < imin) imin = D.inflow[i]; if (D.inflow[i] > imax) imax = D.inflow[i]; }
      sctx.strokeStyle = '#0d5f5a'; sctx.lineWidth = 1.4;
      sctx.beginPath();
      for (i = 0; i < steps; i++) {
        var y = 48 - (D.inflow[i] - imin) / ((imax - imin) || 1) * 20;
        if (i === 0) sctx.moveTo(stripX(i), y); else sctx.lineTo(stripX(i), y);
      }
      sctx.stroke();
      /* 8000 m³/h 设计能力线 */
      var ycap = 48 - (8000 - imin) / ((imax - imin) || 1) * 20;
      if (ycap > 26 && ycap < 49) {
        sctx.strokeStyle = 'rgba(176,58,46,.55)'; sctx.setLineDash([4, 4]);
        sctx.beginPath(); sctx.moveTo(8, ycap); sctx.lineTo(sw - 8, ycap); sctx.stroke();
        sctx.setLineDash([]);
      }
      /* 播放头 */
      sctx.strokeStyle = '#a8691c'; sctx.lineWidth = 1.6;
      x = stripX(state.i);
      sctx.beginPath(); sctx.moveTo(x, 4); sctx.lineTo(x, 52); sctx.stroke();
      sctx.fillStyle = '#a8691c';
      sctx.beginPath(); sctx.arc(x, 4, 3, 0, Math.PI * 2); sctx.fill();
      sctx.fillStyle = '#5d6e73'; sctx.font = '9.5px ui-monospace,Consolas,monospace';
      sctx.fillText('时间条（点击/拖动定位）· 灰柱=雨强 · 青线=进厂流量 · 红虚线=8000 m³/h · 2024-06-24 → 06-30', 8, stripH - 4);
    }
    var sDrag = false;
    function sSeek(ev) {
      var r = scv.getBoundingClientRect();
      state.i = stripI(ev.clientX - r.left);
      range.value = state.i;
      stopPlay();
      draw(); readout();
    }
    scv.addEventListener('mousedown', function (ev) { sDrag = true; sSeek(ev); });
    window.addEventListener('mousemove', function (ev) { if (sDrag) sSeek(ev); });
    window.addEventListener('mouseup', function () { sDrag = false; });

    function readout() {
      var i = state.i;
      var lv = D.lv[i];
      var onSum = D.pon[i].reduce(function (a, b) { return a + b; }, 0);
      var capSum = D.pumps.reduce(function (a, p) { return a + p.n; }, 0);
      var ratio = D.inflow[i] / 8000;
      var lvl = ratio >= 1.1 ? 4 : (ratio >= 0.95 ? 3 : (ratio >= 0.8 ? 2 : (ratio >= 0.6 ? 1 : 0)));
      read.innerHTML =
        '<div class="vcell"><div class="vk">时刻</div><div class="vv">' + fmtDT(tAt(D.start, D.t[i])) + '</div></div>' +
        '<div class="vcell"><div class="vk">雨强</div><div class="vv">' + fmt(D.rain[i], 1) + ' mm/h</div></div>' +
        '<div class="vcell"><div class="vk">进厂流量</div><div class="vv">' + fmt(D.inflow[i]) + ' m³/h</div></div>' +
        '<div class="vcell"><div class="vk">容量比 · 预警</div><div class="vv">' + fmt(ratio * 100) + '% · ' +
          '<span class="vlevel" style="background:' + LEVEL_COLOR[lvl] + '">' + LEVEL[lvl] + '</span></div></div>' +
        '<div class="vcell"><div class="vk">泵站开机</div><div class="vv">' + onSum + ' / ' + capSum + ' 台</div></div>' +
        '<div class="vcell"><div class="vk">厂前液位</div><div class="vv">' + (lv[plantIdx] / 1000).toFixed(3) + ' m</div></div>';
    }

    function showDetail(k) {
      var n = D.nodes[k], i = state.i;
      var lv = D.lv[i][k] / 1000, fl = D.fl[i][k];
      var kind = n.kind === 'trunk' ? '干线节点' : (n.kind === 'branch' ? '支线节点' : '厂前节点（进水）');
      var extra = '';
      if (branchOf[n.id]) extra = ' · 所属支线 ' + branchOf[n.id] + '（接入 ' + ATT[branchOf[n.id]][0] + '）';
      var pm = pumpByNode[k];
      var cells = '<div class="vcell"><div class="vk">时刻</div><div class="vv">' + fmtDT(tAt(D.start, D.t[i])) + '</div></div>' +
        '<div class="vcell"><div class="vk">液位</div><div class="vv">' + lv.toFixed(3) + ' m</div></div>' +
        '<div class="vcell"><div class="vk">节点流量</div><div class="vv">' + fl + ' m³/h</div></div>';
      if (pm) {
        var pi2 = pumpIdxByNode[k];
        cells += '<div class="vcell wide"><div class="vk">' + pm.id + ' 泵站</div><div class="vv">开机 ' + D.pon[i][pi2] + '/' + pm.n +
          ' 台 · 前池 ' + (D.pwl[i][pi2] / 10).toFixed(1) + ' m · 设计能力 ' + pm.cap + ' m³/h</div></div>';
      }
      detail.innerHTML = '<b>' + n.id + '</b> · ' + kind + ' · 距厂 ' + n.km + ' km' + extra +
        ' <a href="#" class="vd-close" style="margin-left:8px;color:#083f3c">收起</a>' +
        '<div class="vread" style="margin-top:8px">' + cells + '</div>';
      detail.style.display = 'block';
      var cl = detail.querySelector('.vd-close');
      if (cl) cl.addEventListener('click', function (ev) { ev.preventDefault(); detail.style.display = 'none'; });
    }

    function nodeAt(mx, my) {
      var best = -1, bd = 16 * 16;
      D.nodes.forEach(function (n, k) {
        var x = X(pos[k].x), y = Y(pos[k].y);
        var d = (x - mx) * (x - mx) + (y - my) * (y - my);
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    }

    var acc = 0;
    function tick() {
      var dt = state.last ? (Date.now() - state.last) / 1000 : 0;
      state.last = Date.now();
      acc += state.speed * dt;
      var adv = Math.floor(acc);
      acc -= adv;
      if (adv > 0) state.i = Math.min(steps - 1, state.i + adv);
      range.value = state.i;
      draw(); readout();
      if (state.i >= steps - 1) {
        state.playing = false; btn.textContent = '▶ 重播'; btn.classList.remove('on');
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    function stopPlay() {
      if (state.playing) {
        state.playing = false; btn.textContent = '▶ 继续'; btn.classList.remove('on');
        if (raf) cancelAnimationFrame(raf);
      }
    }
    btn.addEventListener('click', function () {
      if (state.playing) { stopPlay(); }
      else {
        if (state.i >= steps - 1) state.i = 0;
        state.playing = true; state.last = 0; btn.textContent = '⏸ 暂停'; btn.classList.add('on');
        raf = requestAnimationFrame(tick);
      }
    });
    spd.addEventListener('change', function () { state.speed = SPEEDS[spd.value] || 72; });
    range.addEventListener('input', function () {
      state.i = parseInt(range.value, 10) || 0;
      stopPlay();
      draw(); readout();
    });
    jump.addEventListener('click', function () {
      var mi = 0;
      for (var k = 1; k < steps; k++) if (D.rain[k] > D.rain[mi]) mi = k;
      state.i = mi; stopPlay();
      range.value = state.i;
      draw(); readout();
    });

    /* 缩放 / 平移 / 双击 */
    function zoomAt(mx, my, factor) {
      var k2 = Math.max(0.7, Math.min(5, view.k * factor));
      var ratio = k2 / view.k;
      view.tx = mx - (mx - view.tx) * ratio;
      view.ty = my - (my - view.ty) * ratio;
      view.k = k2;
      clampView();
      draw();
    }
    c.cv.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = c.cv.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.13 : 1 / 1.13);
    }, { passive: false });
    c.cv.addEventListener('dblclick', function (ev) {
      var r = c.cv.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, 1.5);
    });
    zin.addEventListener('click', function () { zoomAt(c.w / 2, c.h / 2, 1.25); });
    zout.addEventListener('click', function () { zoomAt(c.w / 2, c.h / 2, 1 / 1.25); });
    zreset.addEventListener('click', function () { view.k = 1; view.tx = 0; view.ty = 0; draw(); });

    var drag = null;
    c.cv.style.cursor = 'grab';
    c.cv.addEventListener('mousedown', function (ev) {
      var r = c.cv.getBoundingClientRect();
      drag = { x: ev.clientX - r.left, y: ev.clientY - r.top, tx: view.tx, ty: view.ty, moved: 0 };
      c.cv.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', function (ev) {
      if (!drag) return;
      var r = c.cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (drag.moved < 5) {
        var k = nodeAt(mx, my);
        if (k >= 0) showDetail(k); else detail.style.display = 'none';
      }
      drag = null;
      c.cv.style.cursor = 'grab';
    });

    c.cv.addEventListener('mousemove', function (ev) {
      var r = c.cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (drag) {
        var dx = mx - drag.x, dy = my - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        view.tx = drag.tx + dx; view.ty = drag.ty + dy;
        clampView();
        draw();
        return;
      }
      var best = nodeAt(mx, my);
      if (best < 0) { tip.hide(); c.cv.style.cursor = 'grab'; return; }
      c.cv.style.cursor = 'pointer';
      var n = D.nodes[best], lv = D.lv[state.i][best] / 1000, fl = D.fl[state.i][best];
      var rows = ['<b>' + n.id + '</b>（' + (n.kind === 'trunk' ? '干线' : (n.kind === 'branch' ? '支线' : '厂前')) +
        ' · ' + n.km + ' km）', '液位 ' + lv.toFixed(3) + ' m · 流量 ' + fl + ' m³/h'];
      var pm = pumpByNode[best];
      if (pm) {
        var pi2 = pumpIdxByNode[best];
        rows.push(pm.id + ' 泵站：开机 ' + D.pon[state.i][pi2] + '/' + pm.n + ' 台 · 前池 ' +
          (D.pwl[state.i][pi2] / 10).toFixed(1) + ' m');
      }
      tip.show(X(pos[best].x), 20, rows.join('<br>'));
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });
    onResize(function () { draw(); readout(); });
    draw(); readout();
  }

  /* ================= init ================= */
  var BUILDERS = { event: buildEvent, predict: buildPredict, swmm: buildSwmm, stress: buildStress, models: buildModels, robust: buildRobust, shap: buildShap, delay: buildDelay, benefit: buildBenefit, network: buildNetwork };

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
