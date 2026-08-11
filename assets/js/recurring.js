/* Tekrarlayan işlem motoru.
 *
 * Uygulama her açılışta materialize() çağırır: her aktif kural için başlangıç
 * tarihinden bugüne kadar kaçırılmış bütün tekrarlar normal işlem olarak
 * yazılır. Idempotanlık `occurrenceKey = kuralId + ":" + tarih` ile garanti
 * edilir — sayfa kaç kez yenilenirse yenilensin aynı tekrar iki kez oluşmaz.
 */
var Recurring = (function () {
  "use strict";

  // Çok eski bir başlangıç tarihi girildiğinde sonsuz üretimi engeller.
  var MAX_OCCURRENCES = 1200;

  function endOfRule(rule, untilISO) {
    return rule.endDate && rule.endDate < untilISO ? rule.endDate : untilISO;
  }

  /* Kuralın startDate ile untilISO (dahil) arasındaki tekrar tarihleri. */
  function occurrences(rule, untilISO) {
    var out = [];
    if (!rule || !rule.startDate) return out;

    var last = endOfRule(rule, untilISO);
    if (last < rule.startDate) return out;

    var start = Util.fromISO(rule.startDate);
    var i, d, iso;

    if (rule.freq === "gunluk") {
      d = start;
      while (out.length < MAX_OCCURRENCES) {
        iso = Util.toISO(d);
        if (iso > last) break;
        out.push(iso);
        d = Util.addDays(d, 1);
      }

    } else if (rule.freq === "haftalik") {
      var weekday = ((Number(rule.anchor) || 0) % 7 + 7) % 7;   // 0 = Pazar
      d = start;
      while (d.getDay() !== weekday) d = Util.addDays(d, 1);
      while (out.length < MAX_OCCURRENCES) {
        iso = Util.toISO(d);
        if (iso > last) break;
        out.push(iso);
        d = Util.addDays(d, 7);
      }

    } else if (rule.freq === "yillik") {
      // Yıllık kural, başlangıç tarihinin gün/ayını tekrarlar.
      var ym = start.getMonth(), yd = start.getDate();
      for (i = 0; i < 200 && out.length < MAX_OCCURRENCES; i++) {
        var year = start.getFullYear() + i;
        iso = Util.toISO(new Date(year, ym, Util.clampDayToMonth(year, ym, yd)));
        if (iso > last) break;
        if (iso >= rule.startDate) out.push(iso);
      }

    } else {
      // aylik (varsayılan): ayın belirli günü, kısa aylarda son güne kırpılır.
      var day = Math.max(1, Math.min(31, Number(rule.anchor) || 1));
      var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      for (i = 0; i < 600 && out.length < MAX_OCCURRENCES; i++) {
        var y = cursor.getFullYear(), m = cursor.getMonth();
        iso = Util.toISO(new Date(y, m, Util.clampDayToMonth(y, m, day)));
        if (iso > last) break;
        if (iso >= rule.startDate) out.push(iso);
        cursor = new Date(y, m + 1, 1);
      }
    }

    return out;
  }

  /* Kuralın bugünden sonraki ilk tekrarı (yoksa null). */
  function nextOccurrence(rule, fromISO) {
    var from = fromISO || Util.todayISO();
    if (!rule.active) return null;
    // Bir yıl ileriye bakmak her frekans için yeterli.
    var horizon = Util.toISO(new Date(Util.fromISO(from).getFullYear() + 1, Util.fromISO(from).getMonth(), Util.fromISO(from).getDate()));
    var list = occurrences(rule, horizon);
    for (var i = 0; i < list.length; i++) if (list[i] > from) return list[i];
    return null;
  }

  /* Kaçırılmış tekrarları işleme dönüştürür. Tek commit ile yazar. */
  function materialize(untilISO) {
    var state = Store.state;
    var until = untilISO || Util.todayISO();

    var seen = Object.create(null);
    state.transactions.forEach(function (t) {
      if (t.occurrenceKey) seen[t.occurrenceKey] = true;
    });

    var created = [];
    state.recurring.forEach(function (rule) {
      if (!rule.active) return;
      occurrences(rule, until).forEach(function (iso) {
        var key = rule.id + ":" + iso;
        if (seen[key]) return;
        seen[key] = true;
        created.push({
          id: Util.uid("t"),
          date: iso,
          type: rule.type,
          amount: rule.amount,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          note: rule.note,
          recurringId: rule.id,
          occurrenceKey: key
        });
      });
    });

    if (created.length) {
      Store.commit(function (s) {
        s.transactions = s.transactions.concat(created);
      });
    }
    return created.length;
  }

  function freqLabel(rule) {
    if (rule.freq === "gunluk") return "Her gün";
    if (rule.freq === "haftalik") return "Her " + Util.GUN_KISA[((Number(rule.anchor) || 0) % 7 + 7) % 7];
    if (rule.freq === "yillik") {
      var d = Util.fromISO(rule.startDate);
      return "Her yıl " + d.getDate() + " " + Util.AY_ADLARI[d.getMonth()];
    }
    return "Her ayın " + (Math.max(1, Math.min(31, Number(rule.anchor) || 1))) + "'i";
  }

  return {
    occurrences: occurrences,
    nextOccurrence: nextOccurrence,
    materialize: materialize,
    freqLabel: freqLabel
  };
})();
