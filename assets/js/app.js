/* Başlatma ve olay bağlama. */
(function () {
  "use strict";

  var $ = Util.$;

  /* ---- Tema ---- */

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function cycleTheme() {
    var order = ["auto", "light", "dark"];
    var current = Store.state.settings.theme || "auto";
    var next = order[(order.indexOf(current) + 1) % order.length];
    Store.updateSettings({ theme: next });
    applyTheme(next);
    UI.toast("Tema: " + (next === "auto" ? "sistemle aynı" : next === "light" ? "açık" : "koyu"));
  }

  /* ---- Dışa / içe aktarma ---- */

  function exportData() {
    var blob = new Blob([Store.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "butce-" + Util.todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    UI.toast("Yedek indirildi.");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJSON(String(reader.result));
        applyTheme(Store.state.settings.theme);
        Recurring.materialize(Util.todayISO());
        UI.setMonth(Util.monthKey(Util.todayISO()));
        UI.toast("Yedek geri yüklendi.");
      } catch (e) {
        UI.toast("Dosya okunamadı: " + e.message, "hata");
      }
    };
    reader.onerror = function () { UI.toast("Dosya okunamadı.", "hata"); };
    reader.readAsText(file);
  }

  function copyPivot() {
    var table = $("#pivotTable").querySelector("table");
    if (!table) { UI.toast("Kopyalanacak tablo yok.", "hata"); return; }
    var tsv = Util.$$("tr", table).map(function (tr) {
      return Util.$$("th, td", tr).map(function (cell) {
        return cell.textContent.trim();
      }).join("\t");
    }).join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(
        function () { UI.toast("Tablo panoya kopyalandı."); },
        function () { UI.toast("Panoya kopyalanamadı.", "hata"); }
      );
    } else {
      UI.toast("Bu tarayıcı panoya kopyalamayı desteklemiyor.", "hata");
    }
  }

  /* ---- İlk açılış ---- */

  function maybeWelcome() {
    if (Store.state.transactions.length || Store.state.recurring.length) return;
    UI.openModal("Hoş geldiniz",
      "<p>Bu sayfa günlük gelir ve giderlerinizi takip eder: paranın nereye gittiğini, " +
      "nereden geldiğini ve bütçenizin ne durumda olduğunu gösterir.</p>" +
      '<p class="hint">Veriler yalnızca bu tarayıcıda saklanır — hiçbir şey sunucuya gönderilmez. ' +
      "Ayarlar sekmesinden istediğiniz zaman yedek alabilirsiniz.</p>" +
      '<div class="modal__foot">' +
        '<button type="button" class="btn btn--ghost" id="wBos">Boş başla</button>' +
        '<button type="button" class="btn" id="wOrnek">Örnek veriyle gez</button></div>',
      function (root) {
        root.querySelector("#wBos").onclick = function () {
          UI.closeModal();
          UI.transactionForm(null);
        };
        root.querySelector("#wOrnek").onclick = function () {
          Store.loadSampleData();
          Recurring.materialize(Util.todayISO());
          UI.closeModal();
          UI.toast("Örnek veri yüklendi. Ayarlar'dan temizleyebilirsiniz.");
        };
      });
  }

  /* ---- Olaylar ---- */

  function wire() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-month-step], [data-tab], [data-close], [data-edit-tx], " +
        "[data-del-tx], [data-filter-category], [data-edit-rec], [data-del-rec], [data-toggle-rec], " +
        "[data-edit-cat], [data-del-cat], [data-edit-acc], [data-del-acc], button");
      if (!t) return;

      var attr = function (name) { return t.getAttribute(name); };

      /* Ay gezinimi */
      if (t.hasAttribute("data-month-step")) {
        UI.setMonth(Util.addMonthKey(UI.view.month, Number(attr("data-month-step"))));
        return;
      }
      if (t.id === "monthLabel") { UI.setMonth(Util.monthKey(Util.todayISO())); return; }

      /* Sekmeler */
      if (t.classList.contains("tab")) { UI.setTab(attr("data-tab")); return; }

      /* Modal kapatma */
      if (t.hasAttribute("data-close")) { UI.closeModal(); return; }

      /* İşlem ekle / düzenle / sil */
      if (t.id === "fab" || t.id === "addBtn") { UI.transactionForm(null); return; }
      if (t.hasAttribute("data-edit-tx")) {
        var tx = Store.state.transactions.filter(function (x) { return x.id === attr("data-edit-tx"); })[0];
        if (tx) UI.transactionForm(tx);
        return;
      }
      if (t.hasAttribute("data-del-tx")) {
        var delId = attr("data-del-tx");
        UI.confirmAction("Bu işlem silinsin mi?", "Sil", function () {
          Store.removeTransaction(delId);
          UI.toast("İşlem silindi.");
        });
        return;
      }

      /* Donut listesinden kategoriye göre filtrele */
      if (t.hasAttribute("data-filter-category")) {
        UI.view.filters.categoryId = attr("data-filter-category") || "";
        UI.view.filters.range = "month";
        UI.setTab("islemler");
        return;
      }

      /* Tekrarlayanlar */
      if (t.id === "addRecurring") { UI.recurringForm(null); return; }
      if (t.hasAttribute("data-edit-rec")) {
        var rule = Store.state.recurring.filter(function (x) { return x.id === attr("data-edit-rec"); })[0];
        if (rule) UI.recurringForm(rule);
        return;
      }
      if (t.hasAttribute("data-toggle-rec")) {
        var toggleId = attr("data-toggle-rec");
        Store.commit(function (s) {
          s.recurring.forEach(function (r) { if (r.id === toggleId) r.active = !r.active; });
        });
        Recurring.materialize(Util.todayISO());
        return;
      }
      if (t.hasAttribute("data-del-rec")) {
        var recId = attr("data-del-rec");
        UI.confirmAction(
          "Kural silinsin mi? Bugüne kadar oluşturduğu işlemler listede kalır.",
          "Kuralı sil",
          function () { Store.removeRecurring(recId, false); UI.toast("Kural silindi."); });
        return;
      }

      /* Kategoriler */
      if (t.id === "addCategory") { UI.categoryForm(null); return; }
      if (t.hasAttribute("data-edit-cat")) { UI.categoryForm(Store.categoryById(attr("data-edit-cat"))); return; }
      if (t.hasAttribute("data-del-cat")) {
        var catId = attr("data-del-cat");
        var cat = Store.categoryById(catId);
        UI.confirmAction(
          "\"" + (cat ? cat.name : "") + "\" silinsin mi? İşlemler silinmez, kategorisiz kalır.",
          "Sil",
          function () { Store.removeCategory(catId); UI.toast("Kategori silindi."); });
        return;
      }

      /* Hesaplar */
      if (t.id === "addAccount") { UI.accountForm(null); return; }
      if (t.hasAttribute("data-edit-acc")) { UI.accountForm(Store.accountById(attr("data-edit-acc"))); return; }
      if (t.hasAttribute("data-del-acc")) {
        var accId = attr("data-del-acc");
        var acc = Store.accountById(accId);
        UI.confirmAction(
          "\"" + (acc ? acc.name : "") + "\" silinsin mi? İşlemler silinmez, hesapsız kalır.",
          "Sil",
          function () { Store.removeAccount(accId); UI.toast("Hesap silindi."); });
        return;
      }

      /* Veri ve tema */
      if (t.id === "themeBtn") { cycleTheme(); return; }
      if (t.id === "exportBtn") { exportData(); return; }
      if (t.id === "importBtn") { $("#importFile").click(); return; }
      if (t.id === "copyPivot") { copyPivot(); return; }
      if (t.id === "sampleBtn") {
        UI.confirmAction("Örnek veri yüklenecek ve mevcut kayıtların yerine geçecek. Devam edilsin mi?",
          "Örnek veriyi yükle", function () {
            Store.loadSampleData();
            Recurring.materialize(Util.todayISO());
            UI.setMonth(Util.monthKey(Util.todayISO()));
            UI.toast("Örnek veri yüklendi.");
          });
        return;
      }
      if (t.id === "resetBtn") {
        UI.confirmAction("Bütün işlemler, kurallar ve bütçeler silinecek. Bu geri alınamaz.",
          "Her şeyi sil", function () {
            Store.reset();
            UI.toast("Tüm veriler silindi.");
          });
        return;
      }
    });

    /* Filtreler */
    Util.on($("#fltSearch"), "input", function (e) {
      UI.view.filters.q = e.target.value;
      UI.render();
    });
    ["#fltType", "#fltCategory", "#fltAccount", "#fltRange"].forEach(function (sel) {
      Util.on($(sel), "change", function (e) {
        var map = { fltType: "type", fltCategory: "categoryId", fltAccount: "accountId", fltRange: "range" };
        UI.view.filters[map[e.target.id]] = e.target.value;
        UI.render();
      });
    });

    /* Ayarlar */
    Util.on($("#setCurrency"), "change", function (e) {
      Store.updateSettings({ currency: e.target.value });
      UI.toast("Para birimi güncellendi.");
    });
    Util.on($("#setTheme"), "change", function (e) {
      Store.updateSettings({ theme: e.target.value });
      applyTheme(e.target.value);
    });
    Util.on($("#importFile"), "change", function (e) {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    /* Bütçe limitleri — odak kaybında kaydet */
    document.addEventListener("change", function (e) {
      if (!e.target.hasAttribute || !e.target.hasAttribute("data-budget")) return;
      var value = Util.parseAmount(e.target.value);
      Store.setBudget(e.target.getAttribute("data-budget"), isFinite(value) ? value : 0);
    });

    /* Klavye */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("#modal").hidden) { UI.closeModal(); return; }

      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "select" || tag === "textarea";
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "n" || e.key === "N") { e.preventDefault(); UI.transactionForm(null); }
      else if (e.key === "ArrowLeft") UI.setMonth(Util.addMonthKey(UI.view.month, -1));
      else if (e.key === "ArrowRight") UI.setMonth(Util.addMonthKey(UI.view.month, 1));
    });

    // Sistem teması değişince "auto" modundaki grafikler yeniden çizilsin.
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () { if ((Store.state.settings.theme || "auto") === "auto") UI.render(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ---- Başlat ---- */

  function init() {
    Store.load();
    applyTheme(Store.state.settings.theme);
    Recurring.materialize(Util.todayISO());
    Store.subscribe(function () { UI.render(); });
    wire();
    UI.render();
    maybeWelcome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
