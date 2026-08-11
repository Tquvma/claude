/* Ortak yardımcılar: tarih işlemleri, biçimlendirme, küçük DOM kısayolları. */
var Util = (function () {
  "use strict";

  // app.js açılışta ayarlardan günceller.
  var config = { locale: "tr-TR", currency: "TRY" };

  var AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz",
                 "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  var GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* ---- Tarih ---- */

  function toISO(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // "YYYY-MM-DD" -> yerel Date. new Date(iso) tarihi UTC sayıp gün kaydırabildiği
  // için elle ayrıştırıyoruz.
  function fromISO(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) || 1);
  }

  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function todayISO() { return toISO(today()); }

  function monthKey(iso) { return String(iso).slice(0, 7); }          // "2026-08"
  function monthKeyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }

  function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate(); }

  // "2026-08" + delta -> "2026-11"
  function addMonthKey(key, delta) {
    var p = key.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
    return monthKeyOf(d);
  }

  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function monthRange(key) {
    var p = key.split("-"), y = Number(p[0]), m = Number(p[1]) - 1;
    return { start: y + "-" + pad(m + 1) + "-01", end: y + "-" + pad(m + 1) + "-" + pad(daysInMonth(y, m)) };
  }

  function monthLabel(key, kisa) {
    var p = key.split("-");
    var names = kisa ? AY_KISA : AY_ADLARI;
    return names[Number(p[1]) - 1] + " " + p[0];
  }

  function dayLabel(iso) {
    var d = fromISO(iso);
    return d.getDate() + " " + AY_KISA[d.getMonth()] + " " + GUN_KISA[d.getDay()];
  }

  function longDayLabel(iso) {
    var d = fromISO(iso);
    return d.getDate() + " " + AY_ADLARI[d.getMonth()] + " " + d.getFullYear();
  }

  // Bugüne göre "Bugün" / "Dün" / tarih
  function relativeDayLabel(iso) {
    var t = todayISO();
    if (iso === t) return "Bugün";
    if (iso === toISO(addDays(today(), -1))) return "Dün";
    return dayLabel(iso);
  }

  function clampDayToMonth(year, month0, day) {
    return Math.min(day, daysInMonth(year, month0));
  }

  /* ---- Biçimlendirme ---- */

  var cache = {};
  function fmt(kind, opts) {
    var key = kind + "|" + config.locale + "|" + config.currency;
    if (!cache[key]) cache[key] = new Intl.NumberFormat(config.locale, opts);
    return cache[key];
  }

  function money(n) {
    return fmt("money", { style: "currency", currency: config.currency,
                          minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  }

  // Grafik eksenleri ve dar alanlar için: 12.500 -> "12,5 B"
  function moneyShort(n) {
    var v = n || 0;
    if (Math.abs(v) < 1000) return fmt("short0", { maximumFractionDigits: 0 }).format(v);
    return fmt("compact", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }

  function num(n, digits) {
    return new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: digits || 0, maximumFractionDigits: digits === undefined ? 2 : digits
    }).format(n || 0);
  }

  function pct(ratio, digits) {
    var d = digits === undefined ? 0 : digits;
    return new Intl.NumberFormat(config.locale, {
      style: "percent", minimumFractionDigits: d, maximumFractionDigits: d
    }).format(ratio || 0);
  }

  function signedPct(ratio) {
    var s = pct(Math.abs(ratio), 0);
    return (ratio >= 0 ? "+" : "−") + s;
  }

  // Kullanıcı metni her zaman kaçırılarak DOM'a yazılır.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // "12.345,67" / "12,5" / "1 234" -> Number. Türkçe girişte virgül ondalıktır.
  function parseAmount(input) {
    if (typeof input === "number") return input;
    var s = String(input == null ? "" : input).trim().replace(/\s/g, "");
    if (!s) return NaN;
    var lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > -1 && lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");     // 1.234,56
    } else if (lastDot > -1 && lastComma > -1) {
      s = s.replace(/,/g, "");                        // 1,234.56
    } else if (lastComma > -1) {
      s = s.replace(",", ".");                        // 1234,56
    }
    s = s.replace(/[^0-9.\-]/g, "");
    var v = Number(s);
    return isFinite(v) ? v : NaN;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" +
           Math.random().toString(36).slice(2, 8);
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /* ---- DOM ---- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function on(el, type, handler) { if (el) el.addEventListener(type, handler); }

  return {
    config: config,
    AY_ADLARI: AY_ADLARI, AY_KISA: AY_KISA, GUN_KISA: GUN_KISA,
    pad: pad, toISO: toISO, fromISO: fromISO, today: today, todayISO: todayISO,
    monthKey: monthKey, monthKeyOf: monthKeyOf, daysInMonth: daysInMonth,
    addMonthKey: addMonthKey, addDays: addDays, monthRange: monthRange,
    monthLabel: monthLabel, dayLabel: dayLabel, longDayLabel: longDayLabel,
    relativeDayLabel: relativeDayLabel, clampDayToMonth: clampDayToMonth,
    money: money, moneyShort: moneyShort, num: num, pct: pct, signedPct: signedPct,
    esc: esc, parseAmount: parseAmount, uid: uid, round2: round2,
    $: $, $$: $$, on: on
  };
})();
