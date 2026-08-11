/* SVG grafik katmanı — harici kütüphane yok.
 *
 * Uyulan kurallar (dataviz):
 *  - Kategorik renkler sabit palet yuvalarından gelir, sıralamaya göre değişmez.
 *    Dilimler/çubuklar yuva sırasında çizilir, böylece komşu çiftler paletin
 *    doğrulanmış komşu çiftleridir.
 *  - Tek eksen; asla iki y ekseni. Farklı büyüklükteki ölçüler ayrı grafiğe gider.
 *  - Çubuk kalınlığı <= 24px, veri ucu 4px yuvarlatılmış, taban köşeli.
 *  - Dokunan yüzeyler arasında 2px yüzey boşluğu; nokta işaretçilerde 2px yüzey halkası.
 *  - Çizgiler 2px; ızgara ve eksenler hairline ve geri planda.
 *  - Metin asla seri rengini giymez; kimlik metnin yanındaki renkli işaretten gelir.
 *  - Her grafikte hover + tooltip katmanı var.
 */
var Charts = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var GAP = 2;                 // yüzey boşluğu / halka kalınlığı
  var MAX_BAR = 24;            // çubuk kalınlığı tavanı
  var RADIUS = 4;              // veri ucu yuvarlaması

  /* ---- Küçük yardımcılar ---- */

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) {
      node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  function seriesVar(slot) {
    return slot >= 1 ? "var(--series-" + slot + ")" : "var(--series-neutral)";
  }

  // Taban köşeli, veri ucu yuvarlatılmış dikey çubuk.
  function columnPath(x, y, w, h, r) {
    if (h <= 0.5) return "";
    var rr = Math.min(r, w / 2, h);
    return "M" + x + "," + (y + h) +
           "V" + (y + rr) +
           "Q" + x + "," + y + " " + (x + rr) + "," + y +
           "H" + (x + w - rr) +
           "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + rr) +
           "V" + (y + h) + "Z";
  }

  // Eksende okunaklı yuvarlak basamaklar (0 / 5.000 / 10.000 …)
  function niceTicks(max, count) {
    if (!(max > 0)) return { ticks: [0], max: 1 };
    var raw = max / (count || 4);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var ticks = [];
    for (var v = 0; v <= max + step * 0.0001; v += step) ticks.push(Util.round2(v));
    if (ticks[ticks.length - 1] < max) ticks.push(Util.round2(ticks[ticks.length - 1] + step));
    return { ticks: ticks, max: ticks[ticks.length - 1] };
  }

  /* ---- Tooltip (tek örnek) ---- */

  var tip = null;
  function tooltip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "viz-tooltip";
      tip.setAttribute("role", "status");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showTip(html, event) {
    var t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    var pad = 12;
    var rect = t.getBoundingClientRect();
    var x = event.clientX + pad;
    var y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    t.style.left = Math.max(8, x) + "px";
    t.style.top = Math.max(8, y) + "px";
  }

  function hideTip() { if (tip) tip.hidden = true; }

  function tipRow(label, value, slot) {
    return '<div class="viz-tooltip__row">' +
           (slot === undefined ? "" : '<span class="viz-swatch" style="background:' + seriesVar(slot) + '"></span>') +
           '<span class="viz-tooltip__label">' + Util.esc(label) + "</span>" +
           '<span class="viz-tooltip__value">' + Util.esc(value) + "</span></div>";
  }

  function bindTip(node, htmlFn) {
    node.addEventListener("mousemove", function (e) { showTip(htmlFn(), e); });
    node.addEventListener("mouseenter", function (e) { showTip(htmlFn(), e); });
    node.addEventListener("mouseleave", hideTip);
  }

  /* ---- Boyutlandırma: gerçek piksel genişliğinde çiz, yeniden boyutlanınca tekrar çiz ---- */

  var redraws = new WeakMap();
  var observer = null;

  function ensureObserver() {
    if (observer || typeof ResizeObserver === "undefined") return;
    var pending = null;
    observer = new ResizeObserver(function (entries) {
      if (pending) cancelAnimationFrame(pending);
      var nodes = entries.map(function (e) { return e.target; });
      pending = requestAnimationFrame(function () {
        pending = null;
        nodes.forEach(function (node) {
          var fn = redraws.get(node);
          if (fn && node.clientWidth > 0) fn();
        });
      });
    });
  }

  function mount(container, height, draw) {
    if (!container) return;
    var run = function () {
      var w = container.clientWidth;
      if (!w) return;
      container.innerHTML = "";
      var svg = el("svg", {
        width: w, height: height, viewBox: "0 0 " + w + " " + height,
        class: "viz-svg", role: "img"
      });
      container.appendChild(svg);
      draw(svg, w, height);
    };
    redraws.set(container, run);
    ensureObserver();
    if (observer) observer.observe(container);
    run();
  }

  function emptyState(svg, w, h, message) {
    var t = el("text", {
      x: w / 2, y: h / 2, "text-anchor": "middle", "dominant-baseline": "middle",
      class: "viz-empty"
    });
    t.textContent = message || "Bu dönemde kayıt yok";
    svg.appendChild(t);
  }

  /* ---- Donut: kategori dağılımı ---- */

  function donut(container, slices, opts) {
    opts = opts || {};
    mount(container, opts.height || 260, function (svg, w, h) {
      var total = slices.reduce(function (a, s) { return a + s.amount; }, 0);
      if (!total) { emptyState(svg, w, h, opts.empty); return; }

      var cx = w / 2, cy = h / 2;
      var outer = Math.min(w, h) / 2 - 6;
      var inner = outer * 0.62;
      var mid = (outer + inner) / 2;

      // 2px yüzey boşluğu: her dilimi iki ucundan açısal olarak içeri al.
      // Tek dilimde ayıracak komşu yok — halkayı boşuna kesmiyoruz.
      var gapAngle = slices.length > 1 ? GAP / mid : 0;
      var angle = -Math.PI / 2;
      var group = el("g", {});
      svg.appendChild(group);

      slices.forEach(function (s) {
        var span = (s.amount / total) * Math.PI * 2;
        if (span <= 0) return;
        var pad = Math.min(gapAngle / 2, span / 4);
        var a0 = angle + pad, a1 = angle + span - pad;
        angle += span;

        var large = (a1 - a0) > Math.PI ? 1 : 0;
        var x0 = cx + outer * Math.cos(a0), y0 = cy + outer * Math.sin(a0);
        var x1 = cx + outer * Math.cos(a1), y1 = cy + outer * Math.sin(a1);
        var x2 = cx + inner * Math.cos(a1), y2 = cy + inner * Math.sin(a1);
        var x3 = cx + inner * Math.cos(a0), y3 = cy + inner * Math.sin(a0);

        var d = "M" + x0 + "," + y0 +
                "A" + outer + "," + outer + " 0 " + large + " 1 " + x1 + "," + y1 +
                "L" + x2 + "," + y2 +
                "A" + inner + "," + inner + " 0 " + large + " 0 " + x3 + "," + y3 + "Z";

        var path = el("path", { d: d, class: "viz-slice" });
        path.style.fill = seriesVar(s.slot);
        group.appendChild(path);

        bindTip(path, function () {
          return tipRow(s.name, Util.money(s.amount), s.slot) +
                 tipRow("Pay", Util.pct(s.share, 1));
        });
        path.addEventListener("mouseenter", function () { group.classList.add("is-hover"); path.classList.add("is-active"); });
        path.addEventListener("mouseleave", function () { group.classList.remove("is-hover"); path.classList.remove("is-active"); });
      });

      // Ortadaki toplam — bu görünümün tek büyük sayısı.
      var label = el("text", { x: cx, y: cy - 8, "text-anchor": "middle", class: "viz-center-label" });
      label.textContent = opts.centerLabel || "Toplam";
      svg.appendChild(label);

      var value = el("text", { x: cx, y: cy + 16, "text-anchor": "middle", class: "viz-center-value" });
      value.textContent = Util.moneyShort(total);
      svg.appendChild(value);
    });
  }

  /* ---- Gruplanmış sütunlar: dönem başına iki seri ---- */

  function groupedColumns(container, rows, series, opts) {
    opts = opts || {};
    mount(container, opts.height || 260, function (svg, w, h) {
      var padL = 52, padR = 12, padT = 12, padB = 28;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      if (plotW <= 0) return;

      var max = 0;
      rows.forEach(function (r) {
        series.forEach(function (s) { max = Math.max(max, r[s.key] || 0); });
      });
      if (!max) { emptyState(svg, w, h, opts.empty); return; }

      var scale = niceTicks(max, 4);
      var yOf = function (v) { return padT + plotH - (v / scale.max) * plotH; };

      // Izgara + eksen etiketleri
      scale.ticks.forEach(function (v) {
        var y = yOf(v);
        svg.appendChild(el("line", { x1: padL, y1: y, x2: w - padR, y2: y,
          class: v === 0 ? "viz-baseline" : "viz-grid" }));
        var t = el("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "viz-tick" });
        t.textContent = Util.moneyShort(v);
        svg.appendChild(t);
      });

      var band = plotW / rows.length;
      var barW = Math.min(MAX_BAR, Math.max(4, (band - GAP) / series.length - 6));
      var groupW = barW * series.length + GAP * (series.length - 1);
      var labelStep = band >= 34 ? 1 : (band >= 22 ? 2 : 3);

      rows.forEach(function (r, i) {
        var bx = padL + band * i + (band - groupW) / 2;

        series.forEach(function (s, j) {
          var v = r[s.key] || 0;
          var y = yOf(v);
          var d = columnPath(bx + j * (barW + GAP), y, barW, padT + plotH - y, RADIUS);
          if (!d) return;
          var p = el("path", { d: d, class: "viz-bar" });
          p.style.fill = seriesVar(s.slot);
          svg.appendChild(p);
        });

        // Hover hedefi bütün bandı kaplar — çubuktan büyük, isabet kolay.
        var hit = el("rect", { x: padL + band * i, y: padT, width: band, height: plotH, class: "viz-hit" });
        svg.appendChild(hit);
        bindTip(hit, function () {
          var html = '<div class="viz-tooltip__title">' + Util.esc(r.fullLabel || r.label) + "</div>";
          series.forEach(function (s) { html += tipRow(s.name, Util.money(r[s.key] || 0), s.slot); });
          if (opts.showNet) html += tipRow("Net", Util.money((r[series[0].key] || 0) - (r[series[1].key] || 0)));
          return html;
        });

        // Dar ekranda etiketler üst üste biner: bant daraldıkça seyreltiyoruz.
        if (i % labelStep === 0 || i === rows.length - 1) {
          var lbl = el("text", { x: padL + band * i + band / 2, y: h - 8, "text-anchor": "middle", class: "viz-tick" });
          lbl.textContent = r.label;
          svg.appendChild(lbl);
        }
      });
    });
  }

  /* ---- Günlük akış: ay içi sütunlar ----
   * opts.tipSeries verilirse ipucunda çizilmeyen seriler de gösterilir
   * (ör. günlük harcama çizilir, o günkü gelir ipucunda belirtilir). */

  function dailyColumns(container, buckets, series, opts) {
    opts = opts || {};
    mount(container, opts.height || 220, function (svg, w, h) {
      var padL = 52, padR = 12, padT = 12, padB = 26;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      if (plotW <= 0) return;

      var max = 0;
      buckets.forEach(function (b) {
        series.forEach(function (s) { max = Math.max(max, b[s.key] || 0); });
      });
      if (!max) { emptyState(svg, w, h, opts.empty); return; }

      var scale = niceTicks(max, 3);
      var yOf = function (v) { return padT + plotH - (v / scale.max) * plotH; };

      scale.ticks.forEach(function (v) {
        var y = yOf(v);
        svg.appendChild(el("line", { x1: padL, y1: y, x2: w - padR, y2: y,
          class: v === 0 ? "viz-baseline" : "viz-grid" }));
        var t = el("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "viz-tick" });
        t.textContent = Util.moneyShort(v);
        svg.appendChild(t);
      });

      var band = plotW / buckets.length;
      // Günlük görünümde alan dar: iki seri yan yana, aralarında yüzey boşluğu.
      var barW = Math.max(1.5, Math.min(MAX_BAR, (band - GAP) / series.length - 1));

      buckets.forEach(function (b, i) {
        var groupW = barW * series.length + GAP * (series.length - 1);
        var bx = padL + band * i + (band - groupW) / 2;

        series.forEach(function (s, j) {
          var v = b[s.key] || 0;
          if (!v) return;
          // Sıfır olmayan bir gün asla boş görünmesin: çok küçük tutarlar da
          // en az birkaç piksel yükseklikle çizilir.
          var barH = Math.max(2.5, padT + plotH - yOf(v));
          var d = columnPath(bx + j * (barW + GAP), padT + plotH - barH, barW, barH, Math.min(RADIUS, barW / 2));
          if (!d) return;
          var p = el("path", { d: d, class: "viz-bar" });
          p.style.fill = seriesVar(s.slot);
          svg.appendChild(p);
        });

        var hit = el("rect", { x: padL + band * i, y: padT, width: Math.max(band, 6), height: plotH, class: "viz-hit" });
        svg.appendChild(hit);
        bindTip(hit, function () {
          var html = '<div class="viz-tooltip__title">' + Util.esc(Util.longDayLabel(b.date)) + "</div>";
          (opts.tipSeries || series).forEach(function (s) {
            html += tipRow(s.name, Util.money(b[s.key] || 0), s.slot);
          });
          return html;
        });
      });

      // Gün etiketleri: her 5 günde bir, kalabalık yapmadan.
      buckets.forEach(function (b, i) {
        if (b.day !== 1 && b.day % 5 !== 0) return;
        var t = el("text", { x: padL + band * i + band / 2, y: h - 8, "text-anchor": "middle", class: "viz-tick" });
        t.textContent = b.day;
        svg.appendChild(t);
      });
    });
  }

  /* ---- Çizgi: kümülatif bakiye (crosshair + tooltip) ---- */

  function line(container, points, opts) {
    opts = opts || {};
    mount(container, opts.height || 200, function (svg, w, h) {
      var padL = 52, padR = 16, padT = 14, padB = 26;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      if (plotW <= 0 || points.length < 2) {
        if (points.length < 2) { emptyState(svg, w, h, opts.empty); return; }
      }

      var values = points.map(function (p) { return p.value; });
      var maxV = Math.max.apply(null, values);
      var minV = Math.min.apply(null, values);
      if (maxV === minV) { maxV += 1; minV -= 1; }
      // Sıfır çizgisi görünür kalsın: bakiye negatife düşerse eksen onu kapsar.
      var top = Math.max(maxV, 0), bottom = Math.min(minV, 0);
      var span = top - bottom || 1;

      var xOf = function (i) { return padL + (plotW * i) / (points.length - 1); };
      var yOf = function (v) { return padT + plotH - ((v - bottom) / span) * plotH; };

      // Izgara: üst, sıfır, alt
      [top, bottom + span / 2, bottom].forEach(function (v) {
        var y = yOf(v);
        svg.appendChild(el("line", { x1: padL, y1: y, x2: w - padR, y2: y, class: "viz-grid" }));
        var t = el("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "viz-tick" });
        t.textContent = Util.moneyShort(v);
        svg.appendChild(t);
      });
      if (bottom < 0 && top > 0) {
        svg.appendChild(el("line", { x1: padL, y1: yOf(0), x2: w - padR, y2: yOf(0), class: "viz-baseline" }));
      }

      var d = "", area = "";
      points.forEach(function (p, i) {
        d += (i ? "L" : "M") + xOf(i) + "," + yOf(p.value);
      });
      area = d + "L" + xOf(points.length - 1) + "," + yOf(Math.max(bottom, 0)) +
             "L" + xOf(0) + "," + yOf(Math.max(bottom, 0)) + "Z";

      var fill = el("path", { d: area, class: "viz-area" });
      fill.style.fill = seriesVar(opts.slot || 1);
      svg.appendChild(fill);

      var stroke = el("path", { d: d, class: "viz-line" });
      stroke.style.stroke = seriesVar(opts.slot || 1);
      svg.appendChild(stroke);

      // Uç işaretçi: 2px yüzey halkasıyla, çizgiyle kesiştiği yerde okunur kalır.
      var lastI = points.length - 1;
      var dot = el("circle", { cx: xOf(lastI), cy: yOf(points[lastI].value), r: 4.5, class: "viz-dot" });
      dot.style.fill = seriesVar(opts.slot || 1);
      svg.appendChild(dot);

      // Uç değeri doğrudan etiketle (tek seri — açıklama kutusu gereksiz).
      var endLabel = el("text", {
        x: xOf(lastI), y: Math.max(padT + 10, yOf(points[lastI].value) - 12),
        "text-anchor": "end", class: "viz-end-label"
      });
      endLabel.textContent = Util.moneyShort(points[lastI].value);
      svg.appendChild(endLabel);

      // Crosshair katmanı
      var cross = el("line", { x1: 0, y1: padT, x2: 0, y2: padT + plotH, class: "viz-crosshair" });
      cross.style.display = "none";
      svg.appendChild(cross);
      var marker = el("circle", { r: 4.5, class: "viz-dot" });
      marker.style.fill = seriesVar(opts.slot || 1);
      marker.style.display = "none";
      svg.appendChild(marker);

      var overlay = el("rect", { x: padL, y: padT, width: plotW, height: plotH, class: "viz-hit" });
      svg.appendChild(overlay);

      overlay.addEventListener("mousemove", function (e) {
        var box = svg.getBoundingClientRect();
        var rel = (e.clientX - box.left - padL) / plotW;
        var i = Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1))));
        var p = points[i];
        cross.setAttribute("x1", xOf(i)); cross.setAttribute("x2", xOf(i));
        cross.style.display = "";
        marker.setAttribute("cx", xOf(i)); marker.setAttribute("cy", yOf(p.value));
        marker.style.display = "";
        showTip('<div class="viz-tooltip__title">' + Util.esc(p.label) + "</div>" +
                tipRow(opts.seriesName || "Bakiye", Util.money(p.value), opts.slot || 1), e);
      });
      overlay.addEventListener("mouseleave", function () {
        cross.style.display = "none";
        marker.style.display = "none";
        hideTip();
      });

      // Eksen etiketleri
      [0, Math.floor(lastI / 2), lastI].forEach(function (i) {
        var t = el("text", { x: xOf(i), y: h - 8, "text-anchor": i === 0 ? "start" : (i === lastI ? "end" : "middle"), class: "viz-tick" });
        t.textContent = points[i].shortLabel || points[i].label;
        svg.appendChild(t);
      });
    });
  }

  /* ---- Açıklama kutusu (HTML) ---- */

  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span class="legend__item"><span class="viz-swatch" style="background:' +
             seriesVar(it.slot) + '"></span>' + Util.esc(it.name) + "</span>";
    }).join("") + "</div>";
  }

  return {
    donut: donut,
    groupedColumns: groupedColumns,
    dailyColumns: dailyColumns,
    line: line,
    legend: legend,
    seriesVar: seriesVar,
    hideTip: hideTip
  };
})();
