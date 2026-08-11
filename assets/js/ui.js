/* Arayüz katmanı: görünüm durumu, çizim ve olay yönetimi. */
var UI = (function () {
  "use strict";

  var $ = Util.$, $$ = Util.$$;

  // Gelir ve gider, grafiklerde paletin ilk iki yuvasını kullanır (doğrulanmış
  // komşu çift). Kategori grafikleri kendi yuvalarını taşır.
  var GELIR = 1, GIDER = 2;

  var view = {
    tab: "panel",
    month: Util.monthKey(Util.todayISO()),
    filters: { q: "", type: "", categoryId: "", accountId: "", range: "month" }
  };

  /* ================= Ortak parçacıklar ================= */

  function toast(message, kind) {
    var box = $("#toasts");
    var node = document.createElement("div");
    node.className = "toast" + (kind === "hata" ? " toast--hata" : "");
    node.textContent = message;
    box.appendChild(node);
    setTimeout(function () { node.remove(); }, kind === "hata" ? 6000 : 3000);
  }

  function swatch(slot) {
    return '<span class="viz-swatch" style="background:' + Charts.seriesVar(slot) + '"></span>';
  }

  function optionsHtml(items, selectedId, placeholder) {
    var html = placeholder ? '<option value="">' + Util.esc(placeholder) + "</option>" : "";
    items.forEach(function (it) {
      html += '<option value="' + Util.esc(it.id) + '"' +
              (it.id === selectedId ? " selected" : "") + ">" + Util.esc(it.name) + "</option>";
    });
    return html;
  }

  function deltaHtml(ratio, upIsGood) {
    if (ratio === null || ratio === undefined || !isFinite(ratio)) {
      return '<div class="stat__delta">geçen ay veri yok</div>';
    }
    var up = ratio >= 0;
    var good = up === !!upIsGood;
    // Yön simge + metinle de veriliyor; anlam yalnızca renkten okunmuyor.
    return '<div class="stat__delta ' + (good ? "is-good" : "is-bad") + '">' +
           '<span class="stat__arrow" aria-hidden="true">' + (up ? "▲" : "▼") + "</span>" +
           Util.signedPct(ratio) + '<span style="color:var(--text-secondary)">geçen aya göre</span></div>';
  }

  function emptyHtml(message) {
    return '<div class="empty">' + Util.esc(message) + "</div>";
  }

  /* ================= Modal ================= */

  var lastFocus = null;

  function openModal(title, bodyHtml, onMount) {
    lastFocus = document.activeElement;
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modal").hidden = false;
    if (onMount) onMount($("#modalBody"));
    var first = $("#modalBody").querySelector("input, select, textarea, button");
    if (first) first.focus();
  }

  function closeModal() {
    $("#modal").hidden = true;
    $("#modalBody").innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  // Yıkıcı işlemler için onay. Native confirm() bazı gömülü bağlamlarda
  // engellendiği için kendi modalimizi kullanıyoruz.
  function confirmAction(message, confirmLabel, onYes) {
    openModal("Emin misiniz?",
      "<p>" + Util.esc(message) + "</p>" +
      '<div class="modal__foot">' +
      '<button type="button" class="btn btn--ghost" data-no>Vazgeç</button>' +
      '<button type="button" class="btn btn--danger" data-yes>' + Util.esc(confirmLabel) + "</button></div>",
      function (root) {
        root.querySelector("[data-no]").onclick = closeModal;
        root.querySelector("[data-yes]").onclick = function () { closeModal(); onYes(); };
      });
  }

  /* ================= Panel ================= */

  function renderStats() {
    var s = Analytics.monthSummary(view.month);
    var netClass = s.net >= 0 ? "is-good" : "is-bad";

    $("#statsRow").innerHTML =
      statCard("Gelir", Util.money(s.income), deltaHtml(s.incomeChange, true)) +
      statCard("Gider", Util.money(s.expense), deltaHtml(s.expenseChange, false)) +
      '<div class="stat stat--hero"><div class="stat__label">Net (kalan)</div>' +
        '<div class="stat__value ' + netClass + '">' + Util.esc(Util.money(s.net)) + "</div>" +
        deltaHtml(s.netChange, true) + "</div>" +
      statCard("Tasarruf oranı",
        s.savingsRate === null ? "—" : Util.pct(s.savingsRate, 0),
        '<div class="stat__delta">' +
          (s.count ? s.count + " işlem · günlük ort. " + Util.money(s.dailyAverage) : "işlem yok") +
        "</div>");
  }

  function statCard(label, value, extraHtml) {
    return '<div class="stat"><div class="stat__label">' + Util.esc(label) + "</div>" +
           '<div class="stat__value">' + Util.esc(value) + "</div>" + (extraHtml || "") + "</div>";
  }

  function renderBreakdown(kind, chartId, listId) {
    var data = Analytics.categoryBreakdown(view.month, kind);
    var slices = Analytics.foldForChart(data);

    Charts.donut($(chartId), slices, {
      centerLabel: kind === "gider" ? "Toplam gider" : "Toplam gelir",
      empty: kind === "gider" ? "Bu ay gider yok" : "Bu ay gelir yok"
    });

    if (!data.rows.length) {
      $(listId).innerHTML = emptyHtml("Kayıt yok");
      return;
    }

    // Her kalem adı ve tutarıyla görünür şekilde listeleniyor: açık temada bazı
    // hue'lar yüzeye karşı 3:1'in altında, kimlik renge bırakılamaz.
    $(listId).innerHTML = '<div class="ranklist">' + data.rows.map(function (r) {
      return '<button type="button" class="rank" data-filter-category="' + Util.esc(r.id || "") + '">' +
             swatch(r.slot) +
             '<span class="rank__name">' + Util.esc(r.name) + "</span>" +
             '<span class="rank__meta">' +
               '<span class="rank__amount">' + Util.esc(Util.money(r.amount)) + "</span>" +
               '<span class="rank__share">' + Util.esc(Util.pct(r.share, 0)) + " · " + r.count + " işlem</span>" +
             "</span></button>";
    }).join("") + "</div>";
  }

  function renderFlowCharts() {
    var daily = Analytics.dailySeries(view.month);
    var series = [
      { key: "gelir", name: "Gelir", slot: GELIR },
      { key: "gider", name: "Gider", slot: GIDER }
    ];

    // Günlük grafik yalnızca gideri çizer. Maaş gibi tek büyük gelir aynı eksende
    // durduğunda günlük harcamalar okunamayacak kadar eziliyordu; gelirin ay içi
    // etkisi kümülatif bakiye grafiğinde zaten görünüyor, günün geliri de ipucunda.
    var giderSerisi = [{ key: "gider", name: "Gider", slot: GIDER }];
    $("#legendDaily").innerHTML = "";
    Charts.dailyColumns($("#chartDaily"), daily, giderSerisi, {
      tipSeries: series, empty: "Bu ay hareket yok"
    });

    // Kümülatif bakiye ayrı bir grafik: günlük tutarlarla aynı birimde ama çok
    // farklı büyüklükte — ikinci bir eksen yerine kendi paneli.
    var points = daily.map(function (b) {
      return { label: Util.longDayLabel(b.date), shortLabel: String(b.day), value: b.cumulative };
    });
    Charts.line($("#chartCumulative"), points, {
      slot: GELIR, seriesName: "Kümülatif net", empty: "Bu ay hareket yok"
    });

    var monthly = Analytics.monthlySeries(view.month, 12);
    $("#legendMonthly").innerHTML = Charts.legend(series);
    Charts.groupedColumns($("#chartMonthly"), monthly, series, { showNet: true, empty: "Kayıt yok" });
  }

  function renderAccounts() {
    var rows = Analytics.accountBreakdown(view.month);
    if (!rows.length) { $("#accountsTable").innerHTML = emptyHtml("Hesap tanımlı değil"); return; }

    $("#accountsTable").innerHTML =
      '<div class="scrollx"><table><thead><tr>' +
      "<th>Hesap</th><th class=\"num\">Giren</th><th class=\"num\">Çıkan</th><th class=\"num\">Bakiye</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td>" + Util.esc(r.name) + "</td>" +
               '<td class="num">' + Util.esc(r.gelir ? Util.money(r.gelir) : "—") + "</td>" +
               '<td class="num">' + Util.esc(r.gider ? Util.money(r.gider) : "—") + "</td>" +
               '<td class="num"><b class="' + (r.balance < 0 ? "is-bad" : "") + '">' +
                 Util.esc(Util.money(r.balance)) + "</b></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderBudgetSummary() {
    var rows = Analytics.budgetStatus(view.month);
    if (!rows.length) {
      $("#budgetSummary").innerHTML = emptyHtml("Henüz bütçe limiti yok — Bütçe sekmesinden ekleyebilirsiniz.");
      return;
    }
    $("#budgetSummary").innerHTML = rows.slice(0, 6).map(budgetRowHtml).join("");
  }

  function budgetRowHtml(b) {
    var pctWidth = Math.min(100, Math.round(b.ratio * 100));
    var badge = b.durum === "asim"
      ? '<span class="badge badge--asim">⚠ Limit aşıldı</span>'
      : (b.durum === "uyari" ? '<span class="badge badge--uyari">◐ Limite yakın</span>'
                             : '<span class="badge badge--iyi">✓ İyi durumda</span>');

    var foot = badge;
    if (b.durum === "asim") {
      foot += "<span>" + Util.esc(Util.money(Math.abs(b.remaining))) + " aşım</span>";
    } else if (b.dailyAllowance) {
      foot += "<span>Kalan " + b.remainingDays + " günde günlük " +
              Util.esc(Util.money(b.dailyAllowance)) + " harcayabilirsiniz</span>";
    } else {
      foot += "<span>" + Util.esc(Util.money(b.remaining)) + " kaldı</span>";
    }

    return '<div class="budget"><div class="budget__top">' +
           '<span class="budget__name">' + swatch(b.slot) + Util.esc(b.name) + "</span>" +
           '<span class="budget__nums"><b>' + Util.esc(Util.money(b.spent)) + "</b> / " +
             Util.esc(Util.money(b.limit)) + " · " + Util.esc(Util.pct(b.ratio, 0)) + "</span></div>" +
           '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctWidth +
             '" aria-label="' + Util.esc(b.name) + ' bütçe kullanımı">' +
             '<div class="meter__fill meter__fill--' + b.durum + '" style="width:' + pctWidth + '%"></div></div>' +
           '<div class="budget__foot">' + foot + "</div></div>";
  }

  function renderTopList() {
    var rows = Analytics.topTransactions(view.month, 5);
    if (!rows.length) { $("#topList").innerHTML = emptyHtml("Bu ay gider yok"); return; }

    $("#topList").innerHTML = rows.map(function (t) {
      var cat = Store.categoryById(t.categoryId);
      var acc = Store.accountById(t.accountId);
      return '<div class="rowitem"><div class="rowitem__main">' +
             '<div class="rowitem__title">' + Util.esc(t.note || (cat ? cat.name : "İşlem")) + "</div>" +
             '<div class="rowitem__sub">' + Util.esc(Util.relativeDayLabel(t.date)) +
               (cat ? " · " + Util.esc(cat.name) : "") + (acc ? " · " + Util.esc(acc.name) : "") + "</div></div>" +
             '<div class="rowitem__amount">' + Util.esc(Util.money(t.amount)) + "</div></div>";
    }).join("");
  }

  /* Kategori × ay tablosu — grafiklerin okunamadığı durumda tam veriyi taşır. */
  function renderPivot() {
    var p = Analytics.pivot(view.month, 6);
    var head = "<tr><th>Kategori</th>" + p.labels.map(function (l) {
      return '<th class="num">' + Util.esc(l) + "</th>";
    }).join("") + '<th class="num">Toplam</th></tr>';

    function section(title, rows, totals) {
      if (!rows.length) return "";
      var body = rows.map(function (r) {
        return "<tr><td><span class=\"cellname\">" + swatch(r.slot) + Util.esc(r.name) + "</span></td>" +
               r.values.map(function (v) {
                 return '<td class="num">' + (v ? Util.esc(Util.money(v)) : "—") + "</td>";
               }).join("") +
               '<td class="num"><b>' + Util.esc(Util.money(r.total)) + "</b></td></tr>";
      }).join("");
      var sum = totals.reduce(function (a, b) { return a + b; }, 0);
      var foot = "<tr><td><b>" + Util.esc(title) + " toplam</b></td>" +
                 totals.map(function (v) { return '<td class="num"><b>' + Util.esc(Util.money(v)) + "</b></td>"; }).join("") +
                 '<td class="num"><b>' + Util.esc(Util.money(sum)) + "</b></td></tr>";
      return body + foot;
    }

    var netRow = "<tr><td><b>Net</b></td>" + p.months.map(function (mk, i) {
      var net = Util.round2(p.gelirToplam[i] - p.giderToplam[i]);
      return '<td class="num"><b class="' + (net < 0 ? "is-bad" : "is-good") + '">' +
             Util.esc(Util.money(net)) + "</b></td>";
    }).join("") + '<td class="num"><b>' + Util.esc(Util.money(
      p.gelirToplam.reduce(function (a, b) { return a + b; }, 0) -
      p.giderToplam.reduce(function (a, b) { return a + b; }, 0))) + "</b></td></tr>";

    if (!p.gelir.length && !p.gider.length) {
      $("#pivotTable").innerHTML = emptyHtml("Son 6 ayda kayıt yok");
      return;
    }

    $("#pivotTable").innerHTML = "<table><thead>" + head + "</thead><tbody>" +
      section("Gider", p.gider, p.giderToplam) +
      section("Gelir", p.gelir, p.gelirToplam) +
      netRow + "</tbody></table>";
  }

  function renderPanel() {
    renderStats();
    renderBreakdown("gider", "#chartExpense", "#listExpense");
    renderBreakdown("gelir", "#chartIncome", "#listIncome");
    renderFlowCharts();
    renderAccounts();
    renderBudgetSummary();
    renderTopList();
    renderPivot();
  }

  /* ================= İşlemler ================= */

  function filteredTransactions() {
    var f = view.filters;
    var list = Store.state.transactions.slice();

    if (f.range === "month") {
      list = list.filter(function (t) { return t.date.slice(0, 7) === view.month; });
    } else if (f.range === "3") {
      var from3 = Util.addMonthKey(view.month, -2);
      list = list.filter(function (t) {
        var mk = t.date.slice(0, 7);
        return mk >= from3 && mk <= view.month;
      });
    } else if (f.range === "12") {
      var from12 = Util.addMonthKey(view.month, -11);
      list = list.filter(function (t) {
        var mk = t.date.slice(0, 7);
        return mk >= from12 && mk <= view.month;
      });
    }

    if (f.type) list = list.filter(function (t) { return t.type === f.type; });
    if (f.categoryId) list = list.filter(function (t) { return t.categoryId === f.categoryId; });
    if (f.accountId) list = list.filter(function (t) { return t.accountId === f.accountId; });

    if (f.q) {
      var q = f.q.toLocaleLowerCase("tr");
      list = list.filter(function (t) {
        var cat = Store.categoryById(t.categoryId);
        return (t.note || "").toLocaleLowerCase("tr").indexOf(q) > -1 ||
               (cat && cat.name.toLocaleLowerCase("tr").indexOf(q) > -1);
      });
    }

    return list.sort(function (a, b) {
      return a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1);
    });
  }

  function renderFilters() {
    var f = view.filters;
    var sel = $("#fltType");
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">Tür: hepsi</option><option value="gider">Gider</option><option value="gelir">Gelir</option>';
      $("#fltRange").innerHTML =
        '<option value="month">Seçili ay</option><option value="3">Son 3 ay</option>' +
        '<option value="12">Son 12 ay</option><option value="all">Tümü</option>';
    }
    sel.value = f.type;
    $("#fltRange").value = f.range;
    $("#fltSearch").value = f.q;
    $("#fltCategory").innerHTML = optionsHtml(Store.state.categories.map(function (c) {
      return { id: c.id, name: (c.kind === "gelir" ? "↑ " : "↓ ") + c.name };
    }), f.categoryId, "Kategori: hepsi");
    $("#fltAccount").innerHTML = optionsHtml(Store.state.accounts, f.accountId, "Hesap: hepsi");
  }

  function renderTransactions() {
    renderFilters();
    var list = filteredTransactions();

    var income = 0, expense = 0;
    list.forEach(function (t) { if (t.type === "gelir") income += t.amount; else expense += t.amount; });

    $("#txSummary").innerHTML =
      '<div class="legend"><span class="legend__item">' + list.length + " işlem</span>" +
      '<span class="legend__item">' + swatch(GELIR) + "Gelir " + Util.esc(Util.money(income)) + "</span>" +
      '<span class="legend__item">' + swatch(GIDER) + "Gider " + Util.esc(Util.money(expense)) + "</span>" +
      '<span class="legend__item">Net <b>' + Util.esc(Util.money(Util.round2(income - expense))) + "</b></span></div>";

    if (!list.length) {
      $("#txTable").innerHTML = emptyHtml("Bu filtrelerle işlem bulunamadı.");
      return;
    }

    $("#txTable").innerHTML = "<table><thead><tr>" +
      "<th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Hesap</th>" +
      '<th class="num">Tutar</th><th></th></tr></thead><tbody>' +
      list.map(function (t) {
        var cat = Store.categoryById(t.categoryId);
        var acc = Store.accountById(t.accountId);
        var sign = t.type === "gelir" ? "+" : "−";
        return "<tr>" +
          "<td>" + Util.esc(Util.dayLabel(t.date)) + "</td>" +
          "<td>" + Util.esc(t.note || "—") +
            (t.recurringId ? ' <span class="rank__share">↻ tekrarlayan</span>' : "") + "</td>" +
          '<td><span class="cellname">' + (cat ? swatch(cat.slot) + Util.esc(cat.name) : "—") + "</span></td>" +
          "<td>" + (acc ? Util.esc(acc.name) : "—") + "</td>" +
          '<td class="num ' + (t.type === "gelir" ? "amount--gelir" : "") + '">' +
            sign + Util.esc(Util.money(t.amount)) + "</td>" +
          '<td class="num"><button type="button" class="iconbtn" data-edit-tx="' + Util.esc(t.id) +
            '" aria-label="Düzenle">✎</button>' +
            '<button type="button" class="iconbtn" data-del-tx="' + Util.esc(t.id) +
            '" aria-label="Sil">🗑</button></td></tr>';
      }).join("") + "</tbody></table>";
  }

  /* ================= Tekrarlayanlar ================= */

  function renderRecurring() {
    var list = Store.state.recurring;
    if (!list.length) {
      $("#recurringList").innerHTML = emptyHtml("Henüz tekrarlayan kural yok. Maaş, kira ve abonelikleri buraya ekleyin — her dönem otomatik işlenirler.");
      return;
    }

    $("#recurringList").innerHTML = list.map(function (r) {
      var cat = Store.categoryById(r.categoryId);
      var acc = Store.accountById(r.accountId);
      var next = Recurring.nextOccurrence(r);
      var sub = Recurring.freqLabel(r) +
        (cat ? " · " + cat.name : "") + (acc ? " · " + acc.name : "") +
        (r.active ? (next ? " · sonraki " + Util.longDayLabel(next) : " · bitti") : " · duraklatıldı");

      return '<div class="rowitem"><div class="rowitem__main">' +
        '<div class="rowitem__title">' + Util.esc(r.note || (cat ? cat.name : "Kural")) + "</div>" +
        '<div class="rowitem__sub">' + Util.esc(sub) + "</div></div>" +
        '<div class="rowitem__amount ' + (r.type === "gelir" ? "amount--gelir" : "") + '">' +
          (r.type === "gelir" ? "+" : "−") + Util.esc(Util.money(r.amount)) + "</div>" +
        '<div class="rowitem__actions">' +
          '<button type="button" class="iconbtn" data-toggle-rec="' + Util.esc(r.id) + '" aria-label="' +
            (r.active ? "Duraklat" : "Sürdür") + '" title="' + (r.active ? "Duraklat" : "Sürdür") + '">' +
            (r.active ? "⏸" : "▶") + "</button>" +
          '<button type="button" class="iconbtn" data-edit-rec="' + Util.esc(r.id) + '" aria-label="Düzenle">✎</button>' +
          '<button type="button" class="iconbtn" data-del-rec="' + Util.esc(r.id) + '" aria-label="Sil">🗑</button>' +
        "</div></div>";
    }).join("");
  }

  /* ================= Bütçe ================= */

  function renderBudgetEditor() {
    var cats = Store.categoriesOf("gider");
    var status = {};
    Analytics.budgetStatus(view.month).forEach(function (b) { status[b.categoryId] = b; });

    $("#budgetEditor").innerHTML = cats.map(function (c) {
      var b = Store.budgetFor(c.id);
      var st = status[c.id];
      return '<div class="budget"><div class="budget__top">' +
        '<span class="budget__name">' + swatch(c.slot) + Util.esc(c.name) + "</span>" +
        '<span class="budget__nums" style="display:flex;align-items:center;gap:8px">' +
          '<input type="text" inputmode="decimal" class="input" style="width:140px" ' +
            'data-budget="' + Util.esc(c.id) + '" placeholder="Limit yok" value="' +
            (b ? Util.esc(Util.num(b.limit, 2)) : "") + '" aria-label="' + Util.esc(c.name) + ' aylık limiti">' +
        "</span></div>" +
        (st ? '<div class="meter"><div class="meter__fill meter__fill--' + st.durum +
              '" style="width:' + Math.min(100, Math.round(st.ratio * 100)) + '%"></div></div>' +
              '<div class="budget__foot"><span>' + Util.esc(Util.money(st.spent)) + " / " +
              Util.esc(Util.money(st.limit)) + " harcandı</span></div>"
            : '<div class="budget__foot"><span>Bu ay ' +
              Util.esc(Util.money(spentOf(c.id))) + " harcandı</span></div>") +
        "</div>";
    }).join("");
  }

  function spentOf(categoryId) {
    var total = 0;
    Analytics.txOfMonth(view.month).forEach(function (t) {
      if (t.type === "gider" && t.categoryId === categoryId) total += t.amount;
    });
    return Util.round2(total);
  }

  /* ================= Ayarlar ================= */

  function renderSettings() {
    $("#setCurrency").value = Store.state.settings.currency;
    $("#setTheme").value = Store.state.settings.theme;

    function listOf(kind) {
      return Store.categoriesOf(kind).map(function (c) {
        return '<div class="rowitem"><div class="rowitem__main">' +
          '<div class="rowitem__title"><span class="cellname">' + swatch(c.slot) + Util.esc(c.name) + "</span></div>" +
          "</div>" +
          '<div class="rowitem__actions">' +
          '<button type="button" class="iconbtn" data-edit-cat="' + Util.esc(c.id) + '" aria-label="Düzenle">✎</button>' +
          '<button type="button" class="iconbtn" data-del-cat="' + Util.esc(c.id) + '" aria-label="Sil">🗑</button>' +
          "</div></div>";
      }).join("");
    }

    $("#categoryList").innerHTML =
      '<p class="card__sub" style="margin-bottom:6px">Giderler</p>' + listOf("gider") +
      '<p class="card__sub" style="margin:14px 0 6px">Gelirler</p>' + listOf("gelir");

    $("#accountList").innerHTML = Store.state.accounts.map(function (a) {
      return '<div class="rowitem"><div class="rowitem__main">' +
        '<div class="rowitem__title">' + Util.esc(a.name) + "</div>" +
        '<div class="rowitem__sub">' + Util.esc(accountTypeLabel(a.type)) +
          " · açılış " + Util.esc(Util.money(a.openingBalance)) + "</div></div>" +
        '<div class="rowitem__actions">' +
        '<button type="button" class="iconbtn" data-edit-acc="' + Util.esc(a.id) + '" aria-label="Düzenle">✎</button>' +
        '<button type="button" class="iconbtn" data-del-acc="' + Util.esc(a.id) + '" aria-label="Sil">🗑</button>' +
        "</div></div>";
    }).join("") || emptyHtml("Hesap yok");

    var bytes = 0;
    try { bytes = (localStorage.getItem(Store.KEY) || "").length; } catch (e) { bytes = 0; }
    $("#storageHint").textContent =
      Store.state.transactions.length + " işlem, " + Store.state.recurring.length +
      " tekrarlayan kural · yaklaşık " + Math.max(1, Math.round(bytes / 1024)) +
      " KB. Tarayıcı verisi silinirse kayıtlar gider; düzenli olarak dışa aktarın.";
  }

  function accountTypeLabel(type) {
    return type === "nakit" ? "Nakit" : (type === "kart" ? "Kredi kartı" : "Banka");
  }

  /* ================= Formlar ================= */

  function transactionForm(tx) {
    var editing = !!tx;
    var type = tx ? tx.type : "gider";

    var html =
      '<div class="segmented" role="group" aria-label="İşlem türü">' +
        '<button type="button" data-type="gider" aria-pressed="' + (type === "gider") + '">Gider</button>' +
        '<button type="button" data-type="gelir" aria-pressed="' + (type === "gelir") + '">Gelir</button>' +
      "</div>" +
      '<label class="field"><span class="field__label">Tutar</span>' +
        '<input type="text" inputmode="decimal" class="input" id="fTutar" placeholder="0,00" value="' +
        (tx ? Util.esc(Util.num(tx.amount, 2)) : "") + '"></label>' +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Kategori</span>' +
          '<select class="input" id="fKategori"></select></label>' +
        '<label class="field"><span class="field__label">Hesap</span>' +
          '<select class="input" id="fHesap">' +
            optionsHtml(Store.state.accounts, tx ? tx.accountId : Store.state.accounts[0] && Store.state.accounts[0].id, "—") +
          "</select></label>" +
      "</div>" +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Tarih</span>' +
          '<input type="date" class="input" id="fTarih" value="' + (tx ? tx.date : Util.todayISO()) + '"></label>' +
        '<label class="field"><span class="field__label">Not</span>' +
          '<input type="text" class="input" id="fNot" placeholder="Örn. haftalık market" value="' +
          (tx ? Util.esc(tx.note) : "") + '"></label>' +
      "</div>" +
      '<div class="modal__foot">' +
        (editing ? '<button type="button" class="btn btn--danger" id="fSil">Sil</button>' : "") +
        '<button type="button" class="btn btn--ghost" id="fVazgec">Vazgeç</button>' +
        '<button type="button" class="btn" id="fKaydet">Kaydet</button>' +
      "</div>";

    openModal(editing ? "İşlemi düzenle" : "Yeni işlem", html, function (root) {
      var current = type;

      function fillCategories() {
        root.querySelector("#fKategori").innerHTML =
          optionsHtml(Store.categoriesOf(current), tx ? tx.categoryId : null, "—");
      }
      fillCategories();

      Util.$$("[data-type]", root).forEach(function (btn) {
        btn.onclick = function () {
          current = btn.getAttribute("data-type");
          Util.$$("[data-type]", root).forEach(function (b) {
            b.setAttribute("aria-pressed", String(b === btn));
          });
          fillCategories();
        };
      });

      root.querySelector("#fVazgec").onclick = closeModal;

      root.querySelector("#fKaydet").onclick = function () {
        var amount = Util.parseAmount(root.querySelector("#fTutar").value);
        if (!isFinite(amount) || amount <= 0) {
          toast("Geçerli bir tutar girin.", "hata");
          root.querySelector("#fTutar").focus();
          return;
        }
        var date = root.querySelector("#fTarih").value || Util.todayISO();
        var payload = {
          type: current, amount: amount, date: date,
          categoryId: root.querySelector("#fKategori").value || null,
          accountId: root.querySelector("#fHesap").value || null,
          note: root.querySelector("#fNot").value.trim()
        };

        if (editing) { Store.updateTransaction(tx.id, payload); toast("İşlem güncellendi."); }
        else { Store.addTransaction(payload); toast("İşlem eklendi."); }

        // Kayıt başka bir aya düştüyse o aya geç ki kullanıcı sonucu görsün.
        var mk = date.slice(0, 7);
        if (mk !== view.month) { view.month = mk; }
        closeModal();
        render();
      };

      if (editing) {
        root.querySelector("#fSil").onclick = function () {
          closeModal();
          confirmAction("Bu işlem silinsin mi?", "Sil", function () {
            Store.removeTransaction(tx.id);
            toast("İşlem silindi.");
          });
        };
      }

      root.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
          e.preventDefault();
          root.querySelector("#fKaydet").click();
        }
      });
    });
  }

  function recurringForm(rule) {
    var editing = !!rule;
    var r = rule || {
      type: "gider", amount: "", categoryId: null, accountId: Store.state.accounts[0] && Store.state.accounts[0].id,
      note: "", freq: "aylik", anchor: 1, startDate: Util.todayISO(), endDate: null, active: true
    };

    var html =
      '<div class="segmented" role="group" aria-label="Kural türü">' +
        '<button type="button" data-type="gider" aria-pressed="' + (r.type === "gider") + '">Gider</button>' +
        '<button type="button" data-type="gelir" aria-pressed="' + (r.type === "gelir") + '">Gelir</button>' +
      "</div>" +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Tutar</span>' +
          '<input type="text" inputmode="decimal" class="input" id="rTutar" value="' +
          (rule ? Util.esc(Util.num(r.amount, 2)) : "") + '" placeholder="0,00"></label>' +
        '<label class="field"><span class="field__label">Açıklama</span>' +
          '<input type="text" class="input" id="rNot" value="' + Util.esc(r.note) +
          '" placeholder="Örn. kira"></label>' +
      "</div>" +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Kategori</span>' +
          '<select class="input" id="rKategori"></select></label>' +
        '<label class="field"><span class="field__label">Hesap</span>' +
          '<select class="input" id="rHesap">' + optionsHtml(Store.state.accounts, r.accountId, "—") + "</select></label>" +
      "</div>" +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Sıklık</span>' +
          '<select class="input" id="rFreq">' +
            '<option value="aylik">Aylık</option><option value="haftalik">Haftalık</option>' +
            '<option value="gunluk">Günlük</option><option value="yillik">Yıllık</option>' +
          "</select></label>" +
        '<label class="field" id="rAnchorWrap"><span class="field__label" id="rAnchorLabel">Ayın günü</span>' +
          '<select class="input" id="rAnchor"></select></label>' +
      "</div>" +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Başlangıç</span>' +
          '<input type="date" class="input" id="rStart" value="' + Util.esc(r.startDate) + '"></label>' +
        '<label class="field"><span class="field__label">Bitiş (isteğe bağlı)</span>' +
          '<input type="date" class="input" id="rEnd" value="' + Util.esc(r.endDate || "") + '"></label>' +
      "</div>" +
      '<p class="hint" id="rPreview"></p>' +
      '<div class="modal__foot">' +
        '<button type="button" class="btn btn--ghost" id="rVazgec">Vazgeç</button>' +
        '<button type="button" class="btn" id="rKaydet">Kaydet</button>' +
      "</div>";

    openModal(editing ? "Kuralı düzenle" : "Tekrarlayan kural", html, function (root) {
      var current = r.type;

      function fillCategories() {
        root.querySelector("#rKategori").innerHTML =
          optionsHtml(Store.categoriesOf(current), r.categoryId, "—");
      }

      function fillAnchor() {
        var freq = root.querySelector("#rFreq").value;
        var wrap = root.querySelector("#rAnchorWrap");
        var sel = root.querySelector("#rAnchor");
        var label = root.querySelector("#rAnchorLabel");

        if (freq === "aylik") {
          wrap.hidden = false; label.textContent = "Ayın günü";
          var days = "";
          for (var i = 1; i <= 31; i++) {
            days += '<option value="' + i + '"' + (Number(r.anchor) === i ? " selected" : "") + ">" + i + "</option>";
          }
          sel.innerHTML = days;
        } else if (freq === "haftalik") {
          wrap.hidden = false; label.textContent = "Haftanın günü";
          sel.innerHTML = Util.GUN_KISA.map(function (g, i) {
            return '<option value="' + i + '"' + (Number(r.anchor) === i ? " selected" : "") + ">" + g + "</option>";
          }).join("");
        } else {
          // Günlük ve yıllık kurallar konumu başlangıç tarihinden alır.
          wrap.hidden = true;
        }
        updatePreview();
      }

      function updatePreview() {
        var draft = collect();
        var next = Recurring.nextOccurrence(draft, Util.todayISO());
        var pastCount = Recurring.occurrences(draft, Util.todayISO()).length;
        root.querySelector("#rPreview").textContent =
          Recurring.freqLabel(draft) +
          (next ? " · sonraki: " + Util.longDayLabel(next) : " · ileride tekrar yok") +
          (pastCount ? " · bugüne kadar " + pastCount + " kayıt oluşturulacak" : "");
      }

      function collect() {
        return {
          id: rule ? rule.id : null,
          type: current,
          amount: Util.parseAmount(root.querySelector("#rTutar").value) || 0,
          categoryId: root.querySelector("#rKategori").value || null,
          accountId: root.querySelector("#rHesap").value || null,
          note: root.querySelector("#rNot").value.trim(),
          freq: root.querySelector("#rFreq").value,
          anchor: Number(root.querySelector("#rAnchor").value) || 1,
          startDate: root.querySelector("#rStart").value || Util.todayISO(),
          endDate: root.querySelector("#rEnd").value || null,
          active: r.active !== false
        };
      }

      fillCategories();
      root.querySelector("#rFreq").value = r.freq;
      fillAnchor();

      Util.$$("[data-type]", root).forEach(function (btn) {
        btn.onclick = function () {
          current = btn.getAttribute("data-type");
          Util.$$("[data-type]", root).forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
          fillCategories();
        };
      });

      root.querySelector("#rFreq").onchange = fillAnchor;
      ["#rAnchor", "#rStart", "#rEnd"].forEach(function (sel) {
        root.querySelector(sel).onchange = updatePreview;
      });

      root.querySelector("#rVazgec").onclick = closeModal;
      root.querySelector("#rKaydet").onclick = function () {
        var draft = collect();
        if (!(draft.amount > 0)) { toast("Geçerli bir tutar girin.", "hata"); return; }
        Store.saveRecurring(draft);
        Recurring.materialize(Util.todayISO());
        closeModal();
        toast(editing ? "Kural güncellendi." : "Kural eklendi ve geçmiş tekrarlar işlendi.");
        render();
      };
    });
  }

  function categoryForm(cat) {
    var editing = !!cat;
    var slots = [];
    for (var i = 1; i <= Store.SLOT_COUNT; i++) slots.push(i);

    var html =
      '<label class="field"><span class="field__label">Ad</span>' +
        '<input type="text" class="input" id="cAd" value="' + (cat ? Util.esc(cat.name) : "") + '"></label>' +
      (editing ? "" :
        '<div class="segmented" role="group" aria-label="Kategori türü">' +
          '<button type="button" data-kind="gider" aria-pressed="true">Gider</button>' +
          '<button type="button" data-kind="gelir" aria-pressed="false">Gelir</button></div>') +
      '<div class="field"><span class="field__label">Renk</span>' +
        '<div class="btnrow" id="cSlots">' +
          slots.map(function (s) {
            return '<button type="button" class="iconbtn" data-slot="' + s + '" aria-label="Renk ' + s +
              '" aria-pressed="' + (cat && cat.slot === s) + '" style="background:' + Charts.seriesVar(s) +
              ';width:28px;height:28px;border-radius:8px"></button>';
          }).join("") +
          '<button type="button" class="iconbtn" data-slot="0" aria-label="Nötr" aria-pressed="' +
            (cat && cat.slot === 0) + '" style="background:var(--series-neutral);width:28px;height:28px;border-radius:8px"></button>' +
        "</div></div>" +
      '<div class="modal__foot">' +
        '<button type="button" class="btn btn--ghost" id="cVazgec">Vazgeç</button>' +
        '<button type="button" class="btn" id="cKaydet">Kaydet</button></div>';

    openModal(editing ? "Kategoriyi düzenle" : "Yeni kategori", html, function (root) {
      var kind = cat ? cat.kind : "gider";
      var slot = cat ? cat.slot : null;

      Util.$$("[data-kind]", root).forEach(function (btn) {
        btn.onclick = function () {
          kind = btn.getAttribute("data-kind");
          Util.$$("[data-kind]", root).forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        };
      });
      Util.$$("[data-slot]", root).forEach(function (btn) {
        btn.onclick = function () {
          slot = Number(btn.getAttribute("data-slot"));
          Util.$$("[data-slot]", root).forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        };
      });

      root.querySelector("#cVazgec").onclick = closeModal;
      root.querySelector("#cKaydet").onclick = function () {
        var name = root.querySelector("#cAd").value.trim();
        if (!name) { toast("Kategori adı boş olamaz.", "hata"); return; }
        Store.saveCategory({
          id: cat ? cat.id : null, name: name, kind: kind,
          slot: slot === null ? Store.nextSlot(kind) : slot
        });
        closeModal();
        toast("Kategori kaydedildi.");
      };
    });
  }

  function accountForm(acc) {
    var html =
      '<label class="field"><span class="field__label">Ad</span>' +
        '<input type="text" class="input" id="aAd" value="' + (acc ? Util.esc(acc.name) : "") + '"></label>' +
      '<div class="formrow">' +
        '<label class="field"><span class="field__label">Tür</span>' +
          '<select class="input" id="aTur">' +
            '<option value="banka">Banka</option><option value="nakit">Nakit</option>' +
            '<option value="kart">Kredi kartı</option></select></label>' +
        '<label class="field"><span class="field__label">Açılış bakiyesi</span>' +
          '<input type="text" inputmode="decimal" class="input" id="aBakiye" value="' +
          (acc ? Util.esc(Util.num(acc.openingBalance, 2)) : "0") + '"></label>' +
      "</div>" +
      '<div class="modal__foot">' +
        '<button type="button" class="btn btn--ghost" id="aVazgec">Vazgeç</button>' +
        '<button type="button" class="btn" id="aKaydet">Kaydet</button></div>';

    openModal(acc ? "Hesabı düzenle" : "Yeni hesap", html, function (root) {
      if (acc) root.querySelector("#aTur").value = acc.type;
      root.querySelector("#aVazgec").onclick = closeModal;
      root.querySelector("#aKaydet").onclick = function () {
        var name = root.querySelector("#aAd").value.trim();
        if (!name) { toast("Hesap adı boş olamaz.", "hata"); return; }
        Store.saveAccount({
          id: acc ? acc.id : null, name: name,
          type: root.querySelector("#aTur").value,
          openingBalance: Util.parseAmount(root.querySelector("#aBakiye").value) || 0
        });
        closeModal();
        toast("Hesap kaydedildi.");
      };
    });
  }

  /* ================= Çizim yönlendirici ================= */

  function render() {
    $("#monthLabel").textContent = Util.monthLabel(view.month);

    $$(".tab").forEach(function (t) {
      t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === view.tab));
    });
    $$(".view").forEach(function (v) {
      v.hidden = v.getAttribute("data-view") !== view.tab;
    });

    if (view.tab === "panel") renderPanel();
    else if (view.tab === "islemler") renderTransactions();
    else if (view.tab === "tekrar") renderRecurring();
    else if (view.tab === "butce") renderBudgetEditor();
    else if (view.tab === "ayarlar") renderSettings();
  }

  function setTab(tab) { view.tab = tab; Charts.hideTip(); render(); }
  function setMonth(key) { view.month = key; Charts.hideTip(); render(); }

  return {
    view: view,
    render: render,
    setTab: setTab,
    setMonth: setMonth,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmAction: confirmAction,
    transactionForm: transactionForm,
    recurringForm: recurringForm,
    categoryForm: categoryForm,
    accountForm: accountForm
  };
})();
