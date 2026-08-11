/* Veri katmanı: şema, localStorage kalıcılığı, seed verisi, dışa/içe aktarma.
 *
 * Tutarlar her zaman POZİTİF saklanır; yön `type` alanından ("gelir" | "gider")
 * okunur. Böylece işaret hataları baştan elenir.
 *
 * Kategoriler renk yerine bir palet YUVASI (`slot`, 0-8) taşır. Yuva CSS'te
 * --series-N değişkenine karşılık gelir ve açık/koyu temada ayrı ayrı tanımlıdır;
 * böylece kategori rengi temayla birlikte doğru şekilde değişir. Yuva 0 nötr
 * gridir ve "Diğer" gibi artık kalemler içindir.
 */
var Store = (function () {
  "use strict";

  var KEY = "butce.v1";
  var SLOT_COUNT = 8;

  var state = null;
  var listeners = [];

  /* ---- Varsayılan veri ---- */

  function defaultCategories() {
    return [
      { id: "c_market",    name: "Market",     kind: "gider", slot: 1 },
      { id: "c_kira",      name: "Kira",       kind: "gider", slot: 2 },
      { id: "c_fatura",    name: "Faturalar",  kind: "gider", slot: 3 },
      { id: "c_ulasim",    name: "Ulaşım",     kind: "gider", slot: 4 },
      { id: "c_yemek",     name: "Yeme-İçme",  kind: "gider", slot: 5 },
      { id: "c_saglik",    name: "Sağlık",     kind: "gider", slot: 6 },
      { id: "c_eglence",   name: "Eğlence",    kind: "gider", slot: 7 },
      { id: "c_abonelik",  name: "Abonelik",   kind: "gider", slot: 8 },
      { id: "c_diger_g",   name: "Diğer",      kind: "gider", slot: 0 },
      { id: "c_maas",      name: "Maaş",       kind: "gelir", slot: 1 },
      { id: "c_ekgelir",   name: "Ek Gelir",   kind: "gelir", slot: 2 },
      { id: "c_yatirim",   name: "Yatırım",    kind: "gelir", slot: 3 },
      { id: "c_diger_gl",  name: "Diğer",      kind: "gelir", slot: 0 }
    ];
  }

  function defaultAccounts() {
    return [
      { id: "a_banka", name: "Banka", type: "banka", openingBalance: 0 },
      { id: "a_nakit", name: "Nakit", type: "nakit", openingBalance: 0 },
      { id: "a_kart",  name: "Kredi Kartı", type: "kart", openingBalance: 0 }
    ];
  }

  function emptyState() {
    return {
      version: 1,
      settings: { currency: "TRY", locale: "tr-TR", theme: "auto" },
      accounts: defaultAccounts(),
      categories: defaultCategories(),
      transactions: [],
      recurring: [],
      budgets: []
    };
  }

  /* ---- Kalıcılık ---- */

  function normalize(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== "object") return base;

    var s = {
      version: 1,
      settings: Object.assign({}, base.settings, raw.settings || {}),
      accounts: Array.isArray(raw.accounts) && raw.accounts.length ? raw.accounts : base.accounts,
      categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
      budgets: Array.isArray(raw.budgets) ? raw.budgets : []
    };

    // Bozuk/eksik kayıtları at, tutarları normalleştir.
    s.transactions = s.transactions.filter(function (t) {
      return t && typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
             isFinite(Number(t.amount));
    }).map(function (t) {
      return {
        id: t.id || Util.uid("t"),
        date: t.date,
        type: t.type === "gelir" ? "gelir" : "gider",
        amount: Math.abs(Util.round2(Number(t.amount))),
        categoryId: t.categoryId || null,
        accountId: t.accountId || null,
        note: t.note || "",
        recurringId: t.recurringId || null,
        occurrenceKey: t.occurrenceKey || null
      };
    });

    s.categories = s.categories.map(function (c) {
      return {
        id: c.id || Util.uid("c"),
        name: c.name || "Adsız",
        kind: c.kind === "gelir" ? "gelir" : "gider",
        slot: typeof c.slot === "number" ? Math.max(0, Math.min(SLOT_COUNT, c.slot)) : 0
      };
    });

    s.accounts = s.accounts.map(function (a) {
      return {
        id: a.id || Util.uid("a"),
        name: a.name || "Adsız",
        type: a.type || "banka",
        openingBalance: Util.round2(Number(a.openingBalance) || 0)
      };
    });

    s.budgets = s.budgets.filter(function (b) { return b && b.categoryId; })
      .map(function (b) {
        return { categoryId: b.categoryId, limit: Math.abs(Util.round2(Number(b.limit) || 0)) };
      });

    return s;
  }

  function load() {
    var raw = null;
    try {
      var text = localStorage.getItem(KEY);
      if (text) raw = JSON.parse(text);
    } catch (e) {
      console.warn("Kayıtlı veri okunamadı, sıfırdan başlanıyor.", e);
    }
    state = normalize(raw);
    Util.config.currency = state.settings.currency;
    Util.config.locale = state.settings.locale;
    return state;
  }

  var saveFailed = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (e) {
      // Kota dolduysa veya localStorage kapalıysa kullanıcıyı bir kez uyar.
      if (!saveFailed) {
        saveFailed = true;
        console.error("Veri kaydedilemedi.", e);
        if (typeof UI !== "undefined" && UI.toast) {
          UI.toast("Veri tarayıcıya kaydedilemedi. Gizli sekmede olabilirsiniz — verilerinizi dışa aktarın.", "hata");
        }
      }
    }
  }

  function emit() { listeners.forEach(function (fn) { fn(state); }); }
  function subscribe(fn) { listeners.push(fn); }

  // Tek yazma noktası: değiştir -> kaydet -> yeniden çiz.
  function commit(mutator) {
    mutator(state);
    save();
    emit();
  }

  /* ---- Sorgular ---- */

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function categoryById(id) { return byId(state.categories, id); }
  function accountById(id) { return byId(state.accounts, id); }
  function categoriesOf(kind) {
    return state.categories.filter(function (c) { return c.kind === kind; });
  }
  function budgetFor(categoryId) {
    for (var i = 0; i < state.budgets.length; i++) {
      if (state.budgets[i].categoryId === categoryId) return state.budgets[i];
    }
    return null;
  }

  // Yeni kategoriye en az kullanılan yuvayı ver: renkler kategoriye sabitlenir,
  // sıralamaya göre yeniden boyanmaz. 8'den fazla kategoride yuvalar tekrarlar;
  // grafikler ilk 7'yi gösterip kalanını "Diğer"e katladığı için bu sorun olmaz.
  function nextSlot(kind) {
    var used = {}, i;
    for (i = 1; i <= SLOT_COUNT; i++) used[i] = 0;
    state.categories.forEach(function (c) {
      if (c.kind === kind && c.slot >= 1) used[c.slot]++;
    });
    var best = 1;
    for (i = 2; i <= SLOT_COUNT; i++) if (used[i] < used[best]) best = i;
    return best;
  }

  /* ---- Mutasyonlar ---- */

  function addTransaction(tx) {
    var record = {
      id: Util.uid("t"),
      date: tx.date || Util.todayISO(),
      type: tx.type === "gelir" ? "gelir" : "gider",
      amount: Math.abs(Util.round2(Number(tx.amount) || 0)),
      categoryId: tx.categoryId || null,
      accountId: tx.accountId || null,
      note: tx.note || "",
      recurringId: tx.recurringId || null,
      occurrenceKey: tx.occurrenceKey || null
    };
    commit(function (s) { s.transactions.push(record); });
    return record;
  }

  function updateTransaction(id, patch) {
    commit(function (s) {
      var t = byId(s.transactions, id);
      if (!t) return;
      if (patch.amount !== undefined) t.amount = Math.abs(Util.round2(Number(patch.amount) || 0));
      if (patch.date !== undefined) t.date = patch.date;
      if (patch.type !== undefined) t.type = patch.type === "gelir" ? "gelir" : "gider";
      if (patch.categoryId !== undefined) t.categoryId = patch.categoryId;
      if (patch.accountId !== undefined) t.accountId = patch.accountId;
      if (patch.note !== undefined) t.note = patch.note;
    });
  }

  function removeTransaction(id) {
    commit(function (s) {
      s.transactions = s.transactions.filter(function (t) { return t.id !== id; });
    });
  }

  function saveCategory(data) {
    commit(function (s) {
      if (data.id) {
        var c = byId(s.categories, data.id);
        if (c) { c.name = data.name; c.slot = data.slot; }
      } else {
        s.categories.push({
          id: Util.uid("c"), name: data.name, kind: data.kind,
          slot: data.slot === undefined ? nextSlot(data.kind) : data.slot
        });
      }
    });
  }

  // Kategori silinince işlemleri silmiyoruz; kategorisiz kalıyorlar ve
  // raporlarda "Kategorisiz" altında toplanıyorlar.
  function removeCategory(id) {
    commit(function (s) {
      s.categories = s.categories.filter(function (c) { return c.id !== id; });
      s.budgets = s.budgets.filter(function (b) { return b.categoryId !== id; });
      s.transactions.forEach(function (t) { if (t.categoryId === id) t.categoryId = null; });
      s.recurring.forEach(function (r) { if (r.categoryId === id) r.categoryId = null; });
    });
  }

  function saveAccount(data) {
    commit(function (s) {
      if (data.id) {
        var a = byId(s.accounts, data.id);
        if (a) { a.name = data.name; a.type = data.type; a.openingBalance = Util.round2(Number(data.openingBalance) || 0); }
      } else {
        s.accounts.push({
          id: Util.uid("a"), name: data.name, type: data.type || "banka",
          openingBalance: Util.round2(Number(data.openingBalance) || 0)
        });
      }
    });
  }

  function removeAccount(id) {
    commit(function (s) {
      s.accounts = s.accounts.filter(function (a) { return a.id !== id; });
      s.transactions.forEach(function (t) { if (t.accountId === id) t.accountId = null; });
      s.recurring.forEach(function (r) { if (r.accountId === id) r.accountId = null; });
    });
  }

  function saveRecurring(data) {
    var record = {
      id: data.id || Util.uid("r"),
      type: data.type === "gelir" ? "gelir" : "gider",
      amount: Math.abs(Util.round2(Number(data.amount) || 0)),
      categoryId: data.categoryId || null,
      accountId: data.accountId || null,
      note: data.note || "",
      freq: data.freq || "aylik",
      anchor: Number(data.anchor) || 1,
      startDate: data.startDate || Util.todayISO(),
      endDate: data.endDate || null,
      active: data.active !== false
    };
    commit(function (s) {
      var existing = byId(s.recurring, record.id);
      if (existing) Object.assign(existing, record);
      else s.recurring.push(record);
    });
    return record;
  }

  // Kural silinince üretilmiş geçmiş işlemler korunur (gerçekten olmuş
  // harcamalardır). İsteğe bağlı olarak birlikte silinebilirler.
  function removeRecurring(id, alsoTransactions) {
    commit(function (s) {
      s.recurring = s.recurring.filter(function (r) { return r.id !== id; });
      if (alsoTransactions) {
        s.transactions = s.transactions.filter(function (t) { return t.recurringId !== id; });
      } else {
        s.transactions.forEach(function (t) { if (t.recurringId === id) t.recurringId = null; });
      }
    });
  }

  function setBudget(categoryId, limit) {
    commit(function (s) {
      var value = Math.abs(Util.round2(Number(limit) || 0));
      var b = null;
      for (var i = 0; i < s.budgets.length; i++) {
        if (s.budgets[i].categoryId === categoryId) { b = s.budgets[i]; break; }
      }
      if (value <= 0) {
        s.budgets = s.budgets.filter(function (x) { return x.categoryId !== categoryId; });
      } else if (b) {
        b.limit = value;
      } else {
        s.budgets.push({ categoryId: categoryId, limit: value });
      }
    });
  }

  function updateSettings(patch) {
    commit(function (s) {
      Object.assign(s.settings, patch);
      Util.config.currency = s.settings.currency;
      Util.config.locale = s.settings.locale;
    });
  }

  /* ---- Dışa / içe aktarma ---- */

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);           // hata çağırana yükselir
    var next = normalize(parsed);
    if (!next.transactions.length && !next.recurring.length && !parsed.categories) {
      throw new Error("Dosya tanınan bir bütçe yedeği değil.");
    }
    commit(function () { state = next; });
    Util.config.currency = state.settings.currency;
    return state;
  }

  function reset() {
    commit(function () { state = emptyState(); });
  }

  /* ---- Örnek veri ---- */

  // Sayfayı boş grafiklerle karşılamamak için makul bir 4 aylık senaryo üretir.
  function loadSampleData() {
    var next = emptyState();
    var seed = 20260811;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    function between(a, b) { return Util.round2(a + rnd() * (b - a)); }

    var today = Util.today();
    var start = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    var patterns = [
      { cat: "c_market",   acc: "a_kart",  perMonth: 11, min: 320,  max: 1650, notes: ["Haftalık market", "Manav", "Kasap", "Şarküteri"] },
      { cat: "c_yemek",    acc: "a_kart",  perMonth: 9,  min: 120,  max: 780,  notes: ["Öğle yemeği", "Kahve", "Akşam yemeği", "Sipariş"] },
      { cat: "c_ulasim",   acc: "a_nakit", perMonth: 8,  min: 60,   max: 520,  notes: ["Akbil", "Benzin", "Taksi", "Otopark"] },
      { cat: "c_eglence",  acc: "a_kart",  perMonth: 3,  min: 200,  max: 1400, notes: ["Sinema", "Konser", "Kitap", "Maç"] },
      { cat: "c_saglik",   acc: "a_banka", perMonth: 1,  min: 250,  max: 1900, notes: ["Eczane", "Diş hekimi", "Muayene"] },
      { cat: "c_diger_g",  acc: "a_kart",  perMonth: 2,  min: 150,  max: 900,  notes: ["Hediye", "Kırtasiye", "Onarım"] }
    ];

    var cursor = new Date(start.getTime());
    while (cursor <= today) {
      var y = cursor.getFullYear(), m = cursor.getMonth();
      var dim = Util.daysInMonth(y, m);

      patterns.forEach(function (p) {
        for (var i = 0; i < p.perMonth; i++) {
          var day = 1 + Math.floor(rnd() * dim);
          var date = new Date(y, m, day);
          if (date > today) continue;
          next.transactions.push({
            id: Util.uid("t"), date: Util.toISO(date), type: "gider",
            amount: between(p.min, p.max), categoryId: p.cat, accountId: p.acc,
            note: p.notes[Math.floor(rnd() * p.notes.length)],
            recurringId: null, occurrenceKey: null
          });
        }
      });

      // Ara sıra düşen ek gelir
      if (rnd() > 0.45) {
        var gd = new Date(y, m, 5 + Math.floor(rnd() * 20));
        if (gd <= today) {
          next.transactions.push({
            id: Util.uid("t"), date: Util.toISO(gd), type: "gelir",
            amount: between(2500, 9000), categoryId: "c_ekgelir", accountId: "a_banka",
            note: "Serbest çalışma", recurringId: null, occurrenceKey: null
          });
        }
      }

      cursor = new Date(y, m + 1, 1);
    }

    var startISO = Util.toISO(start);
    next.recurring = [
      { id: "r_maas", type: "gelir", amount: 68000, categoryId: "c_maas", accountId: "a_banka",
        note: "Maaş", freq: "aylik", anchor: 1, startDate: startISO, endDate: null, active: true },
      { id: "r_kira", type: "gider", amount: 22000, categoryId: "c_kira", accountId: "a_banka",
        note: "Kira", freq: "aylik", anchor: 5, startDate: startISO, endDate: null, active: true },
      { id: "r_fatura", type: "gider", amount: 3400, categoryId: "c_fatura", accountId: "a_banka",
        note: "Elektrik + su + doğalgaz", freq: "aylik", anchor: 15, startDate: startISO, endDate: null, active: true },
      { id: "r_internet", type: "gider", amount: 850, categoryId: "c_fatura", accountId: "a_banka",
        note: "İnternet", freq: "aylik", anchor: 20, startDate: startISO, endDate: null, active: true },
      { id: "r_abonelik", type: "gider", amount: 640, categoryId: "c_abonelik", accountId: "a_kart",
        note: "Dijital abonelikler", freq: "aylik", anchor: 12, startDate: startISO, endDate: null, active: true },
      { id: "r_spor", type: "gider", amount: 1450, categoryId: "c_saglik", accountId: "a_kart",
        note: "Spor salonu", freq: "aylik", anchor: 8, startDate: startISO, endDate: null, active: true }
    ];

    next.budgets = [
      { categoryId: "c_market", limit: 12000 },
      { categoryId: "c_yemek", limit: 5000 },
      { categoryId: "c_ulasim", limit: 3000 },
      { categoryId: "c_eglence", limit: 2500 },
      { categoryId: "c_fatura", limit: 5000 },
      { categoryId: "c_abonelik", limit: 800 }
    ];

    next.accounts[0].openingBalance = 15000;
    next.accounts[1].openingBalance = 1200;

    commit(function () { state = next; });
    return state;
  }

  return {
    KEY: KEY,
    SLOT_COUNT: SLOT_COUNT,
    load: load, save: save, commit: commit, subscribe: subscribe,
    get state() { return state; },
    categoryById: categoryById, accountById: accountById,
    categoriesOf: categoriesOf, budgetFor: budgetFor, nextSlot: nextSlot,
    addTransaction: addTransaction, updateTransaction: updateTransaction,
    removeTransaction: removeTransaction,
    saveCategory: saveCategory, removeCategory: removeCategory,
    saveAccount: saveAccount, removeAccount: removeAccount,
    saveRecurring: saveRecurring, removeRecurring: removeRecurring,
    setBudget: setBudget, updateSettings: updateSettings,
    exportJSON: exportJSON, importJSON: importJSON, reset: reset,
    loadSampleData: loadSampleData
  };
})();
