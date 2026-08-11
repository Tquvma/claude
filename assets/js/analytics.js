/* Analiz katmanı: saf hesaplama, DOM yok.
 * Her fonksiyon Store.state üzerinden okur ve çizime hazır veri döner.
 */
var Analytics = (function () {
  "use strict";

  // Grafiklerde en fazla bu kadar renkli dilim gösterilir; kalanı "Diğer"e katlanır.
  var MAX_SLICES = 7;

  var KATEGORISIZ = { id: null, name: "Kategorisiz", slot: 0 };

  function txOfMonth(monthKey) {
    return Store.state.transactions.filter(function (t) {
      return t.date.slice(0, 7) === monthKey;
    });
  }

  function sum(list, type) {
    var total = 0;
    for (var i = 0; i < list.length; i++) if (list[i].type === type) total += list[i].amount;
    return Util.round2(total);
  }

  /* Önceki döneme göre oransal değişim. Önceki dönem sıfırsa oran tanımsızdır. */
  function change(current, previous) {
    if (!previous) return null;
    return (current - previous) / previous;
  }

  function monthSummary(monthKey) {
    var cur = txOfMonth(monthKey);
    var prev = txOfMonth(Util.addMonthKey(monthKey, -1));

    var income = sum(cur, "gelir");
    var expense = sum(cur, "gider");
    var prevIncome = sum(prev, "gelir");
    var prevExpense = sum(prev, "gider");
    var net = Util.round2(income - expense);

    return {
      monthKey: monthKey,
      income: income,
      expense: expense,
      net: net,
      savingsRate: income > 0 ? net / income : null,
      prevIncome: prevIncome,
      prevExpense: prevExpense,
      prevNet: Util.round2(prevIncome - prevExpense),
      incomeChange: change(income, prevIncome),
      expenseChange: change(expense, prevExpense),
      netChange: change(net, prevIncome - prevExpense),
      count: cur.length,
      dailyAverage: cur.length ? Util.round2(expense / new Date(
        Number(monthKey.slice(0, 4)),
        Number(monthKey.slice(5, 7)), 0).getDate()) : 0
    };
  }

  /* Kategori kırılımı — tutara göre azalan sıralı, paylarıyla birlikte. */
  function categoryBreakdown(monthKey, kind) {
    var totals = {};
    var grand = 0;

    txOfMonth(monthKey).forEach(function (t) {
      if (t.type !== kind) return;
      var key = t.categoryId || "__yok__";
      if (!totals[key]) totals[key] = { amount: 0, count: 0 };
      totals[key].amount += t.amount;
      totals[key].count++;
      grand += t.amount;
    });

    var rows = Object.keys(totals).map(function (key) {
      var cat = key === "__yok__" ? KATEGORISIZ : (Store.categoryById(key) || KATEGORISIZ);
      return {
        id: cat.id, name: cat.name, slot: cat.slot,
        amount: Util.round2(totals[key].amount),
        count: totals[key].count,
        share: grand > 0 ? totals[key].amount / grand : 0
      };
    });

    rows.sort(function (a, b) { return b.amount - a.amount; });
    return { rows: rows, total: Util.round2(grand) };
  }

  /* Donut için: ilk MAX_SLICES kalem + kalanı tek "Diğer" dilimi.
   * Dilimler paletin sabit yuva sırasına göre çizilir (sıralamaya göre değil),
   * böylece komşu dilimler her zaman paletin doğrulanmış komşu çiftleri olur. */
  function foldForChart(breakdown) {
    var rows = breakdown.rows;
    if (rows.length <= MAX_SLICES + 1) return rows.slice().sort(bySlot);

    var head = rows.slice(0, MAX_SLICES);
    var tail = rows.slice(MAX_SLICES);
    var rest = tail.reduce(function (acc, r) { return acc + r.amount; }, 0);
    var restShare = tail.reduce(function (acc, r) { return acc + r.share; }, 0);

    head.push({
      id: "__diger__", name: "Diğer (" + tail.length + " kalem)", slot: 0,
      amount: Util.round2(rest), count: tail.length, share: restShare
    });
    return head.sort(bySlot);
  }

  function bySlot(a, b) {
    // Nötr yuva (0) her zaman sona.
    if (a.slot === 0) return 1;
    if (b.slot === 0) return -1;
    return a.slot - b.slot;
  }

  /* Ay içi günlük akış + kümülatif bakiye çizgisi. */
  function dailySeries(monthKey) {
    var y = Number(monthKey.slice(0, 4)), m = Number(monthKey.slice(5, 7)) - 1;
    var days = Util.daysInMonth(y, m);
    var buckets = [];
    var i;

    for (i = 1; i <= days; i++) {
      buckets.push({ day: i, date: monthKey + "-" + Util.pad(i), gelir: 0, gider: 0, cumulative: 0 });
    }

    txOfMonth(monthKey).forEach(function (t) {
      var idx = Number(t.date.slice(8, 10)) - 1;
      if (idx < 0 || idx >= buckets.length) return;
      buckets[idx][t.type] += t.amount;
    });

    var running = 0;
    for (i = 0; i < buckets.length; i++) {
      buckets[i].gelir = Util.round2(buckets[i].gelir);
      buckets[i].gider = Util.round2(buckets[i].gider);
      running += buckets[i].gelir - buckets[i].gider;
      buckets[i].cumulative = Util.round2(running);
    }
    return buckets;
  }

  /* Son N ayın aylık trendi (seçili ay dahil, en eskiden yeniye). */
  function monthlySeries(monthKey, count) {
    var n = count || 12;
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var key = Util.addMonthKey(monthKey, -i);
      var list = txOfMonth(key);
      var income = sum(list, "gelir");
      var expense = sum(list, "gider");
      out.push({
        key: key, label: Util.AY_KISA[Number(key.slice(5, 7)) - 1],
        fullLabel: Util.monthLabel(key),
        gelir: income, gider: expense, net: Util.round2(income - expense)
      });
    }
    return out;
  }

  /* Hesap bazlı hareket: ay içinde giren/çıkan ve ay sonu bakiyesi.
   * "Bankadan neler gidiyor" sorusunun karşılığı. */
  function accountBreakdown(monthKey) {
    var end = Util.monthRange(monthKey).end;
    var rows = Store.state.accounts.map(function (a) {
      return {
        id: a.id, name: a.name, type: a.type,
        gelir: 0, gider: 0, balance: a.openingBalance
      };
    });
    var index = {};
    rows.forEach(function (r) { index[r.id] = r; });

    var orphan = null;
    function orphanRow() {
      if (!orphan) {
        orphan = { id: null, name: "Hesapsız", type: "diger", gelir: 0, gider: 0, balance: 0 };
        rows.push(orphan);
      }
      return orphan;
    }

    Store.state.transactions.forEach(function (t) {
      var row = t.accountId ? index[t.accountId] : null;
      if (!row) {
        if (t.accountId && !index[t.accountId]) return;   // silinmiş hesap
        row = orphanRow();
      }
      var delta = t.type === "gelir" ? t.amount : -t.amount;
      if (t.date <= end) row.balance += delta;
      if (t.date.slice(0, 7) === monthKey) row[t.type] += t.amount;
    });

    rows.forEach(function (r) {
      r.gelir = Util.round2(r.gelir);
      r.gider = Util.round2(r.gider);
      r.net = Util.round2(r.gelir - r.gider);
      r.balance = Util.round2(r.balance);
    });
    return rows;
  }

  /* Bütçe durumu. Kalan gün hesabı yalnızca içinde bulunulan ay için anlamlı. */
  function budgetStatus(monthKey) {
    var spent = {};
    txOfMonth(monthKey).forEach(function (t) {
      if (t.type !== "gider" || !t.categoryId) return;
      spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount;
    });

    var currentMonth = Util.monthKey(Util.todayISO());
    var y = Number(monthKey.slice(0, 4)), m = Number(monthKey.slice(5, 7)) - 1;
    var days = Util.daysInMonth(y, m);
    var remainingDays = null;
    if (monthKey === currentMonth) remainingDays = days - Util.today().getDate() + 1;
    else if (monthKey > currentMonth) remainingDays = days;

    return Store.state.budgets.map(function (b) {
      var cat = Store.categoryById(b.categoryId);
      var used = Util.round2(spent[b.categoryId] || 0);
      var ratio = b.limit > 0 ? used / b.limit : 0;
      var remaining = Util.round2(b.limit - used);
      return {
        categoryId: b.categoryId,
        name: cat ? cat.name : "Silinmiş kategori",
        slot: cat ? cat.slot : 0,
        limit: b.limit,
        spent: used,
        ratio: ratio,
        remaining: remaining,
        remainingDays: remainingDays,
        dailyAllowance: remainingDays && remaining > 0 ? Util.round2(remaining / remainingDays) : null,
        durum: ratio > 1 ? "asim" : (ratio >= 0.8 ? "uyari" : "iyi")
      };
    }).sort(function (a, b) { return b.ratio - a.ratio; });
  }

  /* Kategori × ay çapraz tablosu. */
  function pivot(monthKey, count) {
    var months = [];
    for (var i = (count || 6) - 1; i >= 0; i--) months.push(Util.addMonthKey(monthKey, -i));

    var monthSet = {};
    months.forEach(function (k) { monthSet[k] = true; });

    // Kategorisiz işlemler tür bazında ayrı anahtarda toplanır; aksi halde
    // satırlar toplamla tutmaz.
    var cells = {};    // anahtar -> monthKey -> tutar
    Store.state.transactions.forEach(function (t) {
      var mk = t.date.slice(0, 7);
      if (!monthSet[mk]) return;
      var key = t.categoryId || ("__yok__" + t.type);
      if (!cells[key]) cells[key] = {};
      cells[key][mk] = (cells[key][mk] || 0) + t.amount;
    });

    function buildRow(id, name, slot) {
      var values = months.map(function (mk) { return Util.round2((cells[id] || {})[mk] || 0); });
      return {
        id: id, name: name, slot: slot, values: values,
        total: Util.round2(values.reduce(function (a, b) { return a + b; }, 0))
      };
    }

    function rowsFor(kind) {
      var rows = Store.state.categories
        .filter(function (c) { return c.kind === kind; })
        .map(function (c) { return buildRow(c.id, c.name, c.slot); });
      rows.push(buildRow("__yok__" + kind, "Kategorisiz", 0));
      return rows
        .filter(function (r) { return r.total > 0; })
        .sort(function (a, b) { return b.total - a.total; });
    }

    function totalsFor(kind) {
      return months.map(function (mk) {
        return sum(txOfMonth(mk), kind);
      });
    }

    return {
      months: months,
      labels: months.map(function (k) { return Util.monthLabel(k, true); }),
      gelir: rowsFor("gelir"),
      gider: rowsFor("gider"),
      gelirToplam: totalsFor("gelir"),
      giderToplam: totalsFor("gider")
    };
  }

  /* Aydaki en büyük tek harcamalar. */
  function topTransactions(monthKey, limit) {
    return txOfMonth(monthKey)
      .filter(function (t) { return t.type === "gider"; })
      .sort(function (a, b) { return b.amount - a.amount; })
      .slice(0, limit || 5);
  }

  return {
    MAX_SLICES: MAX_SLICES,
    txOfMonth: txOfMonth,
    monthSummary: monthSummary,
    categoryBreakdown: categoryBreakdown,
    foldForChart: foldForChart,
    dailySeries: dailySeries,
    monthlySeries: monthlySeries,
    accountBreakdown: accountBreakdown,
    budgetStatus: budgetStatus,
    pivot: pivot,
    topTransactions: topTransactions
  };
})();
