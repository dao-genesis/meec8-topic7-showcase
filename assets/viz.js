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
    note.innerHTML = '地图操作：滚轮缩放（指向缩放）· 拖拽平移 · 双击放大 · 点节点看详情（液位/流量/<b>输送延迟 τ = 距厂距离 ÷ 0.8 m/s</b>/泵站前池小图）· ＋/－/⟲ 复位。' +
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
      if (n.tau_h != null) {
        cells += '<div class="vcell wide"><div class="vk">输送延迟 τ = 距厂距离 ÷ v（v = 0.8 m/s）</div>' +
          '<div class="vv">' + n.tau_h.toFixed(2) + ' h（' + n.km + ' km）' +
          (n.lead_h != null ? ' · 窗口互相关领先 ' + n.lead_h.toFixed(2) + ' h（r = ' + n.lead_corr + '）' : '') +
          '</div></div>';
      }
      if (pm) {
        var pi2 = pumpIdxByNode[k];
        cells += '<div class="vcell wide"><div class="vk">' + pm.id + ' 泵站</div><div class="vv">开机 ' + D.pon[i][pi2] + '/' + pm.n +
          ' 台 · 前池 ' + (D.pwl[i][pi2] / 10).toFixed(1) + ' m · 设计能力 ' + pm.cap + ' m³/h</div></div>';
      }
      detail.innerHTML = '<b>' + n.id + '</b> · ' + kind + ' · 距厂 ' + n.km + ' km' + extra +
        ' <a href="#" class="vd-close" style="margin-left:8px;color:#083f3c">收起</a>' +
        '<div class="vread" style="margin-top:8px">' + cells + '</div>';
      detail.style.display = 'block';
      if (pm) {
        /* 泵站前池液位小图（窗口内） */
        var pi3 = pumpIdxByNode[k];
        var wrap = E('div', 'vsl');
        wrap.style.marginTop = '8px';
        var lab = E('span', 'vsl-lab', pm.id + ' 前池液位（' + D.start + ' 起 7 天 · 模拟）');
        wrap.appendChild(lab);
        var cv = document.createElement('canvas');
        var W = 560, Hh = 46;
        cv.style.height = Hh + 'px';
        cv.style.width = '100%';
        wrap.appendChild(cv);
        detail.appendChild(wrap);
        var dpr = window.devicePixelRatio || 1;
        var wpx = Math.max(280, wrap.clientWidth || 560);
        cv.width = Math.round(wpx * dpr);
        cv.height = Math.round(Hh * dpr);
        var c2 = cv.getContext('2d');
        c2.setTransform(dpr, 0, 0, dpr, 0, 0);
        var vals = D.pwl.map(function (row) { return row[pi3] / 10; });
        var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
        var vk = (vmax - vmin) || 1;
        c2.strokeStyle = '#0d5f5a'; c2.lineWidth = 1.3;
        c2.beginPath();
        vals.forEach(function (v, j) {
          var x = 4 + j / (vals.length - 1) * (wpx - 8);
          var y = Hh - 8 - (v - vmin) / vk * (Hh - 18);
          if (j === 0) c2.moveTo(x, y); else c2.lineTo(x, y);
        });
        c2.stroke();
        /* 当前步标记 */
        var xc = 4 + state.i / (vals.length - 1) * (wpx - 8);
        var yc = Hh - 8 - (vals[state.i] - vmin) / vk * (Hh - 18);
        c2.strokeStyle = '#a8691c'; c2.lineWidth = 1.4;
        c2.beginPath(); c2.moveTo(xc, 2); c2.lineTo(xc, Hh - 2); c2.stroke();
        c2.fillStyle = '#a8691c';
        c2.beginPath(); c2.arc(xc, yc, 2.6, 0, Math.PI * 2); c2.fill();
        c2.fillStyle = '#5d6e73'; c2.font = '9.5px ui-monospace,Consolas,monospace';
        c2.fillText('min ' + vmin.toFixed(2) + ' m', 6, 10);
        c2.fillText('max ' + vmax.toFixed(2) + ' m', wpx - 76, 10);
      }
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
      if (n.tau_h != null) rows.push('输送延迟 τ ≈ ' + n.tau_h.toFixed(2) + ' h（领先厂前）');
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

  /* ================= 11. 预警事件尺度指标（阈值尺 · 23 天运行口径时间线 · 双口径命中表） ================= */
  function buildEvents(host) {
    var D = data('events');
    if (!D) return;
    var steps = D.t.length;
    var W = D.window;
    var RMAX = 1.25;

    var leg = E('div', 'vlegend');
    leg.innerHTML = '<span><i style="background:#90caf9"></i>蓝色 ≥ 60%</span>' +
      '<span><i style="background:#ffe082"></i>黄色 ≥ 80%</span>' +
      '<span><i style="background:#ffb74d"></i>橙色 ≥ 95%</span>' +
      '<span><i style="background:#ef9a9a"></i>红色 ≥ 110%</span>' +
      '<span>阈值口径 = 占设计能力 8000 m³/h 的比例（Date1 概化 · 与演示 PPT 一致）</span>';
    host.appendChild(leg);

    var c = chart(host, 282);
    var tip = tooltip(c);
    var read = E('div', 'vread');
    host.appendChild(read);

    function X(i) { return c.pad.l + i / (steps - 1) * (c.w - c.pad.l - c.pad.r); }
    function Y(r) { return c.h - c.pad.b - (r / RMAX) * (c.h - c.pad.t - c.pad.b); }

    function draw() {
      c.fit();
      c.pad = { l: 56, r: 16, t: 92, b: 30 };
      var ctx = c.ctx, w = c.w, h = c.h;
      ctx.clearRect(0, 0, w, h);

      /* ---- 阈值尺（顶部）---- */
      var rx0 = c.pad.l, rx1 = w - c.pad.r, ry = 30, rh = 12;
      var bands = [[0, 0.6, '#d7e8e5'], [0.6, 0.8, '#90caf9'], [0.8, 0.95, '#ffe082'], [0.95, 1.1, '#ffb74d'], [1.1, RMAX, '#ef9a9a']];
      bands.forEach(function (b) {
        var x0 = rx0 + b[0] / RMAX * (rx1 - rx0), x1 = rx0 + b[1] / RMAX * (rx1 - rx0);
        ctx.fillStyle = b[2]; ctx.fillRect(x0, ry, x1 - x0, rh);
      });
      ctx.strokeStyle = '#c9c1ad'; ctx.lineWidth = 1; ctx.strokeRect(rx0, ry, rx1 - rx0, rh);
      ctx.font = '10px ui-monospace,Consolas,monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#5d6e73';
      D.levels.forEach(function (lv) {
        var x = rx0 + lv.ratio / RMAX * (rx1 - rx0);
        ctx.beginPath(); ctx.moveTo(x, ry + rh); ctx.lineTo(x, ry + rh + 4); ctx.strokeStyle = '#a99e85'; ctx.stroke();
        ctx.fillText(lv.name + ' ' + Math.round(lv.ratio * 100) + '%', x, ry - 5);
      });
      /* 窗口最高标记（尺下 · 独立一行，避开刻度文字） */
      var xm = rx0 + W.max_ratio / RMAX * (rx1 - rx0);
      ctx.fillStyle = '#b03a2e';
      ctx.beginPath(); ctx.moveTo(xm, ry + rh + 2); ctx.lineTo(xm - 5, ry + rh + 11); ctx.lineTo(xm + 5, ry + rh + 11); ctx.closePath(); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillText('窗口最高 ' + fmt(W.max_ratio * 100, 1) + '%', Math.min(xm, rx1 - 60), ry + rh + 24);
      ctx.textAlign = 'left';
      ctx.fillText('窗口：' + W.start + ' → ' + W.end + '（23 天 · 15min 抽样）', c.pad.l, 14);

      /* ---- 时间线 ---- */
      var y0 = Y(0), y1 = Y(RMAX);
      /* 阈值横线 */
      D.levels.forEach(function (lv) {
        var y = Y(lv.ratio);
        ctx.strokeStyle = 'rgba(169,158,133,.75)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c.pad.l, y); ctx.lineTo(w - c.pad.r, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#5d6e73'; ctx.font = '9.5px ui-monospace,Consolas,monospace';
        ctx.fillText(Math.round(lv.ratio * 100) + '%', c.pad.l - 30, y + 3);
      });
      /* 面积 + 曲线 */
      ctx.beginPath();
      ctx.moveTo(X(0), y0);
      for (var i = 0; i < steps; i++) ctx.lineTo(X(i), Y(Math.min(RMAX, D.ratio[i])));
      ctx.lineTo(X(steps - 1), y0); ctx.closePath();
      ctx.fillStyle = 'rgba(13,95,90,.12)'; ctx.fill();
      ctx.beginPath();
      for (i = 0; i < steps; i++) {
        var yy = Y(Math.min(RMAX, D.ratio[i]));
        if (i === 0) ctx.moveTo(X(i), yy); else ctx.lineTo(X(i), yy);
      }
      ctx.strokeStyle = '#0d5f5a'; ctx.lineWidth = 1.4; ctx.stroke();
      /* 黄色事件段（① ② …） */
      ctx.font = '10px ui-monospace,Consolas,monospace';
      (W.segs || []).forEach(function (sg, j) {
        var i0 = Math.round(sg.t0 / D.t[steps - 1] * (steps - 1));
        var i1 = Math.round(sg.t1 / D.t[steps - 1] * (steps - 1));
        var x0 = X(i0), x1 = X(i1);
        ctx.fillStyle = 'rgba(224,169,46,.20)';
        ctx.fillRect(x0 - 1, y1, Math.max(4, x1 - x0 + 2), y0 - y1);
        ctx.fillStyle = '#a8691c';
        ctx.beginPath(); ctx.arc((x0 + x1) / 2, Y(Math.min(RMAX, sg.max)), 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillText('黄' + (j + 1), (x0 + x1) / 2 - 6, Y(Math.min(RMAX, sg.max)) - 7);
      });
      /* x 轴日期刻度（每 3 天，逐刻计算日期） */
      var total = D.t[steps - 1];
      var t0ms = new Date(W.start.replace(' ', 'T') + ':00').getTime();
      ctx.fillStyle = '#5d6e73'; ctx.font = '10px ui-monospace,Consolas,monospace';
      ctx.textAlign = 'center';
      for (var day = 0; day <= total; day += 1440 * 3) {
        var i2 = Math.round(day / total * (steps - 1));
        ctx.beginPath(); ctx.moveTo(X(i2), y0); ctx.lineTo(X(i2), y0 + 4); ctx.strokeStyle = '#a99e85'; ctx.stroke();
        var dd = new Date(t0ms + day * 60000);
        ctx.fillText(pad2(dd.getMonth() + 1) + '-' + pad2(dd.getDate()), X(i2), y0 + 15);
      }
      ctx.textAlign = 'left';
    }

    function readout() {
      var yellowH = (W.yellow_steps_5min * 5 / 60).toFixed(1);
      read.innerHTML =
        '<div class="vcell"><div class="vk">窗口</div><div class="vv">' + W.start.slice(5) + ' → ' + W.end.slice(5) + '</div></div>' +
        '<div class="vcell"><div class="vk">窗口最高容量比</div><div class="vv">' + fmt(W.max_ratio * 100, 1) + '%（黄色）</div></div>' +
        '<div class="vcell"><div class="vk">黄色累计</div><div class="vv">' + yellowH + ' h（' + W.yellow_steps_5min + ' 步 × 5min）</div></div>' +
        '<div class="vcell"><div class="vk">橙色 / 红色</div><div class="vv">' + W.orange_steps + ' / ' + W.red_steps + ' 步（0 真实正例）</div></div>' +
        '<div class="vcell"><div class="vk">黄色事件段（演示口径）</div><div class="vv">' + (W.segs || []).length + ' 段</div></div>';
    }

    /* 悬停读数 */
    c.cv.addEventListener('mousemove', function (ev) {
      var r = c.cv.getBoundingClientRect();
      var mx = ev.clientX - r.left;
      var i = Math.round((mx - c.pad.l) / (c.w - c.pad.l - c.pad.r) * (steps - 1));
      if (i < 0 || i >= steps) { tip.hide(); return; }
      var mins = D.t[i];
      var dd = tAt(W.start, mins);
      tip.show(X(i), 12, '<b>' + fmtDT(dd) + '</b><br>容量比 ' + fmt(D.ratio[i] * 100, 1) + '% · ' + D.lvl[i]);
    });
    c.cv.addEventListener('mouseleave', function () { tip.hide(); });

    /* ---- 表一：降雨预报增益（三配置 · 报告 §5.4 / rain_forecast_exp.json） ---- */
    var t1 = E('div', 'vtable');
    var rows1 = D.configs.map(function (cf) {
      return '<tr><td>' + cf.name + '</td><td class="num">' + cf.nse.toFixed(3) + '</td>' +
        '<td class="num">' + cf.yellow.hits + ' / ' + cf.yellow.events + '（' + fmt(cf.yellow.recall * 100) + '%）</td>' +
        '<td class="num">' + cf.yellow.fa + '</td><td class="num">' + cf.orange.fa + '</td></tr>';
    }).join('');
    t1.innerHTML = '<table><tr><th>降雨预报配置</th><th class="num">+2h NSE</th><th class="num">黄色事件命中</th>' +
      '<th class="num">黄色误报段</th><th class="num">橙色误报段</th></tr>' + rows1 + '</table>';
    host.appendChild(t1);

    /* ---- 表二：严格 / 运行双口径（报告 §5.5） ---- */
    var t2 = E('div', 'vtable');
    var rows2 = D.calibers.rows.map(function (r2) {
      var s = (r2.strict_recall == null ? '—' : fmt(r2.strict_recall * 100) + '%') + ' / ' + r2.strict_fa;
      var l = (r2.loose_recall == null ? '—' : fmt(r2.loose_recall * 100) + '%') + ' / ' + r2.loose_fa;
      return '<tr><td>' + r2.level + '</td><td class="num">' + r2.events + '</td><td class="num">' + s + '</td><td class="num">' + l + '</td></tr>';
    }).join('');
    t2.innerHTML = '<table><tr><th>预警级</th><th class="num">事件数</th>' +
      '<th class="num">严格口径 召回 / 误报段</th><th class="num">运行口径 召回 / 误报段</th></tr>' + rows2 + '</table>';
    host.appendChild(t2);

    var note = E('p', 'small muted');
    note.style.margin = '10px 2px 0';
    note.innerHTML = D.note + ' ' + D.calibers.note + ' 出处：<code>reports/warning_demo.csv</code> · <code>reports/rain_forecast_exp.json</code> · 技术报告 §5.4 / §5.5。';
    host.appendChild(note);

    onResize(function () { draw(); });
    draw(); readout();
  }

  /* ================= 12. 调度控制中心（演示 · 场景推演） ================= */
  var CT = { bg: '#0a1418', grid: '#14333b', dim: '#6b8c88', txt: '#cfe6e1', teal: '#0d8f80', light: '#7fd8cd',
             amber: '#e0a92e', red: '#e25c4c', green: '#4fd1a5' };

  function buildControl(host) {
    var D = data('control');
    if (!D) return;
    var st = { mode: 'swmm', strat: 'predict', smodel: 'aug', running: false, prog: 0, raf: null, logs: [], done: false };

    var root = E('div', 'ctrl-root');
    root.innerHTML =
      '<div class="ctrl-topbar">' +
        '<div class="ctrl-lights">' +
          '<span class="ctrl-light"><i></i>模型服务 · LightGBM 分位数（P10–P90）</span>' +
          '<span class="ctrl-light"><i></i>数据链路 · 仓库真源回放</span>' +
          '<span class="ctrl-light"><i class="warn"></i>SCADA · 未接入（演示模式）</span>' +
        '</div>' +
        '<div class="ctrl-clock">演示模式 · <span id="ctrl-clock">--:--:--</span></div>' +
      '</div>' +
      '<div class="ctrl-grid">' +
        '<div class="ctrl-panel">' +
          '<h4>场景推演控制台</h4>' +
          '<div class="ctrl-tabs">' +
            '<button class="ctrl-tab on" data-mode="swmm">调度策略推演</button>' +
            '<button class="ctrl-tab" data-mode="stress">极端雨型推演</button>' +
          '</div>' +
          '<div id="ctrl-params"></div>' +
          '<button class="ctrl-run" id="ctrl-run">▶ 开始推演</button>' +
          '<div class="ctrl-bar"><i id="ctrl-bar"></i></div>' +
          '<div class="ctrl-status" id="ctrl-status">待机 · 选择场景后点击「开始推演」</div>' +
          '<div class="ctrl-log" id="ctrl-log"></div>' +
        '</div>' +
        '<div class="ctrl-panel">' +
          '<h4 id="ctrl-title">主态势 · 厂前入流（m³/s）</h4>' +
          '<div class="vchart" id="ctrl-chart"></div>' +
          '<div class="ctrl-kpis" id="ctrl-kpis"></div>' +
          '<div class="ctrl-legend" id="ctrl-legend"></div>' +
        '</div>' +
        '<div class="ctrl-panel">' +
          '<h4>预警工单（运行口径 · 演示）</h4>' +
          '<div id="ctrl-tickets"></div>' +
          '<h4 style="margin-top:14px">数据资产（DATA_CATALOG 摘要）</h4>' +
          '<div class="ctrl-assets"><table class="ctrl-table" id="ctrl-assets"></table></div>' +
        '</div>' +
      '</div>' +
      '<div class="ctrl-foot" id="ctrl-foot"></div>' +
      '<div class="ctrl-note">' + D.note + '</div>';
    host.appendChild(root);

    var $ = function (id) { return root.querySelector('#' + id); };
    var paramsEl = $('ctrl-params'), runBtn = $('ctrl-run'), barEl = $('ctrl-bar'), statusEl = $('ctrl-status'),
        logEl = $('ctrl-log'), kpiEl = $('ctrl-kpis'), titleEl = $('ctrl-title'), legendEl = $('ctrl-legend');
    var chartBox = $('ctrl-chart');

    /* 时钟 */
    (function clock() {
      var el = $('ctrl-clock');
      function tick() {
        var d = new Date();
        if (el) el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      }
      tick(); setInterval(tick, 1000);
    })();

    /* 工单 + 资产 + 系统状态 */
    var tk = $('ctrl-tickets');
    tk.innerHTML = D.tickets.map(function (t) {
      return '<div class="ctrl-ticket"><span class="id">' + t.id + '</span> · ' + t.time + ' · <b>' + t.level +
        '</b>（峰值 ' + fmt(t.peak * 100, 1) + '% · ' + t.dur_min + ' min）<br>' +
        '<span class="adv">' + t.advice + '</span><br><span class="st">● ' + t.status + '</span></div>';
    }).join('');
    var as = $('ctrl-assets');
    as.innerHTML = '<tr><th>数据</th><th>来源 / 许可</th><th>性质</th></tr>' + D.assets.map(function (a) {
      return '<tr><td>' + a.name + '</td><td>' + a.src + '</td><td>' + a.kind + '</td></tr>';
    }).join('');
    $('ctrl-foot').innerHTML = '<span>模型：' + D.system.model + '</span><span>数据：' + D.system.data + '</span>' +
      '<span>容错：' + D.system.sensors + '</span><span>预警：' + D.system.alert + '</span><span>复现：' + D.system.repro + '</span>';

    /* 参数面板 */
    function renderParams() {
      if (st.mode === 'swmm') {
        paramsEl.innerHTML = '<div class="ctrl-chips" id="ctrl-strats">' + D.strategies.map(function (s) {
          return '<button class="ctrl-chip' + (s.key === st.strat ? ' on' : '') + '" data-strat="' + s.key + '">' + s.name + '</button>';
        }).join('') + '</div><div class="ctrl-note">场景：P=50a 设计暴雨 · 7 天 · 安全阈值 ' + D.safe_cms + ' m³/s · ' + D.inp + '</div>';
        paramsEl.querySelectorAll('[data-strat]').forEach(function (b) {
          b.addEventListener('click', function () { st.strat = b.getAttribute('data-strat'); renderParams(); draw(); });
        });
      } else {
        paramsEl.innerHTML = '<div class="ctrl-chips" id="ctrl-models">' +
          '<button class="ctrl-chip' + (st.smodel === 'base' ? ' on' : '') + '" data-sm="base">基准模型（常规工况训练）</button>' +
          '<button class="ctrl-chip' + (st.smodel === 'aug' ? ' on' : '') + '" data-sm="aug">增广模型（+P5/P50）</button>' +
          '</div><div class="ctrl-note">场景：' + D.stress.note + ' · 洪峰 ' + fmt(D.stress.peak_true) + ' m³/h</div>';
        paramsEl.querySelectorAll('[data-sm]').forEach(function (b) {
          b.addEventListener('click', function () { st.smodel = b.getAttribute('data-sm'); renderParams(); draw(); });
        });
      }
    }

    /* 画布 */
    var cv = document.createElement('canvas');
    cv.style.height = '300px';
    cv.style.width = '100%';
    chartBox.appendChild(cv);
    var ctx = cv.getContext('2d');
    var cw = 600, chh = 300;
    function fit() {
      cw = Math.max(320, chartBox.clientWidth || 640);
      chh = 300;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(chh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var pad = { l: 56, r: 14, t: 16, b: 26 };

    function draw() {
      fit();
      ctx.clearRect(0, 0, cw, chh);
      ctx.fillStyle = CT.bg;
      ctx.fillRect(0, 0, cw, chh);
      if (st.mode === 'swmm') drawSwmm(); else drawStress();
    }

    function axes(xlab, ymax, yfmt) {
      ctx.strokeStyle = CT.grid; ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace,Consolas,monospace';
      ctx.fillStyle = CT.dim;
      for (var i = 0; i <= 4; i++) {
        var y = pad.t + (chh - pad.t - pad.b) * i / 4;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(cw - pad.r, y); ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(yfmt(ymax * (1 - i / 4)), pad.l - 6, y + 3);
      }
      ctx.textAlign = 'center';
      xlab.forEach(function (p) {
        ctx.fillText(p[0], p[1], chh - pad.b + 14);
      });
      ctx.textAlign = 'left';
    }

    function drawSwmm() {
      var T = D.swmm.t, N = T.length;
      var ymax = 6.5;
      var Y = function (v) { return chh - pad.b - (v / ymax) * (chh - pad.t - pad.b); };
      var X = function (i) { return pad.l + i / (N - 1) * (cw - pad.l - pad.r); };
      axes([['07-01', X(0)], ['07-03', X(N * 2 / 6)], ['07-05', X(N * 4 / 6)], ['07-07', X(N - 1)]], ymax, function (v) { return v.toFixed(1); });
      /* 其他策略（淡） */
      D.strategies.forEach(function (s) {
        if (s.key === st.strat) return;
        ctx.strokeStyle = 'rgba(127,216,205,.16)'; ctx.lineWidth = 1;
        ctx.beginPath();
        D.swmm.curves[s.key].forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
        ctx.stroke();
      });
      /* 安全阈值线 */
      var ys = Y(D.safe_cms);
      ctx.strokeStyle = 'rgba(224,169,46,.85)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pad.l, ys); ctx.lineTo(cw - pad.r, ys); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CT.amber; ctx.font = '10px ui-monospace,Consolas,monospace';
      ctx.fillText('安全阈值 ' + D.safe_cms + ' m³/s', pad.l + 6, ys - 5);
      /* 选中策略（按进度揭示） */
      var cur = D.swmm.curves[st.strat];
      var upto = Math.max(1, Math.round(st.prog * (N - 1)));
      ctx.strokeStyle = CT.light; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (var i = 0; i <= upto; i++) { i ? ctx.lineTo(X(i), Y(cur[i])) : ctx.moveTo(X(i), Y(cur[i])); }
      ctx.stroke();
      /* 超阈区（已揭示部分） */
      ctx.fillStyle = 'rgba(224,169,46,.22)';
      ctx.beginPath();
      ctx.moveTo(X(0), ys);
      for (i = 0; i <= upto; i++) ctx.lineTo(X(i), Y(Math.max(cur[i], D.safe_cms)));
      ctx.lineTo(X(upto), ys); ctx.closePath(); ctx.fill();
      /* 进度游标 */
      ctx.strokeStyle = 'rgba(127,216,205,.6)';
      ctx.beginPath(); ctx.moveTo(X(upto), pad.t); ctx.lineTo(X(upto), chh - pad.b); ctx.stroke();
      titleEl.textContent = '主态势 · 厂前入流（m³/s）· ' + D.strategies.filter(function (s) { return s.key === st.strat; })[0].name;
      legendEl.innerHTML = '<span><i style="background:' + CT.light + '"></i>当前策略</span>' +
        '<span><i style="background:rgba(127,216,205,.3)"></i>其他策略（对照）</span>' +
        '<span><i style="background:' + CT.amber + '"></i>超阈区 / 安全阈值</span>';
    }

    function drawStress() {
      var T = D.stress.t, N = T.length;
      var ymax = 60000;
      var Y = function (v) { return chh - pad.b - (v / ymax) * (chh - pad.t - pad.b); };
      var X = function (i) { return pad.l + i / (N - 1) * (cw - pad.l - pad.r); };
      axes([['0h', X(0)], ['6h', X(N * 1 / 4)], ['12h', X(N / 2)], ['18h', X(N * 3 / 4)], ['24h', X(N - 1)]], ymax,
        function (v) { return (v / 1000).toFixed(0) + 'k'; });
      var upto = Math.max(1, Math.round(st.prog * (N - 1)));
      /* 真值 */
      ctx.strokeStyle = CT.light; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var i = 0; i <= upto; i++) { i ? ctx.lineTo(X(i), Y(D.stress.truth[i])) : ctx.moveTo(X(i), Y(D.stress.truth[i])); }
      ctx.stroke();
      /* 模型 */
      var mk = st.smodel === 'aug' ? 'aug' : 'base';
      var mc = st.smodel === 'aug' ? CT.green : CT.red;
      ctx.strokeStyle = mc; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (i = 0; i <= upto; i++) { i ? ctx.lineTo(X(i), Y(D.stress[mk][i])) : ctx.moveTo(X(i), Y(D.stress[mk][i])); }
      ctx.stroke();
      /* 设计能力线 */
      var y8 = Y(8000);
      ctx.strokeStyle = 'rgba(224,169,46,.7)'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y8); ctx.lineTo(cw - pad.r, y8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CT.amber; ctx.font = '10px ui-monospace,Consolas,monospace';
      ctx.fillText('设计能力 8000 m³/h', pad.l + 6, y8 - 5);
      titleEl.textContent = '主态势 · 厂前入流（m³/h）· P=100a 极端雨型';
      legendEl.innerHTML = '<span><i style="background:' + CT.light + '"></i>真值（模拟）</span>' +
        '<span><i style="background:' + CT.red + '"></i>基准模型</span>' +
        '<span><i style="background:' + CT.green + '"></i>增广模型</span>';
    }

    /* KPI（实时累计） */
    function updateKpis(final) {
      if (st.mode === 'swmm') {
        var cur = D.swmm.curves[st.strat], N = cur.length;
        var upto = Math.max(1, Math.round(st.prog * (N - 1)));
        var dtS = (D.swmm.step_min || 5) * 60;
        var peak = 0, overSteps = 0, vol = 0;
        for (var i = 0; i <= upto; i++) {
          if (cur[i] > peak) peak = cur[i];
          if (cur[i] > D.safe_cms) { overSteps++; vol += (cur[i] - D.safe_cms) * dtS; }
        }
        var s = D.strategies.filter(function (x) { return x.key === st.strat; })[0];
        kpiEl.innerHTML =
          kpi('峰值入流', fmt(peak, 2) + ' m³/s', peak > D.safe_cms ? 'bad' : 'good') +
          kpi('超阈历时' + (final ? '（结算）' : '（累计）'), (final ? fmt(s.over_h, 1) : (overSteps * dtS / 3600).toFixed(1)) + ' h', overSteps ? 'warn' : 'good') +
          kpi('超阈体积' + (final ? '（结算）' : '（累计）'), (final ? fmt(s.over_vol, 2) : (vol / 1e4).toFixed(2)) + ' 万m³', vol ? 'warn' : 'good') +
          kpi('前池冒溢（结算）', final ? fmt(s.spill, 2) + ' 万m³' : '—', s.spill_delta > 0.5 ? 'warn' : 'good') +
          kpi('相对无调控削峰', final ? (s.cut >= 0 ? '−' : '+') + fmt(Math.abs(s.cut), 1) + '%' : '—', s.cut > 20 ? 'good' : '');
      } else {
        var N = D.stress.t.length;
        var upto = Math.max(1, Math.round(st.prog * (N - 1)));
        var tp = 0, mp = 0;
        for (var i = 0; i <= upto; i++) {
          if (D.stress.truth[i] > tp) tp = D.stress.truth[i];
          var mv = st.smodel === 'aug' ? D.stress.aug[i] : D.stress.base[i];
          if (mv > mp) mp = mv;
        }
        var errLive = tp > 0 ? (mp - tp) / tp : 0;
        var errFinal = st.smodel === 'aug' ? D.stress.aug_err : D.stress.base_err;
        var err = final ? errFinal : errLive;
        var mpShow = final ? D.stress.peak_true * (1 + errFinal) : mp;
        kpiEl.innerHTML =
          kpi('真值洪峰（模拟）', fmt(final ? D.stress.peak_true : tp) + ' m³/h', '') +
          kpi('模型峰值', fmt(mpShow) + ' m³/h', '') +
          kpi('峰值误差' + (final ? '（结算）' : '（实时）'), (err * 100).toFixed(1) + '%', err < -0.2 ? 'bad' : 'good') +
          kpi('NSE（结算）', final ? (st.smodel === 'aug' ? D.stress.aug_nse.toFixed(3) : D.stress.base_nse.toFixed(3)) : '—',
              st.smodel === 'aug' ? 'good' : 'bad');
      }
    }
    function kpi(k, v, cls) {
      return '<div class="ctrl-kpi"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>';
    }

    /* 日志流 */
    function logSeq() {
      if (st.mode === 'swmm') {
        var s = D.strategies.filter(function (x) { return x.key === st.strat; })[0];
        var verdict = {
          'static': '基线：无调控超阈体积最大（2.09 万m³）',
          'rule': '建议：本地规则削峰 15.8%，但冒溢 +3.3%（需权衡）',
          'predict': '建议：维持「预见性滚动（防冒溢保护）」—— 削峰 28.2% 且冒溢不增',
          'predict_aggressive': '注意：激进限排削峰 89.5%，但冒溢 +6.2%（受纳水体敏感时不建议）'
        }[st.strat];
        return [
          [0.02, '载入 SWMM 概化模型 · ' + D.inp],
          [0.10, '场景：P=50a 设计暴雨 7 天 · 安全阈值 ' + D.safe_cms + ' m³/s'],
          [0.22, '策略：' + s.name],
          [0.40, '仿真推进 …（泵站启停按策略规则 · 5min 步长）'],
          [0.62, '监测：厂前入流超阈累计中 …'],
          [0.80, '结算：超阈历时 / 超阈体积 / 前池冒溢'],
          [0.94, '结果：峰值 ' + fmt(s.peak, 2) + ' m³/s · 超阈 ' + fmt(s.over_h, 1) + ' h · 超阈体积 ' + fmt(s.over_vol, 2) + ' 万m³（' + (s.cut > 0 ? '−' + fmt(s.cut, 1) : '0') + '%）', true],
          [0.99, '前池冒溢 ' + fmt(s.spill, 2) + ' 万m³（' + (s.spill_delta > 0 ? '+' : '') + fmt(s.spill_delta, 1) + '%）→ ' + verdict, true]
        ];
      }
      var m = st.smodel;
      return [
        [0.02, '生成 P=100a 芝加哥雨型（2h · 洪峰 ' + fmt(D.stress.peak_true) + ' m³/h）'],
        [0.12, '加载' + (m === 'aug' ? '增广模型（基准 + P5/P50 设计暴雨）' : '基准模型（2024 汛期基准 92 天）')],
        [0.32, '模型外推中 …（常规工况训练未见过极端场景）'],
        [0.55, '对比：基准模型洪峰误差 ' + fmt(D.stress.base_err * 100, 1) + '% · NSE ' + D.stress.base_nse.toFixed(3)],
        [0.78, '增广：NSE ' + D.stress.base_nse.toFixed(3) + ' → ' + D.stress.aug_nse.toFixed(3) + ' · 峰值误差 ' +
          fmt(D.stress.base_err * 100, 1) + '% → ' + fmt(D.stress.aug_err * 100, 1) + '%', true],
        [0.99, '结论：增广需针对目标雨型设计（台风场景反而负迁移 → 增广非万能）', true]
      ];
    }
    function streamLogs() {
      var seq = logSeq();
      seq.forEach(function (row) {
        if (st.prog >= row[0] && st.logs.indexOf(row[1]) < 0) {
          st.logs.push(row[1]);
          var div = document.createElement('div');
          if (row[2]) div.className = 'hi';
          div.textContent = row[1];
          logEl.appendChild(div);
          logEl.scrollTop = logEl.scrollHeight;
        }
      });
    }

    /* 推演驱动 */
    function start() {
      if (st.running) return;
      st.running = true; st.prog = 0; st.logs = []; st.done = false;
      logEl.innerHTML = '';
      runBtn.disabled = true; runBtn.textContent = '⏳ 推演中…';
      statusEl.textContent = st.mode === 'swmm' ? '推演中 · P=50a 设计暴雨' : '推演中 · P=100a 极端雨型';
      var t0 = performance.now(), dur = 4600;
      (function step(now) {
        st.prog = Math.min(1, (now - t0) / dur);
        barEl.style.width = (st.prog * 100).toFixed(1) + '%';
        draw(); updateKpis(false); streamLogs();
        if (st.prog < 1) { st.raf = requestAnimationFrame(step); }
        else {
          st.running = false; st.done = true;
          runBtn.disabled = false; runBtn.textContent = '⟲ 重新推演';
          statusEl.textContent = '推演完成 · 结果已结算（演示口径）';
          updateKpis(true);
        }
      })(performance.now());
    }

    runBtn.addEventListener('click', start);
    root.querySelectorAll('.ctrl-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        st.mode = b.getAttribute('data-mode');
        root.querySelectorAll('.ctrl-tab').forEach(function (x) { x.classList.toggle('on', x === b); });
        st.logs = []; logEl.innerHTML = '';
        st.prog = 0; st.done = false;
        barEl.style.width = '0%';
        runBtn.textContent = '▶ 开始推演';
        statusEl.textContent = '待机 · 选择场景后点击「开始推演」';
        renderParams(); draw(); updateKpis(false);
      });
    });
    onResize(function () { draw(); });
    renderParams(); draw(); updateKpis(false);
  }

  /* ================= 13. 运营平台 · 地图大屏（一张图） ================= */
  function buildTwin(host) {
    var D = data('network');
    if (!D) return;
    var steps = D.t.length;
    var st = { i: 0, playing: false, speed: 72, last: 0, focus: -1, card: -1 };
    var view = { k: 1, tx: 0, ty: 0 };
    var layers = { pipes: true, level: true, pumps: true, flow: true };
    var raf = null, animT = null;

    /* 世界坐标（0..1）：苏州河横贯，干线沿河南侧，支线斜向入城 */
    var byId = {}, pos = [];
    D.nodes.forEach(function (n, k) { byId[n.id] = k; });
    var KMAX = 10.5;
    function wx(km) { return 0.07 + (1 - km / KMAX) * 0.84; }
    var trunkY = 0.545;
    D.nodes.forEach(function (n, k) { if (n.kind !== 'branch') pos[k] = { x: wx(n.km), y: trunkY }; });
    var ATT = { B4: ['T03', 1], B2: ['T04', 1], B6: ['T05', -1], B1: ['T09', 1], B3: ['T10', -1], B5: ['T11', -1] };
    var branchOf = {};
    Object.keys(ATT).forEach(function (b) {
      var ap = pos[byId[ATT[b][0]]], side = ATT[b][1];
      for (var j = 1; j <= 5; j++) {
        pos[byId[b + '0' + j]] = { x: ap.x - 0.048 * j, y: trunkY + side * 0.058 * j };
        branchOf[b + '0' + j] = b;
      }
    });
    pos.forEach(function (q) { q.x = Math.min(0.985, Math.max(0.015, q.x)); q.y = Math.min(0.95, Math.max(0.05, q.y)); });
    var plantIdx = byId['PLANT_IN'];
    var pumpByNode = {}, pumpIdxByNode = {};
    D.pumps.forEach(function (pm, pi) { pumpByNode[pm.node] = pm; pumpIdxByNode[pm.node] = pi; });

    /* ---- DOM ---- */
    var stage = E('div', 'twin-stage');
    stage.innerHTML =
      '<canvas class="twin-cv"></canvas>' +
      '<div class="twin-top"><div class="twin-title"><i></i>厂站网一体化 · 运营平台（演示）</div>' +
        '<div class="twin-clock"><span id="twin-clock">--:--:--</span> · 数据真源回放</div></div>' +
      '<div class="twin-kpis" id="twin-kpis"></div>' +
      '<div class="twin-left">' +
        '<div class="twin-panel"><h5>图层</h5><div class="twin-chips" id="twin-layers"></div>' +
          '<div class="twin-legend"><span><i style="background:#0d8f80"></i>管网（干线/支线）</span>' +
          '<span><i style="background:#e0a92e"></i>泵站（环=开机数）</span>' +
          '<span><i style="background:#4fd1a5"></i>污水厂（厂前）</span></div></div>' +
        '<div class="twin-panel"><h5>操作</h5><div class="twin-chips" id="twin-ops"></div>' +
          '<div class="twin-legend"><span>滚轮缩放 · 拖拽平移 · 双击放大 · 点节点看数据</span></div></div>' +
      '</div>' +
      '<div class="twin-right">' +
        '<div class="twin-panel" style="flex:1;display:flex;flex-direction:column;min-height:0">' +
          '<h5>泵站（6）· 实时</h5><div id="twin-stas" style="overflow-y:auto"></div></div>' +
      '</div>' +
      '<div class="twin-card" id="twin-card"></div>' +
      '<div class="twin-hint" id="twin-hint">演示模式：管网/液位/泵站为物理概化模拟（2024-06-24 → 06-30 梅雨窗口）· 雨强为上海实测驱动</div>' +
      '<div class="twin-bottom">' +
        '<canvas id="twin-strip"></canvas>' +
        '<div class="twin-ctl">' +
          '<button class="twin-btn" id="twin-play">▶ 播放</button>' +
          '<select class="twin-sel" id="twin-spd"><option>慢</option><option selected>中</option><option>快</option></select>' +
          '<button class="twin-btn" id="twin-peak">⏭ 跳到雨峰</button>' +
          '<span id="twin-tlab" style="margin-left:6px"></span>' +
          '<span style="flex:1"></span><span id="twin-src">出处：data/simulated_realrain/ · 模拟口径</span>' +
        '</div>' +
      '</div>';
    host.appendChild(stage);
    var $ = function (id) { return stage.querySelector('#' + id); };
    var cv = stage.querySelector('.twin-cv');
    var ctx = cv.getContext('2d');
    var cw = 900, chh = 640;
    var card = $('twin-card'), stasEl = $('twin-stas'), kpiEl = $('twin-kpis'), hintEl = $('twin-hint');
    var scv = $('twin-strip'), sctx = scv.getContext('2d');
    var sw = 800, stripH = 44;

    function fit() {
      var r = stage.getBoundingClientRect();
      cw = Math.max(360, r.width); chh = Math.max(320, r.height);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sw = Math.max(280, stage.querySelector('.twin-bottom').clientWidth - 24);
      scv.width = Math.round(sw * dpr); scv.height = Math.round(stripH * dpr);
      scv.style.width = sw + 'px';
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* 面板占位（地图可视区避开两侧面板与顶部 KPI 带） */
    function padRect() {
      return { l: 236, r: 252, t: 116, b: 84 };
    }
    function X(f) { var p = padRect(); return (p.l + f * (cw - p.l - p.r)) * view.k + view.tx; }
    function Y(f) { var p = padRect(); return (p.t + f * (chh - p.t - p.b)) * view.k + view.ty; }
    function SZ(px) { return px * Math.min(2, Math.max(0.75, view.k)); }

    function clampView() {
      view.k = Math.max(0.75, Math.min(5, view.k));
      var mx = cw * 0.5, my = chh * 0.5;
      var minTx = mx - cw * view.k, maxTx = mx + cw * 0.15;
      var minTy = my - chh * view.k, maxTy = my + chh * 0.15;
      view.tx = Math.max(minTx, Math.min(maxTx, view.tx));
      view.ty = Math.max(minTy, Math.min(maxTy, view.ty));
    }

    function levelRange(i) {
      var lv = D.lv[i], lo = Infinity, hi = -Infinity;
      for (var k = 0; k < lv.length; k++) { if (lv[k] < lo) lo = lv[k]; if (lv[k] > hi) hi = lv[k]; }
      if (hi - lo < 20) { var m = (hi + lo) / 2; lo = m - 10; hi = m + 10; }
      return [lo, hi];
    }

    /* ---- 城市底图（程序化：苏州河 + 道路 + 街区） ---- */
    function drawBase() {
      ctx.fillStyle = '#050b12';
      ctx.fillRect(0, 0, cw, chh);
      /* 街区（低对比矩形） */
      var jitter = [[0.08, 0.14], [0.2, 0.1], [0.33, 0.16], [0.46, 0.12], [0.6, 0.15], [0.74, 0.1], [0.88, 0.14],
                    [0.12, 0.62], [0.26, 0.68], [0.4, 0.6], [0.55, 0.66], [0.68, 0.72], [0.82, 0.62]];
      ctx.fillStyle = 'rgba(127,216,205,.035)';
      jitter.forEach(function (j, i2) {
        var x = X(j[0]), y = Y(j[1]);
        var w = SZ(70 + (i2 % 3) * 26), h = SZ(40 + (i2 % 4) * 12);
        ctx.fillRect(x, y, w, h);
      });
      /* 道路 */
      ctx.strokeStyle = 'rgba(127,216,205,.075)'; ctx.lineWidth = 1;
      [0.2, 0.34, 0.48, 0.62, 0.76, 0.9].forEach(function (yy) {
        ctx.beginPath(); ctx.moveTo(X(-0.02), Y(yy)); ctx.lineTo(X(1.02), Y(yy)); ctx.stroke();
      });
      [0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 0.97].forEach(function (xx) {
        ctx.beginPath(); ctx.moveTo(X(xx), Y(-0.02)); ctx.lineTo(X(xx), Y(1.02)); ctx.stroke();
      });
      /* 苏州河（宽波段 + 高光 + 辉光） */
      function river(pts, w1, color, blur) {
        ctx.beginPath();
        ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (var i2 = 1; i2 < pts.length; i2++) {
          var a = pts[i2 - 1], b = pts[i2];
          var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          ctx.quadraticCurveTo(X(a[0]), Y(a[1]), X(mx), Y(my));
        }
        ctx.lineTo(X(pts[pts.length - 1][0]), Y(pts[pts.length - 1][1]));
        ctx.strokeStyle = color; ctx.lineWidth = w1; ctx.lineCap = 'round';
        if (blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      var main = [[-0.04, 0.30], [0.18, 0.27], [0.4, 0.31], [0.62, 0.27], [0.84, 0.30], [1.04, 0.27]];
      river(main, SZ(22), 'rgba(38,120,150,.30)', 0);
      river(main, SZ(9), 'rgba(90,190,220,.35)', 14);
      var trib = [[0.66, -0.04], [0.7, 0.1], [0.74, 0.2], [0.79, 0.285]];
      river(trib, SZ(12), 'rgba(38,120,150,.28)', 0);
      river(trib, SZ(5), 'rgba(90,190,220,.30)', 10);
      /* 地名 */
      ctx.font = '11px ui-monospace,Consolas,monospace';
      ctx.fillStyle = 'rgba(127,216,205,.4)';
      ctx.fillText('苏州河', X(0.30), Y(0.245));
      ctx.fillText('彭越浦', X(0.705), Y(0.13));
      ctx.fillStyle = 'rgba(127,216,205,.22)';
      ctx.fillText('中心城区', X(0.1), Y(0.86));
      ctx.fillText('上游汇水区', X(0.62), Y(0.86));
    }

    /* ---- 管网层 ---- */
    function drawNet() {
      var i = st.i, lv = D.lv[i];
      var sr = levelRange(i), lo = sr[0], hi = sr[1];
      var kz = Math.min(2, Math.max(0.75, view.k));
      var dash = layers.flow ? ((Date.now() / 55) % 16) : 0;
      if (layers.pipes) {
        D.links.forEach(function (l) {
          var a = pos[l[0]], b = pos[l[1]];
          var x1 = X(a.x), y1 = Y(a.y), x2 = X(b.x), y2 = Y(b.y);
          var f = ((lv[l[0]] + lv[l[1]]) / 2 - lo) / (hi - lo);
          var col = layers.level ? netColor(f) : 'rgba(13,143,128,.85)';
          ctx.strokeStyle = col; ctx.lineWidth = (l[2] >= 1800 ? 3.4 : (l[2] >= 1400 ? 2.2 : 1.4)) * kz;
          ctx.lineCap = 'round';
          ctx.shadowColor = col; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.shadowBlur = 0;
          if (layers.flow) {
            ctx.save();
            ctx.strokeStyle = 'rgba(215,245,239,.7)';
            ctx.lineWidth = 1.2 * kz;
            ctx.setLineDash([5 * kz, 11 * kz]);
            ctx.lineDashOffset = -dash * kz;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.restore();
          }
        });
      }
      /* 节点 */
      D.nodes.forEach(function (n, k) {
        var q = pos[k];
        var f = (lv[k] - lo) / (hi - lo);
        var r = SZ(n.kind === 'plant_inlet' ? 9 : (n.kind === 'trunk' ? 5.6 : 4.2));
        ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r, 0, Math.PI * 2);
        ctx.fillStyle = layers.level ? netColor(f) : '#1d6b63';
        ctx.fill();
        ctx.strokeStyle = 'rgba(215,245,239,.75)'; ctx.lineWidth = 1; ctx.stroke();
        if (k === st.focus || k === st.card) {
          ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), r + 5 * kz, 0, Math.PI * 2);
          ctx.strokeStyle = '#7fd8cd'; ctx.lineWidth = 1.6; ctx.stroke();
        }
      });
      /* 泵站（菱形 + 开机环） */
      if (layers.pumps) {
        D.pumps.forEach(function (pm) {
          var q = pos[pm.node], pi = pumpIdxByNode[pm.node], on = D.pon[i][pi];
          var x = X(q.x), y = Y(q.y);
          var r = SZ(8) + 3 * kz;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.strokeStyle = on <= 0 ? '#5d6e73' : (on === 1 ? '#e0a92e' : (on === 2 ? '#c8791e' : '#e25c4c'));
          ctx.lineWidth = 2.4 * kz; ctx.stroke();
          ctx.save();
          ctx.translate(x, y); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = 'rgba(224,169,46,.9)';
          var s2 = SZ(5.4);
          ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2);
          ctx.restore();
          ctx.font = '700 ' + Math.round(10 * kz) + 'px ui-monospace,Consolas,monospace';
          ctx.fillStyle = '#e0a92e'; ctx.textAlign = 'center';
          ctx.fillText(pm.id, x, y + 20 * kz);
          ctx.textAlign = 'left';
        });
      }
      /* 污水厂（建筑符号） */
      var pq = pos[plantIdx], px = X(pq.x), py = Y(pq.y);
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = 'rgba(79,209,165,.16)';
      ctx.strokeStyle = '#4fd1a5'; ctx.lineWidth = 1.6 * kz;
      var bw = 30 * kz, bh = 22 * kz;
      ctx.fillRect(6 * kz, -bh / 2, bw, bh);
      ctx.strokeRect(6 * kz, -bh / 2, bw, bh);
      ctx.fillStyle = 'rgba(79,209,165,.7)';
      [10, 18, 26].forEach(function (o) { ctx.fillRect(o * kz, -bh / 2 + 4 * kz, 4 * kz, bh - 8 * kz); });
      ctx.restore();
      ctx.font = '700 ' + Math.round(11 * kz) + 'px system-ui,-apple-system,"Segoe UI",sans-serif';
      ctx.fillStyle = '#4fd1a5'; ctx.textAlign = 'center';
      ctx.fillText('泰和污水厂', px + 21 * kz, py - bh / 2 - 8 * kz);
      ctx.textAlign = 'left';
    }

    function drawStrip() {
      sctx.clearRect(0, 0, sw, stripH);
      var i, x;
      var rmax = 0;
      for (i = 0; i < steps; i++) if (D.rain[i] > rmax) rmax = D.rain[i];
      sctx.fillStyle = 'rgba(127,216,205,.28)';
      for (i = 0; i < steps; i++) {
        if (D.rain[i] <= 0) continue;
        x = 6 + i / (steps - 1) * (sw - 12);
        var bh = 3 + (D.rain[i] / (rmax || 1)) * 14;
        sctx.fillRect(x - 0.5, 18 - bh, 1.2, bh);
      }
      var imin = Infinity, imax = -Infinity;
      for (i = 0; i < steps; i++) { if (D.inflow[i] < imin) imin = D.inflow[i]; if (D.inflow[i] > imax) imax = D.inflow[i]; }
      sctx.strokeStyle = '#0d8f80'; sctx.lineWidth = 1.3;
      sctx.beginPath();
      for (i = 0; i < steps; i++) {
        var y = 38 - (D.inflow[i] - imin) / ((imax - imin) || 1) * 16;
        if (i === 0) sctx.moveTo(6 + i / (steps - 1) * (sw - 12), y);
        else sctx.lineTo(6 + i / (steps - 1) * (sw - 12), y);
      }
      sctx.stroke();
      var ycap = 38 - (8000 - imin) / ((imax - imin) || 1) * 16;
      if (ycap > 20 && ycap < 39) {
        sctx.strokeStyle = 'rgba(224,169,46,.6)'; sctx.setLineDash([4, 4]);
        sctx.beginPath(); sctx.moveTo(6, ycap); sctx.lineTo(sw - 6, ycap); sctx.stroke(); sctx.setLineDash([]);
      }
      x = 6 + st.i / (steps - 1) * (sw - 12);
      sctx.strokeStyle = '#e0a92e'; sctx.lineWidth = 1.5;
      sctx.beginPath(); sctx.moveTo(x, 2); sctx.lineTo(x, stripH - 2); sctx.stroke();
      sctx.fillStyle = '#7fd8cd'; sctx.font = '9.5px ui-monospace,Consolas,monospace';
      sctx.fillText('时间轴 · 06-24 → 06-30（点击/拖动定位）· 灰柱=雨强 · 青线=进厂流量 · 黄虚线=8000 m³/h', 8, stripH - 3);
    }

    function draw() {
      drawBase();
      drawRain();
      drawNet();
      drawAlert();
      drawHoverTip();
      drawStrip();
    }

    /* 雨效：雨强 > 0 时地图上落雨（数字孪生氛围） */
    function drawRain() {
      var r = D.rain[st.i];
      if (!r || r <= 0.05) return;
      var n = Math.min(140, Math.round(r * 26));
      var tnow = Date.now() / 1000;
      var p = padRect();
      var w = cw - p.l - p.r, h = chh - p.t - p.b;
      ctx.strokeStyle = 'rgba(127,216,205,.30)';
      ctx.lineWidth = 1;
      for (var i2 = 0; i2 < n; i2++) {
        var fx = ((i2 * 97) % 100) / 100, fy = ((i2 * 61) % 100) / 100;
        var x = p.l + fx * w, y = p.t + ((fy + tnow * 0.22) % 1) * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 9);
        ctx.stroke();
      }
    }

    /* 告警呼吸：容量比越限时，厂前节点脉冲 */
    function drawAlert() {
      var ratio = D.inflow[st.i] / 8000;
      if (ratio < 0.8) return;
      var col = ratio >= 1.1 ? 'rgba(226,92,76,' : (ratio >= 0.95 ? 'rgba(200,121,30,' : 'rgba(224,169,46,');
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 320);
      var pq = pos[plantIdx];
      var x = X(pq.x), y = Y(pq.y);
      for (var ring = 1; ring <= 2; ring++) {
        ctx.beginPath();
        ctx.arc(x + 20 * SZ(1), y, (18 + ring * 13 + pulse * 6) * SZ(1), 0, Math.PI * 2);
        ctx.strokeStyle = col + (0.55 / ring * (0.5 + pulse * 0.5)) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    /* 悬停读数（画布内小卡） */
    function drawHoverTip() {
      if (hover < 0) return;
      var n = D.nodes[hover], i = st.i;
      var q = pos[hover];
      var lv = (D.lv[i][hover] / 1000).toFixed(3), fl = D.fl[i][hover];
      var l1 = n.id + ' · ' + (n.kind === 'trunk' ? '干线' : (n.kind === 'branch' ? '支线' : '厂前'));
      var l2 = '液位 ' + lv + ' m · 流量 ' + fl + ' m³/h' + (n.tau_h != null ? ' · τ ' + n.tau_h.toFixed(2) + ' h' : '');
      ctx.font = '10.5px ui-monospace,Consolas,monospace';
      var wpx = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16;
      var x = Math.min(cw - wpx - 8, Math.max(8, X(q.x) - wpx / 2));
      var y = Math.max(6, Y(q.y) - 52);
      ctx.fillStyle = 'rgba(8,20,24,.94)';
      ctx.strokeStyle = '#2c8f80'; ctx.lineWidth = 1;
      ctx.fillRect(x, y, wpx, 36);
      ctx.strokeRect(x, y, wpx, 36);
      ctx.fillStyle = '#d7f5ef'; ctx.fillText(l1, x + 8, y + 14);
      ctx.fillStyle = '#8fb0ab'; ctx.fillText(l2, x + 8, y + 28);
    }

    /* ---- 面板 ---- */
    function kpis() {
      var i = st.i;
      var onSum = D.pon[i].reduce(function (a, b) { return a + b; }, 0);
      var capSum = D.pumps.reduce(function (a, p) { return a + p.n; }, 0);
      var ratio = D.inflow[i] / 8000;
      var lvl = ratio >= 1.1 ? 4 : (ratio >= 0.95 ? 3 : (ratio >= 0.8 ? 2 : (ratio >= 0.6 ? 1 : 0)));
      var t = tAt(D.start, D.t[i]);
      kpiEl.innerHTML =
        '<div class="twin-kpi"><div class="k">时刻</div><div class="v">' + fmtDT(t) + '</div></div>' +
        '<div class="twin-kpi"><div class="k">进厂流量</div><div class="v">' + fmt(D.inflow[i]) + ' m³/h</div></div>' +
        '<div class="twin-kpi"><div class="k">容量比 · 预警</div><div class="v ' + (lvl >= 2 ? 'warn' : 'good') + '">' +
          fmt(ratio * 100) + '% · ' + LEVEL[lvl] + '</div></div>' +
        '<div class="twin-kpi"><div class="k">泵站开机</div><div class="v">' + onSum + ' / ' + capSum + ' 台</div></div>' +
        '<div class="twin-kpi"><div class="k">厂前液位</div><div class="v">' + (D.lv[i][plantIdx] / 1000).toFixed(3) + ' m</div></div>';
      $('twin-tlab').textContent = '当前：' + fmtDT(t) + ' · 雨强 ' + fmt(D.rain[i], 1) + ' mm/h';
    }

    function stas() {
      var i = st.i;
      stasEl.innerHTML = D.pumps.map(function (pm) {
        var pi = pumpIdxByNode[pm.node];
        var on = D.pon[i][pi], wl = D.pwl[i][pi] / 10;
        var nm = D.nodes[pm.node].id;
        var pct = Math.max(4, Math.min(100, wl / 3 * 100));
        return '<div class="twin-sta' + (st.focus === pm.node ? ' on' : '') + '" data-k="' + pm.node + '">' +
          '<span><b>' + pm.id + '</b> · ' + nm + '</span>' +
          '<span>开机 ' + on + '/' + pm.n + '<span class="wl"><i class="' + (wl >= 2.2 ? 'hi' : '') +
          '" style="width:' + pct.toFixed(0) + '%"></i></span> ' + wl.toFixed(1) + ' m</span></div>';
      }).join('');
      Array.prototype.forEach.call(stasEl.children, function (el) {
        el.addEventListener('click', function () {
          var k = parseInt(el.getAttribute('data-k'), 10);
          st.focus = k; focusOn(k); stas(); card_(k);
        });
      });
    }

    function focusOn(k) {
      var q = pos[k];
      view.k = 1.9;
      var p = padRect();
      view.tx = cw / 2 - (p.l + q.x * (cw - p.l - p.r)) * view.k;
      view.ty = chh / 2 - (p.t + q.y * (chh - p.t - p.b)) * view.k;
      clampView(); draw();
    }

    function card_(k) {
      var n = D.nodes[k], i = st.i;
      st.card = k;
      var lv = D.lv[i][k] / 1000, fl = D.fl[i][k];
      var kind = n.kind === 'trunk' ? '干线节点' : (n.kind === 'branch' ? '支线节点' : '厂前节点（进水）');
      var html = '<span class="close" id="twin-cclose">✕</span><h6>' + n.id + ' · ' + kind + '</h6>' +
        '<div class="kv">距厂 <b>' + n.km + ' km</b>' + (n.tau_h != null ? ' · 输送延迟 τ <b>' + n.tau_h.toFixed(2) + ' h</b>' : '') +
        (n.lead_h != null ? ' · 互相关领先 <b>' + n.lead_h.toFixed(2) + ' h</b>（r=' + n.lead_corr + '）' : '') + '</div>' +
        '<div class="kv">液位 <b>' + lv.toFixed(3) + ' m</b> · 节点流量 <b>' + fl + ' m³/h</b></div>';
      var pm = pumpByNode[k];
      if (pm) {
        var pi = pumpIdxByNode[k];
        html += '<div class="kv">' + pm.id + ' 泵站：开机 <b>' + D.pon[i][pi] + '/' + pm.n + '</b> 台 · 前池 <b>' +
          (D.pwl[i][pi] / 10).toFixed(1) + ' m</b> · 能力 ' + pm.cap + ' m³/h</div>' +
          '<canvas id="twin-spark" style="width:100%;height:40px;margin-top:6px"></canvas>';
      }
      if (branchOf[n.id]) html += '<div class="kv">所属支线 ' + branchOf[n.id] + '（接入 ' + ATT[branchOf[n.id]][0] + '）</div>';
      card.innerHTML = html;
      card.classList.add('show');
      var cl = $('twin-cclose');
      if (cl) cl.addEventListener('click', function () { card.classList.remove('show'); st.card = -1; draw(); });
      var sp = $('twin-spark');
      if (sp && pm) {
        var pi2 = pumpIdxByNode[k];
        var vals = D.pwl.map(function (row) { return row[pi2] / 10; });
        var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
        var vk = (vmax - vmin) || 1;
        var dpr = window.devicePixelRatio || 1;
        var wpx = Math.max(200, card.clientWidth - 24);
        sp.width = Math.round(wpx * dpr); sp.height = Math.round(40 * dpr);
        var c2 = sp.getContext('2d');
        c2.setTransform(dpr, 0, 0, dpr, 0, 0);
        c2.strokeStyle = '#7fd8cd'; c2.lineWidth = 1.2;
        c2.beginPath();
        vals.forEach(function (v, j) {
          var x = 2 + j / (vals.length - 1) * (wpx - 4);
          var y = 34 - (v - vmin) / vk * 26;
          if (j === 0) c2.moveTo(x, y); else c2.lineTo(x, y);
        });
        c2.stroke();
        var xc = 2 + st.i / (vals.length - 1) * (wpx - 4);
        c2.strokeStyle = '#e0a92e';
        c2.beginPath(); c2.moveTo(xc, 2); c2.lineTo(xc, 38); c2.stroke();
        c2.fillStyle = '#8fb0ab'; c2.font = '9px ui-monospace,Consolas,monospace';
        c2.fillText('前池液位 ' + vmin.toFixed(2) + '–' + vmax.toFixed(2) + ' m（窗口）', 4, 10);
      }
      draw();
    }

    /* 悬停 + 点选 */
    function nodeAt(mx, my) {
      var best = -1, bd = 18 * 18;
      D.nodes.forEach(function (n, k) {
        var x = X(pos[k].x), y = Y(pos[k].y);
        var d = (x - mx) * (x - mx) + (y - my) * (y - my);
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    }
    var drag = null, hover = -1;
    cv.addEventListener('mousedown', function (ev) {
      var r = cv.getBoundingClientRect();
      drag = { x: ev.clientX - r.left, y: ev.clientY - r.top, tx: view.tx, ty: view.ty, moved: 0 };
      cv.classList.add('grabbing');
    });
    window.addEventListener('mouseup', function (ev) {
      if (!drag) return;
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (drag.moved < 5) {
        var k = nodeAt(mx, my);
        if (k >= 0) { st.focus = k; card_(k); stas(); } else { card.classList.remove('show'); st.card = -1; }
        draw();
      }
      drag = null; cv.classList.remove('grabbing');
    });
    cv.addEventListener('mousemove', function (ev) {
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      if (drag) {
        var dx = mx - drag.x, dy = my - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        view.tx = drag.tx + dx; view.ty = drag.ty + dy;
        clampView(); draw(); return;
      }
      var k = nodeAt(mx, my);
      if (k !== hover) { hover = k; cv.style.cursor = k >= 0 ? 'pointer' : 'grab'; draw(); }
    });
    cv.addEventListener('mouseleave', function () { if (hover >= 0) { hover = -1; draw(); } });
    /* 滚轮缩放：整个地图区域生效（面板/卡片/底栏上的滚轮留给页面滚动） */
    stage.addEventListener('wheel', function (ev) {
      var tgt = ev.target;
      if (tgt && tgt.closest && tgt.closest('.twin-panel, .twin-card, .twin-bottom')) return;
      ev.preventDefault();
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var k2 = Math.max(0.75, Math.min(5, view.k * (ev.deltaY < 0 ? 1.14 : 1 / 1.14)));
      var ratio = k2 / view.k;
      view.tx = mx - (mx - view.tx) * ratio;
      view.ty = my - (my - view.ty) * ratio;
      view.k = k2; clampView(); draw();
    }, { passive: false });
    cv.addEventListener('dblclick', function (ev) {
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var k2 = Math.min(5, view.k * 1.5), ratio = k2 / view.k;
      view.tx = mx - (mx - view.tx) * ratio;
      view.ty = my - (my - view.ty) * ratio;
      view.k = k2; clampView(); draw();
    });

    /* 时间轴 */
    var sDrag = false;
    function seek(ev) {
      var r = scv.getBoundingClientRect();
      var i = Math.round((ev.clientX - r.left - 6) / (sw - 12) * (steps - 1));
      st.i = Math.max(0, Math.min(steps - 1, i));
      stopPlay(); draw(); kpis(); stas();
      if (st.card >= 0) card_(st.card);
    }
    scv.addEventListener('mousedown', function (ev) { sDrag = true; seek(ev); });
    window.addEventListener('mousemove', function (ev) { if (sDrag) seek(ev); });
    window.addEventListener('mouseup', function () { sDrag = false; });

    var acc = 0;
    function tick() {
      var dt = st.last ? (Date.now() - st.last) / 1000 : 0;
      st.last = Date.now();
      acc += st.speed * dt;
      var adv = Math.floor(acc); acc -= adv;
      if (adv > 0) st.i = Math.min(steps - 1, st.i + adv);
      draw(); kpis(); stas();
      if (st.i >= steps - 1) { st.playing = false; $('twin-play').textContent = '▶ 重播'; $('twin-play').classList.remove('on'); return; }
      raf = requestAnimationFrame(tick);
    }
    function stopPlay() {
      if (st.playing) { st.playing = false; $('twin-play').textContent = '▶ 继续'; $('twin-play').classList.remove('on'); if (raf) cancelAnimationFrame(raf); }
    }
    $('twin-play').addEventListener('click', function () {
      if (st.playing) { stopPlay(); return; }
      if (st.i >= steps - 1) st.i = 0;
      st.playing = true; st.last = 0; $('twin-play').textContent = '⏸ 暂停'; $('twin-play').classList.add('on');
      raf = requestAnimationFrame(tick);
    });
    $('twin-spd').addEventListener('change', function () {
      st.speed = { '慢': 24, '中': 72, '快': 180 }[$('twin-spd').value] || 72;
    });
    $('twin-peak').addEventListener('click', function () {
      var mi = 0;
      for (var k = 1; k < steps; k++) if (D.rain[k] > D.rain[mi]) mi = k;
      st.i = mi; stopPlay(); draw(); kpis(); stas();
      if (st.card >= 0) card_(st.card);
    });

    /* 图层 + 操作 */
    var LAY = [['pipes', '管网'], ['level', '液位热力'], ['pumps', '泵站'], ['flow', '流向动画']];
    var layEl = $('twin-layers');
    layEl.innerHTML = LAY.map(function (l) {
      return '<button class="twin-chip' + (layers[l[0]] ? ' on' : '') + '" data-l="' + l[0] + '">' + l[1] + '</button>';
    }).join('');
    Array.prototype.forEach.call(layEl.children, function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-l');
        layers[k] = !layers[k];
        b.classList.toggle('on', layers[k]);
        draw();
      });
    });
    $('twin-ops').innerHTML = '<button class="twin-chip" data-op="in">＋ 放大</button>' +
      '<button class="twin-chip" data-op="out">－ 缩小</button>' +
      '<button class="twin-chip" data-op="reset">⟲ 复位</button>';
    Array.prototype.forEach.call($('twin-ops').children, function (b) {
      b.addEventListener('click', function () {
        var op = b.getAttribute('data-op');
        if (op === 'reset') { view.k = 1; view.tx = 0; view.ty = 0; }
        else {
          var k2 = Math.max(0.75, Math.min(5, view.k * (op === 'in' ? 1.3 : 1 / 1.3)));
          var ratio = k2 / view.k;
          view.tx = cw / 2 - (cw / 2 - view.tx) * ratio;
          view.ty = chh / 2 - (chh / 2 - view.ty) * ratio;
          view.k = k2;
        }
        clampView(); draw();
      });
    });

    /* 时钟 */
    setInterval(function () {
      var d = new Date();
      var el = $('twin-clock');
      if (el) el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }, 1000);

    onResize(function () { fit(); draw(); });
    fit(); draw(); kpis(); stas();
    /* 底图微动（流向动画常亮 · 低频重绘） */
    animT = setInterval(function () {
      if (!st.playing && (layers.flow || D.rain[st.i] > 0.05 || D.inflow[st.i] / 8000 >= 0.8)) draw();
    }, 110);
  }

  /* ================= init ================= */
  var BUILDERS = { event: buildEvent, predict: buildPredict, swmm: buildSwmm, stress: buildStress, models: buildModels, robust: buildRobust, shap: buildShap, delay: buildDelay, benefit: buildBenefit, network: buildNetwork, events: buildEvents, control: buildControl, twin: buildTwin };

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
